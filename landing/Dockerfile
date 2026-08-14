FROM alpine:3.21 AS builder

RUN apk add --no-cache gettext

WORKDIR /src
COPY index.html style.css ./
ARG APP_URL
ENV APP_URL=$APP_URL
RUN envsubst '${APP_URL}' < index.html > index.html.rendered && mv index.html.rendered index.html


FROM caddy:2-alpine

COPY --from=builder /src/index.html /src/style.css /srv/
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 80
