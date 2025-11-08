# Build stage
FROM node:18-alpine AS builder

ARG REACT_APP_ENV=production
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source files
COPY . .

# Copy appropriate env file
RUN if [ "$REACT_APP_ENV" = "development" ]; then \
      cp .env.development .env.production.local; \
    elif [ "$REACT_APP_ENV" = "staging" ]; then \
      cp .env.staging .env.production.local; \
    else \
      cp .env.production .env.production.local; \
    fi

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
