#!/bin/bash
# バックエンドのFirebase設定を確認するスクリプト

PROJECT_ID="saito-test-gcp"
SERVICE_NAME="app-dev"
REGION="asia-northeast1"

echo "=========================================="
echo "バックエンドFirebase設定確認"
echo "=========================================="
echo ""

echo "1. Secret Managerのバージョンを確認..."
gcloud secrets versions list firebase-service-account-dev \
  --project=$PROJECT_ID \
  --limit=5

echo ""
echo "2. バックエンドのログを確認（Firebase初期化メッセージを検索）..."
gcloud run services logs read $SERVICE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID \
  --limit=50 \
  --format="table(timestamp,severity,textPayload)" \
  | grep -i "firebase\|authentication\|initialized" || echo "Firebase関連のログが見つかりません"

echo ""
echo "3. 最新のエラーログを確認..."
gcloud run services logs read $SERVICE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID \
  --limit=20 \
  --format="table(timestamp,severity,textPayload)" \
  | grep -i "error\|failed" || echo "エラーログが見つかりません"

echo ""
echo "=========================================="
echo "確認完了"
echo "=========================================="
