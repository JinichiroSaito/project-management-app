#!/bin/bash
# GCP Secret Manager更新コマンド

PROJECT_ID="saito-test-gcp"
SECRET_NAME="firebase-service-account-dev"
SERVICE_ACCOUNT_FILE="firebase-service-account.json"

echo "=========================================="
echo "Firebase Secret Manager 更新"
echo "=========================================="
echo ""

# プロジェクト設定
echo "1. プロジェクトを設定中..."
gcloud config set project $PROJECT_ID

# シークレットの存在確認と更新
echo ""
echo "2. シークレットを確認中..."
if gcloud secrets describe $SECRET_NAME --project=$PROJECT_ID > /dev/null 2>&1; then
    echo "   ✓ シークレット '$SECRET_NAME' が見つかりました"
    echo ""
    echo "3. シークレットを更新中..."
    gcloud secrets versions add $SECRET_NAME \
        --data-file=$SERVICE_ACCOUNT_FILE \
        --project=$PROJECT_ID
    echo "   ✓ 更新完了！"
else
    echo "   ⚠ シークレット '$SECRET_NAME' が存在しません"
    echo ""
    echo "3. シークレットを作成中..."
    gcloud secrets create $SECRET_NAME \
        --data-file=$SERVICE_ACCOUNT_FILE \
        --project=$PROJECT_ID \
        --replication-policy="automatic"
    echo "   ✓ 作成完了！"
fi

echo ""
echo "=========================================="
echo "✓ 完了！"
echo "=========================================="
echo ""
echo "次のステップ:"
echo "  バックエンドを再デプロイしてください:"
echo "  gcloud builds submit --config=cloudbuild.yaml"
echo ""
