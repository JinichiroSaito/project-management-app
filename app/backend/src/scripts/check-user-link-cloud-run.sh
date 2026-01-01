#!/bin/bash
# 本番環境でユーザーの紐付け状態を確認するスクリプト
# Cloud Run Jobとして実行

FIREBASE_UID="w1bixRIxQqShC43elmZ5Yk5v8fD3"
EMAIL="jinichirou.saitou@asahi-gh.com"
PROJECT_ID="saito-test-gcp"
REGION="asia-northeast1"
IMAGE="asia-northeast1-docker.pkg.dev/${PROJECT_ID}/app-images/backend:prod-latest"

echo "Creating Cloud Run Job to check user link for ${EMAIL}..."

JOB_NAME="check-link-$(date +%s | cut -c1-10)"

gcloud run jobs create ${JOB_NAME} \
  --image=${IMAGE} \
  --region=${REGION} \
  --vpc-connector=vpc-connector \
  --service-account=cloud-run-prod@${PROJECT_ID}.iam.gserviceaccount.com \
  --set-env-vars="DB_HOST=10.81.0.6,DB_PORT=5432,DB_NAME=pm_app,DB_USER=app_user,NODE_ENV=production,CHECK_UID=${FIREBASE_UID},CHECK_EMAIL=${EMAIL}" \
  --set-secrets="DB_PASSWORD=db-password-prod:latest" \
  --command=node \
  --args="src/scripts/check-user-link.js" \
  --max-retries=1

echo "Executing job..."
gcloud run jobs execute ${JOB_NAME} \
  --region=${REGION} \
  --wait

echo "Deleting job..."
gcloud run jobs delete ${JOB_NAME} \
  --region=${REGION} \
  --quiet

echo "Done!"

