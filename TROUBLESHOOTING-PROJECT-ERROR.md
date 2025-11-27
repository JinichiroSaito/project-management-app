# プロジェクト取得エラーのトラブルシューティング

## エラー内容
「エラー: プロジェクトの取得に失敗しました」

## 考えられる原因

### 1. バックエンドのFirebase設定が未更新

新しいFirebaseプロジェクト（`project-management-app-c1f78`）を作成したため、バックエンドのSecret Managerも更新する必要があります。

**確認方法:**
```bash
# バックエンドのログを確認
gcloud run services logs read app-dev \
  --region=asia-northeast1 \
  --project=saito-test-gcp \
  --limit=50

# 以下のメッセージが表示されていれば問題:
# ✓ Firebase Admin SDK initialized
# 以下のメッセージが表示されていれば設定が必要:
# ⚠ FIREBASE_SERVICE_ACCOUNT not set - authentication disabled
```

**解決方法:**
1. Firebase Consoleからサービスアカウントキーを取得
2. GCP Secret Managerに更新（`UPDATE-SECRET-MANAGER.md`を参照）
3. バックエンドを再デプロイ

### 2. 認証トークンの問題

フロントエンドで新しいFirebaseプロジェクトに切り替えたため、古いトークンが無効になっている可能性があります。

**解決方法:**
1. ブラウザでログアウト
2. ブラウザのキャッシュをクリア
3. 再度ログイン

### 3. バックエンドAPIのエラー

バックエンドでデータベース接続エラーやその他のエラーが発生している可能性があります。

**確認方法:**
ブラウザの開発者ツール（F12）> Consoleタブでエラーの詳細を確認

**解決方法:**
バックエンドのログを確認して、具体的なエラー内容を特定

## デバッグ手順

### ステップ1: ブラウザのコンソールを確認

1. ブラウザでF12を押して開発者ツールを開く
2. Consoleタブを確認
3. エラーメッセージの詳細を確認

### ステップ2: ネットワークタブを確認

1. 開発者ツールのNetworkタブを開く
2. `/api/projects`または`/api/projects/my`のリクエストを確認
3. レスポンスのステータスコードと内容を確認

### ステップ3: バックエンドのログを確認

```bash
gcloud run services logs read app-dev \
  --region=asia-northeast1 \
  --project=saito-test-gcp \
  --limit=100 \
  --format="table(timestamp,severity,textPayload)"
```

## よくあるエラーと解決方法

### エラー: "Authentication required"
- **原因**: 認証トークンが無効または欠如
- **解決**: ログアウトして再ログイン

### エラー: "User not found"
- **原因**: 新しいFirebaseプロジェクトにユーザーが登録されていない
- **解決**: 再登録またはFirebase Consoleでユーザーを手動追加

### エラー: "Invalid token"
- **原因**: バックエンドのFirebase設定が古いプロジェクトを参照している
- **解決**: Secret Managerを更新してバックエンドを再デプロイ

### エラー: 500 Internal Server Error
- **原因**: バックエンドでデータベースエラーやその他のエラー
- **解決**: バックエンドのログを確認して具体的なエラーを特定

## 緊急対応

もしすぐに動作確認したい場合：

1. **バックエンドのFirebase設定を確認**
   ```bash
   # Secret Managerのバージョンを確認
   gcloud secrets versions list firebase-service-account-dev \
     --project=saito-test-gcp
   ```

2. **バックエンドを再デプロイ**
   ```bash
   gcloud builds submit --config=cloudbuild.yaml
   ```

3. **フロントエンドを再ビルド**
   ```bash
   cd app/frontend
   npm run build
   ```

