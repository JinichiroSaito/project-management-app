# Firebase Secret Manager更新手順（手動実行）

## 現在の状況

✅ Firebaseサービスアカウントキーファイルが準備されました：
- ファイル: `firebase-service-account.json`
- プロジェクトID: `project-management-app-c1f78`
- サービスアカウント: `firebase-adminsdk-fbsvc@project-management-app-c1f78.iam.gserviceaccount.com`

## 更新手順

### ステップ1: gcloud認証

ターミナルで以下のコマンドを実行：

```bash
gcloud auth login
gcloud config set project saito-test-gcp
```

### ステップ2: Secret Managerを更新

プロジェクトのルートディレクトリで以下のコマンドを実行：

```bash
cd /Users/jinichirosaito/project-management-app

# Secret Managerを更新
gcloud secrets versions add firebase-service-account-dev \
  --data-file=firebase-service-account.json \
  --project=saito-test-gcp
```

**注意**: シークレットが存在しない場合は、先に作成してください：

```bash
gcloud secrets create firebase-service-account-dev \
  --data-file=firebase-service-account.json \
  --project=saito-test-gcp \
  --replication-policy="automatic"
```

### ステップ3: 更新の確認

```bash
# 最新バージョンを確認
gcloud secrets versions list firebase-service-account-dev \
  --project=saito-test-gcp \
  --limit=1

# プロジェクトIDを確認
gcloud secrets versions access latest \
  --secret=firebase-service-account-dev \
  --project=saito-test-gcp | jq -r '.project_id'
```

出力が `project-management-app-c1f78` であれば成功です。

### ステップ4: バックエンドを再デプロイ

Secret Managerを更新したら、バックエンドを再デプロイします：

```bash
# GitHubにプッシュ（自動デプロイ）
git add .
git commit -m "Update Firebase service account in Secret Manager"
git push origin main
```

または、Cloud Buildで直接デプロイ：

```bash
gcloud builds submit --config=cloudbuild.yaml
```

### ステップ5: 動作確認

デプロイ後、バックエンドのログでFirebase初期化が成功しているか確認：

```bash
gcloud run services logs read app-dev \
  --region=asia-northeast1 \
  --project=saito-test-gcp \
  --limit=20
```

以下のメッセージが表示されれば成功：
```
✓ Firebase Admin SDK initialized
```

### ステップ6: フロントエンドで再ログイン

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

Secret Manager Admin権限が必要です：

```bash
# 現在のユーザーにSecret Manager Admin権限を付与
gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="user:$(gcloud config get-value account)" \
  --role="roles/secretmanager.admin"
```

### エラー: "Secret not found"

シークレットが存在しない場合は、先に作成してください（上記のステップ2を参照）。

## 確認用チェックリスト

- [ ] gcloud認証が完了している
- [ ] `firebase-service-account.json`が正しいプロジェクトのキーである
- [ ] Secret Managerに`firebase-service-account-dev`が存在する
- [ ] Secret Managerの最新バージョンに正しいFirebaseプロジェクトIDが含まれている
- [ ] バックエンドを再デプロイした
- [ ] バックエンドのログで「✓ Firebase Admin SDK initialized」が表示される
- [ ] フロントエンドで再ログインした
- [ ] プロジェクト一覧が正常に表示される

