# プロジェクト取得エラーの修正手順

## 問題
「エラー: プロジェクトの取得に失敗しました」

## 原因
バックエンドのFirebase設定が新しいプロジェクト（`project-management-app-c1f78`）に更新されていない可能性が高いです。

フロントエンドは新しいFirebaseプロジェクトのトークンを使用していますが、バックエンドが古いプロジェクトの設定でトークンを検証しようとしているため、認証が失敗しています。

## 解決手順

### ステップ1: バックエンドのFirebase設定を確認

```bash
# Secret Managerのバージョンを確認
gcloud secrets versions list firebase-service-account-dev \
  --project=saito-test-gcp

# バックエンドのログを確認
gcloud run services logs read app-dev \
  --region=asia-northeast1 \
  --project=saito-test-gcp \
  --limit=50
```

ログに以下が表示されていれば問題ありません：
- `✓ Firebase Admin SDK initialized`

以下が表示されていれば設定が必要です：
- `⚠ FIREBASE_SERVICE_ACCOUNT not set - authentication disabled`
- `Failed to initialize Firebase Admin SDK`
- `Invalid token` または `Token expired`

### ステップ2: GCP Secret Managerを更新

新しいFirebaseプロジェクトのサービスアカウントキーでSecret Managerを更新します。

```bash
# プロジェクトを設定
gcloud config set project saito-test-gcp

# Secret Managerを更新
gcloud secrets versions add firebase-service-account-dev \
  --data-file=firebase-service-account.json \
  --project=saito-test-gcp
```

**注意**: `firebase-service-account.json`が新しいプロジェクト（`project-management-app-c1f78`）のサービスアカウントキーであることを確認してください。

### ステップ3: バックエンドを再デプロイ

Secret Managerを更新したら、バックエンドを再デプロイして新しい設定を反映します。

```bash
# Cloud Buildでデプロイ
gcloud builds submit --config=cloudbuild.yaml

# または、GitHubにプッシュ（自動デプロイ）
git add .
git commit -m "Update Firebase backend configuration"
git push origin main
```

### ステップ4: 動作確認

デプロイ後、バックエンドのログでFirebase初期化が成功しているか確認します。

```bash
# ログを確認
gcloud run services logs read app-dev \
  --region=asia-northeast1 \
  --project=saito-test-gcp \
  --limit=20

# 以下が表示されれば成功:
# ✓ Firebase Admin SDK initialized
```

### ステップ5: フロントエンドで再ログイン

1. ブラウザでアプリからログアウト
2. ブラウザのキャッシュをクリア（オプション）
3. 再度ログイン
4. プロジェクト一覧が表示されるか確認

## トラブルシューティング

### エラー: "Reauthentication failed"
```bash
gcloud auth login
```

### エラー: "Permission denied"
Secret Manager Admin権限が必要です。GCPのIAM設定を確認してください。

### エラー: "Secret not found"
シークレットが存在しない場合は、先に作成してください：
```bash
gcloud secrets create firebase-service-account-dev \
  --data-file=firebase-service-account.json \
  --project=saito-test-gcp \
  --replication-policy="automatic"
```

### まだエラーが発生する場合

1. ブラウザの開発者ツール（F12）> Consoleタブでエラーの詳細を確認
2. Networkタブで`/api/projects`または`/api/projects/my`のリクエストを確認
3. レスポンスのステータスコードとエラーメッセージを確認

詳細は`TROUBLESHOOTING-PROJECT-ERROR.md`を参照してください。

