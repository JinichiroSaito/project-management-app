const admin = require('firebase-admin');

// Firebase Admin SDK初期化
let firebaseApp;

function initializeFirebase() {
  if (!firebaseApp) {
    try {
      // Secret Managerから取得した認証情報（環境変数として渡される）
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        firebaseApp = admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log('✓ Firebase Admin SDK initialized');
      } else {
        console.warn('⚠ FIREBASE_SERVICE_ACCOUNT not set - authentication disabled');
      }
    } catch (error) {
      console.error('Failed to initialize Firebase Admin SDK:', error);
    }
  }
  return firebaseApp;
}

// 認証ミドルウェア
async function authenticateToken(req, res, next) {
  try {
    // Firebase初期化
    const app = initializeFirebase();
    
    if (!app) {
      // Firebase未設定の場合はスキップ（開発用）
      return next();
    }

    // Authorizationヘッダーからトークンを取得
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];

    // トークンを検証
    const decodedToken = await admin.auth().verifyIdToken(token);
    
    // ユーザー情報をリクエストに追加
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      emailVerified: decodedToken.email_verified
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// オプショナル認証（トークンがあれば検証、なければスキップ）
async function optionalAuth(req, res, next) {
  try {
    const app = initializeFirebase();
    
    if (!app) {
      return next();
    }

    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      
      req.user = {
        uid: decodedToken.uid,
        email: decodedToken.email,
        emailVerified: decodedToken.email_verified
      };
    }

    next();
  } catch (error) {
    // トークンが無効でもエラーにしない
    next();
  }
}

// 管理者チェックミドルウェア
async function requireAdmin(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const db = require('../db');
    const result = await db.query(
      'SELECT is_admin FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (result.rows.length === 0 || !result.rows[0].is_admin) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
    return res.status(500).json({ 
      error: 'Internal server error',
      message: isDevelopment ? error.message : undefined,
      details: isDevelopment ? { stack: error.stack, code: error.code } : undefined
    });
  }
}

// 承認済みユーザーチェックミドルウェア
async function requireApproved(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const db = require('../db');
    const result = await db.query(
      'SELECT is_approved FROM users WHERE email = $1',
      [req.user.email]
    );
    
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'User not found. Please sign up first.' });
    }
    
    if (!result.rows[0].is_approved) {
      return res.status(403).json({ 
        error: 'Your account is pending approval. Please wait for admin approval.' 
      });
    }
    
    next();
  } catch (error) {
    console.error('Approval check error:', error);
    const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
    return res.status(500).json({ 
      error: 'Internal server error',
      message: isDevelopment ? error.message : undefined,
      details: isDevelopment ? { stack: error.stack, code: error.code } : undefined
    });
  }
}

module.exports = {
  authenticateToken,
  optionalAuth,
  requireAdmin,
  requireApproved,
  initializeFirebase
};
