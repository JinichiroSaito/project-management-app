const express = require('express');
const crypto = require('crypto');
const db = require('./db');
const admin = require('firebase-admin');
const { authenticateToken, optionalAuth, requireAdmin, requireApproved, initializeFirebase } = require('./middleware/auth');
const { sendApprovalRequestEmail, sendApprovalNotificationEmail, sendRegistrationConfirmationEmail } = require('./utils/email');

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
    console.log(`[Register] Registration request for:`, { email, uid });
    
    // 既存ユーザーをチェック
    const existingUser = await db.query(
      'SELECT * FROM users WHERE email = $1 OR firebase_uid = $2',
      [email, uid]
    );
    
    if (existingUser.rows.length > 0) {
      console.log(`[Register] User already exists:`, { id: existingUser.rows[0].id, email: existingUser.rows[0].email, is_approved: existingUser.rows[0].is_approved });
      return res.json({
        user: existingUser.rows[0],
        message: 'User already exists'
      });
    }
    
    // 承認トークンを生成（24時間有効）
    const approvalToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setHours(tokenExpiresAt.getHours() + 24);
    
    // 新規ユーザーを作成（承認待ち状態、承認トークンを含む）
    const result = await db.query(
      'INSERT INTO users (firebase_uid, email, is_admin, is_approved, approval_token, approval_token_expires_at) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [uid, email, false, false, approvalToken, tokenExpiresAt]
    );
    
    const newUser = result.rows[0];
    console.log(`[Register] New user created:`, { id: newUser.id, email: newUser.email, is_approved: newUser.is_approved, firebase_uid: newUser.firebase_uid });
    
    // ユーザーに登録確認メールを送信（承認リンクを含む）
    try {
      console.log(`[Register] Attempting to send registration confirmation email to: ${email}`);
      await sendRegistrationConfirmationEmail(email, approvalToken);
      console.log(`[Register] ✓ Registration confirmation email sent successfully to: ${email}`);
    } catch (emailError) {
      console.error('[Register] ✗ Failed to send registration confirmation email:', emailError);
      console.error('[Register] Email error details:', {
        message: emailError.message,
        code: emailError.code,
        stack: emailError.stack
      });
      // メール送信失敗でもユーザー登録は成功とする
    }
    
    // 注意: 管理者への承認依頼メールは、プロフィール情報が入力された後に送信される
    
    res.status(201).json({
      user: newUser,
      message: 'User registered. Waiting for admin approval.'
    });
  } catch (error) {
    console.error('[Register] Error registering user:', error);
    console.error('[Register] Error stack:', error.stack);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});

// Admin: Get all users
app.get('/api/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, name, company, department, position, is_admin, is_approved, created_at FROM users ORDER BY created_at DESC'
    );
    
    console.log(`[Admin] Fetched ${result.rows.length} total users`);
    const pendingCount = result.rows.filter(u => !u.is_approved).length;
    console.log(`[Admin] Pending users in all users: ${pendingCount}`);
    const specificUser = result.rows.find(u => u.email === 'jinichirou.saitou@asahigroup-holdings.com');
    if (specificUser) {
      console.log(`[Admin] Found specific user:`, { id: specificUser.id, email: specificUser.email, is_approved: specificUser.is_approved });
    }
    
    res.json({ users: result.rows });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Get pending approval users
