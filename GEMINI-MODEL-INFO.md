# 現在使用中のGeminiモデル情報

## デフォルトモデル

**`gemini-2.5-flash`**

## 使用箇所

以下の2つの機能でGemini APIを使用しています：

1. **構想書の不足部分チェック** (`checkMissingSections`)
   - プロジェクト申請書（PPT/PDF）から抽出したテキストを分析
   - 審査基準に基づいて不足セクションを評価

2. **ビジネスアドバイザーチャット** (`businessAdvisorChat`)
   - 新規事業のアイデア・仮説・MVP計画を評価・改善提案

## モデル設定の確認方法

### 環境変数でモデルを変更可能

環境変数`GEMINI_MODEL_NAME`でモデル名を指定できます。

**現在の設定:**
- 環境変数が設定されていない場合: `gemini-2.5-flash`（デフォルト）
- 環境変数が設定されている場合: その値を使用

### 利用可能なモデル例

- `gemini-2.5-flash` - 高速で低コスト（デフォルト）
- `gemini-2.5-pro` - より高精度
- `gemini-3.0-flash` - Gemini 3.0シリーズ（利用可能な場合）
- `gemini-3.0-pro` - Gemini 3.0シリーズ（利用可能な場合）

## モデルを変更する方法

### 方法1: Cloud Runの環境変数で設定

```bash
# デプロイ時に環境変数を追加
gcloud run services update app-dev \
  --region=asia-northeast1 \
  --project=saito-test-gcp \
  --set-env-vars="GEMINI_MODEL_NAME=gemini-2.5-pro"
```

### 方法2: Cloud Build設定で追加

`cloudbuild.yaml`の`--set-env-vars`に追加：
```yaml
--set-env-vars="...,GEMINI_MODEL_NAME=gemini-2.5-pro"
```

### 方法3: Secret Managerで管理（推奨）

機密情報として管理する場合：
```bash
# Secret Managerに保存
echo -n "gemini-2.5-pro" | gcloud secrets create gemini-model-name-dev \
  --data-file=- \
  --project=saito-test-gcp

# Cloud Runで参照
--set-secrets="...,GEMINI_MODEL_NAME=gemini-model-name-dev:latest"
```

## 現在の設定を確認

バックエンドのログで使用中のモデルを確認できます：

```bash
gcloud run services logs read app-dev \
  --region=asia-northeast1 \
  --project=saito-test-gcp \
  --limit=100 \
  | grep "Using Gemini model"
```

ログに以下のようなメッセージが表示されます：
- `[Check Missing Sections] Using Gemini model: gemini-2.5-flash`
- `[Business Advisor Chat] Using Gemini model: gemini-2.5-flash`

## 使用パッケージ

- **デフォルト**: `@google/generative-ai`（安定版）
- **オプション**: `@google/genai`（Gemini 3.0対応、環境変数`GEMINI_USE_NEW_PACKAGE=true`で有効化）

