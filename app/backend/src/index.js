// ローカル開発環境で.envファイルを読み込む
if (process.env.NODE_ENV !== 'production' && !process.env.GCP_PROJECT) {
  require('dotenv').config();
}

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./db');
const admin = require('firebase-admin');
const { authenticateToken, optionalAuth, requireAdmin, requireApproved, initializeFirebase } = require('./middleware/auth');
const { sendApprovalRequestEmail, sendApprovalNotificationEmail, sendRegistrationConfirmationEmail } = require('./utils/email');
const upload = require('./middleware/upload');
const { uploadFile, deleteFile } = require('./utils/storage');
const { extractTextFromFile, checkMissingSections, businessAdvisorChat } = require('./utils/gemini');

// Approval route helpers
const APPROVAL_THRESHOLD = {
  UNDER_100M: '<100m',
  OVER_EQ_100M: '>=100m'
};

async function getApprovalRouteByAmount(amount) {
  const threshold = amount < 100000000 ? APPROVAL_THRESHOLD.UNDER_100M : APPROVAL_THRESHOLD.OVER_EQ_100M;
  const route = await db.query('SELECT * FROM approval_routes WHERE amount_threshold = $1', [threshold]);
  return route.rows[0] || null;
}

function buildReviewerApprovals(project, reviewers) {
  const current = project.reviewer_approvals || {};
  const base = {};
  
  // まず、既存の承認情報をすべて保持（reviewersに含まれていない審査者の承認情報も保持）
  Object.keys(current).forEach(key => {
    const existingApproval = current[key];
    // 空のオブジェクトの場合はスキップ
    if (existingApproval && typeof existingApproval === 'object' && Object.keys(existingApproval).length > 0) {
      // statusが設定されている場合は保持
      if (existingApproval.status) {
        base[key] = existingApproval;
      }
    }
  });
  
  // 次に、reviewersに含まれている審査者の承認情報を設定（既存の情報がない場合のみpendingで初期化）
  reviewers.forEach((rid) => {
    // JSONBのキーは文字列として保存されるため、文字列キーを使用
    const key = String(rid);
    // 数値キーと文字列キーの両方をチェック
    let existingApproval = current[key] || 
                           current[rid] || 
                           current[Number(rid)] ||
                           null;
    
    // キーが数値として保存されている場合、すべてのキーをチェック
    if (!existingApproval) {
      const allKeys = Object.keys(current);
      const matchingKey = allKeys.find(k => Number(k) === rid);
      if (matchingKey) {
        existingApproval = current[matchingKey];
      }
    }
    
    // 空のオブジェクトの場合はnullとして扱う
    if (existingApproval && typeof existingApproval === 'object' && Object.keys(existingApproval).length === 0) {
      existingApproval = null;
    }
    
    // 既存の承認情報があり、statusが設定されている場合はそれを保持、ない場合はpendingで初期化
    if (existingApproval && existingApproval.status) {
      base[key] = existingApproval;
    } else if (!base[key]) {
      // 既にbaseに存在する場合は上書きしない（既存の承認情報を優先）
      base[key] = { status: 'pending', updated_at: null };
    }
  });
  return base;
}

async function ensureProjectRoute(project) {
  // final_approver_user_idが設定されていて、reviewer_approvalsが存在し、かつ空でない場合のみ早期リターン
  const hasReviewerApprovals = project.reviewer_approvals && 
                                typeof project.reviewer_approvals === 'object' && 
                                Object.keys(project.reviewer_approvals).length > 0;
  
  if (project.final_approver_user_id && hasReviewerApprovals) {
    // 早期リターンする場合でも、データベースから最新のreviewer_approvalsを取得して返す
    // これにより、他の審査者が承認した最新の情報が反映される
    const latestProjectResult = await db.query(
      'SELECT reviewer_approvals FROM projects WHERE id = $1',
      [project.id]
    );
    const latestReviewerApprovals = latestProjectResult.rows[0]?.reviewer_approvals || {};
    
    console.log('[Ensure Project Route] Route already set, returning project with latest approvals:', {
      projectId: project.id,
      final_approver_user_id: project.final_approver_user_id,
      reviewer_approvals_keys_from_db: Object.keys(latestReviewerApprovals),
      reviewer_approvals_keys_from_project: Object.keys(project.reviewer_approvals || {})
    });
    
    return {
      ...project,
      reviewer_approvals: latestReviewerApprovals
    };
  }
  
  const route = await getApprovalRouteByAmount(parseFloat(project.requested_amount || 0));
  if (!route) {
    console.log('[Ensure Project Route] No route found for amount:', project.requested_amount);
    return project;
  }

  console.log('[Ensure Project Route] Building reviewer approvals:', {
    projectId: project.id,
    routeReviewerIds: route.reviewer_ids,
    currentApprovals: project.reviewer_approvals
  });

  // 既存の承認情報を保存（buildReviewerApprovalsが上書きしないようにするため）
  const existingApprovals = project.reviewer_approvals || {};
  const reviewerApprovals = buildReviewerApprovals(project, route.reviewer_ids || []);
  
  // 既存の承認情報を復元（statusが設定されているものは保持）
  Object.keys(existingApprovals).forEach(key => {
    const existingApproval = existingApprovals[key];
    // 既存の承認情報があり、statusが設定されている場合は保持
    if (existingApproval && existingApproval.status && existingApproval.status !== 'pending') {
      // 文字列キーと数値キーの両方をチェック
      const stringKey = String(key);
      const numericKey = Number(key);
      if (reviewerApprovals[stringKey] || reviewerApprovals[numericKey]) {
        reviewerApprovals[stringKey] = existingApproval;
      } else {
        reviewerApprovals[stringKey] = existingApproval;
      }
    }
  });
  
  console.log('[Ensure Project Route] Built reviewer approvals (with existing data preserved):', reviewerApprovals);
  
  await db.query(
    `UPDATE projects
     SET final_approver_user_id = $1,
         reviewer_approvals = $2::jsonb,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [route.final_approver_user_id || null, reviewerApprovals, project.id]
  );

  if (route.reviewer_ids && route.reviewer_ids.length > 0) {
    await db.query('DELETE FROM project_reviewers WHERE project_id = $1', [project.id]);
    const values = route.reviewer_ids.map((rid) => `(${project.id}, ${rid})`).join(', ');
    await db.query(`INSERT INTO project_reviewers (project_id, reviewer_id) VALUES ${values}`);
  }

  return {
    ...project,
    final_approver_user_id: route.final_approver_user_id,
    reviewer_approvals: reviewerApprovals
  };
}

const app = express();
const PORT = process.env.PORT || 8080;

// Cloud Runやプロキシ経由のリクエストを信頼する設定
// これにより、express-rate-limitがX-Forwarded-Forヘッダーを正しく処理できる
app.set('trust proxy', true);

// Firebase初期化
initializeFirebase();

// セキュリティヘッダーの設定
// CSPのconnectSrcは、フロントエンドからバックエンドへの接続を許可するため、'self'に加えてFRONTEND_URLも許可
const frontendUrl = process.env.FRONTEND_URL || process.env.APP_URL;
const connectSrc = ["'self'"];
if (frontendUrl) {
  // FRONTEND_URLからオリジンを抽出して追加
  try {
    const url = new URL(frontendUrl);
    connectSrc.push(url.origin);
  } catch (e) {
    console.warn('[CSP] Invalid FRONTEND_URL:', frontendUrl);
  }
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: connectSrc,
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Cloud Storageの署名付きURLとの互換性のため
}));

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

// レート制限の設定
// 開発環境ではレート制限を緩和
const isDevelopment = process.env.NODE_ENV === 'development';
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: isDevelopment ? 1000 : 100, // 開発環境では1000リクエスト、本番環境では100リクエスト
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // `RateLimit-*` ヘッダーを返す
  legacyHeaders: false, // `X-RateLimit-*` ヘッダーを無効化
  skip: (req) => {
    // ヘルスチェックエンドポイントはレート制限をスキップ
    return req.path === '/api/health' || req.path === '/health';
  }
});

// 厳しいレート制限（認証エンドポイント用）
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分
  max: 5, // 15分間に5リクエストまで
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// ファイルアップロード用のレート制限
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1時間
  max: 10, // 1時間に10ファイルまで
  message: 'Too many file uploads, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// 全エンドポイントにレート制限を適用
app.use('/api/', limiter);

// CORS設定（FRONTEND_URLが設定されている場合は特定オリジンのみ許可）
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // FRONTEND_URLが設定されている場合は、そのオリジンのみ許可
  if (process.env.FRONTEND_URL) {
    const allowedOrigins = process.env.FRONTEND_URL.split(',').map(url => url.trim());
    
    if (origin && allowedOrigins.includes(origin)) {
      // 許可されたオリジンからのリクエスト
      res.header('Access-Control-Allow-Origin', origin);
    } else if (origin) {
      // 許可されていないオリジンからのリクエスト
      console.warn(`[CORS] Blocked request from origin: ${origin}. Allowed origins: ${allowedOrigins.join(', ')}`);
      return res.status(403).json({ error: 'Origin not allowed' });
    } else {
      // オリジンが指定されていない場合（例: Postman、curl）
      // 開発環境では許可、本番環境では警告
      if (process.env.NODE_ENV === 'production') {
        console.warn('[CORS] Request without origin header in production environment');
      }
      res.header('Access-Control-Allow-Origin', allowedOrigins[0] || '*');
    }
  } else {
    // FRONTEND_URLが設定されていない場合
    // 開発環境では全許可、本番環境では警告
    if (process.env.NODE_ENV === 'production') {
      console.warn('[CORS] FRONTEND_URL not set in production environment - allowing all origins');
    }
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
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
      // 新しいカラムが存在する場合のクエリ（複数の審査者を含む）
      result = await db.query(
        `SELECT p.*, 
                u1.name as executor_name, u1.email as executor_email,
                u2.name as reviewer_name, u2.email as reviewer_email,
                p.extracted_text,
                p.extracted_text_updated_at,
                p.missing_sections,
                p.missing_sections_updated_at,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', u3.id,
                      'name', u3.name,
                      'email', u3.email
                    )
                  ) FILTER (WHERE u3.id IS NOT NULL),
                  '[]'::json
                ) as reviewers
         FROM projects p
         LEFT JOIN users u1 ON p.executor_id = u1.id
         LEFT JOIN users u2 ON p.reviewer_id = u2.id
         LEFT JOIN project_reviewers pr ON p.id = pr.project_id
         LEFT JOIN users u3 ON pr.reviewer_id = u3.id
         GROUP BY p.id, u1.id, u1.name, u1.email, u2.id, u2.name, u2.email
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
    console.log('[My Projects] Request received', { email: req.user.email });
    
    // 現在のユーザー情報を取得
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      console.error('[My Projects] User not found:', req.user.email);
      return res.status(404).json({ error: 'User not found' });
    }
    
    console.log('[My Projects] Current user:', {
      id: currentUser.rows[0].id,
      email: req.user.email,
      position: currentUser.rows[0].position
    });
    
    // 実行者であることを確認
    if (currentUser.rows[0].position !== 'executor') {
      console.warn('[My Projects] User is not executor:', currentUser.rows[0].position);
      return res.status(403).json({ 
        error: 'Only project executors can access this endpoint',
        userPosition: currentUser.rows[0].position
      });
    }
    
    let result;
    try {
      // 新しいカラムが存在する場合のクエリ（自身が実行者であるプロジェクトのみ、複数の審査者を含む）
      result = await db.query(
        `SELECT p.*, 
                u1.name as executor_name, u1.email as executor_email,
                u2.name as reviewer_name, u2.email as reviewer_email,
                p.extracted_text,
                p.extracted_text_updated_at,
                p.missing_sections,
                p.missing_sections_updated_at,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', u3.id,
                      'name', u3.name,
                      'email', u3.email
                    )
                  ) FILTER (WHERE u3.id IS NOT NULL),
                  '[]'::json
                ) as reviewers
         FROM projects p
         LEFT JOIN users u1 ON p.executor_id = u1.id
         LEFT JOIN users u2 ON p.reviewer_id = u2.id
         LEFT JOIN project_reviewers pr ON p.id = pr.project_id
         LEFT JOIN users u3 ON pr.reviewer_id = u3.id
         WHERE p.executor_id = $1
         GROUP BY p.id, u1.id, u1.name, u1.email, u2.id, u2.name, u2.email
         ORDER BY p.created_at DESC`,
        [currentUser.rows[0].id]
      );
      if (process.env.NODE_ENV === 'development') {
        console.log('[My Projects] Query successful, found', result.rows.length, 'projects');
      }
    } catch (queryError) {
      // 新しいカラムが存在しない場合、従来のクエリを試行
      console.warn('[My Projects] New columns not found, trying legacy query:', queryError.message);
      try {
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
        console.log('[My Projects] Legacy query successful, found', result.rows.length, 'projects');
      } catch (legacyError) {
        console.error('[My Projects] Legacy query also failed:', legacyError.message);
        return res.json({ projects: [] });
      }
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[My Projects] Fetched ${result.rows.length} projects for executor ${currentUser.rows[0].id} (${req.user.email})`);
    }
    
    res.json({ projects: result.rows });
  } catch (error) {
    console.error('[My Projects] Error:', error);
    return handleError(res, error, 'Fetch My Projects');
  }
});

// Get approved projects for reviewers (reviewer only)
app.get('/api/projects/review/approved', authenticateToken, requireApproved, async (req, res) => {
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
      // 承認済みプロジェクトを取得（複数の審査者を含む）
      result = await db.query(
        `SELECT p.*, 
                u1.name as executor_name, u1.email as executor_email,
                u2.name as reviewer_name, u2.email as reviewer_email,
                p.extracted_text,
                p.extracted_text_updated_at,
                p.missing_sections,
                p.missing_sections_updated_at,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', u3.id,
                      'name', u3.name,
                      'email', u3.email
                    )
                  ) FILTER (WHERE u3.id IS NOT NULL),
                  '[]'::json
                ) as reviewers
         FROM projects p
         LEFT JOIN users u1 ON p.executor_id = u1.id
         LEFT JOIN users u2 ON p.reviewer_id = u2.id
         LEFT JOIN project_reviewers pr ON p.id = pr.project_id
         LEFT JOIN users u3 ON pr.reviewer_id = u3.id
         WHERE (p.reviewer_id = $1 OR pr.reviewer_id = $1) AND p.application_status = 'approved'
         GROUP BY p.id, u1.id, u1.name, u1.email, u2.id, u2.name, u2.email
         ORDER BY p.created_at DESC`,
        [currentUser.rows[0].id]
      );
    } catch (queryError) {
      // 新しいカラムが存在しない場合（マイグレーション未実行）
      console.warn('[Review Approved] New columns not found:', queryError.message);
      return res.json({ projects: [] });
    }
    
    res.json({ projects: result.rows });
  } catch (error) {
    return handleError(res, error, 'Fetch Approved Projects');
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
    
    const userId = currentUser.rows[0].id;
    const isReviewer = currentUser.rows[0].position === 'reviewer';
    
    // 最終決裁者としてのアクセスを確認（approval_routesテーブルでfinal_approver_user_idが設定されているか）
    const finalApproverCheck = await db.query(
      'SELECT COUNT(*) as count FROM approval_routes WHERE final_approver_user_id = $1',
      [userId]
    );
    
    const isFinalApprover = parseInt(finalApproverCheck.rows[0]?.count || 0) > 0;
    
    // 念のため、プロジェクトでfinal_approver_user_idが設定されているかも確認
    const projectCheck = await db.query(
      'SELECT COUNT(*) as count FROM projects WHERE final_approver_user_id = $1',
      [userId]
    );
    const projectCount = parseInt(projectCheck.rows[0]?.count || 0);
    
    // 審査者または最終決裁者であることを確認
    if (!isReviewer && !isFinalApprover && projectCount === 0) {
      return res.status(403).json({ error: 'Only reviewers or final approvers can access this endpoint' });
    }
    
    console.log('[Review Pending] User access check:', {
      userId: userId,
      email: req.user.email,
      isReviewer: isReviewer,
      isFinalApprover: isFinalApprover,
      projectCount: projectCount
    });
    
    let result;
    try {
      // 新しいカラムが存在する場合のクエリ（複数の審査者を含む）
      // 複数の審査者のいずれかが現在のユーザーであるプロジェクトを取得
      console.log('[Review Pending] Fetching projects:', { userId, email: req.user.email, isReviewer, isFinalApprover });
      
      // まず、project_reviewersテーブルにデータが存在するか確認
      const hasProjectReviewersTable = await db.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'project_reviewers'
        )`
      ).catch(() => ({ rows: [{ exists: false }] }));
      
      if (hasProjectReviewersTable.rows[0]?.exists) {
        // project_reviewersテーブルが存在する場合
        // 最終決裁者の場合は最終決裁者向けのロジックを優先（positionがreviewerでも最終決裁者なら最終決裁者向けロジックを実行）
        if (isFinalApprover || projectCount > 0) {
          // 最終決裁者の場合：すべての審査者が承認済みのプロジェクトを取得
          // まず、提出済みのすべてのプロジェクトを取得（final_approver_user_idが設定されていない可能性があるため）
          const allSubmittedProjects = await db.query(
            `SELECT p.*, 
                    u1.name as executor_name, u1.email as executor_email,
                    u2.name as reviewer_name, u2.email as reviewer_email,
                    p.extracted_text,
                    p.extracted_text_updated_at,
                    p.missing_sections,
                    p.missing_sections_updated_at,
                    COALESCE(
                      (
                        SELECT json_agg(
                          json_build_object(
                            'id', u3.id,
                            'name', u3.name,
                            'email', u3.email
                          )
                        )
                        FROM project_reviewers pr2
                        LEFT JOIN users u3 ON pr2.reviewer_id = u3.id
                        WHERE pr2.project_id = p.id
                      ),
                      '[]'::json
                    ) as reviewers
           FROM projects p
           LEFT JOIN users u1 ON p.executor_id = u1.id
           LEFT JOIN users u2 ON p.reviewer_id = u2.id
           WHERE p.application_status = 'submitted'
           ORDER BY p.created_at DESC`
          );
          
          console.log('[Review Pending] Found all submitted projects:', allSubmittedProjects.rows.length);
          
          // 各プロジェクトに対してensureProjectRouteを呼び出して、final_approver_user_idを設定
          const projectsWithRoute = [];
          for (const project of allSubmittedProjects.rows) {
            await ensureProjectRoute(project);
            // ensureProjectRouteがデータベースを更新した可能性があるため、最新の情報を再取得
            const updatedProject = await db.query(
              `SELECT p.*, 
                      u1.name as executor_name, u1.email as executor_email,
                      u2.name as reviewer_name, u2.email as reviewer_email,
                      p.extracted_text,
                      p.extracted_text_updated_at,
                      p.missing_sections,
                      p.missing_sections_updated_at,
                      COALESCE(
                        (
                          SELECT json_agg(
                            json_build_object(
                              'id', u3.id,
                              'name', u3.name,
                              'email', u3.email
                            )
                          )
                          FROM project_reviewers pr2
                          LEFT JOIN users u3 ON pr2.reviewer_id = u3.id
                          WHERE pr2.project_id = p.id
                        ),
                        '[]'::json
                      ) as reviewers
               FROM projects p
               LEFT JOIN users u1 ON p.executor_id = u1.id
               LEFT JOIN users u2 ON p.reviewer_id = u2.id
               WHERE p.id = $1`,
              [project.id]
            );
            if (updatedProject.rows.length > 0) {
              projectsWithRoute.push(updatedProject.rows[0]);
            }
          }
          
          // 最終決裁者として設定されているプロジェクトをフィルタリング
          const allProjects = projectsWithRoute.filter(p => p.final_approver_user_id === userId);
          
          console.log('[Review Pending] Found projects for final approver:', allProjects.length);
          
          // すべての審査者が承認済みのプロジェクトのみをフィルタリング
          const filteredProjects = [];
          for (const project of allProjects) {
            const reviewers = await db.query(
              'SELECT reviewer_id FROM project_reviewers WHERE project_id = $1',
              [project.id]
            );
            
            if (reviewers.rows.length === 0) {
              console.log('[Review Pending] Project has no reviewers:', project.id);
              continue; // 審査者が設定されていない場合はスキップ
            }
            
            const reviewerIds = reviewers.rows.map(r => r.reviewer_id);
            // データベースから取得した最新のreviewer_approvalsを使用
            const approvals = project.reviewer_approvals || {};
            
            // すべての審査者が承認しているか確認
            const allApproved = reviewerIds.every((reviewerId) => {
              const approval = approvals[String(reviewerId)]; // reviewerIdを文字列に変換
              return approval && approval.status === 'approved';
            });
            
            console.log('[Review Pending] Project approval status:', {
              projectId: project.id,
              projectName: project.name,
              totalReviewers: reviewerIds.length,
              reviewerIds: reviewerIds,
              approvals: approvals,
              allApproved: allApproved
            });
            
            if (allApproved) {
              filteredProjects.push(project);
            }
          }
          
          console.log('[Review Pending] Filtered projects (all reviewers approved):', filteredProjects.length);
          result = { rows: filteredProjects };
        } else if (isReviewer) {
          // 審査者の場合：現在のユーザーが審査者として割り当てられているプロジェクトを取得
          result = await db.query(
            `SELECT p.*, 
                    u1.name as executor_name, u1.email as executor_email,
                    u2.name as reviewer_name, u2.email as reviewer_email,
                    p.extracted_text,
                    p.extracted_text_updated_at,
                    p.missing_sections,
                    p.missing_sections_updated_at,
                    COALESCE(
                      (
                        SELECT json_agg(
                          json_build_object(
                            'id', u3.id,
                            'name', u3.name,
                            'email', u3.email
                          )
                        )
                        FROM project_reviewers pr2
                        LEFT JOIN users u3 ON pr2.reviewer_id = u3.id
                        WHERE pr2.project_id = p.id
                      ),
                      '[]'::json
                    ) as reviewers
           FROM projects p
           LEFT JOIN users u1 ON p.executor_id = u1.id
           LEFT JOIN users u2 ON p.reviewer_id = u2.id
             WHERE p.application_status = 'submitted'
               AND (
                 p.reviewer_id = $1 
                 OR EXISTS (
                   SELECT 1 FROM project_reviewers pr 
                   WHERE pr.project_id = p.id AND pr.reviewer_id = $1
                 )
               )
           ORDER BY p.created_at DESC`,
            [userId]
          );
        }
      } else {
        // project_reviewersテーブルが存在しない場合（後方互換性）
        result = await db.query(
          `SELECT p.*, 
                  u1.name as executor_name, u1.email as executor_email,
                  u2.name as reviewer_name, u2.email as reviewer_email,
                  '[]'::json as reviewers
           FROM projects p
           LEFT JOIN users u1 ON p.executor_id = u1.id
           LEFT JOIN users u2 ON p.reviewer_id = u2.id
           WHERE p.application_status = 'submitted'
             AND p.reviewer_id = $1
           ORDER BY p.created_at DESC`,
          [userId]
        );
      }
      
      console.log('[Review Pending] Found projects:', result.rows.length);
      if (result.rows.length > 0) {
        console.log('[Review Pending] First project:', {
          id: result.rows[0].id,
          name: result.rows[0].name,
          reviewer_id: result.rows[0].reviewer_id,
          reviewers: result.rows[0].reviewers
        });
      }
    } catch (queryError) {
      // 新しいカラムが存在しない場合（マイグレーション未実行）
      console.error('[Review Pending] Query error:', queryError.message, queryError.stack);
      console.warn('[Review Pending] New columns not found:', queryError.message);
      return res.json({ projects: [] });
    }
    
    res.json({ projects: result.rows });
  } catch (error) {
    return handleError(res, error, 'Fetch Pending Review Projects');
  }
});

