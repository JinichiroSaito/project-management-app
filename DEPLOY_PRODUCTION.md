# 本番環境へのデプロイ手順

このドキュメントでは、修正内容を本番環境に適用する手順を説明します。

## デプロイ前のチェックリスト

### 1. コードの確認
- [x] トランザクション処理が実装されている
- [x] setTimeoutによる待機処理が削除されている
- [x] デバッグコードが開発環境のみで実行される
- [x] Firebase APIキーが環境変数化されている
- [x] エラーハンドリングが強化されている
- [x] 承認フローの競合状態対策が実装されている
- [x] ハードコードされたユーザー情報が環境変数化されている

### 2. 環境変数の確認

#### バックエンド（Secret Manager）
以下のシークレットが設定されていることを確認：
- [ ] `db-password-prod:latest`
- [ ] `firebase-service-account-prod:latest`
- [ ] `email-user-prod:latest`
- [ ] `email-app-password-prod:latest`
- [ ] `gemini-api-key-prod:latest`

#### バックエンド（環境変数）
`cloudbuild-prod.yaml`に以下の環境変数が設定されていることを確認：
- [x] `ADMIN_EMAIL=jinichirou.saitou@asahi-gh.com`
- [x] `NODE_ENV=production`
- [x] `EMAIL_SERVICE=gmail`
- [x] その他の必要な環境変数

#### フロントエンド（ビルド引数）
`cloudbuild-frontend-prod.yaml`に以下のsubstitutionsが設定されていることを確認：
- [x] `_FIREBASE_API_KEY`
- [x] `_FIREBASE_AUTH_DOMAIN`
- [x] `_FIREBASE_PROJECT_ID`
- [x] `_FIREBASE_STORAGE_BUCKET`
- [x] `_FIREBASE_MESSAGING_SENDER_ID`
- [x] `_FIREBASE_APP_ID`
- [x] `_FIREBASE_MEASUREMENT_ID`

**注意**: セキュリティのため、Firebase設定はSecret Managerに移行することを推奨します。

### 3. データベースの確認
- [ ] 本番データベースへの接続が可能であること
- [ ] マイグレーションが正常に実行できること
- [ ] バックアップが取得されていること

## デプロイ手順

### ステップ1: バックエンドのデプロイ

```bash
# プロジェクトIDを設定
export PROJECT_ID=saito-test-gcp
export TAG_NAME=v1.0.0  # 適切なバージョンタグを設定

# Cloud Buildでバックエンドをビルド・デプロイ
gcloud builds submit \
  --config=cloudbuild-prod.yaml \
  --substitutions=TAG_NAME=${TAG_NAME} \
  --project=${PROJECT_ID}
```

### ステップ2: マイグレーションの確認

デプロイ後、マイグレーションが正常に実行されたことを確認：

```bash
# Cloud Run Jobのログを確認
gcloud logging read "resource.type=cloud_run_job" \
  --limit=50 \
  --format=json \
  --project=${PROJECT_ID}
```

### ステップ3: フロントエンドのデプロイ

```bash
# Firebase設定をSecret Managerから取得（推奨）またはsubstitutionsで指定
gcloud builds submit \
  --config=cloudbuild-frontend-prod.yaml \
  --substitutions=TAG_NAME=${TAG_NAME} \
  --project=${PROJECT_ID}
```

### ステップ4: デプロイ後の確認

#### ヘルスチェック
```bash
# バックエンドのヘルスチェック
curl https://app-prod-823277232006.asia-northeast1.run.app/health

# データベース接続の確認
curl https://app-prod-823277232006.asia-northeast1.run.app/health/db
```

#### 機能確認
- [ ] ユーザー登録が正常に動作するか
- [ ] プロジェクト作成が正常に動作するか
- [ ] 承認フローが正常に動作するか
- [ ] メール送信が正常に動作するか（`ADMIN_EMAIL`に承認リクエストが送信されるか）
- [ ] Firebase認証が正常に動作するか

