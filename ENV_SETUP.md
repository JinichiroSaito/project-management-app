# 環境変数設定ガイド

このドキュメントでは、アプリケーションに必要な環境変数の設定方法を説明します。

## バックエンド環境変数

### ローカル開発環境

`app/backend/`ディレクトリに`.env`ファイルを作成し、以下の環境変数を設定してください：

```bash
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pm_app
DB_USER=app_user
DB_PASSWORD=your_db_password_here
DB_SSL=false

# Node Environment
NODE_ENV=development

# Firebase Admin SDK (Service Account JSON as string or file path)
# For local development, you can use a service account JSON file path
FIREBASE_SERVICE_ACCOUNT=/path/to/firebase-service-account.json

# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_APP_PASSWORD=your_app_password_here

# Admin Email (required for approval request emails)
ADMIN_EMAIL=admin@example.com

# Application URLs
APP_URL=http://localhost:3000
FRONTEND_URL=http://localhost:3001

# Google Cloud Storage
GCS_BUCKET_NAME=pm-app-uploads-dev

# Gemini API Configuration
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL_NAME=gemini-3.0-flash
USE_VERTEX_AI=false
VERTEX_AI_LOCATION=us-central1
```

### 本番環境（Cloud Run）

本番環境では、Cloud Runの環境変数として設定するか、Secret Managerを使用します。

**環境変数として設定する場合：**
- `cloudbuild.yaml`またはGitHub Actionsのワークフローファイルで設定
- `--set-env-vars`オプションで設定

**Secret Managerを使用する場合：**
- `--set-secrets`オプションで設定
- 以下のシークレットが必要：
  - `DB_PASSWORD`
  - `FIREBASE_SERVICE_ACCOUNT`
  - `EMAIL_USER`
  - `EMAIL_APP_PASSWORD`
  - `GEMINI_API_KEY`

## フロントエンド環境変数

### ローカル開発環境

`app/frontend/`ディレクトリに`.env`ファイルを作成し、以下の環境変数を設定してください：

```bash
# API URL
REACT_APP_API_URL=http://localhost:5000

# Firebase Configuration
# Get these values from Firebase Console > Project Settings > Your apps > Web app
REACT_APP_FIREBASE_API_KEY=your_firebase_api_key_here
REACT_APP_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your-project-id
REACT_APP_FIREBASE_STORAGE_BUCKET=your-project-id.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
REACT_APP_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
```

### 本番環境（Docker Build）

フロントエンドの環境変数は、Dockerビルド時に`ARG`として渡す必要があります。

`Dockerfile`を更新して、Firebase設定を環境変数から取得できるようにする必要があります：

```dockerfile
# Build arguments
ARG REACT_APP_API_URL
ARG REACT_APP_FIREBASE_API_KEY
ARG REACT_APP_FIREBASE_AUTH_DOMAIN
ARG REACT_APP_FIREBASE_PROJECT_ID
ARG REACT_APP_FIREBASE_STORAGE_BUCKET
ARG REACT_APP_FIREBASE_MESSAGING_SENDER_ID
ARG REACT_APP_FIREBASE_APP_ID
ARG REACT_APP_FIREBASE_MEASUREMENT_ID

# Environment variables
ENV REACT_APP_API_URL=$REACT_APP_API_URL
ENV REACT_APP_FIREBASE_API_KEY=$REACT_APP_FIREBASE_API_KEY
ENV REACT_APP_FIREBASE_AUTH_DOMAIN=$REACT_APP_FIREBASE_AUTH_DOMAIN
ENV REACT_APP_FIREBASE_PROJECT_ID=$REACT_APP_FIREBASE_PROJECT_ID
ENV REACT_APP_FIREBASE_STORAGE_BUCKET=$REACT_APP_FIREBASE_STORAGE_BUCKET
ENV REACT_APP_FIREBASE_MESSAGING_SENDER_ID=$REACT_APP_FIREBASE_MESSAGING_SENDER_ID
ENV REACT_APP_FIREBASE_APP_ID=$REACT_APP_FIREBASE_APP_ID
ENV REACT_APP_FIREBASE_MEASUREMENT_ID=$REACT_APP_FIREBASE_MEASUREMENT_ID
```

Cloud Buildでビルドする際は、`--build-arg`で渡します：

```bash
docker build \
  --build-arg REACT_APP_API_URL=https://app-dev.example.com \
  --build-arg REACT_APP_FIREBASE_API_KEY=your_key \
  ...
  -t frontend:latest .
```

## 必須環境変数チェックリスト

### バックエンド（必須）
- [ ] `DB_HOST`
- [ ] `DB_NAME`
- [ ] `DB_USER`
- [ ] `DB_PASSWORD`
- [ ] `ADMIN_EMAIL` ⚠️ **新規追加：必須**
- [ ] `FIREBASE_SERVICE_ACCOUNT` (Secret Manager経由)

### フロントエンド（必須）
- [ ] `REACT_APP_FIREBASE_API_KEY` ⚠️ **新規追加：必須**
- [ ] `REACT_APP_FIREBASE_AUTH_DOMAIN` ⚠️ **新規追加：必須**
- [ ] `REACT_APP_FIREBASE_PROJECT_ID` ⚠️ **新規追加：必須**
- [ ] `REACT_APP_FIREBASE_STORAGE_BUCKET` ⚠️ **新規追加：必須**
- [ ] `REACT_APP_FIREBASE_MESSAGING_SENDER_ID` ⚠️ **新規追加：必須**
- [ ] `REACT_APP_FIREBASE_APP_ID` ⚠️ **新規追加：必須**

## 環境変数の取得方法

### Firebase設定の取得
1. Firebase Consoleにアクセス
2. プロジェクト設定 > マイアプリ > Webアプリの設定
3. 設定値をコピーして環境変数に設定

### ADMIN_EMAILの設定
- 管理者のメールアドレスを設定
- ユーザー承認リクエストがこのメールアドレスに送信されます
- 本番環境では必ず設定してください

## トラブルシューティング

### フロントエンドでFirebase設定が読み込まれない
- 環境変数名が`REACT_APP_`で始まっているか確認
- ビルド後に環境変数が埋め込まれているか確認（`npm run build`後）
- ブラウザの開発者ツールで`process.env`を確認

### バックエンドでADMIN_EMAILエラーが発生する
- `ADMIN_EMAIL`環境変数が設定されているか確認
- メール送信機能を使用する場合は必須です

