# Gemini APIキーの認証設定ガイド

## 問題の原因

Gemini APIキーにIPアドレス制限が設定されているが、許可されたIPアドレスが登録されていないため、Cloud RunからGemini APIを呼び出す際にエラーが発生しています。

Cloud RunのIPアドレスは動的に変わるため、IPアドレス制限は適切ではありません。

## 解決方法

### 方法1: APIキーの制限を「なし」に設定（推奨）

1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. プロジェクト `saito-test-gcp` を選択
3. [APIとサービス] > [認証情報]に移動
4. 使用しているGemini APIキーをクリック（または編集）
5. [アプリケーションの制限]セクションで「なし」を選択
6. [保存]をクリック

### 方法2: APIキーの制限を削除

1. [APIとサービス] > [認証情報]に移動
2. 使用しているGemini APIキーをクリック
3. [キーの制限]セクションで「API の制限」を「キーを制限しない」に設定
4. [アプリケーションの制限]セクションで「なし」を選択
5. [保存]をクリック

## セキュリティに関する注意事項

### APIキーの制限を「なし」に設定する場合

- **利点**: Cloud Runから簡単に呼び出せる
- **注意点**: APIキーが漏洩した場合、誰でも使用可能になる

### セキュリティを強化する方法

1. **APIキーの制限を設定**
   - [API の制限]で「Generative Language API」のみを許可
   - これにより、Gemini API以外のAPIでは使用できなくなります

2. **Secret Managerを使用**
   - APIキーをSecret Managerに保存（既に実装済み）
   - Cloud Runサービスアカウントのみがアクセス可能

3. **定期的なローテーション**
   - 定期的にAPIキーを再生成
   - Secret Managerのシークレットを更新

## 推奨設定

### ステップ1: APIキーの制限を設定

1. [APIとサービス] > [認証情報]に移動
2. Gemini APIキーをクリック
3. [キーの制限]セクションで：
   - [API の制限]で「キーを制限する」を選択
   - 「Generative Language API」を選択
4. [アプリケーションの制限]セクションで：
   - 「なし」を選択（Cloud Runから呼び出すため）
5. [保存]をクリック

### ステップ2: Secret Managerの確認

APIキーがSecret Managerに正しく保存されているか確認：

```bash
# シークレットの存在確認
gcloud secrets list --project=saito-test-gcp | grep gemini

# シークレットのバージョン確認
gcloud secrets versions list gemini-api-key-dev --project=saito-test-gcp
```

### ステップ3: Cloud Runサービスアカウントの権限確認

```bash
# IAM権限の確認
gcloud secrets get-iam-policy gemini-api-key-dev --project=saito-test-gcp
```

## トラブルシューティング

### エラー: "API key not valid"

- APIキーが有効か確認
- Secret Managerに正しいAPIキーが保存されているか確認
- Cloud RunサービスアカウントにSecret Managerへのアクセス権限があるか確認

### エラー: "Permission denied"

- APIキーの制限が「なし」に設定されているか確認
- Cloud Runサービスアカウントに`roles/secretmanager.secretAccessor`権限があるか確認

### エラー: "Quota exceeded"

- Gemini APIの使用量制限に達していないか確認
- [APIとサービス] > [割り当て]で使用量を確認

## 参考リンク

- [APIキーの制限設定](https://cloud.google.com/docs/authentication/api-keys#restricting_keys)
- [Secret Manager ドキュメント](https://cloud.google.com/secret-manager/docs)
- [Gemini API ドキュメント](https://ai.google.dev/docs)

