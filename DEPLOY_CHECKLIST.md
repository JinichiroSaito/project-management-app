# 本番環境デプロイ前チェックリスト

## ✅ 完了した修正

### コード修正
- [x] トランザクション処理の追加（`db.js`に`withTransaction`関数を追加）
- [x] プロジェクト作成・更新時のトランザクション処理
- [x] setTimeoutによる待機処理の削除
- [x] デバッグコードの条件付き実行（開発環境のみ）
- [x] Firebase APIキーの環境変数化
- [x] 非同期処理のエラーハンドリング強化
- [x] 承認フローの競合状態対策（楽観的ロック）
- [x] ハードコードされたユーザー情報の環境変数化
- [x] `migrate.js`に`dotenv`の読み込みを追加

### 設定ファイルの更新
- [x] `cloudbuild-prod.yaml`に`ADMIN_EMAIL`環境変数を追加
- [x] `cloudbuild-prod.yaml`に必要な環境変数を追加
- [x] `cloudbuild-frontend-prod.yaml`を作成（Firebase環境変数対応）
- [x] `app/frontend/Dockerfile`を更新（Firebase環境変数対応）

### テスト
- [x] トランザクション処理のテスト - 成功
- [x] 承認フローの競合状態テスト - 成功
- [x] エラーハンドリングのテスト - 成功

### ドキュメント
- [x] `ENV_SETUP.md` - 環境変数設定ガイド
- [x] `PRODUCTION_DEPLOYMENT.md` - 本番環境適用ガイド
- [x] `DEPLOY_PRODUCTION.md` - デプロイ手順
- [x] `app/backend/src/tests/README.md` - テストスクリプトの説明

## ⚠️ デプロイ前の確認事項

### 1. Secret Managerの確認

以下のシークレットが本番環境に存在することを確認：

```bash
# Secret Managerのシークレット一覧を確認
gcloud secrets list --project=saito-test-gcp | grep -E "(prod|PROD)"
```

必要なシークレット：
- [ ] `db-password-prod:latest`
- [ ] `firebase-service-account-prod:latest` (または `firebase-service-account-dev:latest` を確認)
- [ ] `email-user-prod:latest`
- [ ] `email-app-password-prod:latest`
- [ ] `gemini-api-key-prod:latest` (または `gemini-api-key-dev:latest` を確認)

### 2. 環境変数の確認

`cloudbuild-prod.yaml`の環境変数設定を確認：
- [x] `ADMIN_EMAIL=jinichirou.saitou@asahi-gh.com`
- [x] `NODE_ENV=production`
- [x] `EMAIL_SERVICE=gmail`
- [x] その他の必要な環境変数

### 3. Firebase設定の確認

`cloudbuild-frontend-prod.yaml`のsubstitutionsを確認：
- [x] Firebase設定が正しく設定されているか

**注意**: セキュリティのため、Firebase設定はSecret Managerに移行することを推奨します。

### 4. データベースの確認

- [ ] 本番データベースへの接続が可能であること
- [ ] バックアップが取得されていること

### 5. サービスアカウントの確認

- [ ] `cloud-run-prod@saito-test-gcp.iam.gserviceaccount.com`が存在するか
- [ ] 必要な権限が付与されているか

## 🚀 デプロイ手順

### ステップ1: バックエンドのデプロイ

```bash
# プロジェクトIDとタグ名を設定
export PROJECT_ID=saito-test-gcp
export TAG_NAME=v1.0.0-$(date +%Y%m%d-%H%M%S)

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
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=db-migrate-prod" \
  --limit=50 \
  --format=json \
  --project=${PROJECT_ID}
```

### ステップ3: フロントエンドのデプロイ

```bash
# フロントエンドをビルド・デプロイ
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
- [ ] メール送信が正常に動作するか

## 📝 管理者ユーザーの作成

デプロイ後、管理者ユーザーを作成する必要があります。

詳細は `DEPLOY_PRODUCTION.md` を参照してください。

## 🔄 ロールバック手順

問題が発生した場合：

```bash
# 前のバージョンにロールバック
gcloud run services update-traffic app-prod \
  --region=asia-northeast1 \
  --to-revisions=previous-version=100 \
  --project=saito-test-gcp
```

