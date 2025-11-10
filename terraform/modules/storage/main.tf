variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "cloud_run_sa_email" {
  description = "Cloud Run Service Account Email"
  type        = string
}

# Cloud Storageバケット（環境ごと）
resource "google_storage_bucket" "uploads" {
  name          = "pm-app-uploads-${var.environment}"
  project       = var.project_id
  location      = var.region
  force_destroy = var.environment != "prod" # 本番環境以外は強制削除を許可

  # 統一階層ストレージ（Uniform bucket-level access）
  uniform_bucket_level_access = true

  # ライフサイクル設定（オプション：古いファイルを自動削除）
  lifecycle_rule {
    condition {
      age = 365 # 1年経過
    }
    action {
      type = "Delete"
    }
  }

  # CORS設定（フロントエンドからの直接アップロードを許可する場合）
  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["Content-Type", "Content-Length", "ETag"]
    max_age_seconds = 3600
  }

  # バージョニング（本番環境のみ）
  versioning {
    enabled = var.environment == "prod"
  }

  labels = {
    environment = var.environment
    app         = "project-management"
    managed_by  = "terraform"
  }
}

# Cloud RunサービスアカウントにStorage Object Admin権限を付与
resource "google_storage_bucket_iam_member" "cloud_run_admin" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${var.cloud_run_sa_email}"
}

# 出力
output "bucket_name" {
  value       = google_storage_bucket.uploads.name
  description = "Cloud Storage Bucket Name"
}

output "bucket_url" {
  value       = google_storage_bucket.uploads.url
  description = "Cloud Storage Bucket URL"
}

