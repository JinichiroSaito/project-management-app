const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Storage } = require('@google-cloud/storage');
const pdfParse = require('pdf-parse');

// Gemini API初期化
let genAI;

function initializeGemini() {
  if (!genAI) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is not set');
    }
    genAI = new GoogleGenerativeAI(apiKey);
    console.log('✓ Gemini API initialized');
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

// Gemini APIを使用してPPT/PDFからテキストを抽出
async function extractTextFromFile(fileUrl, fileType) {
  try {
    initializeGemini();
    
    // ファイルをダウンロード
    const buffer = await downloadFileFromStorage(fileUrl);
    
    let extractedText = '';
    
    if (fileType === 'application/pdf' || fileUrl.toLowerCase().endsWith('.pdf')) {
      // PDFの場合はpdf-parseを使用
      extractedText = await extractTextFromPDF(buffer);
    } else {
      // PPTの場合はGemini APIを使用
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      // ファイルをBase64エンコード
      const base64Data = buffer.toString('base64');
      
      // MIMEタイプを決定
      let mimeType = fileType;
      if (!mimeType || mimeType === 'application/octet-stream') {
        // ファイルURLから拡張子を判定
        if (fileUrl.toLowerCase().endsWith('.pptx')) {
          mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        } else if (fileUrl.toLowerCase().endsWith('.ppt')) {
          mimeType = 'application/vnd.ms-powerpoint';
        } else if (fileUrl.toLowerCase().endsWith('.pptm')) {
          mimeType = 'application/vnd.ms-powerpoint.presentation.macroEnabled.12';
        } else {
          mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        }
      }
      
      // Gemini APIでファイルを処理
      const result = await model.generateContent([
        {
          inlineData: {
            data: base64Data,
            mimeType: mimeType
          }
        },
        'このファイルの内容をテキストとして抽出してください。すべてのテキストをそのまま出力してください。スライドのタイトル、本文、箇条書きなど、すべてのテキストを含めてください。'
      ]);
      
      const response = await result.response;
      extractedText = response.text();
    }
    
    return extractedText;
  } catch (error) {
    console.error('Error extracting text with Gemini:', error);
    throw error;
  }
}

