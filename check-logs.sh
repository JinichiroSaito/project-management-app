#!/bin/bash

# Cloud Runのログを確認するスクリプト
# プロジェクトIDとサービス名を設定
PROJECT_ID="saito-test-gcp"
SERVICE_NAME="app-dev"
REGION="asia-northeast1"

echo "=========================================="
echo "Cloud Run ログ確認スクリプト"
echo "=========================================="
echo "プロジェクト: $PROJECT_ID"
echo "サービス: $SERVICE_NAME"
echo "リージョン: $REGION"
echo "=========================================="
echo ""

# 認証確認
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ gcloud認証が必要です。以下のコマンドを実行してください:"
    echo "   gcloud auth login"
    exit 1
fi

# プロジェクトを設定
gcloud config set project $PROJECT_ID

echo "📋 最新のログ（最後の50行）を取得中..."
echo ""

# マイプロジェクト関連のログを取得
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME AND (textPayload=~\"[My Projects]\" OR jsonPayload.message=~\"[My Projects]\")" \
    --project=$PROJECT_ID \
    --limit=50 \
    --format="table(timestamp,textPayload,jsonPayload.message)" \
    --freshness=1h

echo ""
echo "=========================================="
echo "全プロジェクトのデバッグ情報を検索中..."
echo ""

# デバッグ情報のログを取得
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME AND (textPayload=~\"Debug - All projects\" OR jsonPayload.message=~\"Debug - All projects\")" \
    --project=$PROJECT_ID \
    --limit=20 \
    --format="table(timestamp,textPayload,jsonPayload.message)" \
    --freshness=1h

echo ""
echo "=========================================="
echo "エラーログを検索中..."
echo ""

# エラーログを取得
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=$SERVICE_NAME AND severity>=ERROR" \
    --project=$PROJECT_ID \
    --limit=20 \
    --format="table(timestamp,severity,textPayload,jsonPayload.message)" \
    --freshness=1h

echo ""
echo "=========================================="
echo "完了"
echo ""
echo "💡 より詳細なログを確認するには、GCPコンソールで以下にアクセス:"
echo "   https://console.cloud.google.com/logs/query?project=$PROJECT_ID"
echo ""

