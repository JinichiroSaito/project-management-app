# Cloud RunのIPアドレスについて

## 重要な注意事項

**Cloud RunのIPアドレスは動的で固定されていません。** そのため、IPアドレス制限を使用することは**推奨されません**。

## Cloud RunのIPアドレスの特徴

1. **動的IPアドレス**: Cloud Runのエグレス（送信）IPアドレスは、リクエストごとに変わる可能性があります
2. **複数のIPアドレス**: 複数のIPアドレスからリクエストが送信される可能性があります
3. **リージョンごとに異なる**: リージョンによって異なるIPアドレス範囲が使用されます

## 推奨される解決方法

### 方法1: アプリケーションの制限を「なし」に設定（推奨）

Cloud RunからGemini APIを呼び出す場合、**アプリケーションの制限を「なし」に設定**することを強く推奨します。

**理由:**
- Cloud RunのIPアドレスは動的で固定されていない
- IPアドレス制限を設定すると、リクエストが拒否される可能性が高い
- Secret Managerを使用することで、セキュリティは十分に確保されている

### 方法2: APIの制限のみを設定（セキュリティ強化）

IPアドレス制限の代わりに、**APIの制限**を設定することでセキュリティを強化できます：

1. [キーの制限]セクションで「キーを制限する」を選択
2. 「Generative Language API」のみを許可
3. [アプリケーションの制限]は「なし」のまま
4. [保存]をクリック

これにより、Gemini API以外のAPIでは使用できなくなります。

## Cloud RunのエグレスIPアドレスを確認する方法（参考）

もしIPアドレスを確認したい場合（ただし推奨しません）：

### 方法1: ログから確認

```bash
# Cloud Runのログから外部APIへのリクエストを確認
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=app-dev AND httpRequest.requestUrl=~\"generativelanguage\" OR httpRequest.remoteIp" --project=saito-test-gcp --limit=10 --format="table(timestamp,httpRequest.remoteIp)"
```

### 方法2: テストエンドポイントを作成

一時的にテストエンドポイントを作成して、エグレスIPアドレスを確認：

```javascript
// テスト用エンドポイント（一時的）
app.get('/api/test-ip', async (req, res) => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    res.json({ egressIp: data.ip });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 方法3: Cloud NATを使用（高度）

Cloud NATを使用して固定IPアドレスを取得することも可能ですが、追加の設定とコストがかかります。

## 結論

**Cloud RunからGemini APIを呼び出す場合、IPアドレス制限は使用しないことを強く推奨します。**

代わりに：
1. [アプリケーションの制限]を「なし」に設定
2. [APIの制限]で「Generative Language API」のみを許可
3. Secret ManagerでAPIキーを安全に管理

これにより、セキュリティを確保しながら、Cloud Runから正常にGemini APIを呼び出すことができます。

