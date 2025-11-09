const nodemailer = require('nodemailer');

// メール送信設定（環境変数から取得）
const createTransporter = () => {
  // Gmailを使用する場合
  if (process.env.EMAIL_SERVICE === 'gmail') {
    const emailUser = process.env.EMAIL_USER;
    const emailPassword = process.env.EMAIL_APP_PASSWORD || process.env.EMAIL_PASSWORD;
    
    console.log('[Email] Checking email configuration:', {
      EMAIL_SERVICE: process.env.EMAIL_SERVICE,
      EMAIL_USER: emailUser ? `${emailUser.substring(0, 3)}***` : 'NOT SET',
      EMAIL_APP_PASSWORD: emailPassword ? 'SET' : 'NOT SET'
    });
    
    if (!emailUser || !emailPassword) {
      console.warn('[Email] EMAIL_USER or EMAIL_APP_PASSWORD not set. Email sending will be disabled.');
      return {
        sendMail: async (options) => {
          console.log('📧 Email (disabled - credentials not set):', {
            to: options.to,
            subject: options.subject
          });
          return { messageId: 'disabled' };
        }
      };
    }
    
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: emailUser,
        pass: emailPassword
      }
    });
    
    // 接続テスト（オプション）
    transporter.verify((error, success) => {
      if (error) {
        console.error('[Email] Transporter verification failed:', error);
      } else {
        console.log('[Email] Transporter verified successfully');
      }
    });
    
    return transporter;
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

// 管理者への承認依頼メール送信（プロフィール情報を含む）
async function sendApprovalRequestEmail(userEmail, userName, company, department, position) {
  const adminEmail = process.env.ADMIN_EMAIL || 'jinichirou.saitou@asahi-gh.com';
  const appUrl = process.env.APP_URL || 'https://frontend-dev-823277232006.asia-northeast1.run.app';
  
  const transporter = createTransporter();
  
  // 役職の表示名を取得
  const positionDisplay = position === 'executor' ? 'プロジェクト実行者' : position === 'reviewer' ? 'プロジェクト審査者' : position || '未設定';
  
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@project-management.app',
    to: adminEmail,
    subject: '【承認依頼】新しいユーザーの登録申請',
    html: `
      <h2>新しいユーザーの登録申請がありました</h2>
      <p>以下のユーザーがプロフィール情報を入力し、承認を待っています。</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; background-color: #f9f9f9; font-weight: bold;">メールアドレス</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${userEmail}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; background-color: #f9f9f9; font-weight: bold;">名前</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${userName || '未設定'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; background-color: #f9f9f9; font-weight: bold;">会社</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${company || '未設定'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; background-color: #f9f9f9; font-weight: bold;">部門</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${department || '未設定'}</td>
        </tr>
        <tr>
          <td style="padding: 8px; border: 1px solid #ddd; background-color: #f9f9f9; font-weight: bold;">役職</td>
          <td style="padding: 8px; border: 1px solid #ddd;">${positionDisplay}</td>
        </tr>
      </table>
      <p style="margin-top: 20px;">以下のリンクから管理者ダッシュボードにアクセスし、承認待ちユーザーを承認してください:</p>
      <p><a href="${appUrl}" style="color: #4F46E5; text-decoration: underline;">${appUrl}</a></p>
      <p style="color: #666; font-size: 14px;">※ 承認は管理者ダッシュボードから行ってください。</p>
    `,
    text: `
新しいユーザーの登録申請がありました

以下のユーザーがプロフィール情報を入力し、承認を待っています。

メールアドレス: ${userEmail}
名前: ${userName || '未設定'}
会社: ${company || '未設定'}
部門: ${department || '未設定'}
役職: ${positionDisplay}

以下のリンクから管理者ダッシュボードにアクセスし、承認待ちユーザーを承認してください:
${appUrl}

※ 承認は管理者ダッシュボードから行ってください。
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

// ユーザーへの登録確認メール送信
async function sendRegistrationConfirmationEmail(userEmail) {
  const appUrl = process.env.APP_URL || 'https://frontend-dev-823277232006.asia-northeast1.run.app';
  
  const transporter = createTransporter();
  
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@project-management.app',
    to: userEmail,
    subject: '【登録確認】プロジェクト管理アプリへの登録ありがとうございます',
    html: `
      <h2>登録ありがとうございます</h2>
      <p>${userEmail} でプロジェクト管理アプリに登録されました。</p>
      <p>アカウントが承認され次第、以下のリンクからログインしてプロフィール情報を入力してください。</p>
      <p><a href="${appUrl}" style="color: #4F46E5; text-decoration: underline;">${appUrl}</a></p>
      <p style="color: #666; font-size: 14px; margin-top: 20px;">※ アカウントの承認には管理者の確認が必要です。承認が完了するまでお待ちください。</p>
    `,
    text: `
登録ありがとうございます

${userEmail} でプロジェクト管理アプリに登録されました。

アカウントが承認され次第、以下のリンクからログインしてプロフィール情報を入力してください。
${appUrl}

※ アカウントの承認には管理者の確認が必要です。承認が完了するまでお待ちください。
    `
  };
  
  try {
    console.log(`[Email] Attempting to send registration confirmation email to: ${userEmail}`);
    const result = await transporter.sendMail(mailOptions);
    console.log(`✓ Registration confirmation email sent to ${userEmail}`, { messageId: result.messageId });
    return result;
  } catch (error) {
    console.error('[Email] Failed to send registration confirmation email:', error);
    console.error('[Email] Error details:', {
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode
    });
    throw error;
  }
}

// ユーザーへの承認通知メール送信
async function sendApprovalNotificationEmail(userEmail, userName) {
  const appUrl = process.env.APP_URL || 'https://frontend-dev-823277232006.asia-northeast1.run.app';
  
  const transporter = createTransporter();
  
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@project-management.app',
    to: userEmail,
    subject: '【承認完了】アカウントが承認されました',
    html: `
      <h2>アカウントが承認されました</h2>
      <p>${userName ? `${userName}様、` : ''}あなたのアカウントが承認されました。</p>
      <p>以下のリンクからログインして、アプリケーションをご利用ください。</p>
      <p><a href="${appUrl}" style="color: #4F46E5; text-decoration: underline;">${appUrl}</a></p>
    `,
    text: `
アカウントが承認されました

${userName ? `${userName}様、` : ''}あなたのアカウントが承認されました。

以下のリンクからログインして、アプリケーションをご利用ください。
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
  sendApprovalNotificationEmail,
  sendRegistrationConfirmationEmail
};

