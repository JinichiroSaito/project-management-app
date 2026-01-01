#!/bin/bash
# 本番環境でプロフィール情報を紐付けるスクリプト
# Cloud Run Jobとして実行

EMAIL="jinichirou.saitou@asahi-gh.com"
PROJECT_ID="saito-test-gcp"
REGION="asia-northeast1"
IMAGE="asia-northeast1-docker.pkg.dev/${PROJECT_ID}/app-images/backend:prod-latest"

echo "Creating Cloud Run Job to link profile for ${EMAIL}..."

JOB_NAME="link-profile-$(date +%s | cut -c1-10)"

gcloud run jobs create ${JOB_NAME} \
  --image=${IMAGE} \
  --region=${REGION} \
  --vpc-connector=vpc-connector \
  --service-account=cloud-run-prod@${PROJECT_ID}.iam.gserviceaccount.com \
  --set-env-vars="DB_HOST=10.81.0.6,DB_PORT=5432,DB_NAME=pm_app,DB_USER=app_user,NODE_ENV=production" \
  --set-secrets="DB_PASSWORD=db-password-prod:latest,FIREBASE_SERVICE_ACCOUNT=firebase-service-account-dev:latest" \
  --command=node \
  --args="src/scripts/link-user-profile.js,${EMAIL}" \
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

