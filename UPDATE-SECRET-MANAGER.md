# GCP Secret Manager更新手順

## 現在の状況

- ✅ `firebase-service-account.json` ファイルが存在します
- ✅ 新しいFirebaseプロジェクトID: `project-management-app-c1f78`
- ⚠️ gcloud認証が必要です

## 更新手順

### 1. gcloud認証（初回のみ、または期限切れの場合）

```bash
gcloud auth login
```

### 2. プロジェクトを設定

```bash
gcloud config set project saito-test-gcp
```

### 3. Secret Managerを更新

#### 方法A: スクリプトを使用（推奨）

```bash
./scripts/update-firebase-secret-manual.sh
```

#### 方法B: 手動でコマンドを実行

```bash
# シークレットが存在する場合（既存の更新）
gcloud secrets versions add firebase-service-account-dev \
  --data-file=firebase-service-account.json \
  --project=saito-test-gcp

# シークレットが存在しない場合（初回作成）
gcloud secrets create firebase-service-account-dev \
  --data-file=firebase-service-account.json \
  --project=saito-test-gcp \
  --replication-policy="automatic"
```

### 4. 更新の確認

```bash
# シークレットのバージョンを確認
gcloud secrets versions list firebase-service-account-dev \
  --project=saito-test-gcp

# 最新バージョンの情報を確認
gcloud secrets versions access latest \
  --secret=firebase-service-account-dev \
  --project=saito-test-gcp | head -5
```

### 5. バックエンドを再デプロイ

Secret Managerを更新したら、バックエンドを再デプロイして新しい設定を反映します。

```bash
# Cloud Buildでデプロイ
gcloud builds submit --config=cloudbuild.yaml

# または、GitHubにプッシュ（自動デプロイ）
git add .
git commit -m "Update Firebase service account"
git push origin main
```

### 6. 動作確認

デプロイ後、バックエンドのログでFirebase初期化が成功しているか確認します。

```bash
# Cloud Runのログを確認
gcloud run services logs read app-dev \
  --region=asia-northeast1 \
  --project=saito-test-gcp \
  --limit=50

# ログに以下が表示されれば成功:
# ✓ Firebase Admin SDK initialized
```

## トラブルシューティング

### エラー: "Reauthentication failed"

```bash
gcloud auth login
```

### エラー: "Permission denied"

必要な権限を確認してください：

```bash
# Secret Manager Admin権限が必要
gcloud projects get-iam-policy saito-test-gcp \
  --flatten="bindings[].members" \
  --filter="bindings.members:user:$(gcloud config get-value account)"
```

### エラー: "Secret not found"

シークレットが存在しない場合は、先に作成してください（方法Bの「初回作成」コマンドを実行）。

