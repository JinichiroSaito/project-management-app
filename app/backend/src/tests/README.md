# テストスクリプト

このディレクトリには、修正内容を検証するためのテストスクリプトが含まれています。

## テストスクリプト一覧

### 1. test-transaction.js

トランザクション処理の動作を確認します。

**実行方法:**
```bash
cd app/backend
node src/tests/test-transaction.js
```

**テスト内容:**
- 正常なトランザクション処理
- エラー時のロールバック処理
- 複数クエリのトランザクション処理

### 2. test-concurrent-approval.js

承認フローの競合状態を確認します。

**実行方法:**
```bash
cd app/backend
node src/tests/test-concurrent-approval.js
```

**テスト内容:**
- 楽観的ロックの動作確認
- 重複承認の防止

**注意:** このテストは、テスト用のプロジェクトとユーザーを作成します。実行後は自動的にクリーンアップされます。

### 3. test-error-handling.js

エラーハンドリングの動作を確認します。

**実行方法:**
```bash
cd app/backend
node src/tests/test-error-handling.js
```

**テスト内容:**
- データベースエラーのハンドリング
- トランザクション内でのエラーハンドリング
- 空の値のチェック
- JSONエラーのハンドリング
- 非同期処理のエラーハンドリング

## 前提条件

1. **依存関係のインストール**
   ```bash
   cd app/backend
   npm install
   ```

2. **データベース接続の設定**
   - PostgreSQLが起動していること
   - `.env`ファイルが正しく設定されていること
   - 以下の環境変数が設定されていること:
     - `DB_HOST` (例: localhost)
     - `DB_PORT` (例: 5432)
     - `DB_NAME` (例: pm_app)
     - `DB_USER` (例: app_user)
     - `DB_PASSWORD` (データベースパスワード)

3. **データベーススキーマ**
   - 必要なテーブルが作成されていること（マイグレーション実行済み）
   - マイグレーション実行: `node src/migrate.js`

## ローカル環境でのセットアップ

### PostgreSQLの起動（macOS）

```bash
# Homebrewでインストールした場合
brew services start postgresql

# または直接起動
pg_ctl -D /usr/local/var/postgres start
```

### .envファイルの作成

`app/backend/.env`ファイルを作成し、以下の内容を設定:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=pm_app
DB_USER=app_user
DB_PASSWORD=your_password_here
NODE_ENV=development
```

## トラブルシューティング

### データベース接続エラー

```
❌ Database connection error
```

**解決方法:**
- `.env`ファイルのデータベース設定を確認
- データベースが起動しているか確認
- ネットワーク接続を確認

### テーブルが存在しないエラー

```
relation "projects" does not exist
```

**解決方法:**
- マイグレーションを実行: `node src/migrate.js`
- データベーススキーマを確認

### テストデータのクリーンアップ

テストスクリプトは自動的にクリーンアップを行いますが、手動でクリーンアップする必要がある場合：

```sql
-- テスト用プロジェクトを削除
DELETE FROM projects WHERE name LIKE '%Test%';

-- テスト用ユーザーを削除（必要に応じて）
DELETE FROM users WHERE email LIKE '%test%';
```

## 継続的なテスト

本番環境にデプロイする前に、必ずすべてのテストを実行してください：

```bash
# すべてのテストを実行
cd app/backend
node src/tests/test-transaction.js && \
node src/tests/test-concurrent-approval.js && \
node src/tests/test-error-handling.js
```

すべてのテストが成功した場合、本番環境へのデプロイを進めることができます。

