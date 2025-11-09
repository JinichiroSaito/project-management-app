const express = require('express');
const db = require('./db');
const { authenticateToken, optionalAuth, requireAdmin, requireApproved, initializeFirebase } = require('./middleware/auth');
const { sendApprovalRequestEmail, sendApprovalNotificationEmail } = require('./utils/email');

const app = express();
const PORT = process.env.PORT || 8080;

// Firebase初期化
initializeFirebase();

// Middleware
app.use(express.json());

// CORS設定
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Preflight request
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    environment: process.env.NODE_ENV || 'dev',
    timestamp: new Date().toISOString()
  });
});

// Database health check
app.get('/health/db', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: result.rows[0].now
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Public endpoint - Get all projects
app.get('/api/projects', optionalAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM projects ORDER BY created_at DESC'
    );
    res.json({ 
      projects: result.rows,
      user: req.user || null
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public endpoint - Get project by ID
app.get('/api/projects/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'SELECT * FROM projects WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching project:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Protected endpoint - Create new project
app.post('/api/projects', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { name, description, status } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    const result = await db.query(
      'INSERT INTO projects (name, description, status) VALUES ($1, $2, $3) RETURNING *',
      [name, description || '', status || 'planning']
    );
    
    res.status(201).json({
      ...result.rows[0],
      created_by: req.user.email
    });
  } catch (error) {
    console.error('Error creating project:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Protected endpoint - Update project
app.put('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status } = req.body;
    
    const result = await db.query(
      'UPDATE projects SET name = COALESCE($1, name), description = COALESCE($2, description), status = COALESCE($3, status), updated_at = CURRENT_TIMESTAMP WHERE id = $4 RETURNING *',
      [name, description, status, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({
      ...result.rows[0],
      updated_by: req.user.email
    });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Protected endpoint - Delete project
app.delete('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      'DELETE FROM projects WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({ 
      message: 'Project deleted successfully',
      deleted_by: req.user.email
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Auth endpoint - Get current user info
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, is_admin, is_approved, company, department, position, name, created_at FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (result.rows.length === 0) {
      return res.json({
        user: {
          ...req.user,
          is_admin: false,
          is_approved: false,
          needsProfile: true
        }
      });
    }
    
    const user = result.rows[0];
    res.json({
      user: {
        ...req.user,
        ...user,
        needsProfile: !user.name || !user.company || !user.department || !user.position
      }
    });
  } catch (error) {
    console.error('Error fetching user info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User registration endpoint (called after Firebase signup)
app.post('/api/users/register', authenticateToken, async (req, res) => {
  try {
    const { email, uid } = req.user;
    
    // 既存ユーザーをチェック
    const existingUser = await db.query(
      'SELECT * FROM users WHERE email = $1 OR firebase_uid = $2',
      [email, uid]
    );
    
    if (existingUser.rows.length > 0) {
      return res.json({
        user: existingUser.rows[0],
        message: 'User already exists'
      });
    }
    
    // 新規ユーザーを作成（承認待ち状態）
    const result = await db.query(
      'INSERT INTO users (firebase_uid, email, is_admin, is_approved) VALUES ($1, $2, $3, $4) RETURNING *',
      [uid, email, false, false]
    );
    
    const newUser = result.rows[0];
    
    // 管理者に承認依頼メールを送信（通知のみ、承認は管理者ページで行う）
    try {
      await sendApprovalRequestEmail(email, null);
    } catch (emailError) {
      console.error('Failed to send approval request email:', emailError);
      // メール送信失敗でもユーザー登録は成功とする
    }
    
    res.status(201).json({
      user: newUser,
      message: 'User registered. Waiting for admin approval.'
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Get all users
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, name, company, department, position, is_admin, is_approved, created_at FROM users ORDER BY created_at DESC'
    );
    
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Get pending approval users
app.get('/api/admin/users/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, name, company, department, position, created_at FROM users WHERE is_approved = FALSE ORDER BY created_at DESC'
    );
    
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Error fetching pending users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Resend approval request emails for all pending users
app.post('/api/admin/users/resend-approval-requests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, name FROM users WHERE is_approved = FALSE ORDER BY created_at DESC'
    );
    
    if (result.rows.length === 0) {
      return res.json({
        message: 'No pending users found',
        sent: 0
      });
    }
    
    const results = [];
    for (const user of result.rows) {
      try {
        await sendApprovalRequestEmail(user.email, user.name);
        results.push({ email: user.email, status: 'sent' });
      } catch (error) {
        console.error(`Failed to send email to ${user.email}:`, error);
        results.push({ email: user.email, status: 'failed', error: error.message });
      }
    }
    
    res.json({
      message: `Approval request emails sent for ${result.rows.length} user(s)`,
      results: results,
      sent: results.filter(r => r.status === 'sent').length,
      failed: results.filter(r => r.status === 'failed').length
    });
  } catch (error) {
    console.error('Error resending approval requests:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Approve user
app.post('/api/admin/users/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      'UPDATE users SET is_approved = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    // ユーザーに承認通知メールを送信
    try {
      await sendApprovalNotificationEmail(user.email);
    } catch (emailError) {
      console.error('Failed to send approval notification email:', emailError);
    }
    
    res.json({
      user: user,
      message: 'User approved successfully'
    });
  } catch (error) {
    console.error('Error approving user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Delete user
app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 自分自身を削除できないようにチェック
    const currentUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length > 0 && currentUser.rows[0].id === parseInt(id)) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const result = await db.query(
      'DELETE FROM users WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      message: 'User deleted successfully',
      deletedUser: result.rows[0]
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile
app.put('/api/users/profile', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { name, company, department, position } = req.body;
    
    if (!name || !company || !department || !position) {
      return res.status(400).json({ 
        error: 'Name, company, department, and position are required' 
      });
    }
    
    const result = await db.query(
      'UPDATE users SET name = $1, company = $2, department = $3, position = $4, updated_at = CURRENT_TIMESTAMP WHERE email = $5 RETURNING *',
      [name, company, department, position, req.user.email]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      user: result.rows[0],
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'dev'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  db.pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});
