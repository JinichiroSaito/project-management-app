variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

# Cloud Build用サービスアカウント
resource "google_service_account" "cloud_build" {
  account_id   = "cloud-build-sa"
  project      = var.project_id
  display_name = "Cloud Build Service Account"
  description  = "Service account for Cloud Build CI/CD"
}

# Cloud Run用サービスアカウント (環境ごと)
resource "google_service_account" "cloud_run_dev" {
  account_id   = "cloud-run-dev"
  project      = var.project_id
  display_name = "Cloud Run Dev Service Account"
  description  = "Service account for Cloud Run dev environment"
}

resource "google_service_account" "cloud_run_staging" {
  account_id   = "cloud-run-staging"
  project      = var.project_id
  display_name = "Cloud Run Staging Service Account"
  description  = "Service account for Cloud Run staging environment"
}

resource "google_service_account" "cloud_run_production" {
  account_id   = "cloud-run-prod"
  project      = var.project_id
  display_name = "Cloud Run Production Service Account"
  description  = "Service account for Cloud Run production environment"
}

# Cloud Build SA の権限設定
resource "google_project_iam_member" "cloud_build_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.cloud_build.email}"
}

resource "google_project_iam_member" "cloud_build_sa_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.cloud_build.email}"
}

resource "google_project_iam_member" "cloud_build_artifact_writer" {
  project = var.project_id
  role    = "roles/artifactregistry.writer"
  member  = "serviceAccount:${google_service_account.cloud_build.email}"
}

resource "google_project_iam_member" "cloud_build_logs_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.cloud_build.email}"
}

# 出力
output "cloud_build_sa_email" {
  value       = google_service_account.cloud_build.email
  description = "Cloud Build Service Account Email"
}

output "cloud_run_dev_sa_email" {
  value       = google_service_account.cloud_run_dev.email
  description = "Cloud Run Dev Service Account Email"
}

output "cloud_run_staging_sa_email" {
  value       = google_service_account.cloud_run_staging.email
  description = "Cloud Run Staging Service Account Email"
}

output "cloud_run_production_sa_email" {
  value       = google_service_account.cloud_run_production.email
  description = "Cloud Run Production Service Account Email"
}
