const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Cloud SQL Proxy用にタイムアウトを延長
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// 接続確認
pool.on('connect', () => {
  console.log('✓ Database connection established');
});

// エラーハンドリング
pool.on('error', (err) => {
  console.error('[Database] Unexpected error on idle client:', {
    message: err.message,
    code: err.code,
    detail: err.detail,
    hint: err.hint,
    stack: err.stack
  });
  // 本番環境ではプロセスを終了しない（接続プールが自動的に再接続を試みる）
  if (process.env.NODE_ENV === 'production') {
    console.error('[Database] Error in production - continuing...');
  } else {
    process.exit(-1);
  }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
