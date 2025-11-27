# Firebaseバックエンド設定更新ガイド

## クイックスタート

新しいFirebaseプロジェクトを作成したら、以下の手順でバックエンド設定を更新してください。

### 1. Firebaseサービスアカウントキーを取得

1. [Firebase Console](https://console.firebase.google.com/)にアクセス
2. 新しいプロジェクトを選択
3. 「⚙️ プロジェクトの設定」> 「サービスアカウント」タブ
4. 「新しい秘密鍵の生成」をクリック
5. ダウンロードしたJSONファイルを`firebase-service-account.json`として保存

### 2. GCP Secret Managerに更新

```bash
# スクリプトを使用（推奨）
./scripts/update-firebase-secret.sh dev firebase-service-account.json
```

または、手動で実行:

```bash
gcloud secrets versions add firebase-service-account-dev \
  --data-file=firebase-service-account.json \
  --project=saito-test-gcp
```

### 3. バックエンドを再デプロイ

```bash
# Cloud Buildでデプロイ
gcloud builds submit --config=cloudbuild.yaml

# または、GitHubにプッシュ（自動デプロイ）
git add .
git commit -m "Update Firebase backend configuration"
git push origin main
```

### 4. 動作確認

```bash
# ログを確認
gcloud run services logs read app-dev \
  --region=asia-northeast1 \
  --project=saito-test-gcp \
  --limit=20

# 以下が表示されれば成功:
# ✓ Firebase Admin SDK initialized
```

## 詳細な手順

詳細は以下のドキュメントを参照してください:

- [Firebase設定手順](docs/firebase-setup.md)
- [バックエンド更新手順](docs/firebase-backend-update.md)

