# ── Build stage ──
FROM node:22-alpine AS build
WORKDIR /app
# Vite bakes VITE_* at build time
ARG VITE_API_BASE=""
ARG VITE_AUTH_MODE="mock"
ARG VITE_ENTRA_TENANT_ID=""
ARG VITE_ENTRA_CLIENT_ID=""
ARG VITE_ENTRA_API_SCOPE=""
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_AUTH_MODE=$VITE_AUTH_MODE \
    VITE_ENTRA_TENANT_ID=$VITE_ENTRA_TENANT_ID \
    VITE_ENTRA_CLIENT_ID=$VITE_ENTRA_CLIENT_ID \
    VITE_ENTRA_API_SCOPE=$VITE_ENTRA_API_SCOPE
COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
RUN npm install --workspace apps/web --include-workspace-root
COPY apps/web apps/web
WORKDIR /app/apps/web
RUN npm run build

# ── Runtime stage (nginx) ──
FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
