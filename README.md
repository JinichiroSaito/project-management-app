# Project Management App

新規事業のプロジェクト案件管理アプリケーション

## 🏗️ アーキテクチャ
```
GCPプロジェクト: saito-test-gcp
├── VPC Network (app-vpc)
│   ├── app-subnet (10.0.10.0/24)
│   ├── db-subnet (10.0.20.0/24)
│   └── vpc-connector (10.0.30.0/28)
├── 環境: dev / staging / production
│   ├── Cloud Run (アプリケーション)
│   ├── Cloud SQL (PostgreSQL)
│   ├── Secret Manager (機密情報)
│   └── Artifact Registry (コンテナイメージ)
└── Cloud NAT (外部通信)
```

## 📁 ディレクトリ構造
```
project-management-app/
├── terraform/              # インフラストラクチャコード
│   ├── main.tf            # メイン設定
│   ├── modules/
│   │   ├── networking/    # VPC、サブネット、NAT
│   │   ├── security/      # IAM、Secret Manager
│   │   ├── cloud-run/     # Cloud Run設定
│   │   ├── database/      # Cloud SQL設定
│   │   └── monitoring/    # ログ、監視
│   └── environments/
│       ├── dev/           # 開発環境固有設定
│       ├── staging/       # ステージング環境固有設定
│       └── production/    # 本番環境固有設定
├── app/
│   ├── backend/           # バックエンドAPI
│   └── frontend/          # フロントエンドUI
├── .github/
│   └── workflows/         # CI/CDパイプライン
└── docs/                  # ドキュメント
```

## 🚀 セットアップ

### 前提条件

- gcloud CLI
- Terraform >= 1.5
- Git

### 初期セットアップ
```bash
# 1. プロジェクト設定
export PROJECT_ID="saito-test-gcp"
gcloud config set project ${PROJECT_ID}

# 2. Terraform初期化
cd terraform
terraform init

# 3. インフラ構築プラン確認
terraform plan

# 4. インフラ構築実行
terraform apply
```

## 🌍 環境情報

| 環境 | 用途 | Cloud Run | Cloud SQL | 備考 |
|------|------|-----------|-----------|------|
| **dev** | 開発・検証 | 512Mi / 1CPU | db-f1-micro | コスト最小 |
| **staging** | 本番前検証 | 1Gi / 1CPU | db-g1-small | 本番同等テスト |
| **production** | 本番運用 | 2Gi / 2CPU | db-n1-standard-1 | 高可用性 |

## 📋 次のステップ

- [x] プロジェクト作成
- [x] Terraform State バケット作成
- [x] ディレクトリ構造作成
- [x] ネットワーキングモジュール作成
- [ ] Terraform apply (VPC構築)
- [ ] サービスアカウント作成
- [ ] Cloud SQL セットアップ
- [ ] Cloud Run デプロイ
- [ ] CI/CDパイプライン構築
- [ ] モニタリング設定

## 🔧 主要コマンド
```bash
# Terraform
terraform init          # 初期化
terraform plan          # 変更確認
terraform apply         # 適用
terraform destroy       # 削除

# gcloud
gcloud config set project saito-test-gcp
gcloud services list --enabled
gcloud compute networks list
```

## 🔄 CI/CD (GitHub Actions)

### セットアップ

1. **GCPサービスアカウントキーの作成**
```bash
# サービスアカウントを作成（既存の場合はスキップ）
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions Service Account" \
  --project=saito-test-gcp

# 必要な権限を付与
gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.admin"

gcloud projects add-iam-policy-binding saito-test-gcp \
  --member="serviceAccount:github-actions@saito-test-gcp.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# サービスアカウントキーを生成
gcloud iam service-accounts keys create github-actions-key.json \
  --iam-account=github-actions@saito-test-gcp.iam.gserviceaccount.com \
  --project=saito-test-gcp
```

2. **GitHub Secretsの設定**

GitHubリポジトリの Settings > Secrets and variables > Actions に以下を追加：

- `GCP_SA_KEY`: サービスアカウントキー（github-actions-key.json）の内容をコピー&ペースト

3. **自動デプロイ**

`main`ブランチに`app/frontend/`配下の変更をプッシュすると、自動的にCloud Runにデプロイされます。

```bash
git add .
git commit -m "Update frontend"
git push origin main
```

### ワークフロー

- **トリガー**: `main`ブランチへのプッシュ（`app/frontend/`配下の変更時）
- **手動実行**: GitHub ActionsのUIから`workflow_dispatch`で手動実行可能
- **デプロイ先**: Cloud Run (frontend-dev)

## 📝 ドキュメント

- [アーキテクチャ設計](docs/architecture.md) - 詳細設計書
- [セキュリティ設計](docs/security.md) - セキュリティポリシー
- [運用手順](docs/operations.md) - デプロイ・運用手順

# CI/CD Test
# Auto Deploy Success! - 2025年 11月 8日 土曜日 08時20分24秒 JST
