variable "project_id" {
  type = string
}

variable "region" {
  type = string
}

variable "vpc_network" {
  type = string
}

variable "environment" {
  type    = string
  default = "dev"
}

# Private IP用のグローバルアドレス割り当て
resource "google_compute_global_address" "private_ip_address" {
  name          = "db-private-ip-${var.environment}"
  project       = var.project_id
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = var.vpc_network
}

# VPCピアリング接続
resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = var.vpc_network
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]
}

# Cloud SQL インスタンス
resource "google_sql_database_instance" "main" {
  name             = "pm-app-db-${var.environment}"
  project          = var.project_id
  region           = var.region
  database_version = "POSTGRES_15"
  
  deletion_protection = false # 開発環境用（本番はtrue）
  
  settings {
    tier              = "db-f1-micro" # 開発環境用（本番はdb-n1-standard-1以上）
    availability_type = "ZONAL"
    disk_type         = "PD_SSD"
    disk_size         = 10
    
    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
    }
    
    ip_configuration {
      ipv4_enabled    = false
      private_network = var.vpc_network
      require_ssl     = false # 開発環境用（本番はtrue推奨）
    }
    
    database_flags {
      name  = "max_connections"
      value = "100"
    }
  }
  
  depends_on = [google_service_networking_connection.private_vpc_connection]
}

# データベース作成
resource "google_sql_database" "database" {
  name     = "pm_app"
  instance = google_sql_database_instance.main.name
  project  = var.project_id
}

# ランダムパスワード生成
resource "random_password" "db_password" {
  length  = 32
  special = true
}

# ユーザー作成
resource "google_sql_user" "user" {
  name     = "app_user"
  instance = google_sql_database_instance.main.name
  project  = var.project_id
  password = random_password.db_password.result
}

# Secret Managerにパスワード保存
resource "google_secret_manager_secret" "db_password" {
  secret_id = "db-password-${var.environment}"
  project   = var.project_id
  
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db_password.result
}

# Cloud Runサービスアカウントに権限付与
resource "google_secret_manager_secret_iam_member" "secret_access" {
  secret_id = google_secret_manager_secret.db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:cloud-run-dev@${var.project_id}.iam.gserviceaccount.com"
}

# 出力
output "instance_name" {
  value       = google_sql_database_instance.main.name
  description = "Cloud SQL instance name"
}

output "instance_connection_name" {
  value       = google_sql_database_instance.main.connection_name
  description = "Connection name for Cloud SQL instance"
}

output "database_name" {
  value       = google_sql_database.database.name
  description = "Database name"
}

output "database_user" {
  value       = google_sql_user.user.name
  description = "Database user"
}

output "private_ip_address" {
  value       = google_sql_database_instance.main.private_ip_address
  description = "Private IP address"
}

output "db_password_secret" {
  value       = google_secret_manager_secret.db_password.secret_id
  description = "Secret Manager secret ID for database password"
}
