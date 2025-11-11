# Cloud Run ログ確認方法

## 方法1: スクリプトを使用（推奨）

```bash
./check-logs.sh
```

このスクリプトは以下を実行します：
- マイプロジェクト関連のログを取得
- 全プロジェクトのデバッグ情報を検索
- エラーログを検索

## 方法2: gcloudコマンドを直接実行

### 1. 認証（初回のみ）
```bash
gcloud auth login
gcloud config set project saito-test-gcp
```

### 2. マイプロジェクト関連のログを確認
```bash
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=app-dev AND (textPayload=~\"[My Projects]\" OR jsonPayload.message=~\"[My Projects]\")" \
  --project=saito-test-gcp \
  --limit=50 \
  --format="table(timestamp,textPayload,jsonPayload.message)" \
  --freshness=1h
```

### 3. デバッグ情報（全プロジェクト）を確認
```bash
gcloud logging read \
  "resource.type=cloud_run_revision AND resource.labels.service_name=app-dev AND (textPayload=~\"Debug - All projects\" OR jsonPayload.message=~\"Debug - All projects\")" \
  --project=saito-test-gcp \
  --limit=20 \
  --format="table(timestamp,textPayload,jsonPayload.message)" \
  --freshness=1h
```

### 4. 最新のログをリアルタイムで確認
```bash
gcloud logging tail \
  "resource.type=cloud_run_revision AND resource.labels.service_name=app-dev" \
  --project=saito-test-gcp
```

## 方法3: GCPコンソールで確認

1. [GCP Logs Explorer](https://console.cloud.google.com/logs/query?project=saito-test-gcp) にアクセス
2. 以下のクエリを入力：

```
resource.type="cloud_run_revision"
resource.labels.service_name="app-dev"
textPayload=~"[My Projects]"
```

または、デバッグ情報を確認：

```
resource.type="cloud_run_revision"
resource.labels.service_name="app-dev"
textPayload=~"Debug - All projects"
```

## 確認すべきログメッセージ

### 1. マイプロジェクト取得時のログ
- `[My Projects] Request received` - リクエスト受信
- `[My Projects] Current user:` - 現在のユーザー情報
- `[My Projects] Query successful, found X projects` - クエリ成功と取得件数
- `[My Projects] Debug - All projects in database:` - 全プロジェクトのデバッグ情報

### 2. デバッグ情報の内容
- `totalProjects`: データベース内の全プロジェクト数
- `projects`: 各プロジェクトの詳細
  - `id`: プロジェクトID
  - `name`: プロジェクト名
  - `executor_id`: 実行者ID（重要！）
  - `executor_id_type`: executor_idの型
  - `application_status`: 申請ステータス

### 3. 問題の特定ポイント
- `executor_id` が `null` または設定されていない
- `executor_id` と現在のユーザーIDが一致しない
- ユーザーの `position` が `executor` でない

## トラブルシューティング

### ログが表示されない場合
1. 時間範囲を広げる（`--freshness=1h` を `--freshness=24h` に変更）
2. サービス名が正しいか確認（`app-dev`）
3. プロジェクトIDが正しいか確認（`saito-test-gcp`）

### 認証エラーの場合
```bash
gcloud auth login
gcloud config set project saito-test-gcp
```

