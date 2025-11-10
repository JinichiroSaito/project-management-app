// ローカル開発環境で.envファイルを読み込む
if (process.env.NODE_ENV !== 'production' && !process.env.GCP_PROJECT) {
  require('dotenv').config();
}

const express = require('express');
const db = require('./db');
const admin = require('firebase-admin');
const { authenticateToken, optionalAuth, requireAdmin, requireApproved, initializeFirebase } = require('./middleware/auth');
const { sendApprovalRequestEmail, sendApprovalNotificationEmail, sendRegistrationConfirmationEmail } = require('./utils/email');
const upload = require('./middleware/upload');
const { uploadFile, deleteFile } = require('./utils/storage');
const { extractTextFromFile, checkMissingSections } = require('./utils/gemini');

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
app.use(express.json({ limit: '50mb' })); // ファイルアップロード用にサイズ制限を拡大
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// リクエストログミドルウェア
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

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

// エラーハンドリングヘルパー関数
function handleError(res, error, context = '') {
  const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
  
  console.error(`[ERROR${context ? ` - ${context}` : ''}]`, {
    message: error.message,
    stack: error.stack,
    code: error.code,
    detail: error.detail,
    hint: error.hint
  });
  
  // データベースエラーの場合
  if (error.code && error.code.startsWith('2')) {
    return res.status(400).json({
      error: 'Database error',
      message: error.message,
      details: isDevelopment ? {
        code: error.code,
        detail: error.detail,
        hint: error.hint
      } : undefined
    });
  }
  
  // その他のエラー
  return res.status(500).json({
    error: 'Internal server error',
    message: isDevelopment ? error.message : undefined,
    details: isDevelopment ? {
      stack: error.stack,
      code: error.code
    } : undefined
  });
}

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
    console.error('[Health Check] Database connection error:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      stack: error.stack
    });
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? {
        code: error.code,
        detail: error.detail,
        hint: error.hint
      } : undefined
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
    return handleError(res, error, 'Fetch Projects');
  }
});

// Get my projects (executor only) - このルートを /api/projects/:id より前に定義する必要がある
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
    
    // 実行者であることを確認
    if (currentUser.rows[0].position !== 'executor') {
      return res.status(403).json({ error: 'Only project executors can access this endpoint' });
    }
    
    let result;
    try {
      // 新しいカラムが存在する場合のクエリ（自身が実行者であるプロジェクトのみ）
      result = await db.query(
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
    } catch (queryError) {
      // 新しいカラムが存在しない場合（マイグレーション未実行）、空の配列を返す
      console.warn('[My Projects] New columns not found, returning empty array:', queryError.message);
      return res.json({ projects: [] });
    }
    
    console.log(`[My Projects] Fetched ${result.rows.length} projects for executor ${currentUser.rows[0].id}`);
    res.json({ projects: result.rows });
  } catch (error) {
    return handleError(res, error, 'Fetch My Projects');
  }
});

