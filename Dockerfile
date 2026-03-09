# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cached layer)
COPY package*.json ./
RUN npm install

# Pass Google OAuth credentials as build-time args so Vite bakes them
# into the JS bundle (standard practice for TV/installed apps).
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_GOOGLE_CLIENT_SECRET

ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
ENV VITE_GOOGLE_CLIENT_SECRET=$VITE_GOOGLE_CLIENT_SECRET

COPY . .
RUN npm run build

# ── Stage 2: Serve ───────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
