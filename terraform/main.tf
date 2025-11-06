terraform {
  required_version = ">= 1.5"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  
  backend "gcs" {
    bucket = "saito-test-gcp-terraform-state"
    prefix = "terraform/state"
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# 変数
variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "saito-test-gcp"
}

variable "region" {
  description = "Default GCP region"
  type        = string
  default     = "asia-northeast1"
}

variable "zone" {
  description = "Default GCP zone"
  type        = string
  default     = "asia-northeast1-a"
}

# 環境設定
locals {
  environments = ["dev", "staging", "production"]
  
  # 環境ごとのリソース設定
  env_config = {
    dev = {
      cloud_run_cpu       = "1"
      cloud_run_memory    = "512Mi"
      cloud_run_min_instances = 0
      cloud_run_max_instances = 2
      db_tier             = "db-f1-micro"
      db_disk_size        = 10
    }
    staging = {
      cloud_run_cpu       = "1"
      cloud_run_memory    = "1Gi"
      cloud_run_min_instances = 0
      cloud_run_max_instances = 5
      db_tier             = "db-g1-small"
      db_disk_size        = 20
    }
    production = {
      cloud_run_cpu       = "2"
      cloud_run_memory    = "2Gi"
      cloud_run_min_instances = 1
      cloud_run_max_instances = 10
      db_tier             = "db-n1-standard-1"
      db_disk_size        = 50
    }
  }
  
  # 共通ラベル
  common_labels = {
    app        = "project-management"
    managed_by = "terraform"
    project    = "saito-test-gcp"
  }
}

# ネットワーキングモジュール
module "networking" {
  source     = "./modules/networking"
  project_id = var.project_id
  region     = var.region
}

# 出力
output "project_id" {
  value       = var.project_id
  description = "GCP Project ID"
}

output "region" {
  value       = var.region
  description = "GCP Region"
}

output "vpc_name" {
  value       = module.networking.vpc_name
  description = "VPC Network Name"
}

output "vpc_connector_id" {
  value       = module.networking.vpc_connector_id
  description = "VPC Connector ID for Cloud Run"
}

# Artifact Registry モジュール
module "artifact_registry" {
  source     = "./modules/artifact-registry"
  project_id = var.project_id
  region     = var.region
}

# サービスアカウント モジュール
module "service_accounts" {
  source     = "./modules/service-accounts"
  project_id = var.project_id
}

# 追加の出力
output "artifact_registry_url" {
  value       = module.artifact_registry.repository_url
  description = "Artifact Registry URL"
}

output "cloud_build_sa_email" {
  value       = module.service_accounts.cloud_build_sa_email
  description = "Cloud Build Service Account"
}
