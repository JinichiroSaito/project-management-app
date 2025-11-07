FROM node:18-alpine

WORKDIR /app

# package.jsonをコピー
COPY package*.json ./

# 依存関係をインストール（npm installを使用）
RUN npm install --omit=dev

# アプリケーションコードをコピー
COPY . .

# ポート8080を公開
EXPOSE 8080

# アプリケーション起動
CMD ["node", "src/index.js"]