#### ログの確認
```bash
# バックエンドのログを確認
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=app-prod" \
  --limit=50 \
  --format=json \
  --project=${PROJECT_ID}

# エラーの確認
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=app-prod AND severity>=ERROR" \
  --limit=20 \
  --format=json \
  --project=${PROJECT_ID}
```

## 管理者ユーザーの作成

本番環境で管理者ユーザーを作成する必要があります。

### 方法1: スクリプトを使用（推奨）

```bash
# Cloud Run Jobで管理者ユーザーを作成
gcloud run jobs create create-admin-user \
  --image=asia-northeast1-docker.pkg.dev/${PROJECT_ID}/app-images/backend:${TAG_NAME} \
  --region=asia-northeast1 \
  --vpc-connector=vpc-connector \
  --service-account=cloud-run-prod@${PROJECT_ID}.iam.gserviceaccount.com \
  --set-env-vars="DB_HOST=10.81.0.6,DB_PORT=5432,DB_NAME=pm_app,DB_USER=app_user,ADMIN_EMAIL=jinichirou.saitou@asahi-gh.com" \
  --set-secrets="DB_PASSWORD=db-password-prod:latest" \
  --command=node \
  --args="src/scripts/create-admin-user.js,YOUR_FIREBASE_UID" \
  --max-retries=1 \
  --project=${PROJECT_ID}

# ジョブを実行
gcloud run jobs execute create-admin-user \
  --region=asia-northeast1 \
  --wait \
  --project=${PROJECT_ID}

# ジョブを削除
gcloud run jobs delete create-admin-user \
  --region=asia-northeast1 \
  --quiet \
  --project=${PROJECT_ID}
```

### 方法2: SQLで直接作成

```sql
-- Cloud SQLに接続して実行
INSERT INTO users (firebase_uid, email, is_admin, is_approved, name)
VALUES (
  'YOUR_FIREBASE_UID',  -- 実際のFirebase UIDに置き換える
  'jinichirou.saitou@asahi-gh.com',
  TRUE,
  TRUE,
  'Admin User'
)
ON CONFLICT (email) DO UPDATE SET 
  is_admin = TRUE, 
  is_approved = TRUE;
```

## ロールバック手順

問題が発生した場合のロールバック手順：

```bash
# 前のバージョンにロールバック
gcloud run services update-traffic app-prod \
  --region=asia-northeast1 \
  --to-revisions=previous-version=100 \
  --project=${PROJECT_ID}

# フロントエンドも同様にロールバック
gcloud run services update-traffic frontend-prod \
  --region=asia-northeast1 \
  --to-revisions=previous-version=100 \
  --project=${PROJECT_ID}
```

## トラブルシューティング

### ADMIN_EMAILエラー

```
Error: ADMIN_EMAIL is not configured
```

**解決方法:**
- Cloud Runの環境変数に`ADMIN_EMAIL`が設定されているか確認
- `cloudbuild-prod.yaml`の環境変数設定を確認

### Firebase設定エラー

```
Firebase configuration error
```

**解決方法:**
- フロントエンドのビルド時にFirebase環境変数が正しく渡されているか確認
- `cloudbuild-frontend-prod.yaml`のsubstitutionsを確認
- Secret Managerを使用する場合は、シークレットが正しく設定されているか確認

### トランザクションエラー

```
Transaction failed
```

**解決方法:**
- データベース接続を確認
- ログを確認してエラーの詳細を確認
- 必要に応じて、トランザクション処理を見直す

## セキュリティの推奨事項

1. **Firebase設定のSecret Manager化**
   - 現在、Firebase設定は`cloudbuild-frontend-prod.yaml`のsubstitutionsに直接記述されています
   - セキュリティのため、Secret Managerに移行することを推奨します

2. **環境変数の確認**
   - 本番環境の環境変数が正しく設定されているか定期的に確認
   - 機密情報は必ずSecret Managerを使用

3. **ログの監視**
   - エラーログを定期的に確認
   - 異常なアクセスパターンを監視

## 関連ドキュメント

- [環境変数設定ガイド](./ENV_SETUP.md)
- [本番環境適用ガイド](./PRODUCTION_DEPLOYMENT.md)
- [テストスクリプト](./app/backend/src/tests/README.md)