// Approval status (reviewers + final approver)
app.get('/api/projects/:id/approval-status', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const userEmail = req.user.email;
    const userResult = await db.query('SELECT id FROM users WHERE email = $1', [userEmail]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;

    const projectResult = await db.query(
      `SELECT p.*, u_final.name AS final_approver_name, u_final.email AS final_approver_email
       FROM projects p
       LEFT JOIN users u_final ON u_final.id = p.final_approver_user_id
       WHERE p.id = $1`,
      [id]
    );
    if (projectResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });

    const project = projectResult.rows[0];
    
    // 実行者、審査者、管理者、または最終決裁者のみアクセス可能
    const isExecutor = project.executor_id === userId;
    const adminResult = await db.query('SELECT is_admin FROM users WHERE id = $1', [userId]);
    const isAdmin = adminResult.rows[0]?.is_admin || false;
    const reviewerResult = await db.query(
      'SELECT COUNT(*) as count FROM project_reviewers WHERE project_id = $1 AND reviewer_id = $2',
      [id, userId]
    );
    const isReviewer = parseInt(reviewerResult.rows[0]?.count || 0) > 0;
    
    // 最終決裁者かどうかを確認（approval_routesテーブルでfinal_approver_user_idが設定されているか）
    const finalApproverResult = await db.query(
      'SELECT COUNT(*) as count FROM approval_routes WHERE final_approver_user_id = $1',
      [userId]
    );
    const isFinalApproverInRoutes = parseInt(finalApproverResult.rows[0]?.count || 0) > 0;
    const isFinalApproverForProject = project.final_approver_user_id === userId;
    
    if (!isExecutor && !isAdmin && !isReviewer && !isFinalApproverForProject && !isFinalApproverInRoutes) {
      return res.status(403).json({ error: 'You do not have permission to view this project\'s approval status' });
    }

    const projectWithRoute = await ensureProjectRoute(project);
    
    // ensureProjectRouteの後に、データベースから最新のreviewer_approvalsを再取得
    const latestProjectResult = await db.query(
      'SELECT reviewer_approvals FROM projects WHERE id = $1',
      [id]
    );
    const latestReviewerApprovals = latestProjectResult.rows[0]?.reviewer_approvals || {};

    const reviewers = await db.query(
      `SELECT u.id, u.name, u.email
       FROM project_reviewers pr
       JOIN users u ON u.id = pr.reviewer_id
       WHERE pr.project_id = $1`,
      [id]
    );

    // 審査状況の詳細を計算（最新のreviewer_approvalsを使用）
    const reviewerApprovals = latestReviewerApprovals;
    console.log('[Approval Status] Reviewer approvals raw:', JSON.stringify(reviewerApprovals, null, 2));
    console.log('[Approval Status] Reviewer approvals keys:', Object.keys(reviewerApprovals));
    console.log('[Approval Status] Reviewer approvals values:', Object.entries(reviewerApprovals).map(([key, value]) => ({
      key,
      keyType: typeof key,
      value,
      valueType: typeof value,
      status: value?.status,
      review_comment: value?.review_comment
    })));
    console.log('[Approval Status] Reviewers:', reviewers.rows.map(r => ({ id: r.id, name: r.name, email: r.email })));
    
    const reviewerStatuses = reviewers.rows.map(reviewer => {
      // reviewer_approvalsのキーは数値または文字列として保存されている可能性があるため、すべての形式を試す
      const reviewerId = reviewer.id;
      const stringKey = String(reviewerId);
      const numericKey = reviewerId;
      const numberKey = Number(reviewerId);
      
      // すべてのキー形式を試す
      let approval = reviewerApprovals[stringKey] || 
                    reviewerApprovals[numericKey] || 
                    reviewerApprovals[numberKey] ||
                    null;
      
      // キーが数値として保存されている場合、すべてのキーをチェック
      if (!approval) {
        const allKeys = Object.keys(reviewerApprovals);
        const matchingKey = allKeys.find(key => Number(key) === reviewerId);
        if (matchingKey) {
          approval = reviewerApprovals[matchingKey];
          console.log('[Approval Status] Found approval with matching key:', { reviewerId, matchingKey, approval });
        }
      }
      
      // 空のオブジェクトの場合はnullとして扱う
      if (approval && typeof approval === 'object' && Object.keys(approval).length === 0) {
        console.log('[Approval Status] Empty approval object found for reviewer:', reviewerId);
        approval = null;
      }
      
      const reviewerStatus = approval?.status || 'pending';
      const reviewComment = approval?.review_comment || null;
      
      console.log('[Approval Status] Reviewer approval lookup:', {
        reviewerId,
        reviewerName: reviewer.name,
        reviewerEmail: reviewer.email,
        stringKey,
        numericKey,
        numberKey,
        approval,
        status: reviewerStatus,
        review_comment: reviewComment,
        hasStringKey: stringKey in reviewerApprovals,
        hasNumericKey: numericKey in reviewerApprovals,
        allKeys: Object.keys(reviewerApprovals)
      });
      
      return {
        id: reviewer.id, // フロントエンドが期待する形式
        reviewer_id: reviewer.id, // 後方互換性のため
        name: reviewer.name, // フロントエンドが期待する形式
        reviewer_name: reviewer.name, // 後方互換性のため
        email: reviewer.email, // フロントエンドが期待する形式
        reviewer_email: reviewer.email, // 後方互換性のため
        status: reviewerStatus,
        updated_at: approval?.updated_at || null,
        review_comment: reviewComment // 却下コメントも含める
      };
    });

    // 全体の審査状況を計算
    const totalReviewers = reviewers.rows.length;
    
    // reviewerStatusesから正確にカウント（reviewer_approvalsのキー不一致を回避）
    const approvedCount = reviewerStatuses.filter(r => r.status === 'approved').length;
    const rejectedCount = reviewerStatuses.filter(r => r.status === 'rejected').length;
    const pendingCount = reviewerStatuses.filter(r => r.status === 'pending').length;
    
    const allReviewersApproved = totalReviewers > 0 && approvedCount === totalReviewers;
    const canProceedToFinalApproval = allReviewersApproved && projectWithRoute.final_approver_user_id;

    // 最終承認状況
    const finalApprovalStatus = projectWithRoute.application_status === 'approved' ? 'approved' : 
                                (canProceedToFinalApproval ? 'pending' : 'waiting');

    res.json({
      project_id: projectWithRoute.id,
      project_name: projectWithRoute.name,
      application_status: projectWithRoute.application_status,
      final_approver_user_id: projectWithRoute.final_approver_user_id,
      final_approver_name: projectWithRoute.final_approver_name,
      final_approver_email: projectWithRoute.final_approver_email,
      final_review_comment: projectWithRoute.final_review_comment || projectWithRoute.review_comment, // 最終決裁者の却下コメント
      final_approval_status: finalApprovalStatus,
      reviewers: reviewerStatuses,
      reviewer_approvals: reviewerApprovals,
      approval_summary: {
        total_reviewers: totalReviewers,
        approved_count: approvedCount,
        rejected_count: rejectedCount,
        pending_count: totalReviewers - approvedCount - rejectedCount,
        all_reviewers_approved: allReviewersApproved,
        can_proceed_to_final_approval: canProceedToFinalApproval
      }
    });
  } catch (error) {
    return handleError(res, error, 'Get Approval Status');
  }
});

