#!/bin/bash

# Firebase Secret Manager更新スクリプト
# このスクリプトは、FirebaseサービスアカウントキーをSecret Managerに更新します

set -e

PROJECT_ID="saito-test-gcp"
SECRET_NAME="firebase-service-account-dev"
SERVICE_ACCOUNT_FILE="firebase-service-account.json"

echo "=========================================="
echo "Firebase Secret Manager更新スクリプト"
echo "=========================================="
echo ""

# 1. プロジェクトを設定
echo "1. GCPプロジェクトを設定中..."
gcloud config set project $PROJECT_ID
echo "✓ プロジェクトを設定しました: $PROJECT_ID"
echo ""

# 2. サービスアカウントキーファイルの確認
echo "2. サービスアカウントキーファイルを確認中..."
if [ ! -f "$SERVICE_ACCOUNT_FILE" ]; then
    echo "✗ エラー: $SERVICE_ACCOUNT_FILE が見つかりません"
    echo "   ファイルが存在することを確認してください"
    exit 1
fi

# プロジェクトIDを確認
PROJECT_ID_IN_FILE=$(cat $SERVICE_ACCOUNT_FILE | jq -r '.project_id' 2>/dev/null || echo "")
if [ "$PROJECT_ID_IN_FILE" != "project-management-app-c1f78" ]; then
    echo "⚠ 警告: ファイル内のproject_idが 'project-management-app-c1f78' ではありません"
    echo "   現在の値: $PROJECT_ID_IN_FILE"
    read -p "続行しますか？ (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo "✓ 正しいFirebaseプロジェクトIDが確認されました: $PROJECT_ID_IN_FILE"
fi
echo ""

# 3. Secret Managerの確認
echo "3. Secret Managerの確認中..."
if gcloud secrets describe $SECRET_NAME --project=$PROJECT_ID &>/dev/null; then
    echo "✓ Secret '$SECRET_NAME' が存在します"
    echo "  既存のシークレットを更新します..."
else
    echo "⚠ Secret '$SECRET_NAME' が存在しません"
    echo "  新しいシークレットを作成します..."
    gcloud secrets create $SECRET_NAME \
        --data-file=$SERVICE_ACCOUNT_FILE \
        --project=$PROJECT_ID \
        --replication-policy="automatic"
    echo "✓ Secret '$SECRET_NAME' を作成しました"
    exit 0
fi
echo ""

# 4. Secret Managerを更新
echo "4. Secret Managerを更新中..."
gcloud secrets versions add $SECRET_NAME \
    --data-file=$SERVICE_ACCOUNT_FILE \
    --project=$PROJECT_ID

if [ $? -eq 0 ]; then
    echo "✓ Secret Managerを更新しました"
else
    echo "✗ エラー: Secret Managerの更新に失敗しました"
    exit 1
fi
echo ""

# 5. 更新の確認
echo "5. 更新の確認中..."
LATEST_VERSION=$(gcloud secrets versions list $SECRET_NAME --project=$PROJECT_ID --limit=1 --format="value(name)" | head -1)
if [ -n "$LATEST_VERSION" ]; then
    echo "✓ 最新バージョン: $LATEST_VERSION"
    
    # プロジェクトIDを確認
    PROJECT_ID_IN_SECRET=$(gcloud secrets versions access latest --secret=$SECRET_NAME --project=$PROJECT_ID 2>/dev/null | jq -r '.project_id' 2>/dev/null || echo "確認できませんでした")
    echo "  Secret内のproject_id: $PROJECT_ID_IN_SECRET"
    
    if [ "$PROJECT_ID_IN_SECRET" = "project-management-app-c1f78" ]; then
        echo "  ✓ 正しいFirebaseプロジェクトIDが設定されています"
    else
        echo "  ⚠ 警告: FirebaseプロジェクトIDが 'project-management-app-c1f78' ではありません"
    fi
else
    echo "⚠ バージョンが見つかりません"
fi
echo ""

# 6. 次のステップ
echo "=========================================="
echo "次のステップ"
echo "=========================================="
echo ""
echo "1. バックエンドを再デプロイしてください:"
echo "   git push origin main"
echo ""
echo "2. デプロイ後、バックエンドのログを確認してください:"
echo "   gcloud run services logs read app-dev \\"
echo "     --region=asia-northeast1 \\"
echo "     --project=$PROJECT_ID \\"
echo "     --limit=20"
echo ""
echo "3. 以下のメッセージが表示されれば成功です:"
echo "   ✓ Firebase Admin SDK initialized"
echo ""
echo "4. フロントエンドで再ログインしてください"
echo ""
