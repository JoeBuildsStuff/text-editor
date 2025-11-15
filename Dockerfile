# Multi-stage build for Next.js app with better-sqlite3

# Stage 1: Builder - Install dependencies and build the app
FROM node:20.19.5-slim AS builder

# Install pnpm 9 and build dependencies for better-sqlite3
RUN corepack enable && corepack prepare pnpm@9 --activate

# Install build tools needed for better-sqlite3 native module
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies (including better-sqlite3 which will compile)
RUN pnpm install --frozen-lockfile

# Copy source code and config files
COPY . .

# Build Next.js application
# Skip type checking to save memory on resource-constrained VPS
# Set memory limit for Node.js build process
ENV SKIP_TYPE_CHECK=true
ENV NODE_OPTIONS="--max-old-space-size=1536"
RUN pnpm build

# Stage 2: Runner - Production image
FROM node:20.19.5-slim AS runner

# Install pnpm 9
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Set production environment
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Copy necessary files from builder
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/postcss.config.mjs ./
COPY --from=builder /app/src ./src

# Copy server directory structure (empty, will be mounted as volume)
# This ensures the directory exists with correct permissions
RUN mkdir -p /app/server/documents

# Install production dependencies
RUN pnpm install --prod --frozen-lockfile

# Copy TypeScript from builder (needed for next.config.ts at runtime)
# This avoids pnpm store version conflicts
COPY --from=builder /app/node_modules/typescript ./node_modules/typescript
COPY --from=builder /app/node_modules/.bin/tsc ./node_modules/.bin/tsc
RUN chmod +x ./node_modules/.bin/tsc 2>/dev/null || true

# Set ownership for node user
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose port
EXPOSE 3000

# Start the application
CMD ["pnpm", "start"]

