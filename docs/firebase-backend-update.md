# バックエンドFirebase設定更新手順

## 概要

バックエンドのFirebase設定は、GCP Secret Managerに保存されたサービスアカウントキーを使用します。
新しいFirebaseプロジェクトを作成したら、以下の手順でバックエンド設定を更新してください。

## 手順

### 1. Firebaseサービスアカウントキーを取得

1. [Firebase Console](https://console.firebase.google.com/)にアクセス
2. 新しいプロジェクトを選択
3. 「⚙️ プロジェクトの設定」をクリック
4. 「サービスアカウント」タブを選択
5. 「新しい秘密鍵の生成」をクリック
6. JSONファイルがダウンロードされる（例: `firebase-adminsdk-xxxxx-xxxxx.json`）

### 2. サービスアカウントキーファイルを保存

ダウンロードしたJSONファイルをプロジェクトルートに`firebase-service-account.json`として保存します。

```bash
# ダウンロードしたファイルをプロジェクトルートにコピー
cp ~/Downloads/firebase-adminsdk-xxxxx-xxxxx.json ./firebase-service-account.json
```

**注意**: このファイルは`.gitignore`に含まれているため、Gitにはコミットされません。

### 3. GCP Secret Managerに更新

#### 方法A: スクリプトを使用（推奨）

```bash
# 開発環境用
./scripts/update-firebase-secret.sh dev firebase-service-account.json

# ステージング環境用（必要に応じて）
./scripts/update-firebase-secret.sh staging firebase-service-account.json

# 本番環境用（必要に応じて）
./scripts/update-firebase-secret.sh prod firebase-service-account.json
```

#### 方法B: gcloudコマンドを直接実行

```bash
# 開発環境用
gcloud secrets versions add firebase-service-account-dev \
  --data-file=firebase-service-account.json \
  --project=saito-test-gcp

# ステージング環境用
gcloud secrets versions add firebase-service-account-staging \
  --data-file=firebase-service-account.json \
  --project=saito-test-gcp

# 本番環境用
gcloud secrets versions add firebase-service-account-prod \
  --data-file=firebase-service-account.json \
  --project=saito-test-gcp
```

#### 方法C: シークレットが存在しない場合（初回のみ）

```bash
# 開発環境用
gcloud secrets create firebase-service-account-dev \
  --data-file=firebase-service-account.json \
  --project=saito-test-gcp \
  --replication-policy="automatic"
```

### 4. Cloud Runサービスを再デプロイ

Secret Managerを更新したら、Cloud Runサービスを再デプロイして新しい設定を反映します。

```bash
# バックエンドを再デプロイ
gcloud builds submit --config=cloudbuild.yaml

# または、GitHub Actionsを使用（mainブランチにプッシュ）
git add .
git commit -m "Update Firebase backend configuration"
git push origin main
```

### 5. 動作確認

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

## 設定の確認

### Secret Managerの確認

```bash
# シークレットの存在確認
gcloud secrets list --project=saito-test-gcp | grep firebase

# シークレットのバージョン確認
gcloud secrets versions list firebase-service-account-dev \
  --project=saito-test-gcp
```

### Cloud Runの環境変数確認

```bash
# 開発環境
gcloud run services describe app-dev \
  --region=asia-northeast1 \
  --project=saito-test-gcp \
  --format="value(spec.template.spec.containers[0].env)"

# シークレットが正しく設定されているか確認
# FIREBASE_SERVICE_ACCOUNT=firebase-service-account-dev:latest が表示されるはず
```

## トラブルシューティング

### エラー: "Secret not found"

シークレットが存在しない場合は、先にシークレットを作成してください（方法Cを参照）。

### エラー: "Permission denied"

必要な権限を確認してください：

```bash
# Secret Manager Admin権限が必要
gcloud projects get-iam-policy saito-test-gcp \
  --flatten="bindings[].members" \
  --filter="bindings.members:user:YOUR_EMAIL"
```

### Firebase初期化エラー

バックエンドのログで以下のエラーが表示される場合：

```
Failed to initialize Firebase Admin SDK: Error: ...
```

- サービスアカウントキーのJSONが正しいか確認
- Secret Managerのシークレット名が正しいか確認（`firebase-service-account-dev:latest`）
- Cloud Runサービスの環境変数でシークレットが正しく参照されているか確認

## 関連ファイル

- `app/backend/src/middleware/auth.js` - Firebase Admin SDKの初期化
- `cloudbuild.yaml` - デプロイ時のシークレット設定
- `.github/workflows/deploy-backend-dev.yml` - GitHub Actionsのデプロイ設定