// Get projects for review (reviewer only) - このルートも /api/projects/:id より前に定義する必要がある
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
         WHERE p.reviewer_id = $1 AND p.application_status = 'submitted'
         ORDER BY p.created_at DESC`,
        [currentUser.rows[0].id]
      );
    } catch (queryError) {
      // 新しいカラムが存在しない場合（マイグレーション未実行）
      console.warn('[Review Pending] New columns not found:', queryError.message);
      return res.json({ projects: [] });
    }
    
    res.json({ projects: result.rows });
  } catch (error) {
    return handleError(res, error, 'Fetch Pending Review Projects');
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
    return handleError(res, error, 'Fetch Project');
  }
});

// Protected endpoint - Create new project (application)
app.post('/api/projects', authenticateToken, requireApproved, upload.single('applicationFile'), async (req, res) => {
  try {
    const { 
      name, 
      description, 
      requested_amount, 
      reviewer_id
    } = req.body;
    
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
    
    // ファイルアップロード処理
    let fileInfo = null;
    if (req.file) {
      try {
        fileInfo = await uploadFile(req.file, null, executorId.toString());
      } catch (uploadError) {
        console.error('[Project Create] File upload failed:', uploadError);
        return res.status(500).json({ 
          error: 'File upload failed',
          message: uploadError.message
        });
      }
    }
    
    // プロジェクトを作成
    let result;
    try {
      // ファイルアップロードカラムが存在する場合のINSERT
      result = await db.query(
        `INSERT INTO projects (
          name, description, status, executor_id, reviewer_id, requested_amount, application_status,
          application_file_url, application_file_name, application_file_type, application_file_size, application_file_uploaded_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
        [
          name, 
          description || '', 
          'planning', 
          executorId, 
          reviewer_id || null, 
          requested_amount, 
          'draft',
          fileInfo?.url || null,
          fileInfo?.originalName || null,
          fileInfo?.contentType || null,
          fileInfo?.size || null,
          fileInfo ? new Date() : null
        ]
      );
    } catch (insertError) {
      // ファイルアップロードに失敗した場合、アップロードしたファイルを削除
      if (fileInfo) {
        await deleteFile(fileInfo.url);
      }
      
      // ファイルカラムが存在しない場合、従来の形式でINSERT
      if (insertError.message && insertError.message.includes('column') && insertError.message.includes('does not exist')) {
        console.warn('[Project Create] File columns not found, using legacy format');
        try {
          result = await db.query(
            'INSERT INTO projects (name, description, status, executor_id, reviewer_id, requested_amount, application_status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
            [name, description || '', 'planning', executorId, reviewer_id || null, requested_amount, 'draft']
          );
        } catch (legacyError) {
          // 従来のカラムも存在しない場合
          if (legacyError.message && legacyError.message.includes('column') && legacyError.message.includes('does not exist')) {
            console.error('[Project Create] Database migration required:', legacyError.message);
            return res.status(500).json({ 
              error: 'Database migration required',
              message: 'The projects table needs to be updated. Please run migrations or contact an administrator.',
              details: process.env.NODE_ENV === 'development' ? legacyError.message : undefined
            });
          }
          throw legacyError;
        }
      } else {
        throw insertError;
      }
    }
    
    res.status(201).json({
      ...result.rows[0],
      created_by: req.user.email
    });
  } catch (error) {
    return handleError(res, error, 'Create Project');
  }
});

// Protected endpoint - Update project (application)
app.put('/api/projects/:id', authenticateToken, upload.single('applicationFile'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      status, 
      requested_amount, 
      reviewer_id, 
      application_status
    } = req.body;
    
    // プロジェクトの所有者を確認
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const project = await db.query(
      'SELECT executor_id, reviewer_id, application_status, application_file_url FROM projects WHERE id = $1',
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
    
    // ファイルアップロード処理（新しいファイルがアップロードされた場合）
    let fileInfo = null;
    let oldFileUrl = null;
    if (req.file) {
      // 既存のファイルがあれば削除対象として記録
      oldFileUrl = projectData.application_file_url;
      
      try {
        fileInfo = await uploadFile(req.file, id.toString(), currentUser.rows[0].id.toString());
      } catch (uploadError) {
        console.error('[Project Update] File upload failed:', uploadError);
        return res.status(500).json({ 
          error: 'File upload failed',
          message: uploadError.message
        });
      }
    }
    
    // ファイルアップロードカラムが存在するかチェックしてからUPDATE
    let result;
    try {
      // ファイルアップロードカラムが存在する場合のUPDATE
      result = await db.query(
        `UPDATE projects 
         SET name = COALESCE($1, name), 
             description = COALESCE($2, description), 
             status = COALESCE($3, status),
             requested_amount = COALESCE($4, requested_amount),
             reviewer_id = COALESCE($5, reviewer_id),
             application_status = COALESCE($6, application_status),
             application_file_url = COALESCE($7, application_file_url),
             application_file_name = COALESCE($8, application_file_name),
             application_file_type = COALESCE($9, application_file_type),
             application_file_size = COALESCE($10, application_file_size),
             application_file_uploaded_at = COALESCE($11, application_file_uploaded_at),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $12 RETURNING *`,
        [
          name, description, status, requested_amount, reviewer_id, application_status,
          fileInfo?.url || null,
          fileInfo?.originalName || null,
          fileInfo?.contentType || null,
          fileInfo?.size || null,
          fileInfo ? new Date() : null,
          id
        ]
      );
      
      // 新しいファイルがアップロードされた場合、古いファイルを削除
      if (fileInfo && oldFileUrl) {
        await deleteFile(oldFileUrl);
      }
    } catch (updateError) {
      // 新しいファイルをアップロードしたが、更新に失敗した場合、アップロードしたファイルを削除
      if (fileInfo) {
        await deleteFile(fileInfo.url);
      }
      
      // ファイルカラムが存在しない場合、従来の形式でUPDATE
      if (updateError.message && updateError.message.includes('column') && updateError.message.includes('does not exist')) {
        console.warn('[Project Update] File columns not found, using legacy format');
        result = await db.query(
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
      } else {
        throw updateError;
      }
    }
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    res.json({
      ...result.rows[0],
      updated_by: req.user.email
    });
  } catch (error) {
    return handleError(res, error, 'Update Project');
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
    return handleError(res, error, 'Delete Project');
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
    return handleError(res, error, 'Fetch User Info');
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
    return handleError(res, error, 'Register User');
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
    return handleError(res, error, 'Fetch Users');
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
    return handleError(res, error, 'Fetch Pending Users');
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
    return handleError(res, error, 'Resend Approval Requests');
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
    return handleError(res, error, 'Approve User');
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
    return handleError(res, error, 'Update User');
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
    return handleError(res, error, 'Delete User');
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
    return handleError(res, error, 'Update Profile');
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
    return handleError(res, error, 'Fetch Reviewers');
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
    return handleError(res, error, 'Submit Project Application');
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
    return handleError(res, error, 'Review Project Application');
  }
});

