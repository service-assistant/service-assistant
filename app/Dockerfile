FROM node:26.5-alpine3.23 AS builder

WORKDIR /app

COPY package*.json ./
COPY scripts ./scripts
RUN --mount=type=cache,target=/root/.npm npm ci

COPY . .
ARG EXPO_PUBLIC_API_URL
ARG EXPO_PUBLIC_AUTH_TOKEN
ENV EXPO_PUBLIC_API_URL=$EXPO_PUBLIC_API_URL
ENV EXPO_PUBLIC_AUTH_TOKEN=$EXPO_PUBLIC_AUTH_TOKEN
RUN npm run build:web


FROM caddy:2-alpine AS runtime

COPY --from=builder /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80
