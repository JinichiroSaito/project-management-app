const express = require('express');
const db = require('./db');
const admin = require('firebase-admin');
const { authenticateToken, optionalAuth, requireAdmin, requireApproved, initializeFirebase } = require('./middleware/auth');
const { sendApprovalRequestEmail, sendApprovalNotificationEmail, sendRegistrationConfirmationEmail } = require('./utils/email');

const app = express();
const PORT = process.env.PORT || 8080;

// Firebase初期化
initializeFirebase();

// 起動時にマイグレーションを実行（開発環境のみ、または環境変数で制御）
if (process.env.RUN_MIGRATIONS === 'true') {
  const runMigrations = require('./migrate');
  runMigrations().catch(err => {
    console.error('Migration failed on startup:', err);
  });
}

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
    // まず、テーブルの構造を確認して、新しいカラムが存在するかチェック
    let result;
    try {
      // 新しいカラムが存在する場合のクエリ
      result = await db.query(
        `SELECT p.*, 
                u1.name as executor_name, u1.email as executor_email,
                u2.name as reviewer_name, u2.email as reviewer_email
         FROM projects p
         LEFT JOIN users u1 ON p.executor_id = u1.id
         LEFT JOIN users u2 ON p.reviewer_id = u2.id
         ORDER BY p.created_at DESC`
      );
    } catch (queryError) {
      // 新しいカラムが存在しない場合（マイグレーション未実行）、既存のカラムのみで取得
      console.warn('[Projects] New columns not found, using legacy query:', queryError.message);
      result = await db.query(
        `SELECT p.*, 
                NULL as executor_name, NULL as executor_email,
                NULL as reviewer_name, NULL as reviewer_email
         FROM projects p
         ORDER BY p.created_at DESC`
      );
    }
    
    res.json({ 
      projects: result.rows,
      user: req.user || null
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Public endpoint - Get project by ID
app.get('/api/projects/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    let result;
    try {
      // 新しいカラムが存在する場合のクエリ
      result = await db.query(
        `SELECT p.*, 
                u1.name as executor_name, u1.email as executor_email,
                u2.name as reviewer_name, u2.email as reviewer_email
         FROM projects p
         LEFT JOIN users u1 ON p.executor_id = u1.id
         LEFT JOIN users u2 ON p.reviewer_id = u2.id
         WHERE p.id = $1`,
        [id]
      );
    } catch (queryError) {
      // 新しいカラムが存在しない場合（マイグレーション未実行）、既存のカラムのみで取得
      console.warn('[Project] New columns not found, using legacy query:', queryError.message);
      result = await db.query(
        `SELECT p.*, 
                NULL as executor_name, NULL as executor_email,
                NULL as reviewer_name, NULL as reviewer_email
         FROM projects p
         WHERE p.id = $1`,
        [id]
      );
    }
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching project:', error);
    console.error('Error details:', error.message, error.stack);
    res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Protected endpoint - Create new project (application)
app.post('/api/projects', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { name, description, requested_amount, reviewer_id } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }
    
    if (!requested_amount || requested_amount <= 0) {
      return res.status(400).json({ error: 'Requested amount is required and must be greater than 0' });
    }
    
    // 現在のユーザー情報を取得（実行者として設定）
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const executorId = currentUser.rows[0].id;
    
    // 実行者はプロジェクト実行者（executor）である必要がある
    if (currentUser.rows[0].position !== 'executor') {
      return res.status(403).json({ error: 'Only project executors can create project applications' });
    }
    
    // 審査者IDが指定されている場合、プロジェクト審査者（reviewer）であることを確認
    if (reviewer_id) {
      const reviewer = await db.query(
        'SELECT id, position FROM users WHERE id = $1',
        [reviewer_id]
      );
      
      if (reviewer.rows.length === 0) {
        return res.status(404).json({ error: 'Reviewer not found' });
      }
      
      if (reviewer.rows[0].position !== 'reviewer') {
        return res.status(400).json({ error: 'Reviewer must be a project reviewer' });
      }
    }
    
    const result = await db.query(
      'INSERT INTO projects (name, description, status, executor_id, reviewer_id, requested_amount, application_status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [name, description || '', 'planning', executorId, reviewer_id || null, requested_amount, 'draft']
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

// Protected endpoint - Update project (application)
app.put('/api/projects/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, status, requested_amount, reviewer_id, application_status } = req.body;
    
    // プロジェクトの所有者を確認
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const project = await db.query(
      'SELECT executor_id, reviewer_id, application_status FROM projects WHERE id = $1',
      [id]
    );
    
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const projectData = project.rows[0];
    const isExecutor = projectData.executor_id === currentUser.rows[0].id;
    const isReviewer = projectData.reviewer_id === currentUser.rows[0].id;
    const isAdmin = currentUser.rows[0].position === 'admin' || (await db.query('SELECT is_admin FROM users WHERE id = $1', [currentUser.rows[0].id])).rows[0]?.is_admin;
    
    // 実行者は申請の編集が可能（draft状態のみ）
    // 審査者は審査のみ可能
    if (!isExecutor && !isReviewer && !isAdmin) {
      return res.status(403).json({ error: 'You do not have permission to update this project' });
    }
    
    // 実行者は申請の提出まで可能
    if (isExecutor && application_status && application_status !== 'draft' && application_status !== 'submitted') {
      return res.status(403).json({ error: 'Executors can only submit applications, not change status after submission' });
    }
    
    // 審査者は審査のみ可能
    if (isReviewer && application_status && !['approved', 'rejected'].includes(application_status)) {
      return res.status(403).json({ error: 'Reviewers can only approve or reject applications' });
    }
    
    // 審査者IDが指定されている場合、プロジェクト審査者であることを確認
    if (reviewer_id) {
      const reviewer = await db.query(
        'SELECT id, position FROM users WHERE id = $1',
        [reviewer_id]
      );
      
      if (reviewer.rows.length === 0) {
        return res.status(404).json({ error: 'Reviewer not found' });
      }
      
      if (reviewer.rows[0].position !== 'reviewer') {
        return res.status(400).json({ error: 'Reviewer must be a project reviewer' });
      }
    }
    
    const result = await db.query(
      `UPDATE projects 
       SET name = COALESCE($1, name), 
           description = COALESCE($2, description), 
           status = COALESCE($3, status),
           requested_amount = COALESCE($4, requested_amount),
           reviewer_id = COALESCE($5, reviewer_id),
           application_status = COALESCE($6, application_status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $7 RETURNING *`,
      [name, description, status, requested_amount, reviewer_id, application_status, id]
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
    
    // 新規ユーザーを作成（承認待ち状態）
    const result = await db.query(
      'INSERT INTO users (firebase_uid, email, is_admin, is_approved) VALUES ($1, $2, $3, $4) RETURNING *',
      [uid, email, false, false]
    );
    
    const newUser = result.rows[0];
    console.log(`[Register] New user created:`, { id: newUser.id, email: newUser.email, is_approved: newUser.is_approved, firebase_uid: newUser.firebase_uid });
    
    // ユーザーに登録確認メールを送信
    try {
      console.log(`[Register] Attempting to send registration confirmation email to: ${email}`);
      await sendRegistrationConfirmationEmail(email);
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
    
    // 承認待ちユーザーを取得（プロフィール情報が入力されているもののみ）
    const result = await db.query(
      'SELECT id, email, name, company, department, position, is_approved, created_at FROM users WHERE is_approved = FALSE AND name IS NOT NULL AND company IS NOT NULL AND department IS NOT NULL AND position IS NOT NULL ORDER BY created_at DESC'
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

// Admin: Update user (including position)
app.put('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, company, department, position, is_admin, is_approved } = req.body;
    
    // 更新するフィールドを動的に構築
    const updates = [];
    const values = [];
    let paramIndex = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(name);
    }
    if (company !== undefined) {
      updates.push(`company = $${paramIndex++}`);
      values.push(company);
    }
    if (department !== undefined) {
      updates.push(`department = $${paramIndex++}`);
      values.push(department);
    }
    if (position !== undefined) {
      updates.push(`position = $${paramIndex++}`);
      values.push(position);
    }
    if (is_admin !== undefined) {
      updates.push(`is_admin = $${paramIndex++}`);
      values.push(is_admin);
    }
    if (is_approved !== undefined) {
      updates.push(`is_approved = $${paramIndex++}`);
      values.push(is_approved);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const query = `UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`;
    
    const result = await db.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      user: result.rows[0],
      message: 'User updated successfully'
    });
  } catch (error) {
    console.error('Error updating user:', error);
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

// ==================== Project Application & Review APIs ====================

// Get reviewers list (for project executors to select)
app.get('/api/users/reviewers', authenticateToken, requireApproved, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT id, name, email, company, department FROM users WHERE position = $1 AND is_approved = TRUE ORDER BY name',
      ['reviewer']
    );
    
    console.log(`[Reviewers] Fetched ${result.rows.length} reviewers`);
    res.json({ reviewers: result.rows });
  } catch (error) {
    console.error('Error fetching reviewers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit project application (executor only)
app.post('/api/projects/:id/submit', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 現在のユーザー情報を取得
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // プロジェクトの所有者を確認
    const project = await db.query(
      'SELECT executor_id, application_status, requested_amount, reviewer_id FROM projects WHERE id = $1',
      [id]
    );
    
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const projectData = project.rows[0];
    
    if (projectData.executor_id !== currentUser.rows[0].id) {
      return res.status(403).json({ error: 'Only the project executor can submit the application' });
    }
    
    if (projectData.application_status !== 'draft') {
      return res.status(400).json({ error: 'Project application has already been submitted' });
    }
    
    if (!projectData.reviewer_id) {
      return res.status(400).json({ error: 'Reviewer must be assigned before submission' });
    }
    
    // 申請を提出
    const result = await db.query(
      'UPDATE projects SET application_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['submitted', id]
    );
    
    res.json({
      project: result.rows[0],
      message: 'Project application submitted successfully'
    });
  } catch (error) {
    console.error('Error submitting project application:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Review project application (reviewer only)
app.post('/api/projects/:id/review', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, review_comment } = req.body; // decision: 'approved' or 'rejected'
    
    if (!decision || !['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be either "approved" or "rejected"' });
    }
    
    // 現在のユーザー情報を取得
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // プロジェクトの審査者を確認
    const project = await db.query(
      'SELECT reviewer_id, application_status FROM projects WHERE id = $1',
      [id]
    );
    
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const projectData = project.rows[0];
    
    if (projectData.reviewer_id !== currentUser.rows[0].id) {
      return res.status(403).json({ error: 'Only the assigned reviewer can review this application' });
    }
    
    if (projectData.application_status !== 'submitted') {
      return res.status(400).json({ error: 'Project application must be submitted before review' });
    }
    
    // 審査を実行
    const result = await db.query(
      `UPDATE projects 
       SET application_status = $1, 
           review_comment = $2,
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [decision, review_comment || null, currentUser.rows[0].id, id]
    );
    
    // 承認された場合、ステータスをactiveに変更
    if (decision === 'approved') {
      await db.query(
        'UPDATE projects SET status = $1 WHERE id = $2',
        ['active', id]
      );
    }
    
    res.json({
      project: result.rows[0],
      message: `Project application ${decision} successfully`
    });
  } catch (error) {
    console.error('Error reviewing project application:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get projects for review (reviewer only)
app.get('/api/projects/review/pending', authenticateToken, requireApproved, async (req, res) => {
  try {
    // 現在のユーザー情報を取得
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // 審査者であることを確認
    if (currentUser.rows[0].position !== 'reviewer') {
      return res.status(403).json({ error: 'Only reviewers can access this endpoint' });
    }
    
    const result = await db.query(
      `SELECT p.*, 
              u1.name as executor_name, u1.email as executor_email,
              u2.name as reviewer_name, u2.email as reviewer_email
       FROM projects p
       LEFT JOIN users u1 ON p.executor_id = u1.id
       LEFT JOIN users u2 ON p.reviewer_id = u2.id
       WHERE p.reviewer_id = $1 AND p.application_status = 'submitted'
       ORDER BY p.created_at DESC`,
      [currentUser.rows[0].id]
    );
    
    res.json({ projects: result.rows });
  } catch (error) {
    console.error('Error fetching pending review projects:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get my projects (executor only)
app.get('/api/projects/my', authenticateToken, requireApproved, async (req, res) => {
  try {
    // 現在のユーザー情報を取得
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const result = await db.query(
      `SELECT p.*, 
              u1.name as executor_name, u1.email as executor_email,
              u2.name as reviewer_name, u2.email as reviewer_email
       FROM projects p
       LEFT JOIN users u1 ON p.executor_id = u1.id
       LEFT JOIN users u2 ON p.reviewer_id = u2.id
       WHERE p.executor_id = $1
       ORDER BY p.created_at DESC`,
      [currentUser.rows[0].id]
    );
    
    res.json({ projects: result.rows });
  } catch (error) {
    console.error('Error fetching my projects:', error);
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
