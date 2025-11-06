variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
}

# VPC作成
resource "google_compute_network" "vpc" {
  name                    = "app-vpc"
  project                 = var.project_id
  auto_create_subnetworks = false
  description             = "VPC for Project Management App"
  
  depends_on = []
}

# アプリケーション用サブネット
resource "google_compute_subnetwork" "app_subnet" {
  name          = "app-subnet"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = "10.0.10.0/24"
  
  private_ip_google_access = true
  
  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata             = "INCLUDE_ALL_METADATA"
  }
}

# データベース用サブネット
resource "google_compute_subnetwork" "db_subnet" {
  name          = "db-subnet"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = "10.0.20.0/24"
  
  private_ip_google_access = true
}

# Cloud NAT用ルーター
resource "google_compute_router" "nat_router" {
  name    = "nat-router"
  project = var.project_id
  region  = var.region
  network = google_compute_network.vpc.id
}

# Cloud NAT
resource "google_compute_router_nat" "nat" {
  name                               = "cloud-nat"
  project                            = var.project_id
  router                             = google_compute_router.nat_router.name
  region                             = var.region
  nat_ip_allocate_option            = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
  
  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}

# Serverless VPC Access Connector（Cloud Run用）
resource "google_vpc_access_connector" "connector" {
  name          = "vpc-connector"
  project       = var.project_id
  region        = var.region
  network       = google_compute_network.vpc.name
  ip_cidr_range = "10.0.30.0/28"
  
  min_instances = 2
  max_instances = 3
  
  machine_type = "e2-micro"
}

# ファイアウォールルール: 内部通信許可
resource "google_compute_firewall" "allow_internal" {
  name    = "allow-internal"
  project = var.project_id
  network = google_compute_network.vpc.name
  
  allow {
    protocol = "tcp"
    ports    = ["0-65535"]
  }
  
  allow {
    protocol = "udp"
    ports    = ["0-65535"]
  }
  
  allow {
    protocol = "icmp"
  }
  
  source_ranges = ["10.0.0.0/16"]
  
  description = "Allow internal communication within VPC"
}

# 出力
output "vpc_id" {
  value       = google_compute_network.vpc.id
  description = "VPC ID"
}

output "vpc_name" {
  value       = google_compute_network.vpc.name
  description = "VPC Name"
}

output "vpc_self_link" {
  value       = google_compute_network.vpc.self_link
  description = "VPC Self Link"
}

output "app_subnet_name" {
  value       = google_compute_subnetwork.app_subnet.name
  description = "Application Subnet Name"
}

output "app_subnet_cidr" {
  value       = google_compute_subnetwork.app_subnet.ip_cidr_range
  description = "Application Subnet CIDR"
}

output "db_subnet_name" {
  value       = google_compute_subnetwork.db_subnet.name
  description = "Database Subnet Name"
}

output "db_subnet_cidr" {
  value       = google_compute_subnetwork.db_subnet.ip_cidr_range
  description = "Database Subnet CIDR"
}

output "vpc_connector_id" {
  value       = google_vpc_access_connector.connector.id
  description = "VPC Connector ID"
}

output "vpc_connector_name" {
  value       = google_vpc_access_connector.connector.name
  description = "VPC Connector Name"
}
