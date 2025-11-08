const nodemailer = require('nodemailer');

// メール送信設定（環境変数から取得）
const createTransporter = () => {
  // Gmailを使用する場合
  if (process.env.EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD || process.env.EMAIL_APP_PASSWORD
      }
    });
  }
  
  // カスタムSMTPサーバーを使用する場合
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });
  }
  
  // 開発環境: メール送信を無効化（コンソールに出力）
  return {
    sendMail: async (options) => {
      console.log('📧 Email (dev mode):', {
        to: options.to,
        subject: options.subject,
        text: options.text
      });
      return { messageId: 'dev-mode' };
    }
  };
};

// 管理者への承認依頼メール送信
async function sendApprovalRequestEmail(userEmail, userName) {
  const adminEmail = process.env.ADMIN_EMAIL || 'jinichirou.saitou@asahi-gh.com';
  const appUrl = process.env.APP_URL || 'https://frontend-dev-823277232006.asia-northeast1.run.app';
  
  const transporter = createTransporter();
  
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@project-management.app',
    to: adminEmail,
    subject: '【承認依頼】新しいユーザーのサインアップ',
    html: `
      <h2>新しいユーザーのサインアップがありました</h2>
      <p>以下のユーザーがサインアップし、承認を待っています。</p>
      <ul>
        <li><strong>メールアドレス:</strong> ${userEmail}</li>
        <li><strong>名前:</strong> ${userName || '未設定'}</li>
      </ul>
      <p>以下のリンクから承認してください:</p>
      <p><a href="${appUrl}">${appUrl}</a></p>
      <p>管理者ダッシュボードから承認待ちユーザーを確認し、承認してください。</p>
    `,
    text: `
新しいユーザーのサインアップがありました

メールアドレス: ${userEmail}
名前: ${userName || '未設定'}

以下のリンクから承認してください:
${appUrl}

管理者ダッシュボードから承認待ちユーザーを確認し、承認してください。
    `
  };
  
  try {
    await transporter.sendMail(mailOptions);
    console.log(`✓ Approval request email sent to ${adminEmail}`);
  } catch (error) {
    console.error('Failed to send approval request email:', error);
    throw error;
  }
}

// ユーザーへの承認通知メール送信
async function sendApprovalNotificationEmail(userEmail) {
  const appUrl = process.env.APP_URL || 'https://frontend-dev-823277232006.asia-northeast1.run.app';
  
  const transporter = createTransporter();
  
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@project-management.app',
    to: userEmail,
    subject: '【承認完了】アカウントが承認されました',
    html: `
      <h2>アカウントが承認されました</h2>
      <p>あなたのアカウントが承認されました。以下のリンクからログインして、プロフィール情報を登録してください。</p>
      <p><a href="${appUrl}">${appUrl}</a></p>
    `,
    text: `
アカウントが承認されました

あなたのアカウントが承認されました。以下のリンクからログインして、プロフィール情報を登録してください。

${appUrl}
    `
  };
  
  try {
    await transporter.sendMail(mailOptions);
    console.log(`✓ Approval notification email sent to ${userEmail}`);
  } catch (error) {
    console.error('Failed to send approval notification email:', error);
    throw error;
  }
}

module.exports = {
  sendApprovalRequestEmail,
  sendApprovalNotificationEmail
};

