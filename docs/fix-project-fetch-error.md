# プロジェクト取得エラーの修正手順

## エラーメッセージ
「プロジェクトの取得に失敗しました」

## 原因
このエラーは通常、以下のいずれかが原因です：

1. **Firebase認証の問題**: バックエンドのFirebase設定が新しいプロジェクト（`project-management-app-c1f78`）に更新されていない
2. **認証トークンの問題**: フロントエンドとバックエンドで異なるFirebaseプロジェクトを使用している
3. **Secret Managerの設定問題**: Firebaseサービスアカウントキーが正しく設定されていない

## 診断手順

### ステップ1: Firebase設定を確認

診断スクリプトを実行して、現在の設定を確認します：

```bash
# gcloud認証が必要な場合
gcloud auth login
gcloud config set project saito-test-gcp

# 診断スクリプトを実行
./scripts/check-firebase-config.sh
```

このスクリプトは以下を確認します：
- Secret ManagerにFirebaseサービスアカウントが存在するか
- 正しいFirebaseプロジェクトID（`project-management-app-c1f78`）が設定されているか
- Cloud RunサービスがSecret Managerを参照しているか
- バックエンドのログでFirebase初期化が成功しているか

### ステップ2: ブラウザの開発者ツールでエラーを確認

1. ブラウザでF12を押して開発者ツールを開く
2. **Console**タブでエラーメッセージを確認
3. **Network**タブで`/api/projects`または`/api/projects/my`のリクエストを確認
   - ステータスコードが`401`（認証エラー）の場合は、Firebase認証の問題
   - ステータスコードが`500`（サーバーエラー）の場合は、バックエンドのエラー

## 解決手順

### ケース1: Firebase設定が更新されていない場合

#### 1. Firebaseサービスアカウントキーを取得

1. [Firebase Console](https://console.firebase.google.com/)にアクセス
2. プロジェクト `project-management-app-c1f78` を選択
3. 設定（⚙️）> プロジェクトの設定 > サービスアカウント
4. 「新しい秘密鍵の生成」をクリック
5. JSONファイルをダウンロード（`firebase-service-account.json`として保存）

#### 2. Secret Managerを更新

```bash
# プロジェクトを設定
gcloud config set project saito-test-gcp

# Secret Managerを更新
gcloud secrets versions add firebase-service-account-dev \
  --data-file=firebase-service-account.json \
  --project=saito-test-gcp
```

**注意**: `firebase-service-account.json`が新しいプロジェクト（`project-management-app-c1f78`）のサービスアカウントキーであることを確認してください。

#### 3. バックエンドを再デプロイ

Secret Managerを更新したら、バックエンドを再デプロイします：

```bash
# GitHubにプッシュ（自動デプロイ）
git add .
git commit -m "Update Firebase configuration"
git push origin main
```

または、Cloud Buildで直接デプロイ：

```bash
gcloud builds submit --config=cloudbuild.yaml
```

#### 4. 動作確認

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

### ケース2: 認証トークンの問題の場合

#### 1. ブラウザでログアウト

アプリケーションからログアウトします。

#### 2. ブラウザのキャッシュをクリア（オプション）

- Chrome: `Ctrl+Shift+Delete`（Windows/Linux）または`Cmd+Shift+Delete`（Mac）
- キャッシュされた画像とファイルを選択して削除

#### 3. 再度ログイン

新しいFirebaseプロジェクトのトークンで再度ログインします。

### ケース3: Secret Managerが存在しない場合

Secret Managerにシークレットが存在しない場合は、先に作成します：

```bash
gcloud secrets create firebase-service-account-dev \
  --data-file=firebase-service-account.json \
  --project=saito-test-gcp \
  --replication-policy="automatic"
```

## トラブルシューティング

### エラー: "Reauthentication failed"

```bash
gcloud auth login
```

### エラー: "Permission denied"

Secret Manager Admin権限が必要です。GCPのIAM設定を確認してください：

```bash
# 現在のユーザーにSecret Manager Admin権限を付与
gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="user:$(gcloud config get-value account)" \
  --role="roles/secretmanager.admin"
```

### エラー: "Secret not found"

シークレットが存在しない場合は、上記の「ケース3」を参照して作成してください。

### まだエラーが発生する場合

1. **バックエンドのログを詳細に確認**:
   ```bash
   gcloud run services logs read app-dev \
     --region=asia-northeast1 \
     --project=saito-test-gcp \
     --limit=100
   ```

2. **フロントエンドのコンソールログを確認**:
   - ブラウザの開発者ツール（F12）> Consoleタブ
   - エラーメッセージの詳細を確認

3. **ネットワークリクエストを確認**:
   - 開発者ツール > Networkタブ
   - `/api/projects`または`/api/projects/my`のリクエストを確認
   - レスポンスのステータスコードとエラーメッセージを確認

## 確認用チェックリスト

- [ ] `firebase-service-account.json`が新しいプロジェクト（`project-management-app-c1f78`）のキーである
- [ ] Secret Managerに`firebase-service-account-dev`が存在する
- [ ] Secret Managerの最新バージョンに正しいFirebaseプロジェクトIDが含まれている
- [ ] Cloud RunサービスがSecret Managerを参照している
- [ ] バックエンドのログで「✓ Firebase Admin SDK initialized」が表示される
- [ ] ブラウザで再ログインした
- [ ] プロジェクト一覧が正常に表示される

## 参考ドキュメント

- [FIX-PROJECT-ERROR.md](../FIX-PROJECT-ERROR.md) - 基本的な修正手順
- [TROUBLESHOOTING-PROJECT-ERROR.md](../TROUBLESHOOTING-PROJECT-ERROR.md) - 詳細なトラブルシューティング
- [docs/firebase-backend-update.md](./firebase-backend-update.md) - Firebaseバックエンド更新手順

