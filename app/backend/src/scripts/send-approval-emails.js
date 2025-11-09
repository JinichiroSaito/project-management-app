require('dotenv').config();
const db = require('../db');
const { sendApprovalNotificationEmail } = require('../utils/email');

async function sendApprovalEmailsToPendingUsers() {
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
    
    // 各ユーザーに承認通知メールを送信
    for (const user of result.rows) {
      try {
        console.log(`Sending approval notification email to ${user.email}...`);
        await sendApprovalNotificationEmail(user.email);
        console.log(`✓ Email sent to ${user.email}`);
      } catch (error) {
        console.error(`Failed to send email to ${user.email}:`, error.message);
      }
    }
    
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

sendApprovalEmailsToPendingUsers();

