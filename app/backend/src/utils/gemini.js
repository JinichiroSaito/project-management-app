// Gemini 3.0対応: 現在は@google/generative-aiを使用（@google/genaiは将来対応予定）
// 環境変数GEMINI_USE_NEW_PACKAGE=trueで@google/genaiを有効化可能
let GoogleGenAI, GoogleGenerativeAI;
const useNewPackageEnv = process.env.GEMINI_USE_NEW_PACKAGE === 'true';

if (useNewPackageEnv) {
  try {
    // 新しいパッケージを試す
    const genaiModule = require('@google/genai');
    GoogleGenAI = genaiModule.GoogleGenAI;
    if (!GoogleGenAI || typeof GoogleGenAI !== 'function') {
      console.warn('[Gemini] @google/genai GoogleGenAI not found, using @google/generative-ai');
      GoogleGenAI = null;
    }
  } catch (e) {
    console.warn('[Gemini] @google/genai not available, using @google/generative-ai:', e.message);
    GoogleGenAI = null;
  }
}

// 既存のパッケージを使用（デフォルト）
const generativeAiModule = require('@google/generative-ai');
GoogleGenerativeAI = generativeAiModule.GoogleGenerativeAI;

const { Storage } = require('@google-cloud/storage');
const pdfParse = require('pdf-parse');
const JSZip = require('jszip');
const { DOMParser } = require('@xmldom/xmldom');

// Gemini API初期化
let genAI;
let useNewPackage = false;

function initializeGemini() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    
    // 環境変数で新しいパッケージの使用が有効化されている場合のみ試す
    if (useNewPackageEnv && GoogleGenAI) {
      try {
        genAI = new GoogleGenAI({ apiKey });
        useNewPackage = true;
        console.log('✓ Gemini API initialized with @google/genai (Gemini 3.0 compatible)');
      } catch (e) {
        console.warn('[Gemini] Failed to initialize @google/genai, falling back to @google/generative-ai:', e.message);
        genAI = new GoogleGenerativeAI(apiKey);
        useNewPackage = false;
        console.log('✓ Gemini API initialized with @google/generative-ai');
      }
    } else {
      // デフォルト: 既存のパッケージを使用（安定版）
      genAI = new GoogleGenerativeAI(apiKey);
      useNewPackage = false;
      console.log('✓ Gemini API initialized with @google/generative-ai');
    }
  }
  return genAI;
}

// Cloud Storageからファイルをダウンロード
async function downloadFileFromStorage(fileUrl) {
  try {
    const storage = new Storage({
      projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.PROJECT_ID || 'saito-test-gcp'
    });
    
    // 署名付きURLの場合、クエリパラメータを除去してからパース
    // または、直接HTTPリクエストでダウンロード
    let urlToParse = fileUrl.split('?')[0]; // クエリパラメータを除去
    
    // URLからバケット名とファイルパスを抽出
    // https://storage.googleapis.com/bucket-name/path/to/file の形式
    const urlMatch = urlToParse.match(/https:\/\/storage\.googleapis\.com\/([^\/]+)\/(.+)/);
    
    if (urlMatch) {
      const bucketName = urlMatch[1];
      const fileName = urlMatch[2];
      
      const bucket = storage.bucket(bucketName);
      const file = bucket.file(fileName);
      
      const [buffer] = await file.download();
      return buffer;
    } else {
      // 署名付きURLの場合は、直接HTTPリクエストでダウンロード
      const https = require('https');
      return new Promise((resolve, reject) => {
        https.get(fileUrl, (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        }).on('error', reject);
      });
    }
  } catch (error) {
    console.error('Error downloading file from Storage:', error);
    throw error;
  }
}

// PDFからテキストを抽出
async function extractTextFromPDF(buffer) {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw error;
  }
}