// ==================== KPI Reports API ====================

// Get KPI reports for a project
app.get('/api/projects/:id/kpi-reports', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    
    // プロジェクトの存在確認と権限確認
    const project = await db.query(
      'SELECT executor_id, requested_amount FROM projects WHERE id = $1',
      [id]
    );
    
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const currentUser = await db.query(
      'SELECT id, position, is_admin FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = currentUser.rows[0];
    const projectData = project.rows[0];
    
    // 実行者、審査者、または管理者のみアクセス可能
    if (projectData.executor_id !== user.id && 
        !user.is_admin && 
        user.position !== 'reviewer') {
      return res.status(403).json({ error: 'Access denied' });
    }
    
    // KPI報告を取得
    let result;
    try {
      result = await db.query(
        `SELECT * FROM kpi_reports 
         WHERE project_id = $1 
         ORDER BY created_at DESC`,
        [id]
      );
    } catch (queryError) {
      // テーブルが存在しない場合（マイグレーション未実行）
      if (queryError.message && queryError.message.includes('does not exist')) {
        return res.json({ reports: [] });
      }
      throw queryError;
    }
    
    res.json({ reports: result.rows });
  } catch (error) {
    return handleError(res, error, 'Fetch KPI Reports');
  }
});

// Create or update KPI report
app.post('/api/projects/:id/kpi-reports', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      report_type, 
      verification_content, 
      kpi_metrics, 
      planned_date, 
      planned_budget,
      period_start,
      period_end
    } = req.body;
    
    if (!report_type) {
      return res.status(400).json({ error: 'Report type is required' });
    }
    
    // プロジェクトの存在確認と権限確認
    const project = await db.query(
      'SELECT executor_id, requested_amount FROM projects WHERE id = $1',
      [id]
    );
    
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = currentUser.rows[0];
    const projectData = project.rows[0];
    
    // 実行者のみがKPI報告を作成可能
    if (projectData.executor_id !== user.id) {
      return res.status(403).json({ error: 'Only project executors can create KPI reports' });
    }
    
    // KPI報告を作成
    let result;
    try {
      result = await db.query(
        `INSERT INTO kpi_reports 
         (project_id, report_type, verification_content, kpi_metrics, planned_date, planned_budget, period_start, period_end, created_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'draft')
         RETURNING *`,
        [
          id,
          report_type,
          verification_content || null,
          kpi_metrics ? JSON.stringify(kpi_metrics) : null,
          planned_date || null,
          planned_budget || null,
          period_start || null,
          period_end || null,
          user.id
        ]
      );
    } catch (insertError) {
      // テーブルが存在しない場合（マイグレーション未実行）
      if (insertError.message && insertError.message.includes('does not exist')) {
        return res.status(500).json({ 
          error: 'Database migration required',
          message: 'KPI reports table needs to be created. Please run migration 005_kpi_reports_enhancement.sql or contact an administrator.'
        });
      }
      throw insertError;
    }
    
    res.status(201).json({ report: result.rows[0] });
  } catch (error) {
    return handleError(res, error, 'Create KPI Report');
  }
});