// Reviewer approval/rejection (parallel)
app.post('/api/projects/:id/reviewer-approve', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, review_comment } = req.body; // decision: 'approved' or 'rejected'
    
    console.log('[Reviewer Approve] Request received:', {
      projectId: id,
      decision,
      review_comment: review_comment ? `${review_comment.substring(0, 50)}...` : null,
      review_comment_length: review_comment?.length,
      body: req.body
    });
    
    // decisionが指定されていない場合は、デフォルトで'approved'とする（後方互換性のため）
    const finalDecision = decision || 'approved';
    
    if (!['approved', 'rejected'].includes(finalDecision)) {
      console.error('[Reviewer Approve] Invalid decision:', finalDecision);
      return res.status(400).json({ error: 'Decision must be either "approved" or "rejected"' });
    }
    
    // 却下の場合、コメントが必須
    const trimmedComment = review_comment?.trim();
    if (finalDecision === 'rejected' && !trimmedComment) {
      console.error('[Reviewer Approve] Rejection comment missing:', {
        review_comment,
        trimmedComment,
        review_comment_type: typeof review_comment
      });
      return res.status(400).json({ error: 'Review comment is required when rejecting' });
    }
    
    const userEmail = req.user.email;
    const userResult = await db.query('SELECT id FROM users WHERE email = $1', [userEmail]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;

    // まず、データベースから最新のプロジェクト情報を取得
    const projectResult = await db.query('SELECT * FROM projects WHERE id = $1', [id]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    
    const currentProject = projectResult.rows[0];
    // 既存のreviewer_approvalsを保存（上書きを防ぐため）
    const savedReviewerApprovals = currentProject.reviewer_approvals || {};
    
    // ensureProjectRouteを呼び出す（final_approver_user_idとproject_reviewersを設定するため）
    // ただし、既存の承認情報がある場合は、ensureProjectRouteが上書きしないようにする
    const project = await ensureProjectRoute(currentProject);
    
    // ensureProjectRouteの後に、データベースから最新のreviewer_approvalsを再取得
    const latestProjectResult = await db.query(
      'SELECT reviewer_approvals FROM projects WHERE id = $1',
      [id]
    );
    let latestReviewerApprovals = latestProjectResult.rows[0]?.reviewer_approvals || {};
    
    // 既存の承認情報を復元（ensureProjectRouteが上書きした場合に備える）
    // 既存の承認情報がある場合は、それを優先してマージ
    if (savedReviewerApprovals && Object.keys(savedReviewerApprovals).length > 0) {
      // 既存の承認情報をマージ（既存のデータを優先）
      latestReviewerApprovals = { ...latestReviewerApprovals, ...savedReviewerApprovals };
      
      // もしensureProjectRouteが上書きした場合は、データベースを更新
      const currentDbApprovals = latestProjectResult.rows[0]?.reviewer_approvals || {};
      const dbApprovalsKeys = Object.keys(currentDbApprovals);
      const savedApprovalsKeys = Object.keys(savedReviewerApprovals);
      
      // 既存の承認情報が失われている場合は、復元する
      const hasLostData = savedApprovalsKeys.some(key => {
        const savedApproval = savedReviewerApprovals[key];
        const dbApproval = currentDbApprovals[key];
        // 既存の承認情報があり、statusが設定されている場合
        if (savedApproval && savedApproval.status && (!dbApproval || !dbApproval.status)) {
          return true;
        }
        return false;
      });
      
      if (hasLostData) {
        console.log('[Reviewer Approve] Restoring lost reviewer_approvals data');
        await db.query(
          'UPDATE projects SET reviewer_approvals = $1::jsonb WHERE id = $2',
          [latestReviewerApprovals, id]
        );
      }
    }

    const assignedReviewers = await db.query(
      'SELECT reviewer_id FROM project_reviewers WHERE project_id = $1 AND reviewer_id = $2',
      [id, userId]
    );
    if (assignedReviewers.rows.length === 0) {
      return res.status(403).json({ error: 'You are not assigned as a reviewer for this project' });
    }

    // 楽観的ロック：現在のreviewer_approvalsを取得してから更新（最新のデータを使用）
    const currentApprovals = latestReviewerApprovals;
    // JSONBのキーは文字列として保存されるため、文字列キーを使用
    const userIdKey = String(userId);
    
    // 既に承認または却下済みの場合はエラーを返す（数値キーと文字列キーの両方をチェック）
    // すべてのキーをチェック（数値、文字列、Number()変換）
    const allKeys = Object.keys(currentApprovals);
    const existingApproval = currentApprovals[userIdKey] || 
                            currentApprovals[userId] || 
                            currentApprovals[Number(userId)] ||
                            (allKeys.find(key => Number(key) === userId) ? currentApprovals[allKeys.find(key => Number(key) === userId)] : null);
    
    console.log('[Reviewer Approve] Checking existing approval:', {
      userId,
      userIdKey,
      allKeys,
      existingApproval,
      currentApprovals
    });
    
    // 'pending'ステータスは未処理状態なので、処理を続行する
    if (existingApproval && existingApproval.status && existingApproval.status !== 'pending') {
      console.log('[Reviewer Approve] Existing approval found:', {
        userId,
        userIdKey,
        existingApproval,
        finalDecision,
        existingStatus: existingApproval.status
      });
      
      // 既に却下済みの場合、最新の状態を返す（エラーではなく成功として扱う）
      if (existingApproval.status === 'rejected' && finalDecision === 'rejected') {
        console.log('[Reviewer Approve] Already rejected, returning current state');
        return res.json({ 
          success: true, 
          reviewer_approvals: currentApprovals,
          message: 'Already rejected (returning current state)'
        });
      }
      // 承認済みの場合はエラー
      console.log('[Reviewer Approve] Already approved/rejected, returning error');
      return res.status(400).json({ 
        error: `You have already ${existingApproval.status === 'approved' ? 'approved' : 'rejected'} this project`,
        reviewer_approvals: currentApprovals,
        existing_approval: existingApproval
      });
    }
    
    console.log('[Reviewer Approve] No existing approval found, proceeding with new approval/rejection');
    
    // 承認または却下を追加（文字列キーで統一）
    const updatedApprovals = { ...currentApprovals };
    // 数値キーが存在する場合は削除して、文字列キーで統一
    if (updatedApprovals[userId] && !updatedApprovals[userIdKey]) {
      delete updatedApprovals[userId];
    }
    updatedApprovals[userIdKey] = { 
      status: finalDecision === 'approved' ? 'approved' : 'rejected', 
      review_comment: trimmedComment || null,
      updated_at: new Date().toISOString() 
    };
    
    console.log('[Reviewer Approve] Updating approvals:', {
      userId,
      userIdKey,
      finalDecision,
      review_comment: trimmedComment ? `${trimmedComment.substring(0, 50)}...` : null,
      updatedApprovals
    });

    // 楽観的ロック：reviewer_approvalsが変更されていないことを確認してから更新
    // ただし、既存の承認情報を保持するため、現在のデータベースの状態を再取得
    const beforeUpdateResult = await db.query(
      'SELECT reviewer_approvals FROM projects WHERE id = $1',
      [id]
    );
    const dbApprovalsBeforeUpdate = beforeUpdateResult.rows[0]?.reviewer_approvals || {};
    
    // 既存の承認情報をマージ（updatedApprovalsを優先、既存の他の審査者の情報は保持）
    const finalApprovals = { ...dbApprovalsBeforeUpdate };
    
    // 現在のユーザーの承認情報を確実に更新（文字列キーで統一）
    finalApprovals[userIdKey] = updatedApprovals[userIdKey];
    // 数値キーが存在する場合は削除
    if (finalApprovals[userId] && userId !== userIdKey) {
      delete finalApprovals[userId];
    }
    
    console.log('[Reviewer Approve] Final approvals to save:', {
      userId,
      userIdKey,
      finalDecision,
      review_comment: trimmedComment ? `${trimmedComment.substring(0, 50)}...` : null,
      dbApprovalsBeforeUpdate,
      updatedApprovals,
      finalApprovals,
      finalApprovalsKeys: Object.keys(finalApprovals),
      finalApprovalsValues: Object.entries(finalApprovals).map(([key, value]) => ({
        key,
        keyType: typeof key,
        value,
        status: value?.status,
        review_comment: value?.review_comment
      }))
    });
    
    // 却下の場合、application_statusとstatusも更新する
    let updateQuery;
    let updateParams;
    
    if (finalDecision === 'rejected') {
      // 却下の場合：application_statusを'rejected'に、statusを'on_hold'に更新
      updateQuery = `UPDATE projects 
                     SET reviewer_approvals = $1::jsonb,
                         application_status = $2,
                         status = $3,
                         review_comment = $4,
                         reviewed_at = CURRENT_TIMESTAMP,
                         reviewed_by = $5,
                         updated_at = CURRENT_TIMESTAMP 
                     WHERE id = $6
                     RETURNING reviewer_approvals, application_status, status`;
      updateParams = [finalApprovals, 'rejected', 'on_hold', trimmedComment || null, userId, id];
    } else {
      // 承認の場合：reviewer_approvalsのみ更新（application_statusは変更しない）
      updateQuery = `UPDATE projects 
                     SET reviewer_approvals = $1::jsonb, updated_at = CURRENT_TIMESTAMP 
                     WHERE id = $2
                     RETURNING reviewer_approvals`;
      updateParams = [finalApprovals, id];
    }
    
    const updateResult = await db.query(updateQuery, updateParams);
    
    console.log('[Reviewer Approve] Update result:', {
      rowsUpdated: updateResult.rows.length,
      savedApprovals: updateResult.rows[0]?.reviewer_approvals,
      application_status: updateResult.rows[0]?.application_status,
      status: updateResult.rows[0]?.status,
      finalDecision
    });

    if (updateResult.rows.length === 0) {
      // 競合が発生した場合（他の審査者が同時に承認/却下した場合）
      // 最新の状態を取得して再試行
      const latestProject = await db.query('SELECT reviewer_approvals FROM projects WHERE id = $1', [id]);
      const latestApprovals = latestProject.rows[0]?.reviewer_approvals || {};
      
      // 既に承認/却下済みの場合は成功として扱う（数値キーと文字列キーの両方をチェック）
      const userIdKey = String(userId);
      const existingApproval = latestApprovals[userIdKey] || latestApprovals[userId];
      if (existingApproval && existingApproval.status) {
        return res.json({ 
          success: true, 
          reviewer_approvals: latestApprovals,
          message: `Already ${existingApproval.status} (concurrent update detected)`
        });
      }
      
      return res.status(409).json({ 
        error: 'Concurrent update detected. Please refresh and try again.',
        reviewer_approvals: latestApprovals
      });
    }

    // 更新後の最新のプロジェクト情報を取得して返す
    const updatedProjectResult = await db.query(
      'SELECT reviewer_approvals, application_status, status FROM projects WHERE id = $1',
      [id]
    );
    const latestApprovals = updatedProjectResult.rows[0]?.reviewer_approvals || {};
    
    console.log('[Reviewer Approve] Returning latest approvals:', {
      userId,
      userIdKey,
      latestApprovals,
      latestApprovalsKeys: Object.keys(latestApprovals)
    });
    
    res.json({ 
      success: true, 
      reviewer_approvals: latestApprovals,
      application_status: updatedProjectResult.rows[0]?.application_status,
      status: updatedProjectResult.rows[0]?.status
    });
  } catch (error) {
    console.error('[Reviewer Approve] Error occurred:', {
      error: error.message,
      stack: error.stack,
      code: error.code,
      detail: error.detail,
      hint: error.hint,
      projectId: id,
      userId,
      decision: finalDecision
    });
    return handleError(res, error, 'Reviewer Approve/Reject');
  }
});

// Final approval/rejection (G-CGO / G-CEO)
app.post('/api/projects/:id/final-approve', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const { decision, review_comment } = req.body; // decision: 'approved' or 'rejected'
    
    if (!decision || !['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be either "approved" or "rejected"' });
    }
    
    const userEmail = req.user.email;
    const userResult = await db.query('SELECT id FROM users WHERE email = $1', [userEmail]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;

    const projectResult = await db.query('SELECT * FROM projects WHERE id = $1', [id]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    const project = await ensureProjectRoute(projectResult.rows[0]);

    if (!project.final_approver_user_id || project.final_approver_user_id !== userId) {
      return res.status(403).json({ error: 'You are not the final approver for this project' });
    }

    // 却下の場合、コメントが必須
    if (decision === 'rejected' && !review_comment?.trim()) {
      return res.status(400).json({ error: 'Review comment is required when rejecting' });
    }

    // 承認の場合のみ、すべての審査者が承認しているか確認
    if (decision === 'approved') {
      // プロジェクトに割り当てられているすべての審査者を取得
      const assignedReviewers = await db.query(
        'SELECT reviewer_id FROM project_reviewers WHERE project_id = $1',
        [id]
      );
      
      if (assignedReviewers.rows.length === 0) {
        return res.status(400).json({ error: 'No reviewers assigned to this project' });
      }
      
      const reviewerIds = assignedReviewers.rows.map(r => r.reviewer_id);
      const approvals = project.reviewer_approvals || {};
      
      // すべての審査者が承認しているか確認
      const allReviewersApproved = reviewerIds.every((reviewerId) => {
        const approval = approvals[reviewerId];
        return approval && approval.status === 'approved';
      });
      
      if (!allReviewersApproved) {
        const approvedCount = reviewerIds.filter((reviewerId) => {
          const approval = approvals[reviewerId];
          return approval && approval.status === 'approved';
        }).length;
        
        return res.status(400).json({ 
          error: 'All reviewers must approve before final approval',
          details: {
            total_reviewers: reviewerIds.length,
            approved_count: approvedCount,
            pending_count: reviewerIds.length - approvedCount
          }
        });
      }
    }

    // ステータスを更新
    await db.query(
      `UPDATE projects 
       SET application_status = $1, 
           review_comment = $2,
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = $3,
           updated_at = CURRENT_TIMESTAMP 
       WHERE id = $4`,
      [decision === 'approved' ? 'approved' : 'rejected', review_comment || null, userId, id]
    );

    res.json({ success: true, application_status: decision === 'approved' ? 'approved' : 'rejected' });
  } catch (error) {
    return handleError(res, error, 'Final Approve/Reject');
  }
});

