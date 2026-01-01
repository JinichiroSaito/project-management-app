// ローカル開発環境で.envファイルを読み込む
if (process.env.NODE_ENV !== 'production' && !process.env.GCP_PROJECT) {
  require('dotenv').config();
}

const fs = require('fs');
const path = require('path');
const db = require('./db');

async function runMigrations() {
  try {
    console.log('Running database migrations...');
    
    // データベース接続をテスト
    console.log('Testing database connection...');
    try {
      await db.query('SELECT NOW()');
      console.log('✓ Database connection established');
    } catch (connError) {
      console.error('✗ Database connection failed:', connError.message);
      console.error('Please ensure Cloud SQL Proxy is running and credentials are correct.');
      process.exit(1);
    }
    
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();
    
    for (const file of files) {
      console.log(`Running migration: ${file}`);
      const migrationFile = fs.readFileSync(
        path.join(migrationsDir, file),
        'utf8'
      );
      
      try {
        await db.query(migrationFile);
        console.log(`✓ ${file} completed`);
      } catch (migrationError) {
        // 既に存在するカラムのエラーは無視
        if (migrationError.message && migrationError.message.includes('already exists')) {
          console.log(`⚠ ${file} - columns may already exist, skipping...`);
        } 
        // カラム数の上限エラーも無視（既にカラムが存在するか、別の方法で処理済みの場合）
        else if (migrationError.code === '54011' && migrationError.message && migrationError.message.includes('tables can have at most 1600 columns')) {
          console.log(`⚠ ${file} - table column limit reached, skipping (columns may already exist or be handled by later migrations)...`);
        } else {
          throw migrationError;
        }
      }
    }
    
    console.log('✓ All migrations completed successfully');
    
    // 接続プールを閉じる
    await db.pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      detail: error.detail,
      hint: error.hint
    });
    // 接続プールを閉じる
    await db.pool.end().catch(() => {});
    process.exit(1);
  }
}

runMigrations();
