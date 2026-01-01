/**
 * ユーザーのFirebase UIDとデータベースの紐付け状態を確認するスクリプト
 * 
 * 使用方法:
 * node src/scripts/check-user-link.js <firebase_uid> [email]
 * 
 * 例:
 * node src/scripts/check-user-link.js w1bixRIxQqShC43elmZ5Yk5v8fD3 jinichirou.saitou@asahi-gh.com
 */

require('dotenv').config();
const db = require('../db');

async function checkUserLink(firebaseUid, email) {
  try {
    console.log(`[Check User Link] Checking Firebase UID: ${firebaseUid}`);
    if (email) {
      console.log(`[Check User Link] Email: ${email}`);
    }
    
    // firebase_uidで検索
    const uidResult = await db.query(
      'SELECT id, email, firebase_uid, name, company, department, position, is_admin, is_approved FROM users WHERE firebase_uid = $1',
      [firebaseUid]
    );
    
    // emailで検索（emailが指定されている場合）
    let emailResult = { rows: [] };
    if (email) {
      emailResult = await db.query(
        'SELECT id, email, firebase_uid, name, company, department, position, is_admin, is_approved FROM users WHERE email = $1',
        [email]
      );
    }
    
    console.log('\n=== 検索結果 ===');
    console.log(`Firebase UID (${firebaseUid}) で検索:`);
    if (uidResult.rows.length > 0) {
      console.log('✓ 見つかりました:');
      console.log(JSON.stringify(uidResult.rows[0], null, 2));
    } else {
      console.log('✗ 見つかりませんでした');
    }
    
    if (email) {
      console.log(`\nEmail (${email}) で検索:`);
      if (emailResult.rows.length > 0) {
        console.log('✓ 見つかりました:');
        console.log(JSON.stringify(emailResult.rows[0], null, 2));
        
        // 紐付けが必要かどうか確認
        if (emailResult.rows[0].firebase_uid !== firebaseUid) {
          console.log('\n⚠ 紐付けが必要です:');
          console.log(`  データベースのfirebase_uid: ${emailResult.rows[0].firebase_uid || 'null'}`);
          console.log(`  Firebase UID: ${firebaseUid}`);
          console.log('\n以下のSQLを実行して紐付けることができます:');
          console.log(`UPDATE users SET firebase_uid = '${firebaseUid}', updated_at = CURRENT_TIMESTAMP WHERE email = '${email}';`);
        } else {
          console.log('\n✓ 既に正しく紐付けられています');
        }
      } else {
        console.log('✗ 見つかりませんでした');
      }
    }
    
    // プロフィール情報の確認
    const user = uidResult.rows[0] || emailResult.rows[0];
    if (user) {
      console.log('\n=== プロフィール情報 ===');
      const profileComplete = user.name && user.company && user.department && user.position;
      console.log(`プロフィール完成: ${profileComplete ? '✓' : '✗'}`);
      console.log(`  名前: ${user.name || '未設定'}`);
      console.log(`  会社: ${user.company || '未設定'}`);
      console.log(`  部門: ${user.department || '未設定'}`);
      console.log(`  役職: ${user.position || '未設定'}`);
      console.log(`  承認状態: ${user.is_approved ? '承認済み' : '承認待ち'}`);
      console.log(`  管理者: ${user.is_admin ? 'はい' : 'いいえ'}`);
    }
    
    return {
      foundByUid: uidResult.rows.length > 0,
      foundByEmail: emailResult.rows.length > 0,
      user: user || null,
      needsLinking: emailResult.rows.length > 0 && emailResult.rows[0].firebase_uid !== firebaseUid
    };
  } catch (error) {
    console.error('[Check User Link] ✗ Error:', error);
    throw error;
  }
}

// メイン処理
const firebaseUid = process.argv[2] || process.env.CHECK_UID;
const email = process.argv[3] || process.env.CHECK_EMAIL;

if (!firebaseUid) {
  console.error('Usage: node src/scripts/check-user-link.js <firebase_uid> [email]');
  console.error('   or: set CHECK_UID and CHECK_EMAIL environment variables');
  console.error('Example: node src/scripts/check-user-link.js w1bixRIxQqShC43elmZ5Yk5v8fD3 jinichirou.saitou@asahi-gh.com');
  process.exit(1);
}

checkUserLink(firebaseUid, email)
  .then((result) => {
    console.log('\n=== まとめ ===');
    if (result.foundByUid) {
      console.log('✓ Firebase UIDでユーザーが見つかりました');
    } else if (result.foundByEmail) {
      console.log('⚠ Emailでユーザーが見つかりましたが、Firebase UIDが一致していません');
      if (result.needsLinking) {
        console.log('  → 紐付けが必要です');
      }
    } else {
      console.log('✗ ユーザーが見つかりませんでした');
    }
    
    if (result.user) {
      const profileComplete = result.user.name && result.user.company && result.user.department && result.user.position;
      if (!profileComplete) {
        console.log('⚠ プロフィール情報が不完全です');
      }
    }
    
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n✗ Error:', error);
    process.exit(1);
  });