// Public endpoint - Get project by ID
app.get('/api/projects/:id', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    let result;
    try {
      // 新しいカラムが存在する場合のクエリ（複数の審査者を含む）
      result = await db.query(
        `SELECT p.*, 
                u1.name as executor_name, u1.email as executor_email,
                u2.name as reviewer_name, u2.email as reviewer_email,
                p.extracted_text,
                p.extracted_text_updated_at,
                p.missing_sections,
                p.missing_sections_updated_at,
                COALESCE(
                  json_agg(
                    json_build_object(
                      'id', u3.id,
                      'name', u3.name,
                      'email', u3.email
                    )
                  ) FILTER (WHERE u3.id IS NOT NULL),
                  '[]'::json
                ) as reviewers
         FROM projects p
         LEFT JOIN users u1 ON p.executor_id = u1.id
         LEFT JOIN users u2 ON p.reviewer_id = u2.id
         LEFT JOIN project_reviewers pr ON p.id = pr.project_id
         LEFT JOIN users u3 ON pr.reviewer_id = u3.id
         WHERE p.id = $1
         GROUP BY p.id, u1.id, u1.name, u1.email, u2.id, u2.name, u2.email`,
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
app.post('/api/projects', uploadLimiter, authenticateToken, requireApproved, upload.single('applicationFile'), async (req, res) => {
  try {
    const { 
      name, 
      description, 
      requested_amount, 
      reviewer_id, // 後方互換性のため残す
      reviewer_ids // 複数の審査者ID（配列またはカンマ区切り文字列）
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
    
    // 審査者は実行者が設定できません。承認ルート（approval_routes）に基づいて自動的に設定されます。
    // フロントエンドから送信されたreviewer_idsやreviewer_idは無視されます。
    
    // ファイルアップロード処理
    let fileInfo = null;
    console.log('[Project Create] File upload check:', {
      hasFile: !!req.file,
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      fileType: req.file?.mimetype,
      bodyKeys: Object.keys(req.body)
    });
    
    if (req.file) {
      try {
        console.log('[Project Create] Uploading file to Cloud Storage...');
        fileInfo = await uploadFile(req.file, null, executorId.toString());
        console.log('[Project Create] File uploaded successfully:', fileInfo);
      } catch (uploadError) {
        console.error('[Project Create] File upload failed:', uploadError);
        return res.status(500).json({ 
          error: 'File upload failed',
          message: uploadError.message
        });
      }
    } else {
      console.warn('[Project Create] No file received in req.file');
    }
    
    // プロジェクトを作成（トランザクション内で実行）
    console.log('[Project Create] Creating project with executor_id:', executorId, 'for user:', req.user.email);
    let result;
    try {
      // トランザクション内でプロジェクト作成と審査者の割り当てを実行
      result = await db.withTransaction(async (client) => {
        // ファイルアップロードカラムが存在する場合のINSERT
        // 審査者は承認ルート（approval_routes）に基づいて自動的に設定されるため、reviewer_idはnull
        const projectResult = await client.query(
          `INSERT INTO projects (
            name, description, status, executor_id, reviewer_id, requested_amount, application_status,
            application_file_url, application_file_name, application_file_type, application_file_size, application_file_uploaded_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
          [
            name, 
            description || '', 
            'planning', 
            executorId, 
            null, // 審査者は承認ルートに基づいて自動設定される
            requested_amount, 
            'draft',
            fileInfo?.url || null,
            fileInfo?.originalName || null,
            fileInfo?.contentType || null,
            fileInfo?.size || null,
            fileInfo ? new Date() : null
          ]
        );
        
        const projectId = projectResult.rows[0].id;
        const project = projectResult.rows[0];
        
        // 承認ルート（approval_routes）に基づいて審査者を自動設定（トランザクション内で実行）
        // approval_routesテーブルは既存データなので、トランザクション外で読み取っても問題ない
        const threshold = parseFloat(project.requested_amount || 0) < 100000000 ? '<100m' : '>=100m';
        const routeResult = await client.query('SELECT * FROM approval_routes WHERE amount_threshold = $1', [threshold]);
        const route = routeResult.rows[0] || null;
        if (route) {
          const reviewerApprovals = buildReviewerApprovals(project, route.reviewer_ids || []);
          
          // プロジェクトに承認ルート情報を設定
          await client.query(
            `UPDATE projects
             SET final_approver_user_id = $1,
                 reviewer_approvals = $2::jsonb,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3`,
            [route.final_approver_user_id || null, reviewerApprovals, projectId]
          );
          
          // project_reviewersテーブルに審査者を追加
          if (route.reviewer_ids && route.reviewer_ids.length > 0) {
            for (const reviewerId of route.reviewer_ids) {
              await client.query(
                'INSERT INTO project_reviewers (project_id, reviewer_id) VALUES ($1, $2) ON CONFLICT (project_id, reviewer_id) DO NOTHING',
                [projectId, reviewerId]
              );
            }
          }
        }
        
        return projectResult;
      });
      
      console.log('[Project Create] Project created successfully:', {
        id: result.rows[0].id,
        name: result.rows[0].name,
        executor_id: result.rows[0].executor_id,
        executor_email: req.user.email,
        current_user_id: executorId
      });
      
      // ファイルがアップロードされている場合、自動的にテキスト抽出と評価を実行
      if (fileInfo?.url) {
        console.log('[Project Create] File uploaded, starting automatic text extraction and evaluation...');
        const projectId = result.rows[0].id;
        const fileUrl = fileInfo.url;
        const fileType = fileInfo.contentType;
        
        // 非同期でテキスト抽出と評価を実行（エラーが発生してもプロジェクト作成は成功とする）
        // エラーハンドリングを強化：エラー詳細をログに記録
        (async () => {
          let extractionError = null;
          let analysisError = null;
          
          try {
            // テキスト抽出
            console.log(`[Project Create] Extracting text from file for project ${projectId}...`);
            const extractedText = await extractTextFromFile(fileUrl, fileType);
            
            if (!extractedText || extractedText.trim().length === 0) {
              throw new Error('Extracted text is empty');
            }
            
            // データベースに保存
            await db.query(
              `UPDATE projects 
               SET extracted_text = $1, 
                   extracted_text_updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [extractedText, projectId]
            );
            console.log(`[Project Create] Text extracted and saved for project ${projectId} (${extractedText.length} characters)`);
            
            // 評価を実行
            console.log(`[Project Create] Checking missing sections for project ${projectId}...`);
            const analysisResult = await checkMissingSections(extractedText);
            
            if (!analysisResult) {
              throw new Error('Analysis result is null or undefined');
            }
            
            // データベースに保存
            await db.query(
              `UPDATE projects 
               SET missing_sections = $1, 
                   missing_sections_updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [JSON.stringify(analysisResult), projectId]
            );
            console.log(`[Project Create] Evaluation completed and saved for project ${projectId}`);
          } catch (autoProcessError) {
            // エラーの種類を判定してログに記録
            if (autoProcessError.message && autoProcessError.message.includes('extract')) {
              extractionError = autoProcessError;
            } else if (autoProcessError.message && autoProcessError.message.includes('analysis') || autoProcessError.message && autoProcessError.message.includes('missing sections')) {
              analysisError = autoProcessError;
            } else {
              // どちらか特定できない場合は両方の可能性がある
              extractionError = autoProcessError;
            }
            
            console.error(`[Project Create] Error in automatic processing for project ${projectId}:`, {
              message: autoProcessError.message,
              stack: autoProcessError.stack,
              name: autoProcessError.name,
              extractionError: extractionError ? extractionError.message : null,
              analysisError: analysisError ? analysisError.message : null
            });
            
            // エラー情報をデータベースに記録（オプション）
            try {
              await db.query(
                `UPDATE projects 
                 SET missing_sections = $1
                 WHERE id = $2`,
                [JSON.stringify({ 
                  error: true, 
                  error_message: autoProcessError.message,
                  error_timestamp: new Date().toISOString()
                }), projectId]
              );
            } catch (dbError) {
              console.error(`[Project Create] Failed to save error info to database:`, dbError);
            }
          }
        })();
      }
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
    
    // 作成されたプロジェクトを再度取得して確実に返す（トランザクション完了後）
    // 複数の審査者を取得
    const createdProject = await db.query(
      `SELECT p.*, 
              u1.name as executor_name, u1.email as executor_email,
              u2.name as reviewer_name, u2.email as reviewer_email,
              p.extracted_text,
              p.extracted_text_updated_at,
              p.missing_sections,
              p.missing_sections_updated_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', u3.id,
                    'name', u3.name,
                    'email', u3.email
                  )
                ) FILTER (WHERE u3.id IS NOT NULL),
                '[]'::json
              ) as reviewers
       FROM projects p
       LEFT JOIN users u1 ON p.executor_id = u1.id
       LEFT JOIN users u2 ON p.reviewer_id = u2.id
       LEFT JOIN project_reviewers pr ON p.id = pr.project_id
       LEFT JOIN users u3 ON pr.reviewer_id = u3.id
       WHERE p.id = $1
       GROUP BY p.id, u1.id, u1.name, u1.email, u2.id, u2.name, u2.email`,
      [result.rows[0].id]
    );
    
    if (createdProject.rows.length === 0) {
      console.error('[Project Create] ERROR: Created project not found after insert!', {
        insertedId: result.rows[0].id,
        executorId: executorId
      });
      // フォールバック: INSERT結果を返す
      return res.status(201).json({
      ...result.rows[0],
      created_by: req.user.email
    });
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.log('[Project Create] Returning created project:', {
        id: createdProject.rows[0].id,
        executor_id: createdProject.rows[0].executor_id,
        executor_name: createdProject.rows[0].executor_name,
        executor_email: createdProject.rows[0].executor_email
      });
    }
    
    // executor_idの型を確認（数値として確実に返す）
    const projectData = {
      ...createdProject.rows[0],
      executor_id: parseInt(createdProject.rows[0].executor_id), // 数値型に変換
      created_by: req.user.email
    };
    
    res.status(201).json(projectData);
  } catch (error) {
    return handleError(res, error, 'Create Project');
  }
});

// Protected endpoint - Update project (application)
app.put('/api/projects/:id', uploadLimiter, authenticateToken, upload.single('applicationFile'), async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      description, 
      status, 
      requested_amount, 
      reviewer_id, // 後方互換性のため残す
      reviewer_ids, // 複数の審査者ID（配列またはカンマ区切り文字列）
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
    
    // 複数の審査者を確認
    const projectReviewers = await db.query(
      'SELECT reviewer_id FROM project_reviewers WHERE project_id = $1',
      [id]
    );
    const reviewerIds = projectReviewers.rows.map(r => r.reviewer_id);
    
    const projectData = project.rows[0];
    const isExecutor = projectData.executor_id === currentUser.rows[0].id;
    const isReviewer = projectData.reviewer_id === currentUser.rows[0].id || reviewerIds.includes(currentUser.rows[0].id);
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
    
    // 実行者は審査者を設定できません。審査者は承認ルート（approval_routes）に基づいて自動的に設定されます。
    // 実行者が審査者を変更しようとした場合は無視します（管理者のみ審査者を変更可能）
    let reviewerIdsToUpdate = [];
    if (!isExecutor && (reviewer_ids || reviewer_id)) {
      // 管理者のみ審査者を変更可能
      if (reviewer_ids) {
        // 配列またはカンマ区切り文字列を処理
        if (Array.isArray(reviewer_ids)) {
          reviewerIdsToUpdate = reviewer_ids.map(id => parseInt(id)).filter(id => !isNaN(id));
        } else if (typeof reviewer_ids === 'string') {
          reviewerIdsToUpdate = reviewer_ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        }
      } else if (reviewer_id) {
        // 後方互換性のため、単一のreviewer_idもサポート
        const id = parseInt(reviewer_id);
        if (!isNaN(id)) {
          reviewerIdsToUpdate = [id];
        }
      }
      
      // 審査者IDが指定されている場合、プロジェクト審査者であることを確認
      if (reviewerIdsToUpdate.length > 0) {
        const placeholders = reviewerIdsToUpdate.map((_, i) => `$${i + 1}`).join(',');
        const reviewers = await db.query(
          `SELECT id, position FROM users WHERE id IN (${placeholders})`,
          reviewerIdsToUpdate
        );
        
        if (reviewers.rows.length !== reviewerIdsToUpdate.length) {
          return res.status(404).json({ error: 'One or more reviewers not found' });
        }
        
        const invalidReviewers = reviewers.rows.filter(r => r.position !== 'reviewer');
        if (invalidReviewers.length > 0) {
          return res.status(400).json({ error: 'All reviewers must have the reviewer position' });
        }
      }
    }
    
    // ファイルアップロード処理（新しいファイルがアップロードされた場合）
    let fileInfo = null;
    let oldFileUrl = null;
    console.log('[Project Update] File upload check:', {
      hasFile: !!req.file,
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      fileType: req.file?.mimetype,
      bodyKeys: Object.keys(req.body)
    });
    
    if (req.file) {
      // 既存のファイルがあれば削除対象として記録
      oldFileUrl = projectData.application_file_url;
      
      try {
        console.log('[Project Update] Uploading file to Cloud Storage...');
        fileInfo = await uploadFile(req.file, id.toString(), currentUser.rows[0].id.toString());
        console.log('[Project Update] File uploaded successfully:', fileInfo);
      } catch (uploadError) {
        console.error('[Project Update] File upload failed:', uploadError);
        return res.status(500).json({ 
          error: 'File upload failed',
          message: uploadError.message
        });
      }
    } else {
      console.warn('[Project Update] No file received in req.file');
    }
    
    // ファイルアップロードカラムが存在するかチェックしてからUPDATE（トランザクション内で実行）
    let result;
    try {
      // トランザクション内でプロジェクト更新と審査者の更新を実行
      result = await db.withTransaction(async (client) => {
        // ファイルアップロードカラムが存在する場合のUPDATE
        // 後方互換性のため、最初の審査者IDをreviewer_idに設定
        const firstReviewerId = reviewerIdsToUpdate.length > 0 ? reviewerIdsToUpdate[0] : reviewer_id || null;
        const updateResult = await client.query(
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
            name, description, status, requested_amount, firstReviewerId, application_status,
            fileInfo?.url || null,
            fileInfo?.originalName || null,
            fileInfo?.contentType || null,
            fileInfo?.size || null,
            fileInfo ? new Date() : null,
            id
          ]
        );
        
        // project_reviewersテーブルを更新（reviewer_idsが指定されている場合のみ）
        if (reviewerIdsToUpdate.length > 0) {
          // 既存の審査者を削除
          await client.query('DELETE FROM project_reviewers WHERE project_id = $1', [id]);
          
          // 新しい審査者を追加
          for (const reviewerId of reviewerIdsToUpdate) {
            await client.query(
              'INSERT INTO project_reviewers (project_id, reviewer_id) VALUES ($1, $2) ON CONFLICT (project_id, reviewer_id) DO NOTHING',
              [id, reviewerId]
            );
          }
        }
        
        return updateResult;
      });
      
      // requested_amountが変更された場合、承認ルートを再適用（実行者が審査者を変更できないようにするため）
      if (requested_amount && isExecutor) {
        const updatedProject = result.rows[0];
        await ensureProjectRoute(updatedProject);
      }
      
      // 新しいファイルがアップロードされた場合、古いファイルを削除（非同期で実行、エラーは無視）
      if (fileInfo && oldFileUrl) {
        deleteFile(oldFileUrl).catch(err => {
          console.error(`[Project Update] Failed to delete old file ${oldFileUrl}:`, err);
        });
      }
      
      // 新しいファイルがアップロードされている場合、自動的にテキスト抽出と評価を実行
      if (fileInfo?.url) {
        console.log('[Project Update] New file uploaded, starting automatic text extraction and evaluation...');
        const projectId = id;
        const fileUrl = fileInfo.url;
        const fileType = fileInfo.contentType;
        
        // 非同期でテキスト抽出と評価を実行（エラーが発生してもプロジェクト更新は成功とする）
        // エラーハンドリングを強化：エラー詳細をログに記録
        (async () => {
          let extractionError = null;
          let analysisError = null;
          
          try {
            // テキスト抽出
            console.log(`[Project Update] Extracting text from file for project ${projectId}...`);
            const extractedText = await extractTextFromFile(fileUrl, fileType);
            
            if (!extractedText || extractedText.trim().length === 0) {
              throw new Error('Extracted text is empty');
            }
            
            // データベースに保存
            await db.query(
              `UPDATE projects 
               SET extracted_text = $1, 
                   extracted_text_updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [extractedText, projectId]
            );
            console.log(`[Project Update] Text extracted and saved for project ${projectId} (${extractedText.length} characters)`);
            
            // 評価を実行
            console.log(`[Project Update] Checking missing sections for project ${projectId}...`);
            const analysisResult = await checkMissingSections(extractedText);
            
            if (!analysisResult) {
              throw new Error('Analysis result is null or undefined');
            }
            
            // データベースに保存
            await db.query(
              `UPDATE projects 
               SET missing_sections = $1, 
                   missing_sections_updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [JSON.stringify(analysisResult), projectId]
            );
            console.log(`[Project Update] Evaluation completed and saved for project ${projectId}`);
          } catch (autoProcessError) {
            // エラーの種類を判定してログに記録
            if (autoProcessError.message && autoProcessError.message.includes('extract')) {
              extractionError = autoProcessError;
            } else if (autoProcessError.message && autoProcessError.message.includes('analysis') || autoProcessError.message && autoProcessError.message.includes('missing sections')) {
              analysisError = autoProcessError;
            } else {
              // どちらか特定できない場合は両方の可能性がある
              extractionError = autoProcessError;
            }
            
            console.error(`[Project Update] Error in automatic processing for project ${projectId}:`, {
              message: autoProcessError.message,
              stack: autoProcessError.stack,
              name: autoProcessError.name,
              extractionError: extractionError ? extractionError.message : null,
              analysisError: analysisError ? analysisError.message : null
            });
            
            // エラー情報をデータベースに記録（オプション）
            try {
              await db.query(
                `UPDATE projects 
                 SET missing_sections = $1
                 WHERE id = $2`,
                [JSON.stringify({ 
                  error: true, 
                  error_message: autoProcessError.message,
                  error_timestamp: new Date().toISOString()
                }), projectId]
              );
            } catch (dbError) {
              console.error(`[Project Update] Failed to save error info to database:`, dbError);
            }
          }
        })();
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
app.delete('/api/projects/:id', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    
    // 現在のユーザー情報を取得
    const currentUser = await db.query(
      'SELECT id, is_admin FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const isAdmin = currentUser.rows[0].is_admin;
    
    // プロジェクト情報を取得
    const project = await db.query(
      'SELECT executor_id FROM projects WHERE id = $1',
      [id]
    );
    
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // 管理者でない場合、実行者であることを確認
    if (!isAdmin) {
      const executorId = project.rows[0].executor_id;
      if (executorId !== currentUser.rows[0].id) {
        return res.status(403).json({ 
          error: 'Only project executors or administrators can delete projects' 
        });
      }
    }
    
    // 関連データを削除（CASCADEが設定されているが念のため）
    try {
      // 1. project_reviewersテーブルから削除
      await db.query('DELETE FROM project_reviewers WHERE project_id = $1', [id]);
      
      // 2. project_budget_entriesテーブルから削除
      await db.query('DELETE FROM project_budget_entries WHERE project_id = $1', [id]);
      
      // 3. kpi_reportsテーブルから削除
      await db.query('DELETE FROM kpi_reports WHERE project_id = $1', [id]);
      
      // 4. budget_applicationsテーブルから削除
      await db.query('DELETE FROM budget_applications WHERE project_id = $1', [id]);
      
      // 5. プロジェクトを削除
      const result = await db.query(
        'DELETE FROM projects WHERE id = $1 RETURNING *',
        [id]
      );
      
      console.log(`[Delete Project] Project ${id} deleted by ${req.user.email} (admin: ${isAdmin})`);
    
    res.json({ 
      message: 'Project deleted successfully',
        deleted_by: req.user.email,
        is_admin: isAdmin
      });
    } catch (dbError) {
      console.error(`[Delete Project] Database error:`, dbError);
      return res.status(500).json({
        error: 'Failed to delete project',
        message: dbError.message
      });
    }
  } catch (error) {
    return handleError(res, error, 'Delete Project');
  }
});

// Auth endpoint - Get current user info
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    // まずemailで検索
    let result = await db.query(
      'SELECT id, email, firebase_uid, is_admin, is_approved, company, department, position, name, created_at FROM users WHERE email = $1',
      [req.user.email]
    );
    
    // emailで見つからない場合、firebase_uidで検索（既存のプロフィール情報と紐付けるため）
    if (result.rows.length === 0) {
      result = await db.query(
        'SELECT id, email, firebase_uid, is_admin, is_approved, company, department, position, name, created_at FROM users WHERE firebase_uid = $1',
        [req.user.uid]
      );
      
      // firebase_uidで見つかった場合、emailとfirebase_uidを更新して紐付ける
      if (result.rows.length > 0) {
        const existingUser = result.rows[0];
        // emailまたはfirebase_uidが異なる場合、更新する
        const needsUpdate = existingUser.email !== req.user.email || !existingUser.firebase_uid || existingUser.firebase_uid !== req.user.uid;
        if (needsUpdate) {
          await db.query(
            'UPDATE users SET email = $1, firebase_uid = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
            [req.user.email, req.user.uid, existingUser.id]
          );
          // 更新後の情報を再取得（必ず最新のデータを取得）
          result = await db.query(
            'SELECT id, email, firebase_uid, is_admin, is_approved, company, department, position, name, created_at FROM users WHERE id = $1',
            [existingUser.id]
          );
        }
      }
    } else {
      // emailで見つかった場合、firebase_uidが一致しているか確認
      const foundUser = result.rows[0];
      if (!foundUser.firebase_uid || foundUser.firebase_uid !== req.user.uid) {
        // firebase_uidが設定されていない、または異なる場合、更新する
        await db.query(
          'UPDATE users SET firebase_uid = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [req.user.uid, foundUser.id]
        );
        // 更新後の情報を再取得（必ず最新のデータを取得）
        result = await db.query(
          'SELECT id, email, firebase_uid, is_admin, is_approved, company, department, position, name, created_at FROM users WHERE id = $1',
          [foundUser.id]
        );
      }
    }
    
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
    
    // 最終決裁者かどうかを確認（approval_routesテーブルでfinal_approver_user_idが設定されているか）
    const finalApproverCheck = await db.query(
      'SELECT COUNT(*) as count FROM approval_routes WHERE final_approver_user_id = $1',
      [user.id]
    );
    const isFinalApprover = parseInt(finalApproverCheck.rows[0]?.count || 0) > 0;
    
    res.json({
      user: {
        ...req.user,
        ...user,
        needsProfile: !user.name || !user.company || !user.department || !user.position,
        is_final_approver: isFinalApprover
      }
    });
  } catch (error) {
    return handleError(res, error, 'Fetch User Info');
  }
});

// User registration endpoint (called after Firebase signup)
app.post('/api/users/register', authLimiter, authenticateToken, async (req, res) => {
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
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Admin] Fetched ${result.rows.length} total users`);
      const pendingCount = result.rows.filter(u => !u.is_approved).length;
      console.log(`[Admin] Pending users in all users: ${pendingCount}`);
    }
    
    res.json({ users: result.rows });
  } catch (error) {
    return handleError(res, error, 'Fetch Users');
  }
});

// Admin: Get pending approval users
app.get('/api/admin/users/pending', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 承認待ちユーザーを取得（プロフィール情報が入力されているもののみ）
    const result = await db.query(
      'SELECT id, email, name, company, department, position, is_approved, created_at FROM users WHERE is_approved = FALSE AND name IS NOT NULL AND company IS NOT NULL AND department IS NOT NULL AND position IS NOT NULL ORDER BY created_at DESC'
    );
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[Admin] Fetched ${result.rows.length} pending users`);
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
    const userId = parseInt(id);
    
    // 自分自身を削除できないようにチェック
    const currentUser = await db.query(
      'SELECT id FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length > 0 && currentUser.rows[0].id === userId) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    // 削除するユーザー情報を取得（Firebase UIDが必要）
    const userToDelete = await db.query(
      'SELECT firebase_uid, email FROM users WHERE id = $1',
      [userId]
    );
    
    if (userToDelete.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const { firebase_uid, email } = userToDelete.rows[0];
    
    console.log(`[Delete] Starting deletion process for user: ${email} (id: ${userId})`);
    
    // 関連データを削除またはNULLに設定（外部キー制約エラーを回避）
    try {
      // 1. project_reviewersテーブルから削除（CASCADEが設定されているが念のため）
      await db.query('DELETE FROM project_reviewers WHERE reviewer_id = $1', [userId]);
      console.log(`[Delete] Removed from project_reviewers`);
      
      // 2. project_budget_entriesテーブルから削除（created_byをNULLに設定できないため削除）
      await db.query('DELETE FROM project_budget_entries WHERE created_by = $1', [userId]);
      console.log(`[Delete] Removed project_budget_entries`);
      
      // 3. kpi_reportsテーブルから削除（created_byをNULLに設定できないため削除）
      await db.query('DELETE FROM kpi_reports WHERE created_by = $1', [userId]);
      console.log(`[Delete] Removed kpi_reports`);
      
      // 4. budget_applicationsテーブルから削除（created_byをNULLに設定できないため削除）
      await db.query('DELETE FROM budget_applications WHERE created_by = $1', [userId]);
      console.log(`[Delete] Removed budget_applications`);
      
      // 5. projectsテーブルの関連フィールドをNULLに設定
      await db.query(
        `UPDATE projects 
         SET executor_id = NULL WHERE executor_id = $1`,
        [userId]
      );
      await db.query(
        `UPDATE projects 
         SET reviewer_id = NULL WHERE reviewer_id = $1`,
        [userId]
      );
      await db.query(
        `UPDATE projects 
         SET reviewed_by = NULL WHERE reviewed_by = $1`,
        [userId]
      );
      console.log(`[Delete] Updated projects table (set executor_id, reviewer_id, reviewed_by to NULL)`);
      
      // 6. データベースからユーザーを削除
    const result = await db.query(
      'DELETE FROM users WHERE id = $1 RETURNING *',
        [userId]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found after cleanup' });
      }
      
      console.log(`[Delete] User deleted from database: ${email} (id: ${userId})`);
      
      // 7. Firebase Authenticationからも削除
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
    
    res.json({
      message: 'User deleted successfully',
      deletedUser: result.rows[0]
    });
    } catch (dbError) {
      console.error(`[Delete] Database error during deletion:`, dbError);
      // より詳細なエラーメッセージを返す
      const isDevelopment = process.env.NODE_ENV === 'development';
      return res.status(500).json({
        error: 'Failed to delete user',
        message: dbError.message,
        details: isDevelopment ? {
          code: dbError.code,
          detail: dbError.detail,
          hint: dbError.hint,
          constraint: dbError.constraint
        } : undefined
      });
    }
  } catch (error) {
    return handleError(res, error, 'Delete User');
  }
});

// Admin: Get approval routes by amount threshold
app.get('/api/admin/approval-routes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM approval_routes ORDER BY amount_threshold');
    res.json({ routes: result.rows });
  } catch (error) {
    return handleError(res, error, 'Get Approval Routes');
  }
});

// Admin: Upsert approval route
app.put('/api/admin/approval-routes', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { amount_threshold, reviewer_ids, final_approver_user_id } = req.body;
    if (!amount_threshold || ![APPROVAL_THRESHOLD.UNDER_100M, APPROVAL_THRESHOLD.OVER_EQ_100M].includes(amount_threshold)) {
      return res.status(400).json({ error: `amount_threshold must be one of: ${APPROVAL_THRESHOLD.UNDER_100M}, ${APPROVAL_THRESHOLD.OVER_EQ_100M}` });
    }

    const reviewersArray = Array.isArray(reviewer_ids) ? reviewer_ids : [];
    await db.query(
      `INSERT INTO approval_routes (amount_threshold, reviewer_ids, final_approver_user_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (amount_threshold)
       DO UPDATE SET reviewer_ids = EXCLUDED.reviewer_ids, final_approver_user_id = EXCLUDED.final_approver_user_id, updated_at = CURRENT_TIMESTAMP`,
      [amount_threshold, reviewersArray, final_approver_user_id || null]
    );

    const result = await db.query('SELECT * FROM approval_routes ORDER BY amount_threshold');
    res.json({ routes: result.rows });
  } catch (error) {
    return handleError(res, error, 'Upsert Approval Route');
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
    // まずemailで検索、見つからない場合はfirebase_uidで検索
    let currentUser = await db.query(
      'SELECT id, name, company, department, position, is_approved, firebase_uid FROM users WHERE email = $1',
      [req.user.email]
    );
    
    // emailで見つからない場合、firebase_uidで検索
    if (currentUser.rows.length === 0) {
      currentUser = await db.query(
        'SELECT id, name, company, department, position, is_approved, firebase_uid FROM users WHERE firebase_uid = $1',
        [req.user.uid]
      );
      
      // firebase_uidで見つかった場合、emailを更新して紐付ける
      if (currentUser.rows.length > 0) {
        await db.query(
          'UPDATE users SET email = $1, firebase_uid = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3',
          [req.user.email, req.user.uid, currentUser.rows[0].id]
        );
      }
    } else {
      // emailで見つかった場合、firebase_uidが一致しているか確認
      const foundUser = currentUser.rows[0];
      if (!foundUser.firebase_uid || foundUser.firebase_uid !== req.user.uid) {
        // firebase_uidが設定されていない、または異なる場合、更新する
        await db.query(
          'UPDATE users SET firebase_uid = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [req.user.uid, foundUser.id]
        );
      }
    }
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found. Please sign up first.' });
    }
    
    const user = currentUser.rows[0];
    const wasProfileEmpty = !user.name || !user.company;
    const isPending = !user.is_approved;
    
    // プロフィール情報を更新（idで更新するように変更）
    const result = await db.query(
      'UPDATE users SET name = $1, company = $2, department = $3, position = $4, firebase_uid = $5, email = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *',
      [name, company, department, position, req.user.uid, req.user.email, user.id]
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
    
    // 複数の審査者が設定されているか確認
    const projectReviewers = await db.query(
      'SELECT reviewer_id FROM project_reviewers WHERE project_id = $1',
      [id]
    );
    const hasReviewers = projectData.reviewer_id || projectReviewers.rows.length > 0;
    
    if (!hasReviewers) {
      return res.status(400).json({ error: 'At least one reviewer must be assigned before submission' });
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
    
    console.log('[Review] Review request received:', {
      projectId: id,
      decision: decision,
      hasComment: !!review_comment,
      commentLength: review_comment?.length || 0,
      userEmail: req.user?.email
    });
    
    if (!decision || !['approved', 'rejected'].includes(decision)) {
      console.error('[Review] Invalid decision:', decision);
      return res.status(400).json({ error: 'Decision must be either "approved" or "rejected"' });
    }
    
    // 却下の場合はコメントが必須
    if (decision === 'rejected' && (!review_comment || review_comment.trim().length === 0)) {
      console.error('[Review] Rejection requires comment');
      return res.status(400).json({ error: 'Review comment is required when rejecting' });
    }
    
    // 現在のユーザー情報を取得
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      console.error('[Review] User not found:', req.user.email);
      return res.status(404).json({ error: 'User not found' });
    }
    
    // プロジェクトの審査者を確認（複数の審査者に対応）
    const projectResult = await db.query(
      'SELECT * FROM projects WHERE id = $1',
      [id]
    );
    
    if (projectResult.rows.length === 0) {
      console.error('[Review] Project not found:', id);
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const projectData = projectResult.rows[0];
    
    // プロジェクトの承認ルートを取得
    const fullProject = await ensureProjectRoute(projectData);
    
    // project_reviewersテーブルから審査者を確認
    const projectReviewers = await db.query(
      'SELECT reviewer_id FROM project_reviewers WHERE project_id = $1',
      [id]
    ).catch(() => ({ rows: [] })); // テーブルが存在しない場合のエラーハンドリング
    const reviewerIds = projectReviewers.rows.map(r => r.reviewer_id);
    
    // 現在のユーザーが審査者のいずれかであることを確認
    const userId = currentUser.rows[0].id;
    const isAssignedReviewer = projectData.reviewer_id === userId || reviewerIds.includes(userId);
    
    console.log('[Review] Checking reviewer permission:', {
      projectId: id,
      userId: userId,
      projectReviewerId: projectData.reviewer_id,
      reviewerIds: reviewerIds,
      isAssignedReviewer: isAssignedReviewer
    });
    
    if (!isAssignedReviewer) {
      console.error('[Review] User is not assigned reviewer:', {
        userId: userId,
        projectReviewerId: projectData.reviewer_id,
        reviewerIds: reviewerIds
      });
      return res.status(403).json({ 
        error: 'Only the assigned reviewer can review this application',
        details: {
          userId: userId,
          projectReviewerId: projectData.reviewer_id,
          reviewerIds: reviewerIds
        }
      });
    }
    
    // 既に審査済みの場合はエラー（却下された場合も含む）
    if (projectData.application_status === 'approved' || projectData.application_status === 'rejected') {
      console.warn('[Review] Project already reviewed:', {
        projectId: id,
        currentStatus: projectData.application_status
      });
      return res.status(400).json({ 
        error: `Project application has already been ${projectData.application_status}` 
      });
    }
    
    if (projectData.application_status !== 'submitted') {
      console.warn('[Review] Project not in submitted status:', {
        projectId: id,
        currentStatus: projectData.application_status
      });
      return res.status(400).json({ 
        error: 'Project application must be submitted before review',
        currentStatus: projectData.application_status
      });
    }
    
    // 承認の場合：reviewer_approvalsを更新（並列承認フローに対応）
    if (decision === 'approved') {
      const currentApprovals = fullProject.reviewer_approvals || {};
      const updatedApprovals = { ...currentApprovals };
      // JSONBのキーは文字列として保存されるため、文字列キーを使用
      const userIdKey = String(userId);
      // 数値キーが存在する場合は削除して、文字列キーで統一
      if (updatedApprovals[userId] && !updatedApprovals[userIdKey]) {
        delete updatedApprovals[userId];
      }
      updatedApprovals[userIdKey] = { status: 'approved', updated_at: new Date().toISOString() };
      
      // reviewer_approvalsを更新（application_statusは変更しない）
      await db.query(
        `UPDATE projects 
         SET reviewer_approvals = $1::jsonb,
             review_comment = $2,
             reviewed_at = CURRENT_TIMESTAMP,
             reviewed_by = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [updatedApprovals, review_comment || null, currentUser.rows[0].id, id]
      );
      
      // すべての審査者が承認したか確認
      const allReviewers = await db.query(
        'SELECT reviewer_id FROM project_reviewers WHERE project_id = $1',
        [id]
      );
      const totalReviewers = allReviewers.rows.length;
      const approvedCount = Object.values(updatedApprovals).filter(a => a?.status === 'approved').length;
      const allReviewersApproved = totalReviewers > 0 && approvedCount === totalReviewers;
      
      // すべての審査者が承認した場合でも、application_statusは変更しない
      // 最終承認者が最終承認を行うまで、application_statusは'submitted'のまま
      
      const updatedProject = await db.query('SELECT * FROM projects WHERE id = $1', [id]);
      res.json({
        project: updatedProject.rows[0],
        message: 'Reviewer approval recorded successfully',
        all_reviewers_approved: allReviewersApproved,
        note: allReviewersApproved && fullProject.final_approver_user_id 
          ? 'All reviewers have approved. Waiting for final approval.' 
          : 'Reviewer approval recorded.'
      });
    } else {
      // 却下の場合：application_statusを'rejected'に変更、statusを'on_hold'に変更
      const result = await db.query(
        `UPDATE projects 
         SET application_status = $1, 
             review_comment = $2,
             reviewed_at = CURRENT_TIMESTAMP,
             reviewed_by = $3,
             status = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $5 RETURNING *`,
        ['rejected', review_comment || null, currentUser.rows[0].id, 'on_hold', id]
      );
      
      // 更新後のプロジェクト情報を再取得（reviewersなどの最新情報を含む）
      let updatedProjectData = result.rows[0];
      try {
        const updatedProject = await db.query(
          `SELECT p.*, 
                  u1.name as executor_name, u1.email as executor_email,
                  u2.name as reviewer_name, u2.email as reviewer_email,
                  COALESCE(
                    json_agg(
                      json_build_object(
                        'id', u3.id,
                        'name', u3.name,
                        'email', u3.email
                      )
                    ) FILTER (WHERE u3.id IS NOT NULL),
                    '[]'::json
                  ) as reviewers
           FROM projects p
           LEFT JOIN users u1 ON p.executor_id = u1.id
           LEFT JOIN users u2 ON p.reviewer_id = u2.id
           LEFT JOIN project_reviewers pr ON p.id = pr.project_id
           LEFT JOIN users u3 ON pr.reviewer_id = u3.id
           WHERE p.id = $1
           GROUP BY p.id, u1.id, u1.name, u1.email, u2.id, u2.name, u2.email`,
          [id]
        );
        
        if (updatedProject.rows.length > 0) {
          updatedProjectData = updatedProject.rows[0];
        }
      } catch (fetchError) {
        console.error('[Review] Error fetching updated project data:', fetchError);
        // エラーが発生しても、UPDATE結果を返す
        console.warn('[Review] Using UPDATE result instead of re-fetched data');
      }
      
      res.json({
        project: updatedProjectData,
        message: 'Project application rejected successfully'
      });
    }
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
         (project_id, report_type, verification_content, kpi_metrics, results, budget_used, planned_date, planned_budget, period_start, period_end, created_by, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'draft')
         RETURNING *`,
        [
          id,
          report_type,
          verification_content || null,
          kpi_metrics ? JSON.stringify(kpi_metrics) : null,
          results || null,
          budget_used || null,
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
      results,
      budget_used,
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
    if (results !== undefined) {
      updateFields.push(`results = $${paramIndex++}`);
      updateValues.push(results);
    }
    if (budget_used !== undefined) {
      updateFields.push(`budget_used = $${paramIndex++}`);
      updateValues.push(budget_used);
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

// ==================== Budget Management API ====================

// Get annual budget for a project
app.get('/api/projects/:id/annual-budget', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    
    // プロジェクトの存在確認と権限確認
    const project = await db.query(
      'SELECT id, executor_id, annual_opex_budget, annual_capex_budget, application_status FROM projects WHERE id = $1',
      [id]
    );
    
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // 承認済みプロジェクトのみアクセス可能
    if (project.rows[0].application_status !== 'approved') {
      return res.status(403).json({ error: 'Budget management is only available for approved projects' });
    }
    
    // 現在のユーザー情報を取得
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
    
    res.json({
      annual_opex_budget: project.rows[0].annual_opex_budget || 0,
      annual_capex_budget: project.rows[0].annual_capex_budget || 0
    });
  } catch (error) {
    return handleError(res, error, 'Get Annual Budget');
  }
});

// Update annual budget for a project
app.put('/api/projects/:id/annual-budget', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const { annual_opex_budget, annual_capex_budget } = req.body;
    
    // プロジェクトの存在確認と権限確認
    const project = await db.query(
      'SELECT executor_id, application_status, requested_amount FROM projects WHERE id = $1',
      [id]
    );
    
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    if (project.rows[0].application_status !== 'approved') {
      return res.status(403).json({ error: 'Budget management is only available for approved projects' });
    }
    
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // 実行者のみが年間予算を更新可能（審査者は閲覧のみ）
    const isExecutor = project.rows[0].executor_id === currentUser.rows[0].id;
    
    if (!isExecutor) {
      return res.status(403).json({ error: 'Only project executors can update annual budget' });
    }
    
    // 申請金額に対するバリデーション
    const requestedAmount = parseFloat(project.rows[0].requested_amount) || 0;
    const opexBudget = annual_opex_budget !== undefined ? parseFloat(annual_opex_budget) : 0;
    const capexBudget = annual_capex_budget !== undefined ? parseFloat(annual_capex_budget) : 0;
    const totalBudget = opexBudget + capexBudget;
    
    if (requestedAmount > 0 && totalBudget > requestedAmount) {
      return res.status(400).json({ 
        error: `The sum of OPEX and CAPEX budgets (${totalBudget.toLocaleString()}) exceeds the requested amount (${requestedAmount.toLocaleString()})` 
      });
    }
    
    const result = await db.query(
      `UPDATE projects 
       SET annual_opex_budget = COALESCE($1, annual_opex_budget),
           annual_capex_budget = COALESCE($2, annual_capex_budget),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING annual_opex_budget, annual_capex_budget`,
      [
        annual_opex_budget !== undefined ? parseFloat(annual_opex_budget) : null,
        annual_capex_budget !== undefined ? parseFloat(annual_capex_budget) : null,
        id
      ]
    );
    
    res.json({
      annual_opex_budget: result.rows[0].annual_opex_budget || 0,
      annual_capex_budget: result.rows[0].annual_capex_budget || 0
    });
  } catch (error) {
    return handleError(res, error, 'Update Annual Budget');
  }
});

// Get monthly budget entries for a project
app.get('/api/projects/:id/budget-entries', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const { year } = req.query;
    
    // プロジェクトの存在確認と権限確認
    const project = await db.query(
      'SELECT id, executor_id, application_status FROM projects WHERE id = $1',
      [id]
    );
    
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    if (project.rows[0].application_status !== 'approved') {
      return res.status(403).json({ error: 'Budget management is only available for approved projects' });
    }
    
    // 現在のユーザー情報を取得
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
    
    let query = 'SELECT * FROM project_budget_entries WHERE project_id = $1';
    const params = [id];
    
    if (year) {
      query += ' AND year = $2 ORDER BY year, month';
      params.push(parseInt(year));
    } else {
      query += ' ORDER BY year DESC, month DESC';
    }
    
    const result = await db.query(query, params);
    
    // 累計金額を計算
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    let totalOpexBudget = 0;
    let totalOpexUsed = 0;
    let totalCapexBudget = 0;
    let totalCapexUsed = 0;
    
    result.rows.forEach(entry => {
      if (entry.year < currentYear || (entry.year === currentYear && entry.month <= currentMonth)) {
        totalOpexBudget += parseFloat(entry.opex_budget || 0);
        totalOpexUsed += parseFloat(entry.opex_used || 0);
        totalCapexBudget += parseFloat(entry.capex_budget || 0);
        totalCapexUsed += parseFloat(entry.capex_used || 0);
      }
    });
    
    res.json({
      entries: result.rows,
      cumulative: {
        opex_budget: totalOpexBudget,
        opex_used: totalOpexUsed,
        capex_budget: totalCapexBudget,
        capex_used: totalCapexUsed
      }
    });
  } catch (error) {
    return handleError(res, error, 'Get Budget Entries');
  }
});

// Create or update monthly budget entry
app.post('/api/projects/:id/budget-entries', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const { year, month, opex_budget, opex_used, capex_budget, capex_used } = req.body;
    
    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month are required' });
    }
    
    if (month < 1 || month > 12) {
      return res.status(400).json({ error: 'Month must be between 1 and 12' });
    }
    
    // プロジェクトの存在確認と権限確認
    const project = await db.query(
      'SELECT executor_id, application_status FROM projects WHERE id = $1',
      [id]
    );
    
    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    if (project.rows[0].application_status !== 'approved') {
      return res.status(403).json({ error: 'Budget management is only available for approved projects' });
    }
    
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // 実行者のみが予算を更新可能（審査者は閲覧のみ）
    const isExecutor = project.rows[0].executor_id === currentUser.rows[0].id;
    
    if (!isExecutor) {
      return res.status(403).json({ error: 'Only project executors can create or update budget entries' });
    }
    
    const result = await db.query(
      `INSERT INTO project_budget_entries 
       (project_id, year, month, opex_budget, opex_used, capex_budget, capex_used, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (project_id, year, month) 
       DO UPDATE SET 
         opex_budget = EXCLUDED.opex_budget,
         opex_used = EXCLUDED.opex_used,
         capex_budget = EXCLUDED.capex_budget,
         capex_used = EXCLUDED.capex_used,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [
        id,
        parseInt(year),
        parseInt(month),
        opex_budget !== undefined ? parseFloat(opex_budget) : 0,
        opex_used !== undefined ? parseFloat(opex_used) : 0,
        capex_budget !== undefined ? parseFloat(capex_budget) : 0,
        capex_used !== undefined ? parseFloat(capex_used) : 0,
        currentUser.rows[0].id
      ]
    );
    
    res.json({ entry: result.rows[0] });
  } catch (error) {
    return handleError(res, error, 'Create/Update Budget Entry');
  }
});

