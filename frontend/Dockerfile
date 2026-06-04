# Build Stage
FROM node:20-alpine AS builder
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production Stage: Serve static assets with Nginx
FROM nginx:alpine
COPY --from=builder /usr/src/app/dist /usr/share/nginx/html
# Copy default nginx configuration if custom routing is needed, else standard Nginx is fine
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
