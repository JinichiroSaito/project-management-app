require('dotenv').config();
const db = require('../db');
const { sendApprovalRequestEmail } = require('../utils/email');

async function sendPendingApprovalRequests() {
  try {
    console.log('Fetching pending users...');
    
    // 承認待ちのユーザーを取得
    const result = await db.query(
      'SELECT id, email, name FROM users WHERE is_approved = FALSE ORDER BY created_at DESC'
    );
    
    if (result.rows.length === 0) {
      console.log('No pending users found.');
      return;
    }
    
    console.log(`Found ${result.rows.length} pending user(s).`);
    
    // 各ユーザーについて管理者に承認依頼メールを送信
    // 注意: このスクリプトはプロフィール情報が入力済みのユーザーに対してのみ使用される想定
    for (const user of result.rows) {
      try {
        console.log(`Sending approval request email for ${user.email}...`);
        // プロフィール情報が入力されている場合のみ送信
        if (user.name && user.company) {
          await sendApprovalRequestEmail(user.email, user.name, user.company, user.department || '', user.position || '');
          console.log(`✓ Approval request email sent for ${user.email}`);
        } else {
          console.log(`⚠ Skipping ${user.email} - profile not complete`);
        }
      } catch (error) {
        console.error(`Failed to send email for ${user.email}:`, error.message);
      }
    }
    
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

sendPendingApprovalRequests();

