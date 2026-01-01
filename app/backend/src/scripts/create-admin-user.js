/**
 * 管理者ユーザー作成スクリプト
 * 
 * このスクリプトは、本番環境で管理者ユーザーを作成するために使用します。
 * 
 * 使用方法:
 *   1. ADMIN_EMAIL環境変数を設定
 *   2. Firebase UIDを取得（Firebase ConsoleまたはFirebase Admin SDKを使用）
 *   3. スクリプトを実行: node src/scripts/create-admin-user.js
 * 
 * 注意: 本番環境では、Firebase UIDを実際の値に置き換えてください。
 */

require('dotenv').config();
const db = require('../db');

async function createAdminUser() {
  try {
    // 環境変数から管理者メールアドレスを取得
    const adminEmail = process.env.ADMIN_EMAIL;
    if (!adminEmail) {
      console.error('❌ ADMIN_EMAIL environment variable is not set');
      console.error('Please set ADMIN_EMAIL environment variable before running this script.');
      process.exit(1);
    }

    // Firebase UIDを取得
    // 本番環境では、Firebase Admin SDKを使用して実際のUIDを取得するか、
    // コマンドライン引数で渡してください
    const firebaseUid = process.argv[2] || 'admin-initial';
    
    if (firebaseUid === 'admin-initial') {
      console.warn('⚠️  Warning: Using default Firebase UID "admin-initial"');
      console.warn('   For production, please provide the actual Firebase UID as an argument:');
      console.warn('   node src/scripts/create-admin-user.js YOUR_FIREBASE_UID');
    }

    console.log(`Creating admin user with email: ${adminEmail}`);
    console.log(`Firebase UID: ${firebaseUid}\n`);

    // 既存のユーザーを確認
    const existingUser = await db.query(
      'SELECT * FROM users WHERE email = $1',
      [adminEmail]
    );

    if (existingUser.rows.length > 0) {
      console.log('User already exists. Updating to admin...');
      const result = await db.query(
        `UPDATE users 
         SET firebase_uid = $1, 
             is_admin = TRUE, 
             is_approved = TRUE,
             updated_at = CURRENT_TIMESTAMP
         WHERE email = $2
         RETURNING *`,
        [firebaseUid, adminEmail]
      );
      console.log('✓ Admin user updated successfully:');
      console.log(JSON.stringify(result.rows[0], null, 2));
    } else {
      console.log('Creating new admin user...');
      const result = await db.query(
        `INSERT INTO users (firebase_uid, email, is_admin, is_approved, name)
         VALUES ($1, $2, TRUE, TRUE, 'Admin User')
         RETURNING *`,
        [firebaseUid, adminEmail]
      );
      console.log('✓ Admin user created successfully:');
      console.log(JSON.stringify(result.rows[0], null, 2));
    }

    // 確認: 管理者ユーザーが正しく作成されたか確認
    const verifyResult = await db.query(
      'SELECT id, email, is_admin, is_approved FROM users WHERE email = $1',
      [adminEmail]
    );

    if (verifyResult.rows.length > 0) {
      const user = verifyResult.rows[0];
      if (user.is_admin && user.is_approved) {
        console.log('\n✅ Admin user verification: SUCCESS');
        console.log(`   User ID: ${user.id}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Is Admin: ${user.is_admin}`);
        console.log(`   Is Approved: ${user.is_approved}`);
      } else {
        console.error('\n❌ Admin user verification: FAILED');
        console.error('   User exists but is not properly configured as admin');
        process.exit(1);
      }
    } else {
      console.error('\n❌ Admin user verification: FAILED');
      console.error('   User was not found after creation');
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin user:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// データベース接続を確認してから実行
db.pool.query('SELECT 1')
  .then(() => {
    console.log('✓ Database connection verified\n');
    createAdminUser();
  })
  .catch((error) => {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  });