app.get('/api/admin/users/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // まず、すべてのユーザーを取得してデバッグ
    const allUsers = await db.query('SELECT id, email, is_approved FROM users');
    console.log(`[Admin] Total users in database: ${allUsers.rows.length}`);
    console.log('[Admin] All users:', allUsers.rows.map(u => ({ id: u.id, email: u.email, is_approved: u.is_approved })));
    
    // 承認待ちユーザーを取得
    const result = await db.query(
      'SELECT id, email, name, company, department, position, is_approved, created_at FROM users WHERE is_approved = FALSE ORDER BY created_at DESC'
    );
    
    console.log(`[Admin] Fetched ${result.rows.length} pending users`);
    console.log('[Admin] Pending users:', result.rows.map(u => ({ id: u.id, email: u.email, is_approved: u.is_approved })));
    
    // 特定のユーザーを確認
    const specificUser = result.rows.find(u => u.email === 'jinichirou.saitou@asahigroup-holdings.com');
    if (specificUser) {
      console.log(`[Admin] Found specific user in pending:`, specificUser);
    } else {
      const allSpecificUser = allUsers.rows.find(u => u.email === 'jinichirou.saitou@asahigroup-holdings.com');
      if (allSpecificUser) {
        console.log(`[Admin] Specific user exists but is_approved=${allSpecificUser.is_approved}:`, allSpecificUser);
      } else {
        console.log(`[Admin] Specific user not found in database at all`);
      }
    }
    
    res.json({ users: result.rows });
  } catch (error) {
    console.error('[Admin] Error fetching pending users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Resend approval request emails for all pending users
app.post('/api/admin/users/resend-approval-requests', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, email, name, company, department, position FROM users WHERE is_approved = FALSE ORDER BY created_at DESC'
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
        // プロフィール情報が入力されている場合のみ送信
        if (user.name && user.company) {
          await sendApprovalRequestEmail(user.email, user.name, user.company, user.department || '', user.position || '');
          results.push({ email: user.email, status: 'sent' });
        } else {
          results.push({ email: user.email, status: 'skipped', reason: 'Profile not complete' });
        }
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

// Public endpoint: Approve user via email token
app.get('/api/users/approve', async (req, res) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(400).json({ error: 'Approval token is required' });
    }
    
    // トークンでユーザーを検索（有効期限内）
    const result = await db.query(
      'SELECT id, email, name, is_approved, approval_token_expires_at FROM users WHERE approval_token = $1 AND approval_token_expires_at > NOW()',
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired approval token' });
    }
    
    const user = result.rows[0];
    
    // 既に承認済みの場合
    if (user.is_approved) {
      return res.json({
        message: 'Account is already approved',
        user: user
      });
    }
    
    // ユーザーを承認
    const updateResult = await db.query(
      'UPDATE users SET is_approved = TRUE, approval_token = NULL, approval_token_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [user.id]
    );
    
    const approvedUser = updateResult.rows[0];
    console.log(`[Approve] User approved via email token: ${user.email}`);
    
    // ユーザーに承認通知メールを送信
    try {
      await sendApprovalNotificationEmail(user.email, user.name);
    } catch (emailError) {
      console.error('Failed to send approval notification email:', emailError);
    }
    
    res.json({
      user: approvedUser,
      message: 'Account approved successfully'
    });
  } catch (error) {
    console.error('[Approve] Error approving user via token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin: Approve user
app.post('/api/admin/users/:id/approve', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(
      'UPDATE users SET is_approved = TRUE, approval_token = NULL, approval_token_expires_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = result.rows[0];
    
    // ユーザーに承認通知メールを送信
    try {
      await sendApprovalNotificationEmail(user.email, user.name);
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
    
    // 削除するユーザー情報を取得（Firebase UIDが必要）
    const userToDelete = await db.query(
      'SELECT firebase_uid, email FROM users WHERE id = $1',
      [id]
    );
    
    if (userToDelete.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const { firebase_uid, email } = userToDelete.rows[0];
    
    // データベースから削除
    const result = await db.query(
      'DELETE FROM users WHERE id = $1 RETURNING *',
      [id]
    );
    
    // Firebase Authenticationからも削除
    try {
      const app = initializeFirebase();
      if (app && firebase_uid && firebase_uid !== 'admin-initial') {
        await admin.auth().deleteUser(firebase_uid);
        console.log(`[Delete] Firebase user deleted: ${email} (${firebase_uid})`);
      }
    } catch (firebaseError) {
      console.error(`[Delete] Failed to delete Firebase user ${email}:`, firebaseError);
      // Firebase削除失敗でもデータベース削除は成功とする
    }
    
    console.log(`[Delete] User deleted from database: ${email} (id: ${id})`);
    
    res.json({
      message: 'User deleted successfully',
      deletedUser: result.rows[0]
    });
  } catch (error) {
    console.error('[Delete] Error deleting user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update user profile (承認待ちユーザーもプロフィールを入力できるように requireApproved を削除)
app.put('/api/users/profile', authenticateToken, async (req, res) => {
  try {
    const { name, company, department, position } = req.body;
    
    if (!name || !company || !department || !position) {
      return res.status(400).json({ 
        error: 'Name, company, department, and position are required' 
      });
    }
    
    // 現在のユーザー情報を取得（プロフィール入力前かどうかを確認）
    const currentUser = await db.query(
      'SELECT name, company, department, position, is_approved FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const wasProfileEmpty = !currentUser.rows[0].name || !currentUser.rows[0].company;
    const isPending = !currentUser.rows[0].is_approved;
    
    // プロフィール情報を更新
    const result = await db.query(
      'UPDATE users SET name = $1, company = $2, department = $3, position = $4, updated_at = CURRENT_TIMESTAMP WHERE email = $5 RETURNING *',
      [name, company, department, position, req.user.email]
    );
    
    // プロフィール情報が初めて入力され、かつ承認待ちの場合、管理者に承認依頼メールを送信
    if (wasProfileEmpty && isPending) {
      try {
        await sendApprovalRequestEmail(req.user.email, name, company, department, position);
        console.log(`[Profile] Approval request email sent to admin for: ${req.user.email}`);
      } catch (emailError) {
        console.error('[Profile] Failed to send approval request email:', emailError);
        // メール送信失敗でもプロフィール更新は成功とする
      }
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