// Delete monthly budget entry
app.delete('/api/projects/:id/budget-entries/:entryId', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id, entryId } = req.params;
    
    // プロジェクトの存在確認と権限確認
    const project = await db.query(
      'SELECT executor_id FROM projects WHERE id = $1',
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
    
    // 実行者のみが削除可能（審査者は閲覧のみ）
    const isExecutor = project.rows[0].executor_id === currentUser.rows[0].id;
    
    if (!isExecutor) {
      return res.status(403).json({ error: 'Only project executors can delete budget entries' });
    }
    
    await db.query(
      'DELETE FROM project_budget_entries WHERE id = $1 AND project_id = $2',
      [entryId, id]
    );
    
    res.json({ message: 'Budget entry deleted successfully' });
  } catch (error) {
    return handleError(res, error, 'Delete Budget Entry');
  }
});

// デバッグ用エンドポイント: 利用可能なGeminiモデルを確認
app.get('/api/debug/gemini-models', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is not set' });
    }
    
    const genAI = new GoogleGenerativeAI(apiKey);
    
    try {
      const models = await genAI.listModels();
      const modelList = models.map(model => ({
        name: model.name,
        displayName: model.displayName || null,
        supportedMethods: model.supportedGenerationMethods || []
      }));
      
      // generateContentをサポートしているモデルをフィルタ
      const generateContentModels = modelList.filter(model => 
        model.supportedMethods.includes('generateContent')
      );
      
      res.json({
        allModels: modelList,
        generateContentModels: generateContentModels,
        totalModels: modelList.length,
        generateContentSupported: generateContentModels.length
      });
    } catch (error) {
      return res.status(500).json({ 
        error: 'Failed to list models',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  } catch (error) {
    return handleError(res, error, 'List Gemini Models');
  }
});

