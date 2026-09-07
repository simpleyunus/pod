# POD API — NestJS + Prisma
#
# Prisma's query and schema engines are native binaries that link against
# OpenSSL. node:*-alpine ships without it, so without the apk line below the
# engines fail to load and every prisma command dies with
# "Could not parse schema engine response" — which means `migrate deploy` in
# the CMD fails and the container crash-loops on a fresh deployment.
FROM node:20-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
