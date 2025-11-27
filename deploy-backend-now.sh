#!/bin/bash
# バックエンドを再デプロイするスクリプト

PROJECT_ID="saito-test-gcp"

echo "=========================================="
echo "バックエンド再デプロイ"
echo "=========================================="
echo "プロジェクト: $PROJECT_ID"
echo ""

# プロジェクトを確認
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
    echo "プロジェクトを設定中..."
    gcloud config set project $PROJECT_ID
fi

echo "Cloud Buildでデプロイを開始します..."
echo "（通常5-10分かかります）"
echo ""

gcloud builds submit --config=cloudbuild.yaml

echo ""
echo "=========================================="
echo "デプロイ完了"
echo "=========================================="
echo ""
echo "次のステップ:"
echo "1. バックエンドのログを確認:"
echo "   gcloud run services logs read app-dev --region=asia-northeast1 --project=$PROJECT_ID --limit=50"
echo ""
echo "2. フロントエンドでログアウト→再ログインして動作確認"
echo ""