// デバッグ用エンドポイント: 全プロジェクトとユーザー情報を確認
app.get('/api/debug/projects', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 全プロジェクトを取得
    const allProjects = await db.query(
      `SELECT p.*, 
              u1.name as executor_name, u1.email as executor_email,
              u2.name as reviewer_name, u2.email as reviewer_email
       FROM projects p
       LEFT JOIN users u1 ON p.executor_id = u1.id
       LEFT JOIN users u2 ON p.reviewer_id = u2.id
       ORDER BY p.created_at DESC`
    );
    
    // 全ユーザーを取得
    const allUsers = await db.query(
      'SELECT id, email, name, position, is_approved FROM users ORDER BY id'
    );
    
    // 現在のユーザー情報
    const currentUser = await db.query(
      'SELECT id, email, name, position, is_approved FROM users WHERE email = $1',
      [req.user.email]
    );
    
    // project_reviewersテーブルのデータを取得
    let projectReviewers = [];
    try {
      const reviewersResult = await db.query(
        'SELECT pr.*, u.email as reviewer_email, u.name as reviewer_name, p.name as project_name FROM project_reviewers pr LEFT JOIN users u ON pr.reviewer_id = u.id LEFT JOIN projects p ON pr.project_id = p.id ORDER BY pr.project_id'
      );
      projectReviewers = reviewersResult.rows;
    } catch (err) {
      console.warn('[Debug] project_reviewers table not found:', err.message);
    }
    
    res.json({
      currentUser: currentUser.rows[0] || null,
      totalProjects: allProjects.rows.length,
      projects: allProjects.rows,
      totalUsers: allUsers.rows.length,
      users: allUsers.rows,
      projectReviewers: projectReviewers
    });
  } catch (error) {
    return handleError(res, error, 'Debug Projects');
  }
});

