/**
 * Firebase UID取得スクリプト
 * 
 * メールアドレスからFirebase UIDを取得します。
 */

require('dotenv').config();
const admin = require('firebase-admin');

// Firebase Admin SDKの初期化
function initializeFirebase() {
  if (admin.apps.length === 0) {
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (!serviceAccount) {
      console.error('❌ FIREBASE_SERVICE_ACCOUNT environment variable is not set');
      process.exit(1);
    }

    let serviceAccountData;
    try {
      // JSON文字列の場合
      if (serviceAccount.startsWith('{')) {
        serviceAccountData = JSON.parse(serviceAccount);
      } else {
        // ファイルパスの場合
        const fs = require('fs');
        serviceAccountData = JSON.parse(fs.readFileSync(serviceAccount, 'utf8'));
      }
    } catch (error) {
      console.error('❌ Error parsing Firebase service account:', error);
      process.exit(1);
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccountData)
    });
  }
}

async function getFirebaseUid(email) {
  try {
    initializeFirebase();
    
    const user = await admin.auth().getUserByEmail(email);
    return user.uid;
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`❌ User with email ${email} not found in Firebase`);
      console.error('   Please create the user in Firebase Authentication first.');
      return null;
    }
    throw error;
  }
}

// コマンドライン引数からメールアドレスを取得
const email = process.argv[2];

if (!email) {
  console.error('❌ Email address is required');
  console.error('Usage: node src/scripts/get-firebase-uid.js <email>');
  process.exit(1);
}

getFirebaseUid(email)
  .then((uid) => {
    if (uid) {
      console.log(`✓ Firebase UID for ${email}: ${uid}`);
      process.exit(0);
    } else {
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('❌ Error getting Firebase UID:', error);
    process.exit(1);
  });

