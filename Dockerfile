# Build from source so deployments always receive the current, hashed assets.
FROM node:24-alpine AS build
WORKDIR /build
COPY . .
RUN node scripts/build.mjs

# The public image contains only the allowlisted build output, never the repo.
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /build/docs/ /usr/share/nginx/html/
EXPOSE 8080
