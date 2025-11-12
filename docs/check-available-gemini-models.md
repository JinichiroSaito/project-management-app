# GCPで利用可能なGeminiモデルを確認する方法

## 方法1: Google AI Studioで確認（推奨）

1. [Google AI Studio](https://makersuite.google.com/app/apikey)にアクセス
2. 左側のメニューから「モデル」を選択
3. 利用可能なモデルの一覧が表示されます

## 方法2: Gemini APIを使用して確認

### ローカル環境で確認

```bash
# Node.jsスクリプトを作成
cat > check-models.js << 'EOF'
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function listModels() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY environment variable is not set');
    process.exit(1);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  
  try {
    // 利用可能なモデルをリストアップ
    const models = await genAI.listModels();
    console.log('利用可能なモデル:');
    models.forEach(model => {
      console.log(`- ${model.name}`);
      console.log(`  サポートされているメソッド: ${model.supportedGenerationMethods.join(', ')}`);
    });
  } catch (error) {
    console.error('エラー:', error.message);
  }
}

listModels();
EOF

# スクリプトを実行
GEMINI_API_KEY=your-api-key node check-models.js
```

### Cloud Runで確認（一時的なエンドポイント）

バックエンドに一時的なエンドポイントを追加：

```javascript
// app/backend/src/index.js に追加（一時的）
app.get('/api/debug/list-models', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    const models = await genAI.listModels();
    const modelList = models.map(model => ({
      name: model.name,
      displayName: model.displayName,
      supportedMethods: model.supportedGenerationMethods
    }));
    
    res.json({ models: modelList });
  } catch (error) {
    return handleError(res, error, 'List Models');
  }
});
```

## 方法3: REST APIで直接確認

```bash
# APIキーを使用してREST APIで確認
curl "https://generativelanguage.googleapis.com/v1beta/models?key=YOUR_API_KEY"

# または、認証トークンを使用
curl -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://generativelanguage.googleapis.com/v1beta/models"
```

## 方法4: gcloud CLIで確認

```bash
# Vertex AI APIを使用（別の認証方法が必要な場合）
gcloud ai models list --region=us-central1 --project=saito-test-gcp
```

## 一般的に利用可能なモデル名

### v1 API（安定版）
- `gemini-pro` - 一般的な用途向け
- `gemini-pro-vision` - 画像処理対応

### v1beta API（ベータ版）
- `gemini-1.5-flash` - 高速処理向け
- `gemini-1.5-pro` - 高精度処理向け
- `gemini-1.5-flash-latest` - 最新のFlashモデル
- `gemini-1.5-pro-latest` - 最新のProモデル

## 推奨される確認方法

1. **Google AI Studioで確認**（最も簡単）
2. **REST APIで確認**（最も確実）
3. **コードで確認**（プログラムから利用可能）

## 注意事項

- APIバージョン（v1 vs v1beta）によって利用可能なモデルが異なる場合があります
- `@google/generative-ai`パッケージのバージョンによって、デフォルトのAPIバージョンが異なる場合があります
- 最新のモデル名は公式ドキュメントで確認してください

## 参考リンク

- [Gemini API モデル一覧](https://ai.google.dev/models/gemini)
- [Google AI Studio](https://makersuite.google.com/app/apikey)
- [Gemini API ドキュメント](https://ai.google.dev/docs)