// Update KPI report
app.put('/api/projects/:id/kpi-reports/:reportId', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id, reportId } = req.params;
    const { 
      verification_content, 
      kpi_metrics, 
      planned_date, 
      planned_budget,
      period_start,
      period_end,
      status
    } = req.body;
    
    // プロジェクトとKPI報告の存在確認
    const project = await db.query(
      'SELECT executor_id FROM projects WHERE id = $1',
      [id]
    );
    
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const kpiReport = await db.query(
      'SELECT created_by FROM kpi_reports WHERE id = $1 AND project_id = $2',
      [reportId, id]
    );
    
    if (kpiReport.rows.length === 0) {
      return res.status(404).json({ error: 'KPI report not found' });
    }
    
    const currentUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // 実行者のみがKPI報告を更新可能
    if (project.rows[0].executor_id !== currentUser.rows[0].id) {
      return res.status(403).json({ error: 'Only project executors can update KPI reports' });
    }
    
    // 更新フィールドを構築
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;
    
    if (verification_content !== undefined) {
      updateFields.push(`verification_content = $${paramIndex++}`);
      updateValues.push(verification_content);
    }
    if (kpi_metrics !== undefined) {
      updateFields.push(`kpi_metrics = $${paramIndex++}`);
      updateValues.push(JSON.stringify(kpi_metrics));
    }
    if (planned_date !== undefined) {
      updateFields.push(`planned_date = $${paramIndex++}`);
      updateValues.push(planned_date);
    }
    if (planned_budget !== undefined) {
      updateFields.push(`planned_budget = $${paramIndex++}`);
      updateValues.push(planned_budget);
    }
    if (period_start !== undefined) {
      updateFields.push(`period_start = $${paramIndex++}`);
      updateValues.push(period_start);
    }
    if (period_end !== undefined) {
      updateFields.push(`period_end = $${paramIndex++}`);
      updateValues.push(period_end);
    }
    if (status !== undefined) {
      updateFields.push(`status = $${paramIndex++}`);
      updateValues.push(status);
      if (status === 'submitted') {
        updateFields.push(`submitted_at = CURRENT_TIMESTAMP`);
      }
    }
    
    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    updateValues.push(reportId);
    
    const result = await db.query(
      `UPDATE kpi_reports 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      updateValues
    );
    
    res.json({ report: result.rows[0] });
  } catch (error) {
    return handleError(res, error, 'Update KPI Report');
  }
});

// Delete KPI report
app.delete('/api/projects/:id/kpi-reports/:reportId', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id, reportId } = req.params;
    
    // プロジェクトとKPI報告の存在確認
    const project = await db.query(
      'SELECT executor_id FROM projects WHERE id = $1',
      [id]
    );
    
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const currentUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // 実行者のみがKPI報告を削除可能
    if (project.rows[0].executor_id !== currentUser.rows[0].id) {
      return res.status(403).json({ error: 'Only project executors can delete KPI reports' });
    }
    
    await db.query(
      'DELETE FROM kpi_reports WHERE id = $1 AND project_id = $2',
      [reportId, id]
    );
    
    res.json({ message: 'KPI report deleted successfully' });
  } catch (error) {
    return handleError(res, error, 'Delete KPI Report');
  }
});

// グローバルエラーハンドラー（未処理のエラーをキャッチ）
app.use((error, req, res, next) => {
  console.error('[Unhandled Error]', {
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method
  });
  
  if (!res.headersSent) {
    return handleError(res, error, 'Unhandled Error');
  }
});

// Protected endpoint - Extract text from uploaded file
app.post('/api/projects/:id/extract-text', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    
    // プロジェクトを取得
    const project = await db.query(
      'SELECT id, application_file_url, application_file_name, application_file_type, executor_id FROM projects WHERE id = $1',
      [id]
    );
    
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const projectData = project.rows[0];
    
    // ファイルがアップロードされているか確認
    if (!projectData.application_file_url) {
      return res.status(400).json({ error: 'No file uploaded for this project' });
    }
    
    // 現在のユーザーが実行者または管理者か確認
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const isExecutor = projectData.executor_id === currentUser.rows[0].id;
    const isAdmin = currentUser.rows[0].position === 'admin';
    
    if (!isExecutor && !isAdmin) {
      return res.status(403).json({ error: 'You do not have permission to extract text from this project' });
    }
    
    // テキストを抽出
    // ファイル名から拡張子を判定してMIMEタイプを決定
    let fileType = projectData.application_file_type;
    if (!fileType && projectData.application_file_name) {
      const fileName = projectData.application_file_name.toLowerCase();
      if (fileName.endsWith('.pdf')) {
        fileType = 'application/pdf';
      } else if (fileName.endsWith('.pptx')) {
        fileType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
      } else if (fileName.endsWith('.ppt')) {
        fileType = 'application/vnd.ms-powerpoint';
      } else if (fileName.endsWith('.pptm')) {
        fileType = 'application/vnd.ms-powerpoint.presentation.macroEnabled.12';
      }
    }
    
    const extractedText = await extractTextFromFile(
      projectData.application_file_url,
      fileType
    );
    
    // データベースに保存
    await db.query(
      `UPDATE projects 
       SET extracted_text = $1, 
           extracted_text_updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [extractedText, id]
    );
    
    res.json({
      success: true,
      extracted_text: extractedText,
      message: 'Text extracted successfully'
    });
  } catch (error) {
    return handleError(res, error, 'Extract Text');
  }
});