// 構想書の不足部分をチェック
async function checkMissingSections(extractedText) {
  try {
    initializeGemini();
    
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    
    const prompt = `以下の新規事業構想書（MVP開発承認申請書）のテキストを分析し、MVP開発承認における必要事項の基準に基づいて評価してください。

## MVP開発承認における必要事項の評価基準

### 1. 解決すべき問題は何か？

**問題の明確化**: 事業の現状やNBD（New Business Development）部門の存在理由も踏まえ、現在どのような問題がどのような状況で発生しているのか、そしてその問題を解決することにどれほどの意義があるのかを明確に示す必要があります。社内外の背景を含め「なぜこの問題に取り組むのか」を説明してください。

**確認ポイント**: 当該問題がNBD部門として取り組むべき領域の課題であることを確認します。（自部署のミッションに合致した問題設定であることが重要です。）

### 2. ターゲット顧客は誰か？

**ターゲットの特定**: 解決しようとする問題に直面しているターゲット顧客がどのような属性・習慣を持ち、具体的にどのような問題を抱えているのかを明示する必要があります。また、前段階のPoC（概念実証）などで得られた顧客からのフィードバックや、顧客自身が感じていた課題も合わせて提示し、ターゲット像に現実味を持たせます。

**確認ポイント**:
- 少なくとも1つの顧客セグメント（ターゲット）が設定されており、そのセグメントについて単なる属性情報だけでなく、顧客の状況・行動・動機の観点で定義されていること。
- 定義したターゲットに該当する実在の顧客サンプル（5名以上）でヒアリングや検証を行い、仮説の裏付けを取っていること。
- 定義したターゲットの周辺に位置する「対象外」の顧客セグメントも明確に示されていること。（誰を狙わないのかを明示し、焦点のブレを防止します。）

### 3. 提供価値は何か？

**価値仮説の提示**: ターゲット顧客に提供する価値（バリュー・プロポジション）は何か、そしてその価値によって顧客の問題がどのように解決されるのかを示す必要があります。単に機能説明に終始せず、「顧客にとって何が嬉しいのか」「どんな負担が減るのか」を明確に語ります。

**確認ポイント**:
- 提供価値の仮説が「Xな状況でYを可能にし、Zを減らす」という形式で明文化されていること。（※X＝顧客が置かれた状況、Y＝その状況下で顧客が実現したいこと、Z＝顧客にとっての負担や痛み）
- 提供価値を評価する際の比較基準（顧客が現在採用している解決策や他の代替手段）が明確に示されていること。現在の方法や競合サービスと比べて何がどれだけ優れているのかを説明できるようにします。

### 4. プロトタイプは用意できているか？

**試作による実演**: ユーザーが実際に触れることのできるプロトタイプ（またはプレトタイプ）を用意し、そのプロトタイプを通じて前述の価値提供をどのように行うのかを実演する必要があります。可能な範囲で構いませんので、サービスやプロダクトの利用イメージを関係者に具体的に伝えてください。

**確認ポイント**: 最低限、簡易的なデザイン画や画面イメージでも構わないので、ユーザーが利用する場面を想像できるプロトタイプが準備されていること。（文字だけの説明ではなく、視覚的に示すことで理解を促進します。）

### 5. 想定ビジネスモデルは何か？

**収益モデルの明示**: 提供した価値によってどのように収益や利益を得るのか（ビジネスとしてどう儲けるのか）を明示する必要があります。単にユーザーに価値を提供するだけでなく、事業として持続可能なモデルになっているかを説明してください。

**確認ポイント**:
- 提案するビジネスで主要となる収益源が一つに特定されていること。（例：サブスクリプション課金による継続収入、取引あたりの手数料収入、あるいはコスト削減による社内便益 など）
- 収益の概算を示す算出式が明文化されていること。粗い見積もりで構いませんが、例えば「年間契約者数 × 一人当たり課金額 ＝ 年間○○円の収入見込み」のように算出根拠を示します。（※例：ARPU〈ユーザー一人当たり平均売上〉や1件あたり便益などの指標を用いる）
- 提供する価値に対して誰が支払うのか（支払主体）が明確になっていること。（例：エンドユーザー本人が支払うのか、企業クライアントが支払うのか、あるいは社内の別部門予算で賄うのか 等）

### 6. 市場規模はどれくらいか？

**市場規模と成長性**: 参入予定の市場環境（市場の規模や成長性、競合状況など）を調査し、将来的にどの程度の事業規模・売上規模が見込めるのかを示す必要があります。市場の魅力度（大きさや成長トレンド）を定量的なデータとともに説明してください。

**確認ポイント**:
- ターゲットとするサービス提供可能市場（SAM: Serviceable Available Market）の規模が少なくとも100億円以上であること。（ニッチすぎず、事業化に足る市場の大きさがあることを示す）
- 上記市場規模の算出根拠（例：対象となる顧客数、市場の利用頻度、単価や提供便益など）が明確に示されていること。どのような前提条件でその市場規模算出に至ったかを説明できるようにします。

### 7. 競合はどこか？

**競合と差別化**: 想定される競合他社や代替ソリューションのリストアップを行い、それぞれの特徴を整理します。その上で、自社（自プロジェクト）が**どのような差別化戦略（ポジショニング）**を取る予定なのかを明示する必要があります。他との差異や優位性を示すことで、独自の立ち位置を明確にしてください。

**確認ポイント**:
- 業界内の直接の競合だけでなく、間接的な競合や代替手段についても、それぞれ少なくとも1つ以上の具体例を挙げていること。（直接・間接・代替それぞれの観点で競合分析ができているか）
- 上記を踏まえ、自社サービスのポジションを説明する差別化の仮説が視覚的に示されていること。例えば、主要な2軸（価格軸×品質軸など）で自社と競合をプロットしたポジショニングマップを用意するなど、差別化ポイントを一目で伝えられる工夫が望ましいです。

### 8. MVPの検証方法と目標数値は何か？

**検証方法の定義**: MVPで実施する検証の方法、およびそこで計測・観察する指標（KPI）の内容を明確に定義する必要があります。「どのような手段で何を検証するのか」を事前に計画し、チーム全員で合意しておきます。

**確認ポイント**:
- 具体的なMVP検証のアプローチ方法が明示されていること。（ユーザーテスト、インタビュー、アクセス解析など、どのような方法で仮説検証を行うかを明確に記載）
- MVP検証において設定した目標指標が、ユーザーの行動・プロダクトの品質・ユーザーの主観評価の各カテゴリにつきそれぞれ少なくとも1つ設定されていること。
  （例 - 行動指標: 主要タスク完了率40%以上、48時間以内の再訪率25%以上 / 品質指標: クレーム発生率≤X%、致命的不具合0件、プライバシー事故0件 / 主観評価指標: NPSスコア、PMF調査結果、CES、UMUX-Lite など）

### 9. MVP検証のロードマップはどうなっているか？

**実施計画の明示**: MVP検証を「いつ・誰と・どのように」進め、そして「どれくらいの期間」で何を達成する予定かを示す必要があります。検証の目的ごとにスケジュールを区切り、ロードマップとして関係者に共有してください。具体的な日程や担当も可能な範囲で言及します。

**確認ポイント**:
- MVP検証全体のスケジュール期間および主要なフェーズ（例：設計 → 実装 → 計測 → 学習）の区切りが明確に示されていること。いつどの段階にいるのかがひと目で分かる計画表が望ましいです。
- 検証を実施するにあたり、テスト参加者となる被験者の募集・確保計画が具体的に立てられていること。（例：社内外から○名のユーザーを募集済み、提携先企業○社の協力を取り付け済み 等）

### 10. いくらかかるのか？

**コスト見積もり**: MVPを実施する上で必要となる費用の概算を提示する必要があります。開発・運用・検証にかかるコストを洗い出し、予算枠内で実行可能かを説明してください。見積もりには人件費やツール費用なども含め、漏れがないようにします。

**確認ポイント**:
- MVP実施にかかる費用内訳について、開発費・運用費・検証（調査）費などの項目ごとに見積もりが示されていること。必要に応じて設備投資や人件費も含め、総額だけでなく内訳が明確になっていることが望ましいです。
- 予算をオーバーした場合の対応策（優先度の低い機能の削減、スコープ縮小などを含む「縮小計画」）が明記されていること。万一計画通りに進まずコスト超過となった場合でも、どう調整してプロジェクトを継続させるかのプランが用意されていると安心感を与えます。

### 11. 実施におけるリスクは何か？

**リスクの洗い出し**: MVP検証を進める上で想定される様々なリスク要因を事前に洗い出し、関係者と共有しておく必要があります。特にデータの扱い、セキュリティやプライバシーの確保、法務・コンプライアンス上の遵守事項、技術面・稼働面での不確実性、そして社内外の**評判（レピュテーション）**への影響など、多角的な観点からリスクを検討します。

**確認ポイント**:
- 上記のような観点を網羅し、考えうるリスクが漏れなくリストアップされていること。（セキュリティ/プライバシー、法務/コンプラ、技術/運用、レピュテーション等のカテゴリごとに整理）
- 特定した各リスクに対して、回避・低減・受容のいずれを選択して対応するかといった方針が明確に示されていること。どのリスクは受け入れ、どのリスクは事前対策を講じるのか判断が共有されていれば、プロジェクト実行時の混乱を防げます。

## 評価結果の出力形式

以下のJSON形式で回答してください:

{
  "missing_sections": [
    {
      "section_number": "1",
      "section_name": "解決すべき問題",
      "is_missing": false,
      "is_incomplete": true,
      "reason": "問題の明確化はされているが、社内外の背景を含めた「なぜこの問題に取り組むのか」の説明が不足しています",
      "checkpoints": [
        {
          "point": "問題の明確化",
          "status": "ok",
          "note": "問題の状況と意義は明確に示されています"
        },
        {
          "point": "社内外の背景を含めた説明",
          "status": "missing",
          "note": "背景情報が不足しています"
        },
        {
          "point": "NBD部門として取り組むべき領域の確認",
          "status": "ok",
          "note": "自部署のミッションに合致していることが確認できます"
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
    "ターゲット顧客の具体的なペルソナを追加してください（属性だけでなく、状況・行動・動機の観点で定義）",
    "実在の顧客サンプル（5名以上）でのヒアリング結果を追加してください",
    "市場規模の算出根拠をより詳細に示してください（SAMが100億円以上であることを数値で示す）",
    "MVP検証の目標指標を、行動・品質・主観評価の各カテゴリで設定してください",
    "リスク管理について、各リスクに対する対応方針（回避・低減・受容）を明記してください"
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

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const responseText = response.text();
    
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
    
    const analysisResult = JSON.parse(jsonText);
    return analysisResult;
  } catch (error) {
    console.error('Error checking missing sections:', error);
    // JSONパースエラーの場合、フォールバック
    return {
      missing_sections: [],
      completeness_score: 0,
      recommendations: ['分析中にエラーが発生しました'],
      error: error.message
    };
  }
}

module.exports = {
  initializeGemini,
  extractTextFromFile,
  checkMissingSections
};