// PPTXファイルからテキストを抽出（ZIPとして展開してXMLを読み取る）
async function extractTextFromPPTX(buffer) {
  try {
    console.log('[Extract PPTX] Loading ZIP file...');
    const zip = await JSZip.loadAsync(buffer);
    const textParts = [];
    
    // スライドファイルを取得（ppt/slides/slide*.xml）
    const slideFiles = Object.keys(zip.files).filter(name => 
      name.startsWith('ppt/slides/slide') && name.endsWith('.xml')
    );
    
    console.log(`[Extract PPTX] Found ${slideFiles.length} slide files`);
    
    if (slideFiles.length === 0) {
      // スライドファイルが見つからない場合、他の場所を探す
      const allXmlFiles = Object.keys(zip.files).filter(name => name.endsWith('.xml'));
      console.log(`[Extract PPTX] No slide files found. Total XML files: ${allXmlFiles.length}`);
      
      // スライドマスターやレイアウトからもテキストを抽出を試みる
      for (const xmlFile of allXmlFiles) {
        try {
          const xmlContent = await zip.files[xmlFile].async('string');
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');
          
          // 名前空間を考慮してテキストノードを取得
          // 'a:t' は名前空間 'http://schemas.openxmlformats.org/drawingml/2006/main' のテキスト要素
          const textNodes = xmlDoc.getElementsByTagName('a:t');
          for (let i = 0; i < textNodes.length; i++) {
            const text = textNodes[i].textContent;
            if (text && text.trim()) {
              textParts.push(text.trim());
            }
          }
        } catch (error) {
          console.warn(`[Extract PPTX] Error processing ${xmlFile}:`, error.message);
        }
      }
    } else {
      // 各スライドからテキストを抽出
      for (const slideFile of slideFiles) {
        try {
          const slideContent = await zip.files[slideFile].async('string');
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(slideContent, 'text/xml');
          
          // すべてのテキストノードを取得（名前空間 'a' は 'http://schemas.openxmlformats.org/drawingml/2006/main'）
          const textNodes = xmlDoc.getElementsByTagName('a:t');
          for (let i = 0; i < textNodes.length; i++) {
            const text = textNodes[i].textContent;
            if (text && text.trim()) {
              textParts.push(text.trim());
            }
          }
        } catch (error) {
          console.warn(`[Extract PPTX] Error processing slide ${slideFile}:`, error.message);
          // スライドの処理に失敗しても続行
        }
      }
    }
    
    if (textParts.length === 0) {
      throw new Error('PPTXファイルからテキストを抽出できませんでした。ファイルが空か、テキストが含まれていない可能性があります。');
    }
    
    const extractedText = textParts.join('\n');
    console.log(`[Extract PPTX] Successfully extracted ${textParts.length} text parts, total length: ${extractedText.length} characters`);
    return extractedText;
  } catch (error) {
    console.error('[Extract PPTX] Error extracting text from PPTX:', error);
    throw new Error(`PPTXファイルのテキスト抽出に失敗しました: ${error.message}`);
  }
}

// PPT/PDFからテキストを抽出
async function extractTextFromFile(fileUrl, fileType) {
  try {
    // ファイルをダウンロード
    const buffer = await downloadFileFromStorage(fileUrl);
    
    let extractedText = '';
    
    // ファイルURLからクエリパラメータを除去して拡張子を判定
    const fileUrlWithoutQuery = fileUrl.split('?')[0].toLowerCase();
    const fileExtension = fileUrlWithoutQuery.substring(fileUrlWithoutQuery.lastIndexOf('.'));
    
    // ファイル形式を判定（拡張子とMIMEタイプの両方を確認）
    const isPDF = fileType === 'application/pdf' || fileExtension === '.pdf';
    const isPPTX = fileExtension === '.pptx' || fileExtension === '.pptm' || 
                   fileType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
                   fileType === 'application/vnd.ms-powerpoint.presentation.macroEnabled.12';
    const isPPT = fileExtension === '.ppt' || fileType === 'application/vnd.ms-powerpoint';
    
    if (isPDF) {
      // PDFの場合はpdf-parseを使用
      console.log('[Extract Text] Processing PDF file');
      extractedText = await extractTextFromPDF(buffer);
    } else if (isPPTX) {
      // PPTXファイルの場合はZIPとして展開してテキストを抽出
      console.log('[Extract Text] Processing PPTX file');
      extractedText = await extractTextFromPPTX(buffer);
    } else if (isPPT) {
      // 古いPPT形式はサポートされていない
      throw new Error('古いPPT形式（.ppt）はサポートされていません。PPTX形式に変換するか、PDFファイルに変換してからアップロードしてください。');
    } else {
      // ファイル名からも判定を試みる（フォールバック）
      const fileName = fileUrlWithoutQuery.substring(fileUrlWithoutQuery.lastIndexOf('/') + 1);
      if (fileName.endsWith('.pptx') || fileName.endsWith('.pptm')) {
        console.log('[Extract Text] Processing PPTX file (detected from filename)');
        extractedText = await extractTextFromPPTX(buffer);
      } else if (fileName.endsWith('.pdf')) {
        console.log('[Extract Text] Processing PDF file (detected from filename)');
        extractedText = await extractTextFromPDF(buffer);
      } else {
        throw new Error(`このファイル形式（${fileExtension || '不明'}）はサポートされていません。PDFまたはPPTXファイルをアップロードしてください。`);
      }
    }
    
    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error('ファイルからテキストを抽出できませんでした。ファイルが空か、テキストが含まれていない可能性があります。');
    }
    
    console.log(`[Extract Text] Successfully extracted ${extractedText.length} characters`);
    return extractedText;
  } catch (error) {
    console.error('[Extract Text] Error extracting text from file:', error);
    // より詳細なエラーメッセージを提供
    if (error.message.includes('PPTX') || error.message.includes('PPT')) {
      throw new Error(`PPTXファイルのテキスト抽出に失敗しました: ${error.message}`);
    } else if (error.message.includes('PDF')) {
      throw new Error(`PDFファイルのテキスト抽出に失敗しました: ${error.message}`);
    } else {
      throw new Error(`ファイルのテキスト抽出に失敗しました: ${error.message}`);
    }
  }
}

