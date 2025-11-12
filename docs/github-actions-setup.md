# GitHub Actions自動デプロイ設定ガイド

## 現在の状況

### ✅ フロントエンド
- 自動デプロイ設定済み
- ワークフロー: `.github/workflows/deploy-frontend-dev.yml`
- トリガー: `app/frontend/**` の変更時に自動実行

### ✅ バックエンド
- 自動デプロイ設定済み
- ワークフロー: `.github/workflows/deploy-backend-dev.yml`
- トリガー: `app/backend/**` または `cloudbuild.yaml` の変更時に自動実行

## 必要な権限設定

GitHub Actionsのサービスアカウント（`github-actions@saito-test-gcp.iam.gserviceaccount.com`）に以下の権限が必要です：

### 1. Cloud Build関連の権限

```bash
# Cloud Buildのビルド実行権限
gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/cloudbuild.builds.editor" \
  --project=saito-test-gcp

# Cloud Buildのバケットへのアクセス権限（ストレージ管理）
gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/storage.admin" \
  --project=saito-test-gcp
```

### 2. Service Usage権限

```bash
# APIの使用に必要
gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/serviceusage.serviceUsageConsumer" \
  --project=saito-test-gcp
```

### 3. Cloud Run関連の権限

```bash
# Cloud Run管理権限（既に付与済みの可能性あり）
gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/run.admin" \
  --project=saito-test-gcp
```

### 4. Cloud SQL関連の権限

```bash
# データベースマイグレーション実行に必要
gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/cloudsql.client" \
  --project=saito-test-gcp
```

### 5. Artifact Registry関連の権限

```bash
# Artifact Registryへの書き込み権限（既に付与済みの可能性あり）
gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer" \
  --project=saito-test-gcp

# Artifact Registry管理権限（既に付与済みの可能性あり）
gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.admin" \
  --project=saito-test-gcp
```

### 6. IAM関連の権限

```bash
# サービスアカウントの使用権限（既に付与済みの可能性あり）
gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser" \
  --project=saito-test-gcp
```

## 権限の確認

現在付与されている権限を確認：

```bash
gcloud projects get-iam-policy saito-test-gcp \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --format="table(bindings.role)"
```

## エラーが発生した場合

### エラー: "The user is forbidden from accessing the bucket"

**原因:**
- Cloud Buildのバケット（`saito-test-gcp_cloudbuild`）へのアクセス権限が不足

**解決方法:**
- `roles/storage.admin` または `roles/storage.objectAdmin` を付与

### エラー: "serviceusage.services.use permission"

**原因:**
- Service Usage APIの使用権限が不足

**解決方法:**
- `roles/serviceusage.serviceUsageConsumer` を付与

### エラー: "Cloud Build API is not enabled"

**原因:**
- Cloud Build APIが有効化されていない

**解決方法:**
```bash
gcloud services enable cloudbuild.googleapis.com --project=saito-test-gcp
```

## ワークフローの動作確認

1. GitHubリポジトリの「Actions」タブを開く
2. 最新のワークフロー実行を確認
3. エラーが発生している場合は、ログを確認

## トラブルシューティング

### 権限が正しく付与されているか確認

```bash
# サービスアカウントの権限を確認
gcloud projects get-iam-policy saito-test-gcp \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --format="table(bindings.role)"
```

### Cloud Build APIが有効化されているか確認

```bash
gcloud services list --enabled --project=saito-test-gcp --filter="name:cloudbuild.googleapis.com"
```

### 手動でCloud Buildを実行してテスト

```bash
SHORT_SHA=$(git rev-parse --short HEAD)
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=SHORT_SHA=$SHORT_SHA \
  --project=saito-test-gcp
```

## 参考リンク

- [Cloud Build ドキュメント](https://cloud.google.com/build/docs)
- [GitHub Actions ドキュメント](https://docs.github.com/ja/actions)
- [IAM ロールと権限](https://cloud.google.com/iam/docs/understanding-roles)

