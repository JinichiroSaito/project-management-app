# バックエンド再デプロイ手順

## 現在の状況
✅ Secret Managerの更新が完了しました（バージョン3）

## 次のステップ: バックエンドを再デプロイ

### 方法1: Cloud Buildで直接デプロイ（推奨）

```bash
# プロジェクトルートで実行
gcloud builds submit --config=cloudbuild.yaml
```

### 方法2: GitHubにプッシュして自動デプロイ

```bash
# 変更をコミット（既にSecret Managerを更新したことを記録）
git add .
git commit -m "Update Firebase service account in Secret Manager"
git push origin main
```

GitHub Actionsが自動的にバックエンドをデプロイします。

## デプロイ後の確認

### 1. デプロイの完了を待つ

Cloud Buildの実行が完了するまで待ちます（通常5-10分）。

### 2. バックエンドのログを確認

```bash
# Firebase初期化が成功しているか確認
gcloud run services logs read app-dev \
  --region=asia-northeast1 \
  --project=saito-test-gcp \
  --limit=50 \
  | grep -i "firebase\|initialized"
```

以下のメッセージが表示されれば成功：
- `✓ Firebase Admin SDK initialized`

### 3. フロントエンドで動作確認

1. ブラウザでアプリを開く
2. ログアウト（既にログインしている場合）
3. 再度ログイン
4. プロジェクト一覧が表示されるか確認

## トラブルシューティング

### デプロイが失敗する場合

```bash
# 最新のビルドログを確認
gcloud builds list --limit=5 --project=saito-test-gcp
```

### Firebase初期化エラーが続く場合

1. Secret Managerのバージョンを確認：
```bash
gcloud secrets versions list firebase-service-account-dev \
  --project=saito-test-gcp
```

2. 最新バージョン（3）が使用されているか確認

3. 必要に応じて、Cloud Runサービスを手動で再デプロイ：
```bash
gcloud run services update app-dev \
  --region=asia-northeast1 \
  --project=saito-test-gcp
```