// Admin: Delete all projects
app.delete('/api/admin/projects/all', authenticateToken, requireAdmin, async (req, res) => {
  try {
    console.log('[Delete All Projects] Starting deletion of all projects...');
    
    // 削除前のプロジェクト数を取得
    const countResult = await db.query('SELECT COUNT(*) as count FROM projects');
    const projectCount = parseInt(countResult.rows[0].count);
    
    console.log(`[Delete All Projects] Found ${projectCount} projects to delete`);
    
    if (projectCount === 0) {
      return res.json({
        message: 'No projects to delete',
        deletedCount: 0
      });
    }
    
    // 関連データを削除（CASCADEが設定されているが念のため）
    // 1. project_reviewersテーブルから削除
    const reviewersResult = await db.query('DELETE FROM project_reviewers RETURNING *');
    console.log(`[Delete All Projects] Deleted ${reviewersResult.rows.length} project_reviewers entries`);
    
    // 2. project_budget_entriesテーブルから削除
    const budgetEntriesResult = await db.query('DELETE FROM project_budget_entries RETURNING *');
    console.log(`[Delete All Projects] Deleted ${budgetEntriesResult.rows.length} project_budget_entries`);
    
    // 3. kpi_reportsテーブルから削除
    const kpiReportsResult = await db.query('DELETE FROM kpi_reports RETURNING *');
    console.log(`[Delete All Projects] Deleted ${kpiReportsResult.rows.length} kpi_reports`);
    
    // 4. budget_applicationsテーブルから削除
    const budgetAppsResult = await db.query('DELETE FROM budget_applications RETURNING *');
    console.log(`[Delete All Projects] Deleted ${budgetAppsResult.rows.length} budget_applications`);
    
    // 5. プロジェクトを削除（CASCADEにより関連データも自動削除されるが、念のため上記で削除済み）
    const projectsResult = await db.query('DELETE FROM projects RETURNING *');
    console.log(`[Delete All Projects] Deleted ${projectsResult.rows.length} projects`);
    
    res.json({
      message: 'All projects deleted successfully',
      deletedCount: projectsResult.rows.length,
      deletedRelatedData: {
        project_reviewers: reviewersResult.rows.length,
        project_budget_entries: budgetEntriesResult.rows.length,
        kpi_reports: kpiReportsResult.rows.length,
        budget_applications: budgetAppsResult.rows.length
      }
    });
  } catch (error) {
    console.error('[Delete All Projects] Error:', error);
    return handleError(res, error, 'Delete All Projects');
  }
});

// Admin: Delete specific project_reviewers entry
app.delete('/api/admin/project-reviewers/:projectId/:reviewerId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { projectId, reviewerId } = req.params;
    
    console.log(`[Delete Project Reviewer] Deleting project_reviewers entry: project_id=${projectId}, reviewer_id=${reviewerId}`);
    
    const result = await db.query(
      'DELETE FROM project_reviewers WHERE project_id = $1 AND reviewer_id = $2 RETURNING *',
      [projectId, reviewerId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Project reviewer entry not found',
        project_id: projectId,
        reviewer_id: reviewerId
      });
    }
    
    console.log(`[Delete Project Reviewer] Successfully deleted:`, result.rows[0]);
    
    res.json({
      message: 'Project reviewer entry deleted successfully',
      deleted: result.rows[0]
    });
  } catch (error) {
    console.error('[Delete Project Reviewer] Error:', error);
    return handleError(res, error, 'Delete Project Reviewer');
  }
});

// Admin: Delete multiple project_reviewers entries
app.post('/api/admin/project-reviewers/delete-multiple', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { entries } = req.body; // [{ project_id: 102, reviewer_id: 1 }, ...]
    
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ error: 'Entries array is required and must not be empty' });
    }
    
    console.log(`[Delete Multiple Project Reviewers] Deleting ${entries.length} entries`);
    
    const deletedEntries = [];
    const notFoundEntries = [];
    
    for (const entry of entries) {
      const { project_id, reviewer_id } = entry;
      
      if (!project_id || !reviewer_id) {
        notFoundEntries.push({ ...entry, reason: 'Missing project_id or reviewer_id' });
        continue;
      }
      
      try {
        const result = await db.query(
          'DELETE FROM project_reviewers WHERE project_id = $1 AND reviewer_id = $2 RETURNING *',
          [project_id, reviewer_id]
        );
        
        if (result.rows.length > 0) {
          deletedEntries.push(result.rows[0]);
          console.log(`[Delete Multiple Project Reviewers] Deleted: project_id=${project_id}, reviewer_id=${reviewer_id}`);
        } else {
          notFoundEntries.push({ project_id, reviewer_id, reason: 'Entry not found' });
        }
      } catch (error) {
        console.error(`[Delete Multiple Project Reviewers] Error deleting project_id=${project_id}, reviewer_id=${reviewer_id}:`, error);
        notFoundEntries.push({ project_id, reviewer_id, reason: error.message });
      }
    }
    
    res.json({
      message: `Deleted ${deletedEntries.length} out of ${entries.length} entries`,
      deleted: deletedEntries,
      notFound: notFoundEntries
    });
  } catch (error) {
    console.error('[Delete Multiple Project Reviewers] Error:', error);
    return handleError(res, error, 'Delete Multiple Project Reviewers');
  }
});

// デバッグ用エンドポイント: project_reviewersテーブルへの移行を実行
app.post('/api/debug/migrate-reviewers', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // 既存のreviewer_idをproject_reviewersテーブルに移行
    const result = await db.query(
      `INSERT INTO project_reviewers (project_id, reviewer_id, assigned_at)
       SELECT id, reviewer_id, created_at
       FROM projects
       WHERE reviewer_id IS NOT NULL
       ON CONFLICT (project_id, reviewer_id) DO NOTHING
       RETURNING *`
    );
    
    res.json({
      message: 'Migration completed',
      migrated: result.rows.length
    });
  } catch (error) {
    console.error('[Migrate Reviewers] Error:', error);
    return handleError(res, error, 'Migrate Reviewers');
  }
});

// デバッグ用エンドポイント: 現在のユーザー情報とプロフィール紐付け状態を確認
app.get('/api/debug/user-profile', authenticateToken, async (req, res) => {
  try {
    const email = req.user.email;
    const uid = req.user.uid;
    
    // emailで検索
    const emailResult = await db.query(
      'SELECT id, email, firebase_uid, name, company, department, position, is_admin, is_approved FROM users WHERE email = $1',
      [email]
    );
    
    // firebase_uidで検索
    const uidResult = await db.query(
      'SELECT id, email, firebase_uid, name, company, department, position, is_admin, is_approved FROM users WHERE firebase_uid = $1',
      [uid]
    );
    
    // すべてのユーザーを取得（デバッグ用）
    const allUsers = await db.query(
      'SELECT id, email, firebase_uid, name, company, department, position, is_admin, is_approved FROM users ORDER BY id'
    );
    
    res.json({
      currentFirebaseUser: {
        email: email,
        uid: uid
      },
      foundByEmail: emailResult.rows.length > 0 ? emailResult.rows[0] : null,
      foundByUid: uidResult.rows.length > 0 ? uidResult.rows[0] : null,
      allUsers: allUsers.rows,
      needsLinking: emailResult.rows.length === 0 && uidResult.rows.length > 0,
      profileComplete: emailResult.rows.length > 0 ? 
        (emailResult.rows[0].name && emailResult.rows[0].company && emailResult.rows[0].department && emailResult.rows[0].position) :
        (uidResult.rows.length > 0 ? 
          (uidResult.rows[0].name && uidResult.rows[0].company && uidResult.rows[0].department && uidResult.rows[0].position) :
          false)
    });
  } catch (error) {
    return handleError(res, error, 'Debug User Profile');
  }
});