// 構想書の不足部分をチェック
async function checkMissingSections(extractedText) {
  try {
    initializeGemini();
    
    // 環境変数でモデル名を指定可能
    // デフォルト: gemini-2.5-flash（安定版）
    // Gemini 3.0モデル（gemini-3.0-pro, gemini-3.0-flashなど）は@google/generative-aiでも利用可能な場合があります
    const modelName = process.env.GEMINI_MODEL_NAME || 'gemini-2.5-flash';
    console.log(`[Check Missing Sections] Using Gemini model: ${modelName} (package: ${useNewPackage ? '@google/genai' : '@google/generative-ai'})`);
    
    // 新しいパッケージの場合は直接genAI.models.generateContentを使用
    let useDirectAPI = false;
    if (useNewPackage && genAI.models && typeof genAI.models.generateContent === 'function') {
      useDirectAPI = true;
      console.log('[Check Missing Sections] Using direct API: genAI.models.generateContent');
    }
    
    const prompt = `以下の新規事業構想書（MVP予算承認申請書）のテキストを分析し、審査基準（MVP予算承認までのチェック項目）に基づいて評価してください。

## 審査基準（MVP予算承認までのチェック項目）

### 共通ルール

各項目について「Knock-Out 条件」をすべて満たした場合にのみ、次のステップへ進む。

### 1. 解決すべき問題は何か？

事業状況や NBD の存在理由も踏まえ、どのような問題が、どんな状況で発生しており、なぜそれを解決する意義があるのかを明示する。

**Knock-Out 条件**:
- NBD が担うべき問題解決領域であることが明示されている。

### 2. ターゲット顧客は誰か？

問題に巻き込まれているターゲット顧客について、どのような属性・習慣を持ち、どのような問題を抱えているのかを示す。前ステップの PoC で判明した顧客のフィードバックや、顧客が感じていた問題を提示する。

**Knock-Out 条件**:
- 少なくとも 1 つのセグメントまたはターゲットが定義されている。
- 属性だけでなく、「状況・行動・動機」が定義されている。
- 実在する被験者 5 名以上に対し、印象評価を確認済みである。

### 3. 提供価値は何か？

**概要**: ターゲット顧客に対して提供する価値は何かを明示する。その価値によって、顧客のどの問題がどのように解決されるのかを示す。

**Knock-Out 条件**:
- 価値仮説が次の形式で明文化されている：「X な状況で Y を可能にし、Z を減らす」
- 比較基準（現状・代替手段）が明記されている。

### 4. プロトタイプは何か？

**概要**: 顧客が「触れる」プロトタイプ（またはプレトタイプ）を準備し、どのように価値を提供するのかを実演できる状態にする。

**Knock-Out 条件**:
- 少なくとも簡易的なモックアップまたはビジュアルイメージが存在する。
- そのプロトタイプから、利用イメージが具体的に想像できる。

### 5. 想定ビジネスモデルは？

**概要**: 価値を提供することで、どのように収益やメリットを得るのかを明示する。

**Knock-Out 条件**:
- 主要な売上・収益または便益の方法が 1 つ特定されている（例：サブスクリプション、手数料モデル、コスト削減額による貢献利益 など）
- 収益の粗い計算式が明文化されている（例：ARPU、1件あたり便益 など）
- 支払主体が特定されている（例：ユーザー、企業、社内部門 など）

### 6. 市場規模はどれくらいか？

**概要**: 参入を想定している市場の状況・規模・成長性を示し、将来どれくらいの売上規模を見込めるかを明示する。

**Knock-Out 条件**:
- SAM（Serviceable Available Market）が 100 億円以上の市場規模である。
- SAM の算出根拠（対象数・利用頻度・単価または便益）が明記されている。

### 7. 競合はどこか？

**概要**: 想定される競合とその特徴を示し、どのような差別化アプローチ（ポジショニング）をとるのかを明示する。

**Knock-Out 条件**:
- 直接 / 間接 / 代替の競合が、少なくとも 1 例以上挙げられている。
- 代表的な競合との差別化仮説が、2 軸（例：価格 × 体験価値など）で可視化されている。

### 8. MVP の検証方法と目標数値は？

**概要**: MVP の検証方法と、検証したい指標および目標数値を明示する。

**Knock-Out 条件**:
- 検証方法が明示されている。
- 以下 3 種類の指標について、それぞれ 1 つ以上の目標数値が設定されている：
  - **行動指標**（例：主要タスク完了率 40%以上、48時間以内の再訪率 25%以上）
  - **品質指標**（例：クレーム発生率 ≤ X%、致命的不具合 0 件、プライバシー事故 0 件）
  - **主観指標**（例：NPS、PMF サーベイ、CES、UMUX-Lite など）

### 9. MVP 検証のロードマップは？

**概要**: 何を検証するために、いつから誰と組んで、どのような進め方で実施するのか、また全体でどれくらいの期間がかかるのかを明示する。

**Knock-Out 条件**:
- MVP 検証の期間とフェーズ区切りが明記されている（例：設計 → 実装 → 計測 → 学習）
- 被験者の募集・確保計画が具体的に記載されている。

### 10. いくらかかるのか？

**概要**: MVP を実施するうえでの想定コストを明示する。

**Knock-Out 条件**:
- MVP の開発費・運用費・検証費など、主なコストの内訳が明示されている。
- 想定を超過した場合の対応（スコープ縮小や中止などの縮小計画）が明記されている。

### 11. 実施におけるリスクは？

**概要**: MVP 検証を実施するうえで想定されるリスクを整理し、とくにデータ、セキュリティ、コンプライアンス、技術的リスクなどを明示する。

**Knock-Out 条件**:
- 以下の領域におけるリスクが網羅的に明示されている：
  - セキュリティ / プライバシー
  - 法務 / コンプライアンス
  - 技術 / 稼働（システム障害など）
  - レピュテーション（評判リスク）
- 各リスクに対して「回避・低減・受容」のいずれかの方針が明示されており、その内容が妥当である。

## 評価結果の出力形式

以下のJSON形式で回答してください。各セクションについて、Knock-Out条件をすべて満たしているかどうかを評価してください。

{
  "missing_sections": [
    {
      "section_number": "1",
      "section_name": "解決すべき問題",
      "is_missing": false,
      "is_incomplete": true,
      "reason": "NBDが担うべき問題解決領域であることは明示されているが、問題の状況や解決の意義についての説明が不足しています",
      "checkpoints": [
        {
          "point": "NBDが担うべき問題解決領域であることが明示されている",
          "status": "ok",
          "note": "自部署のミッションに合致していることが確認できます"
        },
        {
          "point": "問題の状況や解決の意義の説明",
          "status": "incomplete",
          "note": "問題の状況や解決の意義についての説明が不足しています"
        }
      ]
    }
  ],
  "completeness_score": 65,
  "category_scores": {
    "問題設定": 70,
    "顧客理解": 60,
    "価値提供": 75,
    "プロトタイプ": 50,
    "ビジネスモデル": 70,
    "市場分析": 65,
    "競合分析": 60,
    "検証計画": 55,
    "ロードマップ": 50,
    "予算計画": 70,
    "リスク管理": 60
  },
  "recommendations": [
    "ターゲット顧客について、属性だけでなく「状況・行動・動機」の観点で定義してください",
    "実在する被験者5名以上に対する印象評価の結果を追加してください",
    "価値仮説を「Xな状況でYを可能にし、Zを減らす」という形式で明文化してください",
    "SAM（Serviceable Available Market）が100億円以上であることを数値で示してください",
    "MVP検証の目標指標を、行動指標・品質指標・主観指標の各カテゴリで1つ以上設定してください",
    "各リスクに対して「回避・低減・受容」のいずれかの方針を明示してください"
  ],
  "strengths": [
    "問題設定が明確で、解決の意義がよく説明されています",
    "収益モデルが具体的で、算出式も明文化されています"
  ],
  "critical_issues": [
    "プロトタイプの準備状況が不明確です。最低限、デザイン画や画面イメージを追加してください",
    "MVP検証のロードマップが具体的でないため、スケジュールとフェーズの区切りを明確にしてください"
  ]
}

テキスト:
${extractedText}`;

    console.log('[Check Missing Sections] Sending request to Gemini API...');
    let result, responseText;
    
    if (useDirectAPI) {
      // @google/genaiの直接APIを使用（提供されたコード例に基づく）
      try {
        console.log(`[Check Missing Sections] Calling genAI.models.generateContent with model: ${modelName}`);
        result = await genAI.models.generateContent({
          model: modelName,
          contents: [prompt]
        });
        
        // レスポンスの形式を確認
        console.log('[Check Missing Sections] Response received, type:', typeof result);
        console.log('[Check Missing Sections] Response keys:', Object.keys(result || {}));
        
        // レスポンスからテキストを抽出
        if (result && result.response) {
          if (typeof result.response.text === 'function') {
            responseText = result.response.text();
          } else if (typeof result.response === 'string') {
            responseText = result.response;
          } else if (result.response.text) {
            responseText = result.response.text;
          }
        } else if (result && typeof result.text === 'function') {
          responseText = await result.text();
        } else if (result && typeof result === 'string') {
          responseText = result;
        } else if (result && result.text) {
          responseText = result.text;
        } else {
          throw new Error('Unexpected response format from @google/genai');
        }
        
        console.log(`[Check Missing Sections] Extracted text length: ${responseText?.length || 0}`);
      } catch (apiError) {
        console.error('[Check Missing Sections] Error with @google/genai API:', apiError.message);
        console.error('[Check Missing Sections] Error stack:', apiError.stack);
        // フォールバック: 古いパッケージに戻す
        console.log('[Check Missing Sections] Falling back to @google/generative-ai');
        useNewPackage = false;
        useDirectAPI = false;
        const generativeAiModule = require('@google/generative-ai');
        const GoogleGenerativeAI = generativeAiModule.GoogleGenerativeAI;
        const apiKey = process.env.GEMINI_API_KEY;
        genAI = new GoogleGenerativeAI(apiKey);
        const fallbackModel = 'gemini-2.5-flash';
        const model = genAI.getGenerativeModel({ model: fallbackModel });
        result = await model.generateContent(prompt);
        const response = await result.response;
        responseText = response.text();
      }
    } else {
      // 既存のパッケージの使用方法
      const model = genAI.getGenerativeModel({ model: modelName });
      result = await model.generateContent(prompt);
      const response = await result.response;
      responseText = response.text();
    }
    
    console.log(`[Check Missing Sections] Received response (${responseText.length} characters)`);
    
    // JSONを抽出（マークダウンコードブロックから）
    let jsonText = responseText;
    const jsonMatch = responseText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    } else {
      // JSONコードブロックがない場合、直接JSONを探す
      const directJsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (directJsonMatch) {
        jsonText = directJsonMatch[0];
      }
    }
    
    console.log('[Check Missing Sections] Parsing JSON response...');
    const analysisResult = JSON.parse(jsonText);
    console.log('[Check Missing Sections] Analysis completed successfully');
    return analysisResult;
  } catch (error) {
    console.error('[Check Missing Sections] Error checking missing sections:', error);
    console.error('[Check Missing Sections] Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    // エラーを再スローして、呼び出し元で適切に処理できるようにする
    throw new Error(`Gemini API error: ${error.message}`);
  }
}

