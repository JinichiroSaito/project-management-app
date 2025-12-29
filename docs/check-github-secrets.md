# GitHub Secrets確認ガイド

## GCP_SA_KEYの確認方法

### 方法1: GitHub Web UIで確認（推奨）

1. GitHubリポジトリにアクセス:
   ```
   https://github.com/JinichiroSaito/project-management-app
   ```

2. リポジトリの設定ページに移動:
   - リポジトリページの上部メニューから「Settings」をクリック
   - 左サイドバーから「Secrets and variables」>「Actions」を選択

3. Secretsの一覧を確認:
   - `GCP_SA_KEY`が一覧に表示されていれば設定済みです
   - 表示されていない場合は、設定が必要です

### 方法2: GitHub Actionsの実行ログで確認

1. GitHubリポジトリの「Actions」タブに移動
2. 最近のワークフロー実行を確認
3. ログで以下のエラーが出ていないか確認:
   - `Error: Missing required secret: GCP_SA_KEY`
   - `Error: Invalid credentials`
   - `Error: Authentication failed`

### 方法3: ワークフローを手動実行して確認

1. GitHubリポジトリの「Actions」タブに移動
2. 「Deploy Backend to Dev」または「Deploy Frontend to Dev」を選択
3. 「Run workflow」ボタンをクリック
4. 実行ログで認証が成功しているか確認

## GCP_SA_KEYの設定方法

### ステップ1: サービスアカウントキーファイルの確認

ローカルに`github-actions-key.json`ファイルが存在することを確認:

```bash
ls -la github-actions-key.json
```

### ステップ2: キーファイルの内容をコピー

```bash
# ファイルの内容を表示（JSON形式）
cat github-actions-key.json
```

**重要**: このファイルの内容全体をコピーしてください（`{`から`}`まで）

### ステップ3: GitHub Secretsに設定

1. GitHubリポジトリの設定ページに移動:
   ```
   https://github.com/JinichiroSaito/project-management-app/settings/secrets/actions
   ```

2. 「New repository secret」をクリック

3. 以下の情報を入力:
   - **Name**: `GCP_SA_KEY`
   - **Secret**: `github-actions-key.json`の内容全体を貼り付け

4. 「Add secret」をクリック

### ステップ4: 設定の確認

ワークフローを手動実行して、認証が成功することを確認:

1. 「Actions」タブに移動
2. 「Deploy Backend to Dev」を選択
3. 「Run workflow」をクリック
4. ログで「Authenticate to Google Cloud」ステップが成功することを確認

## トラブルシューティング

### エラー: "Missing required secret: GCP_SA_KEY"

**原因**: GitHub Secretsに`GCP_SA_KEY`が設定されていない

**解決方法**: 上記の「GCP_SA_KEYの設定方法」を参照して設定してください

### エラー: "Invalid credentials" または "Authentication failed"

**原因**: 
- サービスアカウントキーが無効
- キーファイルの内容が正しくコピーされていない
- サービスアカウントの権限が不足している

**解決方法**:

1. サービスアカウントキーを再生成:
   ```bash
   gcloud iam service-accounts keys create github-actions-key.json \
     --iam-account=github-actions@saito-test-gcp.iam.gserviceaccount.com \
     --project=saito-test-gcp
   ```

2. GitHub Secretsの`GCP_SA_KEY`を更新（新しいキーの内容で）

3. サービスアカウントの権限を確認:
   ```bash
   gcloud projects get-iam-policy saito-test-gcp \
     --flatten="bindings[].members" \
     --filter="bindings.members:serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
     --format="table(bindings.role)"
   ```

   必要な権限:
   - `roles/run.admin` - Cloud Runの管理
   - `roles/artifactregistry.writer` - Artifact Registryへの書き込み
   - `roles/iam.serviceAccountUser` - サービスアカウントの使用

### エラー: "Permission denied" または "Access denied"

**原因**: サービスアカウントに必要な権限が付与されていない

**解決方法**: 必要な権限を付与:

```bash
# Cloud Run管理権限
gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/run.admin"

# Artifact Registry書き込み権限
gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

# Artifact Registry管理権限
gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.admin"

# サービスアカウント使用権限
gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"
```

## 確認用チェックリスト

- [ ] `github-actions-key.json`ファイルが存在する
- [ ] GitHub Secretsに`GCP_SA_KEY`が設定されている
- [ ] サービスアカウントに必要な権限が付与されている
- [ ] ワークフローの実行ログで認証が成功している
- [ ] デプロイが正常に完了している

## 参考リンク

- [GitHub Secrets ドキュメント](https://docs.github.com/en/actions/security-guides/encrypted-secrets)
- [Google Cloud Service Accounts](https://cloud.google.com/iam/docs/service-accounts)
- [GitHub Actions for Google Cloud](https://github.com/google-github-actions/auth)

