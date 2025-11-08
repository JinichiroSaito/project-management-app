# メール送信設定ガイド

## 概要

ユーザー登録時の承認依頼メールと承認完了通知メールを送信するための設定手順です。

## Gmailを使用する場合

### 1. Gmailアプリパスワードの作成

1. Googleアカウントの設定にアクセス: https://myaccount.google.com/
2. 「セキュリティ」タブを開く
3. 「2段階認証プロセス」が有効になっていることを確認（無効の場合は有効化）
4. 「アプリパスワード」を検索して開く
5. 「アプリを選択」で「メール」を選択
6. 「デバイスを選択」で「その他（カスタム名）」を選択し、「Project Management App」などと入力
7. 「生成」をクリック
8. 表示された16文字のアプリパスワードをコピー（後で使用します）

### 2. Secret Managerにシークレットを保存

#### メール送信元のGmailアドレスを保存

```bash
echo -n "your-email@gmail.com" | gcloud secrets create email-user-dev \
  --data-file=- \
  --replication-policy="automatic" \
  --project=saito-test-gcp
```

#### Gmailアプリパスワードを保存

```bash
echo -n "your-16-character-app-password" | gcloud secrets create email-app-password-dev \
  --data-file=- \
  --replication-policy="automatic" \
  --project=saito-test-gcp
```

### 3. Cloud RunサービスアカウントにSecret Managerアクセス権限を付与

```bash
gcloud secrets add-iam-policy-binding email-user-dev \
  --member="serviceAccount:cloud-run-dev@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=saito-test-gcp

gcloud secrets add-iam-policy-binding email-app-password-dev \
  --member="serviceAccount:cloud-run-dev@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=saito-test-gcp
```

### 4. 既存のシークレットを更新する場合

```bash
# メールアドレスを更新
echo -n "new-email@gmail.com" | gcloud secrets versions add email-user-dev \
  --data-file=- \
  --project=saito-test-gcp

# アプリパスワードを更新
echo -n "new-app-password" | gcloud secrets versions add email-app-password-dev \
  --data-file=- \
  --project=saito-test-gcp
```

## カスタムSMTPサーバーを使用する場合

### 1. Secret ManagerにSMTP認証情報を保存

```bash
# SMTPユーザー名
echo -n "smtp-username" | gcloud secrets create smtp-user-dev \
  --data-file=- \
  --replication-policy="automatic" \
  --project=saito-test-gcp

# SMTPパスワード
echo -n "smtp-password" | gcloud secrets create smtp-password-dev \
  --data-file=- \
  --replication-policy="automatic" \
  --project=saito-test-gcp
```

### 2. cloudbuild.yamlの環境変数を更新

Gmailの代わりにSMTPを使用する場合、`cloudbuild.yaml`の環境変数を以下のように変更：

```yaml
--set-env-vars=...,SMTP_HOST=smtp.example.com,SMTP_PORT=587,SMTP_SECURE=false
--set-secrets=...,SMTP_USER=smtp-user-dev:latest,SMTP_PASSWORD=smtp-password-dev:latest
```

## 環境変数の説明

| 環境変数 | 説明 | 必須 |
|---------|------|------|
| `EMAIL_SERVICE` | `gmail` を指定（Gmail使用時） | Gmail使用時 |
| `EMAIL_USER` | 送信元のGmailアドレス | Gmail使用時 |
| `EMAIL_APP_PASSWORD` | Gmailアプリパスワード | Gmail使用時 |
| `SMTP_HOST` | SMTPサーバーのホスト名 | SMTP使用時 |
| `SMTP_PORT` | SMTPサーバーのポート（通常587） | SMTP使用時 |
| `SMTP_SECURE` | TLS使用時は`true` | SMTP使用時 |
| `SMTP_USER` | SMTP認証ユーザー名 | SMTP使用時 |
| `SMTP_PASSWORD` | SMTP認証パスワード | SMTP使用時 |
| `ADMIN_EMAIL` | 管理者のメールアドレス（承認依頼先） | 必須 |
| `APP_URL` | アプリケーションのURL（メール内のリンク用） | 推奨 |
| `EMAIL_FROM` | 送信者表示名（オプション） | オプション |

## 動作確認

設定後、新しいユーザーがサインアップすると、管理者（`ADMIN_EMAIL`で指定したアドレス）に承認依頼メールが送信されます。

メールが送信されない場合：
1. Cloud Runのログを確認: `gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=app-dev" --limit 50`
2. Secret Managerのシークレットが正しく設定されているか確認
3. サービスアカウントにSecret Managerアクセス権限があるか確認