// ビジネスアドバイザーチャット
async function businessAdvisorChat(message, conversationHistory = [], userDocumentText = null) {
  try {
    initializeGemini();
    
    const modelName = process.env.GEMINI_MODEL_NAME || 'gemini-2.5-flash';
    console.log(`[Business Advisor Chat] Using Gemini model: ${modelName}`);
    console.log(`[Business Advisor Chat] User document text length: ${userDocumentText ? userDocumentText.length : 0}`);
    
    // システムプロンプト
    const systemPrompt = `新規事業開発担当の皆様、お疲れ様です。Asahi Group Holdingsの事業創出プロセス専門アドバイザーです。

新規事業のアイデア・仮説・MVP計画を、NBDのミッション・目標と事業創出プロセス（ミッション → 調査・分析 → 発想 → 仮説 → 印象評価 → MVP 以降）の観点から構造的に評価・改善提案することが目的です。

**重要な注意事項**:
- 一度に複数の質問をすることは避け、一つずつ順番に質問してください
- ユーザーが一度に複数の質問をした場合は、最も優先度の高い質問から順に一つずつ回答してください
- 回答は簡潔で分かりやすく、次の質問に進む前に現在の質問に対する回答を完了させてください

## 参照すべき前提（NBDの共通ルール）

### NBDのミッションと目標
NBDは、グループ横断のデジタル・データ活用により、
- コスト構造の改善（生産・物流の最適化、遊休資産活用）
- 売上源の拡大（需要予測、店舗DX、ロイヤルティ施策）
- M&A・ブランド強化
を通じて、事業価値を創出する役割を担う。目標は、2030年までに累積売上利益300億円規模の貢献を目指すこと。

### 事業創出プロセス（フェーズ）
NBDの事業創出プロセスは、おおよそ次のステップで進む。
1. ミッション設計
2. 調査・分析（市場・技術・内部資産の把握）
3. 発想（特殊情報 × 一般情報からアイデア創出）
4. 仮説（ターゲット・市場規模・業界構造・Real/Win/Worth）
5. 印象評価（被験者への検証・フィードバック）
その後：MVP開発 → MVP検証 → 本格事業化

各ステップには**ゲート（合否判断）**があり、「次のフェーズに進むだけの根拠があるか」で判断する。

### 仮説フェーズの評価軸
- **Real（実在性・現実性）**: マクロ環境変化・技術・法規制等を踏まえて、本当に需要が生まれそうか
- **Win（勝ち筋）**: NBDが担うべき領域と整合しているか、差別化ポイントが明確か（最小プロダクトでも尖りがあるか）
- **Worth（規模・旨み）**: SAMが100億円以上になり得るか、利益の出るプレーヤーが既に存在する等、構造的に「儲かる市場」か

### 市場規模の整理
- **TAM**: 理論上取りうる最大市場
- **SAM**: 提供条件を加味した「到達可能な市場」
- **SOM**: 3〜5年で現実的に獲得し得る市場

## 出力フォーマット

あなたの回答は、次の構成で返してください。

1. **要約**（30〜80字程度）
   このプロジェクトのねらいを、一文で短くまとめる。

2. **フェーズ別チェック**（発想 / 仮説 / 印象評価）
   各フェーズについて、できている点（◎ / ○）と弱い点・不足している点（△ / ×）を箇条書きで書く。

3. **Real / Win / Worth 評価**
   - Real：評価（◎ / ○ / △ / ×）とコメント
   - Win：評価（◎ / ○ / △ / ×）とコメント
   - Worth：評価（◎ / ○ / △ / ×）とコメント

4. **市場規模・ビジネスモデルに関するコメント**
   TAM / SAM / SOM の前提が現実的かどうか、収益構造（単価・頻度・ARPUなど）で見落としていそうな点、もう一段精緻にするならどこから手をつけるべきか

5. **顧客価値・提供価値の整理**（VPC観点）
   顧客のジョブ / 問題 / 要望の整理、それに対する提供価値（ペインリリーバー / ゲインクリエイター）の対応関係、「ここをもっと尖らせると良い」という具体的な提案

6. **次にやるべきアクション**（優先度順に3〜5個）
   例：「まずAという仮説の精度を上げるために、Bタイプの顧客5名にインタビューする」

7. **リスクと不確実性の整理**（任意）
   技術・規制・レピュテーション・実行体制などの主なリスク、現時点で取るべき方針（回避 / 低減 / 受容）の提案

8. **MVPに進むかどうかの暫定判断**（任意）
   「現時点の情報だけを前提にした場合」の暫定判断でよいので、「MVP検証に進む / もう一度仮説フェーズで深掘り / そもそもピボット検討」などをコメントする。その根拠を2〜3点挙げる。

## 最初の応答方針

もし入力情報に明らかな欠落がある場合は、いきなり評価せず、まず「優先度の高い不足情報」について**一つずつ**質問してから評価を行ってください。一度に複数の質問をすることは避け、一つずつ順番に質問してください。

入力が十分な場合は、そのまま上記フォーマットに従って評価・提案を行ってください。

**重要な注意**: ユーザーが一度に複数の質問や情報を提供した場合でも、最も優先度の高いものから一つずつ対応してください。一度にすべてに答えるのではなく、一つずつ丁寧に対応することが重要です。`;

    // ユーザーがアップロードしたドキュメントの内容を追加
    let documentContext = '';
    if (userDocumentText && userDocumentText.trim().length > 0) {
      // テキストが長すぎる場合は最初の部分のみ使用（約8000文字まで）
      const maxLength = 8000;
      const truncatedText = userDocumentText.length > maxLength 
        ? userDocumentText.substring(0, maxLength) + '\n\n[以下省略...]'
        : userDocumentText;
      
      documentContext = `\n\n## ユーザーがアップロードした申請書類の内容\n\n以下の内容は、ユーザーがアップロードしたPPT/PDFファイルから抽出されたテキストです。この内容を理解して、質問に答えてください。\n\n---\n${truncatedText}\n---\n\n`;
      console.log('[Business Advisor Chat] Added document context to prompt');
    }

    // 会話履歴を構築
    let conversationContext = '';
    if (conversationHistory && conversationHistory.length > 0) {
      conversationContext = conversationHistory.map(msg => {
        const role = msg.role === 'user' ? 'ユーザー' : 'アドバイザー';
        return `${role}: ${msg.content}`;
      }).join('\n\n') + '\n\n';
    }

    const fullPrompt = `${systemPrompt}${documentContext}\n\n${conversationContext}ユーザー: ${message}\n\nアドバイザー:`;

    let useDirectAPI = false;
    if (useNewPackage && genAI.models && typeof genAI.models.generateContent === 'function') {
      useDirectAPI = true;
    }

    console.log('[Business Advisor Chat] Sending request to Gemini API...');
    let result, responseText;

    if (useDirectAPI) {
      try {
        result = await genAI.models.generateContent({
          model: modelName,
          contents: [fullPrompt]
        });
        
        if (result && result.response) {
          if (typeof result.response.text === 'function') {
            responseText = result.response.text();
          } else if (typeof result.response === 'string') {
            responseText = result.response;
          } else if (result.response.text) {
            responseText = result.response.text;
          }
        } else if (result && typeof result.text === 'function') {
          responseText = await result.text();
        } else if (result && typeof result === 'string') {
          responseText = result;
        } else if (result && result.text) {
          responseText = result.text;
        } else {
          throw new Error('Unexpected response format from @google/genai');
        }
      } catch (apiError) {
        console.error('[Business Advisor Chat] Error with @google/genai API:', apiError.message);
        throw apiError;
      }
    } else {
      const model = genAI.getGenerativeModel({ model: modelName });
      result = await model.generateContent(fullPrompt);
      const response = await result.response;
      responseText = response.text();
    }

    console.log('[Business Advisor Chat] Response received');
    return responseText;
  } catch (error) {
    console.error('[Business Advisor Chat] Error:', error);
    throw error;
  }
}

module.exports = {
  initializeGemini,
  extractTextFromFile,
  checkMissingSections,
  businessAdvisorChat
};

