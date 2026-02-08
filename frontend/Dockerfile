FROM node:20-alpine AS builder
WORKDIR /app

# Build arg for API base URL
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=$VITE_API_BASE

# Install deps
COPY package*.json ./
RUN npm ci

# Build
COPY . .
RUN npm run build

# Serve with nginx
FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
