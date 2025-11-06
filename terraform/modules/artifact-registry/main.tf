variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
}

# Artifact Registry リポジトリ作成
resource "google_artifact_registry_repository" "app_images" {
  location      = var.region
  project       = var.project_id
  repository_id = "app-images"
  format        = "DOCKER"
  description   = "Docker repository for application images"
  
  labels = {
    app        = "project-management"
    managed_by = "terraform"
  }
}

# 出力
output "repository_id" {
  value       = google_artifact_registry_repository.app_images.repository_id
  description = "Artifact Registry Repository ID"
}

output "repository_url" {
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.app_images.repository_id}"
  description = "Artifact Registry Repository URL"
}