// Protected endpoint - Check missing sections
app.post('/api/projects/:id/check-missing-sections', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    
    // プロジェクトを取得
    const project = await db.query(
      'SELECT id, extracted_text, executor_id FROM projects WHERE id = $1',
      [id]
    );
    
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const projectData = project.rows[0];
    
    // 抽出されたテキストがあるか確認
    if (!projectData.extracted_text) {
      return res.status(400).json({ 
        error: 'No extracted text found. Please extract text from the uploaded file first.' 
      });
    }
    
    // 現在のユーザーが実行者または管理者か確認
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const isExecutor = projectData.executor_id === currentUser.rows[0].id;
    const isAdmin = currentUser.rows[0].position === 'admin';
    
    if (!isExecutor && !isAdmin) {
      return res.status(403).json({ error: 'You do not have permission to check missing sections for this project' });
    }
    
    // 不足部分をチェック
    const analysisResult = await checkMissingSections(projectData.extracted_text);
    
    // データベースに保存
    await db.query(
      `UPDATE projects 
       SET missing_sections = $1, 
           missing_sections_updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify(analysisResult), id]
    );
    
    res.json({
      success: true,
      analysis: analysisResult,
      message: 'Missing sections checked successfully'
    });
  } catch (error) {
    return handleError(res, error, 'Check Missing Sections');
  }
});

// Protected endpoint - Get extracted text
app.get('/api/projects/:id/extracted-text', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    
    const project = await db.query(
      'SELECT id, extracted_text, extracted_text_updated_at, executor_id FROM projects WHERE id = $1',
      [id]
    );
    
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const projectData = project.rows[0];
    
    // 現在のユーザーが実行者、審査者、または管理者か確認
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const isExecutor = projectData.executor_id === currentUser.rows[0].id;
    const isReviewer = projectData.reviewer_id === currentUser.rows[0].id;
    const isAdmin = currentUser.rows[0].position === 'admin';
    
    if (!isExecutor && !isReviewer && !isAdmin) {
      return res.status(403).json({ error: 'You do not have permission to view extracted text for this project' });
    }
    
    res.json({
      extracted_text: projectData.extracted_text,
      extracted_text_updated_at: projectData.extracted_text_updated_at
    });
  } catch (error) {
    return handleError(res, error, 'Get Extracted Text');
  }
});

// Protected endpoint - Get missing sections analysis
app.get('/api/projects/:id/missing-sections', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    
    const project = await db.query(
      'SELECT id, missing_sections, missing_sections_updated_at, executor_id, reviewer_id FROM projects WHERE id = $1',
      [id]
    );
    
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const projectData = project.rows[0];
    
    // 現在のユーザーが実行者、審査者、または管理者か確認
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const isExecutor = projectData.executor_id === currentUser.rows[0].id;
    const isReviewer = projectData.reviewer_id === currentUser.rows[0].id;
    const isAdmin = currentUser.rows[0].position === 'admin';
    
    if (!isExecutor && !isReviewer && !isAdmin) {
      return res.status(403).json({ error: 'You do not have permission to view missing sections for this project' });
    }
    
    res.json({
      missing_sections: projectData.missing_sections,
      missing_sections_updated_at: projectData.missing_sections_updated_at
    });
  } catch (error) {
    return handleError(res, error, 'Get Missing Sections');
  }
});

// 404ハンドラー
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    method: req.method
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'dev'}`);
  console.log(`Database: ${process.env.DB_HOST || 'not configured'}`);
  console.log(`Firebase: ${process.env.FIREBASE_SERVICE_ACCOUNT ? 'configured' : 'not configured'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  db.pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});