// デバッグ用エンドポイント: 審査待ちプロジェクトのデバッグ情報
app.get('/api/debug/review-pending', authenticateToken, requireApproved, async (req, res) => {
  try {
    // 現在のユーザー情報を取得
    const currentUser = await db.query(
      'SELECT id, email, name, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const userId = currentUser.rows[0].id;
    
    // 提出済みプロジェクトを取得（final_approver_user_idも含める）
    const submittedProjects = await db.query(
      'SELECT id, name, application_status, reviewer_id, final_approver_user_id, requested_amount, reviewer_approvals FROM projects WHERE application_status = $1',
      ['submitted']
    );
    
    // project_reviewersテーブルのデータを取得
    let projectReviewers = [];
    try {
      const reviewersResult = await db.query(
        'SELECT project_id, reviewer_id FROM project_reviewers'
      );
      projectReviewers = reviewersResult.rows;
    } catch (err) {
      console.warn('[Debug] project_reviewers table not found:', err.message);
    }
    
    // approval_routesテーブルのデータを取得
    let approvalRoutes = [];
    try {
      const routesResult = await db.query(
        'SELECT * FROM approval_routes ORDER BY amount_threshold'
      );
      approvalRoutes = routesResult.rows;
    } catch (err) {
      console.warn('[Debug] approval_routes table not found:', err.message);
    }
    
    // 現在のユーザーが最終決裁者として設定されているか確認
    const finalApproverCheck = await db.query(
      'SELECT COUNT(*) as count FROM approval_routes WHERE final_approver_user_id = $1',
      [userId]
    );
    const isFinalApproverInRoutes = parseInt(finalApproverCheck.rows[0]?.count || 0) > 0;
    
    // 現在のユーザーが最終決裁者として設定されているプロジェクトを確認
    const projectsWithCurrentUserAsFinalApprover = submittedProjects.rows.filter(p => 
      p.final_approver_user_id === userId
    );
    
    // 現在のユーザーが審査者として割り当てられているプロジェクトを確認
    const assignedProjects = projectReviewers.filter(pr => pr.reviewer_id === userId);
    const projectsWithCurrentUserAsReviewer = submittedProjects.rows.filter(p => 
      p.reviewer_id === userId || assignedProjects.some(ap => ap.project_id === p.id)
    );
    
    // 最終決裁者として表示されるべきプロジェクトを確認
    let projectsReadyForFinalApproval = [];
    for (const project of projectsWithCurrentUserAsFinalApprover) {
      const reviewers = projectReviewers.filter(pr => pr.project_id === project.id);
      if (reviewers.length === 0) continue;
      
      const approvals = project.reviewer_approvals || {};
      const allApproved = reviewers.every((r) => {
        const approval = approvals[r.reviewer_id];
        return approval && approval.status === 'approved';
      });
      
      if (allApproved) {
        projectsReadyForFinalApproval.push({
          ...project,
          reviewers: reviewers,
          allReviewersApproved: true
        });
      }
    }
    
    res.json({
      currentUser: {
        id: userId,
        email: currentUser.rows[0].email,
        name: currentUser.rows[0].name,
        position: currentUser.rows[0].position,
        isFinalApproverInRoutes: isFinalApproverInRoutes
      },
      submittedProjects: submittedProjects.rows,
      projectReviewers: projectReviewers,
      approvalRoutes: approvalRoutes,
      assignedProjects: assignedProjects,
      projectsWithCurrentUserAsReviewer: projectsWithCurrentUserAsReviewer,
      projectsWithCurrentUserAsFinalApprover: projectsWithCurrentUserAsFinalApprover,
      projectsReadyForFinalApproval: projectsReadyForFinalApproval,
      summary: {
        totalSubmittedProjects: submittedProjects.rows.length,
        totalProjectReviewers: projectReviewers.length,
        assignedAsReviewer: assignedProjects.length,
        assignedAsFinalApprover: projectsWithCurrentUserAsFinalApprover.length,
        readyForFinalApproval: projectsReadyForFinalApproval.length
      }
    });
  } catch (error) {
    return handleError(res, error, 'Debug Review Pending');
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

// Protected endpoint - Get approved projects dashboard (with KPI and budget summaries)
app.get('/api/projects/approved/dashboard', authenticateToken, requireApproved, async (req, res) => {
  try {
    // 承認済みプロジェクトをステップ別に取得
    const projects = await db.query(
      `SELECT p.*, 
              u1.name as executor_name, u1.email as executor_email, u1.company as executor_company,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', u3.id,
                    'name', u3.name,
                    'email', u3.email
                  )
                ) FILTER (WHERE u3.id IS NOT NULL),
                '[]'::json
              ) as reviewers
       FROM projects p
       LEFT JOIN users u1 ON p.executor_id = u1.id
       LEFT JOIN project_reviewers pr ON p.id = pr.project_id
       LEFT JOIN users u3 ON pr.reviewer_id = u3.id
       WHERE p.application_status = 'approved'
       GROUP BY p.id, u1.id, u1.name, u1.email, u1.company
       ORDER BY p.created_at DESC`
    );

    // 各プロジェクトのKPI報告数と予算使用額を取得
    const projectsWithSummaries = await Promise.all(
      projects.rows.map(async (project) => {
        // KPI報告数を取得
        const kpiCount = await db.query(
          'SELECT COUNT(*) as count FROM kpi_reports WHERE project_id = $1',
          [project.id]
        );
        
        // 予算使用額の合計を取得（OPEX + CAPEX）
        const budgetEntries = await db.query(
          `SELECT 
             COALESCE(SUM(opex_used), 0) as total_opex_used,
             COALESCE(SUM(capex_used), 0) as total_capex_used
           FROM project_budget_entries 
           WHERE project_id = $1`,
          [project.id]
        );
        
        const totalUsed = parseFloat(budgetEntries.rows[0]?.total_opex_used || 0) + 
                         parseFloat(budgetEntries.rows[0]?.total_capex_used || 0);
        
        return {
          ...project,
          kpi_report_count: parseInt(kpiCount.rows[0]?.count || 0),
          total_budget_used: totalUsed,
          requested_amount: parseFloat(project.requested_amount || 0)
        };
      })
    );

    // ステップ別にグループ化
    const phases = {
      mvp_development_1: [],
      mvp_development_2: [],
      business_launch: [],
      business_stabilization: []
    };

    const normalizePhase = (phase) => {
      if (!phase || phase === 'mvp_development') return 'mvp_development_1';
      if (['mvp_development_1', 'mvp_development_2', 'business_launch', 'business_stabilization'].includes(phase)) {
        return phase;
      }
      return 'mvp_development_1';
    };

    projectsWithSummaries.forEach(project => {
      const phase = normalizePhase(project.project_phase);
      if (phases[phase]) {
        phases[phase].push(project);
      } else {
        phases.mvp_development_1.push(project);
      }
    });

    // 各ステップの合計を計算
    const phaseSummaries = Object.keys(phases).map(phase => {
      const phaseProjects = phases[phase];
      const totalRequested = phaseProjects.reduce((sum, p) => sum + (p.requested_amount || 0), 0);
      const totalUsed = phaseProjects.reduce((sum, p) => sum + (p.total_budget_used || 0), 0);
      const totalKpiReports = phaseProjects.reduce((sum, p) => sum + (p.kpi_report_count || 0), 0);

      return {
        phase,
        projects: phaseProjects,
        summary: {
          project_count: phaseProjects.length,
          total_requested_amount: totalRequested,
          total_budget_used: totalUsed,
          total_kpi_reports: totalKpiReports
        }
      };
    });

    res.json({
      phases: phaseSummaries,
      overall_summary: {
        total_projects: projectsWithSummaries.length,
        total_requested_amount: projectsWithSummaries.reduce((sum, p) => sum + (p.requested_amount || 0), 0),
        total_budget_used: projectsWithSummaries.reduce((sum, p) => sum + (p.total_budget_used || 0), 0),
        total_kpi_reports: projectsWithSummaries.reduce((sum, p) => sum + (p.kpi_report_count || 0), 0)
      }
    });
  } catch (error) {
    console.error('[Approved Projects Dashboard] Error:', error);
    return handleError(res, error, 'Get Approved Projects Dashboard');
  }
});

// Protected endpoint - Update project phase
app.put('/api/projects/:id/phase', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const { phase } = req.body;

    const validPhases = ['mvp_development_1', 'mvp_development_2', 'business_launch', 'business_stabilization', 'mvp_development'];
    if (!phase || !validPhases.includes(phase)) {
      return res.status(400).json({ 
        error: `Phase must be one of: ${validPhases.join(', ')}` 
      });
    }

    const normalizedPhase = phase === 'mvp_development' ? 'mvp_development_1' : phase;

    // プロジェクトの存在確認
    const project = await db.query(
      'SELECT id, application_status FROM projects WHERE id = $1',
      [id]
    );

    if (project.rows.length === 0) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.rows[0].application_status !== 'approved') {
      return res.status(403).json({ error: 'Phase can only be updated for approved projects' });
    }

    // 現在のユーザー情報を取得
    const currentUser = await db.query(
      'SELECT id, position, is_admin FROM users WHERE email = $1',
      [req.user.email]
    );

    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = currentUser.rows[0];
    const projectData = project.rows[0];

    // 実行者、審査者、または管理者のみ更新可能
    const projectWithExecutor = await db.query(
      'SELECT executor_id FROM projects WHERE id = $1',
      [id]
    );
    const isExecutor = projectWithExecutor.rows[0]?.executor_id === user.id;

    if (!isExecutor && !user.is_admin && user.position !== 'reviewer') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // フェーズを更新
    await db.query(
      'UPDATE projects SET project_phase = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [normalizedPhase, id]
    );

    res.json({ success: true, phase });
  } catch (error) {
    return handleError(res, error, 'Update Project Phase');
  }
});

// Protected endpoint - Business Advisor Chat (executor only)
app.post('/api/business-advisor/chat', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { message, conversationHistory } = req.body;
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // 現在のユーザー情報を取得
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // 実行者のみが利用可能
    if (currentUser.rows[0].position !== 'executor') {
      return res.status(403).json({ error: 'Only executors can use the business advisor chat' });
    }
    
    // 会話履歴の検証
    let history = Array.isArray(conversationHistory) ? conversationHistory : [];
    if (history.length > 20) {
      // 会話履歴が長すぎる場合は最新20件のみ使用
      history = history.slice(-20);
    }
    
    console.log('[Business Advisor Chat] Request received', {
      userId: currentUser.rows[0].id,
      messageLength: message.length,
      historyLength: history.length
    });
    
    // ユーザーがアップロードした最新のプロジェクトファイルを取得
    let userDocumentText = null;
    try {
      const userProjects = await db.query(
        `SELECT id, application_file_url, application_file_name, application_file_type, extracted_text, executor_id
         FROM projects 
         WHERE executor_id = $1 
           AND application_file_url IS NOT NULL
         ORDER BY updated_at DESC, created_at DESC
         LIMIT 1`,
        [currentUser.rows[0].id]
      );
      
      if (userProjects.rows.length > 0) {
        const project = userProjects.rows[0];
        console.log('[Business Advisor Chat] Found user project with file:', {
          projectId: project.id,
          fileName: project.application_file_name,
          hasExtractedText: !!project.extracted_text
        });
        
        // 既に抽出されたテキストがある場合はそれを使用、なければ抽出
        if (project.extracted_text) {
          userDocumentText = project.extracted_text;
          console.log('[Business Advisor Chat] Using existing extracted text');
        } else if (project.application_file_url) {
          // テキストを抽出
          console.log('[Business Advisor Chat] Extracting text from file...');
          try {
            userDocumentText = await extractTextFromFile(
              project.application_file_url,
              project.application_file_type
            );
            // 抽出したテキストをデータベースに保存
            await db.query(
              `UPDATE projects 
               SET extracted_text = $1, 
                   extracted_text_updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [userDocumentText, project.id]
            );
            console.log('[Business Advisor Chat] Text extracted and saved');
          } catch (extractError) {
            console.error('[Business Advisor Chat] Error extracting text:', extractError);
            // テキスト抽出に失敗してもチャットは続行
          }
        }
      }
    } catch (docError) {
      console.error('[Business Advisor Chat] Error fetching user document:', docError);
      // ドキュメント取得に失敗してもチャットは続行
    }
    
    // Gemini APIを呼び出し
    const response = await businessAdvisorChat(message, history, userDocumentText);
    
    res.json({
      success: true,
      response: response
    });
  } catch (error) {
    console.error('[Business Advisor Chat] Error:', error);
    return handleError(res, error, 'Business Advisor Chat');
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
    
    // 現在のユーザーが実行者・審査者・管理者か確認
    const currentUser = await db.query(
      'SELECT id, position FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (currentUser.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // 複数審査者を取得
    const projectReviewers = await db.query(
      'SELECT reviewer_id FROM project_reviewers WHERE project_id = $1',
      [id]
    ).catch(() => ({ rows: [] }));
    const reviewerIds = projectReviewers.rows.map(r => r.reviewer_id);
    
    const isExecutor = projectData.executor_id === currentUser.rows[0].id;
    const isReviewer = reviewerIds.includes(currentUser.rows[0].id);
    const isAdmin = currentUser.rows[0].position === 'admin';
    
    if (!isExecutor && !isReviewer && !isAdmin) {
      return res.status(403).json({ error: 'You do not have permission to check missing sections for this project' });
    }
    
    // 不足部分をチェック
    // リクエストから言語設定を取得（デフォルトは日本語）
    const language = req.body.language || req.headers['accept-language']?.split(',')[0]?.split('-')[0] || 'ja';
    console.log(`[Check Missing Sections API] Starting analysis for project ${id}, language: ${language}`);
    const analysisResult = await checkMissingSections(projectData.extracted_text, language);
    
    if (!analysisResult) {
      console.error('[Check Missing Sections API] No analysis result returned');
      return res.status(500).json({ 
        error: 'Analysis completed but no results were returned. Please try again.' 
      });
    }
    
    console.log(`[Check Missing Sections API] Analysis completed, saving to database...`);
    
    // データベースに保存
    await db.query(
      `UPDATE projects 
       SET missing_sections = $1, 
           missing_sections_updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [JSON.stringify(analysisResult), id]
    );
    
    console.log(`[Check Missing Sections API] Successfully saved analysis result`);
    
    res.json({
      success: true,
      analysis: analysisResult,
      message: 'Missing sections checked successfully'
    });
  } catch (error) {
    console.error('[Check Missing Sections API] Error:', error);
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
    
    // 複数の審査者を確認
    const projectReviewers = await db.query(
      'SELECT reviewer_id FROM project_reviewers WHERE project_id = $1',
      [id]
    );
    const reviewerIds = projectReviewers.rows.map(r => r.reviewer_id);
    
    const isExecutor = projectData.executor_id === currentUser.rows[0].id;
    const isReviewer = projectData.reviewer_id === currentUser.rows[0].id || reviewerIds.includes(currentUser.rows[0].id);
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
    
    // 複数の審査者を確認
    const projectReviewers = await db.query(
      'SELECT reviewer_id FROM project_reviewers WHERE project_id = $1',
      [id]
    );
    const reviewerIds = projectReviewers.rows.map(r => r.reviewer_id);
    
    const isExecutor = projectData.executor_id === currentUser.rows[0].id;
    const isReviewer = projectData.reviewer_id === currentUser.rows[0].id || reviewerIds.includes(currentUser.rows[0].id);
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

// ==================== Additional Materials & Messages API ====================

// Upload additional material for a rejected project (executor only)
app.post('/api/projects/:id/add-additional-material', uploadLimiter, authenticateToken, requireApproved, upload.single('additionalFile'), async (req, res) => {
  try {
    const { id } = req.params;
    const { executorMessage } = req.body;
    
    const userEmail = req.user.email;
    const userResult = await db.query('SELECT id FROM users WHERE email = $1', [userEmail]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;
    
    const projectResult = await db.query('SELECT executor_id, application_status FROM projects WHERE id = $1', [id]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    
    const project = projectResult.rows[0];
    if (project.executor_id !== userId) {
      return res.status(403).json({ error: 'Only the project executor can upload additional materials' });
    }
    
    // プロジェクトが却下されているか確認
    if (project.application_status !== 'rejected') {
      // reviewer_approvalsに却下があるか確認
      const projectWithRoute = await ensureProjectRoute(project);
      const approvals = projectWithRoute.reviewer_approvals || {};
      const hasRejection = Object.values(approvals).some(a => a && a.status === 'rejected');
      
      if (!hasRejection) {
        return res.status(400).json({ error: 'Additional materials can only be uploaded for rejected projects' });
      }
    }
    
    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }
    
    // ファイルをアップロード
    const fileInfo = await uploadFile(req.file, id, userId.toString());
    
    // データベースに保存
    const result = await db.query(
      `INSERT INTO project_additional_materials (project_id, file_url, file_name, file_type, file_size, uploaded_by, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [id, fileInfo.url, fileInfo.originalName, fileInfo.contentType, fileInfo.size, userId, executorMessage || null]
    );
    
    res.json({ success: true, material: result.rows[0] });
  } catch (error) {
    return handleError(res, error, 'Upload Additional Material');
  }
});

// Send message to reviewers (executor only)
app.post('/api/projects/:id/send-message-to-reviewers', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    const userEmail = req.user.email;
    const userResult = await db.query('SELECT id FROM users WHERE email = $1', [userEmail]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;
    
    const projectResult = await db.query('SELECT executor_id, application_status FROM projects WHERE id = $1', [id]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    
    const project = projectResult.rows[0];
    if (project.executor_id !== userId) {
      return res.status(403).json({ error: 'Only the project executor can send messages to reviewers' });
    }
    
    // プロジェクトの審査者を取得
    const reviewersResult = await db.query(
      'SELECT reviewer_id FROM project_reviewers WHERE project_id = $1',
      [id]
    );
    const reviewerIds = reviewersResult.rows.map(r => r.reviewer_id);
    
    if (reviewerIds.length === 0) {
      return res.status(400).json({ error: 'No reviewers assigned to this project' });
    }
    
    // すべての審査者にメッセージを送信（to_user_idはNULLで全員に送信）
    const result = await db.query(
      `INSERT INTO project_messages (project_id, from_user_id, to_user_id, message)
       VALUES ($1, $2, NULL, $3) RETURNING *`,
      [id, userId, message.trim()]
    );
    
    res.json({ success: true, message: result.rows[0] });
  } catch (error) {
    return handleError(res, error, 'Send Message to Reviewers');
  }
});

// Get additional materials for a project
app.get('/api/projects/:id/additional-materials', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    
    const userEmail = req.user.email;
    const userResult = await db.query('SELECT id, position, is_admin FROM users WHERE email = $1', [userEmail]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;
    const isAdmin = userResult.rows[0].is_admin;
    
    const projectResult = await db.query('SELECT executor_id FROM projects WHERE id = $1', [id]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    
    const project = projectResult.rows[0];
    const isExecutor = project.executor_id === userId;
    
    // 審査者かどうか確認
    const reviewersResult = await db.query(
      'SELECT reviewer_id FROM project_reviewers WHERE project_id = $1 AND reviewer_id = $2',
      [id, userId]
    );
    const isReviewer = reviewersResult.rows.length > 0;
    
    if (!isExecutor && !isReviewer && !isAdmin) {
      return res.status(403).json({ error: 'You do not have permission to view additional materials for this project' });
    }
    
    const materialsResult = await db.query(
      `SELECT am.*, u.name as uploaded_by_name, u.email as uploaded_by_email
       FROM project_additional_materials am
       LEFT JOIN users u ON am.uploaded_by = u.id
       WHERE am.project_id = $1
       ORDER BY am.uploaded_at DESC`,
      [id]
    );
    
    res.json({ materials: materialsResult.rows });
  } catch (error) {
    return handleError(res, error, 'Get Additional Materials');
  }
});

// Get messages for a project
app.get('/api/projects/:id/messages', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    
    const userEmail = req.user.email;
    const userResult = await db.query('SELECT id, position, is_admin FROM users WHERE email = $1', [userEmail]);
    if (userResult.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    const userId = userResult.rows[0].id;
    const isAdmin = userResult.rows[0].is_admin;
    
    const projectResult = await db.query('SELECT executor_id FROM projects WHERE id = $1', [id]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    
    const project = projectResult.rows[0];
    const isExecutor = project.executor_id === userId;
    
    // 審査者かどうか確認
    const reviewersResult = await db.query(
      'SELECT reviewer_id FROM project_reviewers WHERE project_id = $1 AND reviewer_id = $2',
      [id, userId]
    );
    const isReviewer = reviewersResult.rows.length > 0;
    
    if (!isExecutor && !isReviewer && !isAdmin) {
      return res.status(403).json({ error: 'You do not have permission to view messages for this project' });
    }
    
    // 実行者は全メッセージを、審査者は自分宛てまたは全員宛てのメッセージを取得
    let messagesResult;
    if (isExecutor || isAdmin) {
      messagesResult = await db.query(
        `SELECT m.*, 
                u_from.name as from_user_name, u_from.email as from_user_email,
                u_to.name as to_user_name, u_to.email as to_user_email
         FROM project_messages m
         LEFT JOIN users u_from ON m.from_user_id = u_from.id
         LEFT JOIN users u_to ON m.to_user_id = u_to.id
         WHERE m.project_id = $1
         ORDER BY m.created_at DESC`,
        [id]
      );
    } else {
      messagesResult = await db.query(
        `SELECT m.*, 
                u_from.name as from_user_name, u_from.email as from_user_email,
                u_to.name as to_user_name, u_to.email as to_user_email
         FROM project_messages m
         LEFT JOIN users u_from ON m.from_user_id = u_from.id
         LEFT JOIN users u_to ON m.to_user_id = u_to.id
         WHERE m.project_id = $1 AND (m.to_user_id = $2 OR m.to_user_id IS NULL)
         ORDER BY m.created_at DESC`,
        [id, userId]
      );
    }
    
    res.json({ messages: messagesResult.rows });
  } catch (error) {
    return handleError(res, error, 'Get Messages');
  }
});

// デバッグ用エンドポイント: プロジェクトのreviewer_approvalsの生データを確認
app.get('/api/debug/project/:id/reviewer-approvals', authenticateToken, requireApproved, async (req, res) => {
  try {
    const { id } = req.params;
    const projectResult = await db.query('SELECT id, reviewer_approvals, application_status FROM projects WHERE id = $1', [id]);
    if (projectResult.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    
    const project = projectResult.rows[0];
    const reviewersResult = await db.query(
      'SELECT reviewer_id FROM project_reviewers WHERE project_id = $1',
      [id]
    );
    const reviewerIds = reviewersResult.rows.map(r => r.reviewer_id);
    
    const reviewerApprovals = project.reviewer_approvals || {};
    const reviewerApprovalsKeys = Object.keys(reviewerApprovals);
    
    // 各審査者IDについて、数値キーと文字列キーの両方をチェック
    const reviewerStatuses = reviewerIds.map(reviewerId => {
      const stringKey = String(reviewerId);
      const numericKey = reviewerId;
      const approval = reviewerApprovals[stringKey] || reviewerApprovals[numericKey];
      return {
        reviewer_id: reviewerId,
        string_key: stringKey,
        numeric_key: numericKey,
        approval: approval,
        has_string_key: stringKey in reviewerApprovals,
        has_numeric_key: numericKey in reviewerApprovals
      };
    });
    
    res.json({
      project_id: id,
      application_status: project.application_status,
      reviewer_approvals_raw: reviewerApprovals,
      reviewer_approvals_keys: reviewerApprovalsKeys,
      reviewer_ids: reviewerIds,
      reviewer_statuses: reviewerStatuses,
      reviewer_approvals_type: typeof reviewerApprovals,
      reviewer_approvals_stringified: JSON.stringify(reviewerApprovals)
    });
  } catch (error) {
    return handleError(res, error, 'Debug Reviewer Approvals');
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
