# Gemini API設定ガイド

このドキュメントでは、GCPでGemini APIを使用するために必要な設定手順を説明します。

## 前提条件

- GCPプロジェクトが作成されていること
- `gcloud` CLIがインストール・設定されていること
- プロジェクトID: `saito-test-gcp`（またはご自身のプロジェクトID）

## 1. Gemini APIの有効化

まず、Gemini APIを有効化する必要があります。

```bash
# Gemini APIを有効化
gcloud services enable generativelanguage.googleapis.com --project=saito-test-gcp
```

または、GCPコンソールから：
1. [APIとサービス] > [ライブラリ]に移動
2. "Generative Language API"を検索
3. [有効にする]をクリック

## 2. Gemini APIキーの取得

### 方法1: Google AI Studioから取得（推奨）

1. [Google AI Studio](https://makersuite.google.com/app/apikey)にアクセス
2. [Create API Key]をクリック
3. プロジェクトを選択（または新規作成）
4. APIキーをコピー

### 方法2: GCPコンソールから取得

1. [APIとサービス] > [認証情報]に移動
2. [+ 認証情報を作成] > [APIキー]を選択
3. APIキーをコピー

## 3. Secret Managerにシークレットを作成

各環境（dev, staging, production）用にSecret Managerにシークレットを作成します。

### Dev環境

```bash
# Gemini APIキーをSecret Managerに保存
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create gemini-api-key-dev \
  --data-file=- \
  --replication-policy="automatic" \
  --project=saito-test-gcp

# または既存のシークレットを更新
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets versions add gemini-api-key-dev \
  --data-file=- \
  --project=saito-test-gcp
```

### Staging環境

```bash
# Staging環境用のシークレットを作成（必要に応じて）
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create gemini-api-key-staging \
  --data-file=- \
  --replication-policy="automatic" \
  --project=saito-test-gcp
```

### Production環境

```bash
# Production環境用のシークレットを作成（必要に応じて）
echo -n "YOUR_GEMINI_API_KEY" | gcloud secrets create gemini-api-key-prod \
  --data-file=- \
  --replication-policy="automatic" \
  --project=saito-test-gcp
```

**注意**: 現在のCloud Build設定では、すべての環境で`gemini-api-key-dev:latest`を参照しています。環境ごとに異なるAPIキーを使用する場合は、Cloud Build設定を更新してください。

## 4. Cloud Runサービスアカウントに権限を付与

Cloud RunサービスアカウントがSecret Managerからシークレットを読み取れるように権限を付与します。

### Dev環境

```bash
# Cloud Run DevサービスアカウントにSecret Managerへのアクセス権限を付与
gcloud secrets add-iam-policy-binding gemini-api-key-dev \
  --member="serviceAccount:cloud-run-dev@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=saito-test-gcp
```

### Staging環境

```bash
# Cloud Run StagingサービスアカウントにSecret Managerへのアクセス権限を付与
gcloud secrets add-iam-policy-binding gemini-api-key-dev \
  --member="serviceAccount:cloud-run-staging@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=saito-test-gcp
```

### Production環境

```bash
# Cloud Run ProductionサービスアカウントにSecret Managerへのアクセス権限を付与
gcloud secrets add-iam-policy-binding gemini-api-key-dev \
  --member="serviceAccount:cloud-run-prod@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor" \
  --project=saito-test-gcp
```

## 5. 設定の確認

### Secret Managerの確認

```bash
# シークレットが作成されているか確認
gcloud secrets list --project=saito-test-gcp | grep gemini

# シークレットのバージョンを確認
gcloud secrets versions list gemini-api-key-dev --project=saito-test-gcp
```

### IAM権限の確認

```bash
# Cloud Runサービスアカウントの権限を確認
gcloud projects get-iam-policy saito-test-gcp \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:cloud-run-dev@saito-test-gcp.iam.gserviceaccount.com" \
  --format="table(bindings.role)"
```

## 6. Cloud Build設定の確認

現在のCloud Build設定では、以下のようにSecret Managerから`GEMINI_API_KEY`を取得しています：

### Dev環境 (`cloudbuild.yaml`)

```yaml
--set-secrets=GEMINI_API_KEY=gemini-api-key-dev:latest
```

### Staging環境 (`cloudbuild-staging.yaml`)

```yaml
--set-secrets=GEMINI_API_KEY=gemini-api-key-dev:latest
```

### Production環境 (`cloudbuild-prod.yaml`)

```yaml
--set-secrets=GEMINI_API_KEY=gemini-api-key-dev:latest
```

## 7. アプリケーションコードでの使用

アプリケーションコードでは、環境変数`GEMINI_API_KEY`からAPIキーを取得します：

```javascript
// app/backend/src/utils/gemini.js
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY environment variable is not set');
}
genAI = new GoogleGenerativeAI(apiKey);
```

## 8. ローカル開発環境での設定

ローカル開発環境では、`.env`ファイルにAPIキーを設定します：

```bash
# .env
GEMINI_API_KEY=your-api-key-here
```

**注意**: `.env`ファイルはGitにコミットしないでください（`.gitignore`に含まれています）。

## トラブルシューティング

### エラー: "GEMINI_API_KEY environment variable is not set"

- Secret Managerにシークレットが作成されているか確認
- Cloud Runサービスアカウントに`roles/secretmanager.secretAccessor`権限が付与されているか確認
- Cloud Build設定で`--set-secrets`が正しく指定されているか確認

### エラー: "models/gemini-1.5-pro is not found"

- モデル名を`gemini-1.5-flash`に変更（既に修正済み）
- Gemini APIが有効化されているか確認

### エラー: "Permission denied"

- Cloud RunサービスアカウントにSecret Managerへのアクセス権限を付与
- プロジェクトIDが正しいか確認

## 参考リンク

- [Gemini API ドキュメント](https://ai.google.dev/docs)
- [Secret Manager ドキュメント](https://cloud.google.com/secret-manager/docs)
- [Cloud Run 環境変数とシークレット](https://cloud.google.com/run/docs/configuring/secrets)

