#!/bin/bash

# FirebaseサービスアカウントキーをGCP Secret Managerに更新するスクリプト（手動実行版）
# 使用方法: ./scripts/update-firebase-secret-manual.sh

set -e

PROJECT_ID="saito-test-gcp"
ENVIRONMENT="dev"
SERVICE_ACCOUNT_FILE="firebase-service-account.json"

echo "=========================================="
echo "Firebase Secret Manager 更新スクリプト"
echo "=========================================="
echo "プロジェクト: $PROJECT_ID"
echo "環境: $ENVIRONMENT"
echo "サービスアカウントファイル: $SERVICE_ACCOUNT_FILE"
echo ""

# ファイルの存在確認
if [ ! -f "$SERVICE_ACCOUNT_FILE" ]; then
    echo "エラー: サービスアカウントキーファイル '$SERVICE_ACCOUNT_FILE' が見つかりません"
    exit 1
fi

# プロジェクトIDの確認
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null || echo "")
if [ "$CURRENT_PROJECT" != "$PROJECT_ID" ]; then
    echo "現在のプロジェクト: $CURRENT_PROJECT"
    echo "設定プロジェクト: $PROJECT_ID"
    echo ""
    echo "プロジェクトを設定しますか？ (y/n)"
    read -r response
    if [ "$response" = "y" ]; then
        gcloud config set project "$PROJECT_ID"
        echo "✓ プロジェクトを $PROJECT_ID に設定しました"
    else
        echo "プロジェクト設定をスキップします"
    fi
fi

SECRET_NAME="firebase-service-account-${ENVIRONMENT}"

echo ""
echo "シークレット名: $SECRET_NAME"
echo ""

# シークレットが存在するか確認
if gcloud secrets describe "$SECRET_NAME" --project="$PROJECT_ID" > /dev/null 2>&1; then
    echo "✓ シークレット '$SECRET_NAME' が見つかりました"
    echo "  新しいバージョンを追加します..."
else
    echo "⚠ シークレット '$SECRET_NAME' が存在しません"
    echo "  新しいシークレットを作成します..."
    gcloud secrets create "$SECRET_NAME" \
        --data-file="$SERVICE_ACCOUNT_FILE" \
        --project="$PROJECT_ID" \
        --replication-policy="automatic"
    echo "✓ シークレット '$SECRET_NAME' を作成しました"
    exit 0
fi

# シークレットの新しいバージョンを追加
echo ""
echo "シークレットを更新しています..."
gcloud secrets versions add "$SECRET_NAME" \
    --data-file="$SERVICE_ACCOUNT_FILE" \
    --project="$PROJECT_ID"

echo ""
echo "=========================================="
echo "✓ 更新完了！"
echo "=========================================="
echo ""
echo "次のステップ:"
echo "  1. Cloud Runサービスを再デプロイして新しいシークレットを反映"
echo "  2. バックエンドのログで '✓ Firebase Admin SDK initialized' を確認"
echo ""
echo "デプロイコマンド例:"
echo "  gcloud builds submit --config=cloudbuild.yaml"
echo ""

