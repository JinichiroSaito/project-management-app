/**
 * 管理者ユーザーのFirebase UIDを更新するスクリプト
 */

require('dotenv').config();
const db = require('../db');

async function updateAdminUid() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'jinichirou.saitou@asahi-gh.com';
    const firebaseUid = process.argv[2];
    
    if (!firebaseUid) {
      console.error('❌ Firebase UID is required');
      console.error('Usage: node src/scripts/update-admin-uid.js <firebase_uid>');
      process.exit(1);
    }

    console.log(`Updating Firebase UID for admin user: ${adminEmail}`);
    console.log(`New Firebase UID: ${firebaseUid}\n`);

    const result = await db.query(
      `UPDATE users 
       SET firebase_uid = $1, 
           updated_at = CURRENT_TIMESTAMP
       WHERE email = $2
       RETURNING *`,
      [firebaseUid, adminEmail]
    );

    if (result.rows.length === 0) {
      console.error(`❌ User with email ${adminEmail} not found`);
      process.exit(1);
    }

    const user = result.rows[0];
    console.log('✓ Admin user UID updated successfully:');
    console.log(JSON.stringify({
      id: user.id,
      email: user.email,
      firebase_uid: user.firebase_uid,
      is_admin: user.is_admin,
      is_approved: user.is_approved
    }, null, 2));

    // 確認
    const verifyResult = await db.query(
      'SELECT id, email, firebase_uid, is_admin, is_approved FROM users WHERE email = $1',
      [adminEmail]
    );

    if (verifyResult.rows.length > 0) {
      const verifiedUser = verifyResult.rows[0];
      if (verifiedUser.firebase_uid === firebaseUid) {
        console.log('\n✅ Verification: SUCCESS');
        console.log(`   Firebase UID correctly updated to: ${verifiedUser.firebase_uid}`);
      } else {
        console.error('\n❌ Verification: FAILED');
        console.error(`   Expected UID: ${firebaseUid}`);
        console.error(`   Actual UID: ${verifiedUser.firebase_uid}`);
        process.exit(1);
      }
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating admin UID:', error);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  }
}

// データベース接続を確認してから実行
db.pool.query('SELECT 1')
  .then(() => {
    console.log('✓ Database connection verified\n');
    updateAdminUid();
  })
  .catch((error) => {
    console.error('❌ Database connection error:', error);
    process.exit(1);
  });

