#!/bin/bash

# FirebaseサービスアカウントキーをGCP Secret Managerに更新するスクリプト
# 使用方法: ./scripts/update-firebase-secret.sh [環境] [サービスアカウントキーファイル]
# 例: ./scripts/update-firebase-secret.sh dev firebase-service-account.json

set -e

PROJECT_ID="saito-test-gcp"
ENVIRONMENT=${1:-dev}
SERVICE_ACCOUNT_FILE=${2:-firebase-service-account.json}

if [ ! -f "$SERVICE_ACCOUNT_FILE" ]; then
    echo "エラー: サービスアカウントキーファイル '$SERVICE_ACCOUNT_FILE' が見つかりません"
    echo ""
    echo "使用方法:"
    echo "  1. Firebase Console > プロジェクトの設定 > サービスアカウント"
    echo "  2. 「新しい秘密鍵の生成」をクリックしてJSONファイルをダウンロード"
    echo "  3. ダウンロードしたファイルを '$SERVICE_ACCOUNT_FILE' として保存"
    echo "  4. このスクリプトを実行: ./scripts/update-firebase-secret.sh $ENVIRONMENT $SERVICE_ACCOUNT_FILE"
    exit 1
fi

SECRET_NAME="firebase-service-account-${ENVIRONMENT}"

echo "=========================================="
echo "Firebase Secret Manager 更新スクリプト"
echo "=========================================="
echo "プロジェクト: $PROJECT_ID"
echo "環境: $ENVIRONMENT"
echo "シークレット名: $SECRET_NAME"
echo "サービスアカウントファイル: $SERVICE_ACCOUNT_FILE"
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

