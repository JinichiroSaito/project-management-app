/**
 * 既存のプロフィール情報をFirebaseユーザーと紐付けるスクリプト
 * 
 * 使用方法:
 * node src/scripts/link-user-profile.js <email>
 * 
 * 例:
 * node src/scripts/link-user-profile.js jinichirou.saitou@asahi-gh.com
 */

require('dotenv').config();
const db = require('../db');
const admin = require('firebase-admin');

// Firebase初期化
function initializeFirebase() {
  if (!admin.apps.length) {
    try {
      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log('✓ Firebase Admin SDK initialized');
      } else {
        console.error('✗ FIREBASE_SERVICE_ACCOUNT not set');
        process.exit(1);
      }
    } catch (error) {
      console.error('Failed to initialize Firebase Admin SDK:', error);
      process.exit(1);
    }
  }
  return admin.app();
}

async function linkUserProfile(email) {
  try {
    initializeFirebase();
    
    console.log(`[Link Profile] Starting profile linking for: ${email}`);
    
    // 1. データベースからユーザー情報を取得
    const dbUser = await db.query(
      'SELECT id, email, firebase_uid, name, company, department, position, is_admin, is_approved FROM users WHERE email = $1',
      [email]
    );
    
    if (dbUser.rows.length === 0) {
      console.error(`[Link Profile] ✗ User not found in database: ${email}`);
      return false;
    }
    
    const user = dbUser.rows[0];
    console.log(`[Link Profile] Found user in database:`, {
      id: user.id,
      email: user.email,
      firebase_uid: user.firebase_uid,
      name: user.name,
      company: user.company,
      department: user.department,
      position: user.position
    });
    
    // 2. Firebaseからユーザー情報を取得
    let firebaseUser;
    try {
      firebaseUser = await admin.auth().getUserByEmail(email);
      console.log(`[Link Profile] Found user in Firebase:`, {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        emailVerified: firebaseUser.emailVerified
      });
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        console.error(`[Link Profile] ✗ User not found in Firebase: ${email}`);
        console.error(`[Link Profile] Please create the user in Firebase first or check the email address.`);
        return false;
      }
      throw error;
    }
    
    // 3. firebase_uidを更新
    if (!user.firebase_uid || user.firebase_uid !== firebaseUser.uid) {
      console.log(`[Link Profile] Updating firebase_uid: ${user.firebase_uid || 'null'} -> ${firebaseUser.uid}`);
      
      await db.query(
        'UPDATE users SET firebase_uid = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [firebaseUser.uid, user.id]
      );
      
      console.log(`[Link Profile] ✓ firebase_uid updated successfully`);
    } else {
      console.log(`[Link Profile] ✓ firebase_uid is already correct`);
    }
    
    // 4. emailが一致しているか確認（念のため）
    if (user.email !== firebaseUser.email) {
      console.log(`[Link Profile] Warning: Email mismatch. Database: ${user.email}, Firebase: ${firebaseUser.email}`);
      console.log(`[Link Profile] Updating email in database to match Firebase...`);
      
      await db.query(
        'UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [firebaseUser.email, user.id]
      );
      
      console.log(`[Link Profile] ✓ Email updated successfully`);
    }
    
    // 5. 最終的なユーザー情報を取得して表示
    const finalUser = await db.query(
      'SELECT id, email, firebase_uid, name, company, department, position, is_admin, is_approved FROM users WHERE id = $1',
      [user.id]
    );
    
    console.log(`[Link Profile] ✓ Profile linking completed successfully!`);
    console.log(`[Link Profile] Final user information:`, finalUser.rows[0]);
    
    return true;
  } catch (error) {
    console.error('[Link Profile] ✗ Error:', error);
    throw error;
  }
}

// メイン処理
const email = process.argv[2];

if (!email) {
  console.error('Usage: node src/scripts/link-user-profile.js <email>');
  console.error('Example: node src/scripts/link-user-profile.js jinichirou.saitou@asahi-gh.com');
  process.exit(1);
}

linkUserProfile(email)
  .then((success) => {
    if (success) {
      console.log('\n✓ Profile linking completed successfully!');
      process.exit(0);
    } else {
      console.log('\n✗ Profile linking failed.');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('\n✗ Error:', error);
    process.exit(1);
  });

