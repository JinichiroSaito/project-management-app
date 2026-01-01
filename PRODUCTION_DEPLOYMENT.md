# 本番環境への適用ガイド

このドキュメントでは、修正内容を本番環境に適用する手順を説明します。

## 目次

1. [環境変数の設定](#環境変数の設定)
2. [マイグレーションの実行](#マイグレーションの実行)
3. [管理者ユーザーの作成](#管理者ユーザーの作成)
4. [デプロイ前の確認事項](#デプロイ前の確認事項)
5. [デプロイ手順](#デプロイ手順)
6. [デプロイ後の確認](#デプロイ後の確認)

## 環境変数の設定

### バックエンド環境変数

本番環境では、以下の環境変数が必須です：

#### Cloud Run環境変数として設定

```bash
DB_HOST=10.81.0.3
DB_PORT=5432
DB_NAME=pm_app
DB_USER=app_user
NODE_ENV=production
EMAIL_SERVICE=gmail
ADMIN_EMAIL=your-admin-email@example.com  # ⚠️ 必須: 管理者メールアドレス
APP_URL=https://your-frontend-url.com
FRONTEND_URL=https://your-frontend-url.com
GCS_BUCKET_NAME=pm-app-uploads-prod
GEMINI_MODEL_NAME=gemini-3.0-flash
USE_VERTEX_AI=true
VERTEX_AI_LOCATION=us-central1
```

#### Secret Managerに設定

以下のシークレットをSecret Managerに設定してください：

- `DB_PASSWORD`: データベースパスワード
- `FIREBASE_SERVICE_ACCOUNT`: FirebaseサービスアカウントJSON
- `EMAIL_USER`: メール送信用のGmailアドレス
- `EMAIL_APP_PASSWORD`: Gmailアプリパスワード
- `GEMINI_API_KEY`: Gemini APIキー

### フロントエンド環境変数

フロントエンドのDockerfileを更新したため、ビルド時に以下の環境変数を渡す必要があります：

```bash
REACT_APP_API_URL=https://your-backend-url.com
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

#### Cloud Buildでの設定

`cloudbuild.yaml`またはGitHub Actionsのワークフローファイルで、フロントエンドビルド時に`--build-arg`で渡します：

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args:
      - 'build'
      - '--build-arg'
      - 'REACT_APP_API_URL=https://your-backend-url.com'
      - '--build-arg'
      - 'REACT_APP_FIREBASE_API_KEY=${_FIREBASE_API_KEY}'
      # ... 他のFirebase環境変数
      - '-t'
      - 'asia-northeast1-docker.pkg.dev/${PROJECT_ID}/app-images/frontend:${SHORT_SHA}'
      - './app/frontend'
```

または、Cloud Buildのsubstitution変数を使用：

```yaml
substitutions:
  _FIREBASE_API_KEY: 'your-firebase-api-key'
  _FIREBASE_AUTH_DOMAIN: 'your-project-id.firebaseapp.com'
  # ...
```

## マイグレーションの実行

### 既存のマイグレーション

既存のマイグレーションファイルはそのまま使用できます。ただし、`002_users_schema.sql`の管理者ユーザー作成部分はコメントアウトされています。

### マイグレーション実行方法

```bash
# Cloud Run Jobを使用（推奨）
gcloud run jobs create db-migrate \
  --image=asia-northeast1-docker.pkg.dev/PROJECT_ID/app-images/backend:latest \
  --region=asia-northeast1 \
  --vpc-connector=vpc-connector \
  --service-account=cloud-run-prod@PROJECT_ID.iam.gserviceaccount.com \
  --set-env-vars="DB_HOST=10.81.0.3,DB_PORT=5432,DB_NAME=pm_app,DB_USER=app_user" \
  --set-secrets="DB_PASSWORD=db-password-prod:latest" \
  --command=node \
  --args=src/migrate.js

gcloud run jobs execute db-migrate \
  --region=asia-northeast1 \
  --wait
```

## 管理者ユーザーの作成

### 方法1: SQLで直接作成（推奨）

マイグレーション実行後、管理者ユーザーを手動で作成します：

```sql
-- 管理者ユーザーを作成
INSERT INTO users (firebase_uid, email, is_admin, is_approved, name)
VALUES (
  'admin-initial',  -- Firebase UID（実際のFirebase UIDに置き換える）
  'admin@example.com',  -- 管理者のメールアドレス
  TRUE,
  TRUE,
  'Admin User'
)
ON CONFLICT (email) DO UPDATE SET 
  is_admin = TRUE, 
  is_approved = TRUE;
```

### 方法2: スクリプトを使用

`app/backend/src/scripts/update-user-position.js`を参考に、管理者ユーザー作成スクリプトを作成：

```javascript
require('dotenv').config();
const db = require('../db');

async function createAdminUser() {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) {
    console.error('ADMIN_EMAIL environment variable is not set');
    process.exit(1);
  }

  // Firebase UIDを取得（実際の実装ではFirebase Admin SDKを使用）
  const firebaseUid = 'admin-initial'; // 実際のFirebase UIDに置き換える

  const result = await db.query(
    `INSERT INTO users (firebase_uid, email, is_admin, is_approved, name)
     VALUES ($1, $2, TRUE, TRUE, 'Admin User')
     ON CONFLICT (email) DO UPDATE SET 
       is_admin = TRUE, 
       is_approved = TRUE
     RETURNING *`,
    [firebaseUid, adminEmail]
  );

  console.log('Admin user created/updated:', result.rows[0]);
}

createAdminUser()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
```

### 方法3: API経由で作成（開発環境のみ）

開発環境では、既存のユーザーを管理者に昇格させることもできます：

```sql
UPDATE users 
SET is_admin = TRUE, is_approved = TRUE 
WHERE email = 'your-email@example.com';
```

## デプロイ前の確認事項

### 1. 環境変数の確認

- [ ] `ADMIN_EMAIL`が設定されているか
- [ ] すべてのFirebase環境変数が設定されているか
- [ ] Secret Managerのシークレットが最新であるか

### 2. コードの確認

- [ ] トランザクション処理が正しく実装されているか
- [ ] デバッグコードが開発環境のみで実行されるか
- [ ] エラーハンドリングが適切か

### 3. データベースの確認

- [ ] マイグレーションが正常に実行できるか
- [ ] 既存データとの互換性があるか

### 4. テストの実行

ローカル環境でテストスクリプトを実行：

```bash
# トランザクション処理のテスト
node app/backend/src/tests/test-transaction.js

# 承認フローの競合状態テスト
node app/backend/src/tests/test-concurrent-approval.js

# エラーハンドリングのテスト
node app/backend/src/tests/test-error-handling.js
```

## デプロイ手順

### 1. バックエンドのデプロイ

```bash
# Cloud Buildを使用
gcloud builds submit --config=cloudbuild.yaml

# またはGitHub Actionsを使用（自動デプロイが設定されている場合）
git push origin main
```

### 2. フロントエンドのデプロイ

フロントエンドのビルド時に環境変数を渡す必要があります：

```bash
# Cloud Buildを使用
gcloud builds submit \
  --config=cloudbuild-frontend-prod.yaml \
  --substitutions=_FIREBASE_API_KEY=your-key,_FIREBASE_AUTH_DOMAIN=your-domain,...
```

### 3. 環境変数の更新

既存のCloud Runサービスに環境変数を追加/更新：

```bash
gcloud run services update app-prod \
  --region=asia-northeast1 \
  --set-env-vars="ADMIN_EMAIL=admin@example.com" \
  --update-secrets="DB_PASSWORD=db-password-prod:latest"
```

## デプロイ後の確認

### 1. ヘルスチェック

```bash
# バックエンドのヘルスチェック
curl https://your-backend-url.com/health

# データベース接続の確認
curl https://your-backend-url.com/health/db
```

### 2. 機能確認

- [ ] ユーザー登録が正常に動作するか
- [ ] プロジェクト作成が正常に動作するか
- [ ] 承認フローが正常に動作するか
- [ ] メール送信が正常に動作するか（`ADMIN_EMAIL`に承認リクエストが送信されるか）

### 3. ログの確認

```bash
# Cloud Runのログを確認
gcloud logging read "resource.type=cloud_run_revision" \
  --limit=50 \
  --format=json
```

### 4. エラーの監視

- [ ] トランザクションエラーが発生していないか
- [ ] 承認フローの競合エラーが発生していないか
- [ ] 非同期処理のエラーが適切にログに記録されているか

## ロールバック手順

問題が発生した場合のロールバック手順：

```bash
# 前のバージョンにロールバック
gcloud run services update-traffic app-prod \
  --region=asia-northeast1 \
  --to-revisions=previous-version=100
```

## トラブルシューティング

### ADMIN_EMAILエラー

```
Error: ADMIN_EMAIL is not configured
```

**解決方法:**
- Cloud Runの環境変数に`ADMIN_EMAIL`を設定
- Secret Managerを使用している場合は、環境変数として設定する必要があります

### Firebase設定エラー

```
Firebase configuration error
```

**解決方法:**
- フロントエンドのビルド時にFirebase環境変数が正しく渡されているか確認
- ブラウザの開発者ツールで`process.env`を確認

### トランザクションエラー

```
Transaction failed
```

**解決方法:**
- データベース接続を確認
- ログを確認してエラーの詳細を確認
- 必要に応じて、トランザクション処理を見直す

## 関連ドキュメント

- [環境変数設定ガイド](./ENV_SETUP.md)
- [テストスクリプト](./app/backend/src/tests/README.md)

