#!/bin/bash

# Firebase設定確認スクリプト
# このスクリプトは、バックエンドのFirebase設定が正しく構成されているか確認します

set -e

PROJECT_ID="saito-test-gcp"
REGION="asia-northeast1"
SERVICE_NAME="app-dev"
SECRET_NAME="firebase-service-account-dev"

echo "=========================================="
echo "Firebase設定確認スクリプト"
echo "=========================================="
echo ""

# 1. Secret Managerの確認
echo "1. Secret Managerの確認"
echo "----------------------------------------"
if gcloud secrets describe $SECRET_NAME --project=$PROJECT_ID &>/dev/null; then
    echo "✓ Secret '$SECRET_NAME' が存在します"
    
    # 最新バージョンを確認
    LATEST_VERSION=$(gcloud secrets versions list $SECRET_NAME --project=$PROJECT_ID --limit=1 --format="value(name)" | head -1)
    if [ -n "$LATEST_VERSION" ]; then
        echo "  最新バージョン: $LATEST_VERSION"
        
        # プロジェクトIDを確認
        PROJECT_ID_IN_SECRET=$(gcloud secrets versions access latest --secret=$SECRET_NAME --project=$PROJECT_ID 2>/dev/null | jq -r '.project_id' 2>/dev/null || echo "確認できませんでした")
        echo "  Secret内のproject_id: $PROJECT_ID_IN_SECRET"
        
        if [ "$PROJECT_ID_IN_SECRET" = "project-management-app-c1f78" ]; then
            echo "  ✓ 正しいFirebaseプロジェクトIDが設定されています"
        else
            echo "  ⚠ 警告: FirebaseプロジェクトIDが 'project-management-app-c1f78' ではありません"
            echo "    現在の値: $PROJECT_ID_IN_SECRET"
        fi
    else
        echo "  ⚠ バージョンが見つかりません"
    fi
else
    echo "✗ Secret '$SECRET_NAME' が存在しません"
    echo "  作成が必要です"
fi
echo ""

# 2. Cloud Runサービスの環境変数確認
echo "2. Cloud Runサービスの環境変数確認"
echo "----------------------------------------"
if gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID &>/dev/null; then
    echo "✓ Cloud Runサービス '$SERVICE_NAME' が存在します"
    
    # FIREBASE_SERVICE_ACCOUNTがSecret Managerから参照されているか確認
    SECRETS=$(gcloud run services describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --format="value(spec.template.spec.containers[0].env[].valueFrom.secretKeyRef.secret)" 2>/dev/null || echo "")
    if echo "$SECRETS" | grep -q "$SECRET_NAME"; then
        echo "  ✓ FIREBASE_SERVICE_ACCOUNTがSecret Managerから参照されています"
    else
        echo "  ⚠ 警告: FIREBASE_SERVICE_ACCOUNTがSecret Managerから参照されていません"
    fi
else
    echo "✗ Cloud Runサービス '$SERVICE_NAME' が存在しません"
fi
echo ""

# 3. バックエンドのログ確認（最新20行）
echo "3. バックエンドのログ確認（最新20行）"
echo "----------------------------------------"
echo "Firebase初期化メッセージを確認中..."
LOG_OUTPUT=$(gcloud run services logs read $SERVICE_NAME --region=$REGION --project=$PROJECT_ID --limit=50 2>&1 || echo "ログの取得に失敗しました")

if echo "$LOG_OUTPUT" | grep -q "Firebase Admin SDK initialized"; then
    echo "  ✓ Firebase Admin SDKが正常に初期化されています"
elif echo "$LOG_OUTPUT" | grep -q "FIREBASE_SERVICE_ACCOUNT not set"; then
    echo "  ✗ エラー: FIREBASE_SERVICE_ACCOUNTが設定されていません"
elif echo "$LOG_OUTPUT" | grep -q "Failed to initialize Firebase"; then
    echo "  ✗ エラー: Firebase初期化に失敗しています"
    echo "$LOG_OUTPUT" | grep -A 5 "Failed to initialize Firebase" | head -10
else
    echo "  ⚠ 警告: Firebase初期化メッセージが見つかりませんでした"
    echo "  ログの一部:"
    echo "$LOG_OUTPUT" | tail -5
fi
echo ""

# 4. 認証エラーの確認
echo "4. 認証エラーの確認"
echo "----------------------------------------"
if echo "$LOG_OUTPUT" | grep -q "Authentication error"; then
    echo "  ⚠ 警告: 認証エラーが検出されました"
    echo "$LOG_OUTPUT" | grep -A 3 "Authentication error" | head -10
else
    echo "  ✓ 最近の認証エラーは検出されませんでした"
fi
echo ""

# 5. 推奨アクション
echo "=========================================="
echo "推奨アクション"
echo "=========================================="
echo ""

if [ "$PROJECT_ID_IN_SECRET" != "project-management-app-c1f78" ]; then
    echo "1. Secret Managerを更新してください:"
    echo "   gcloud secrets versions add $SECRET_NAME \\"
    echo "     --data-file=firebase-service-account.json \\"
    echo "     --project=$PROJECT_ID"
    echo ""
fi

if ! echo "$LOG_OUTPUT" | grep -q "Firebase Admin SDK initialized"; then
    echo "2. バックエンドを再デプロイしてください:"
    echo "   git push origin main"
    echo "   または"
    echo "   gcloud builds submit --config=cloudbuild.yaml"
    echo ""
fi

echo "3. フロントエンドで再ログインしてください"
echo ""

