FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install system dependencies (openssl is needed by Prisma)
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy dependency definitions and install
COPY package*.json ./
RUN npm ci

# Copy all source files
COPY . .

# Generate Prisma client and build TypeScript
RUN npx prisma generate
RUN npm run build

# --- Production Image ---
FROM node:20-bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy necessary files from builder
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# The server.ts hardcodes path.join(process.cwd(), 'src', 'web', 'public')
COPY --from=builder /app/src/web/public ./src/web/public

# Create uploads directory for local file storage
RUN mkdir -p /app/uploads

# Set correct environment
ENV NODE_ENV=production

# Start the bot (runs prisma db push and starts node)
CMD ["npm", "run", "start"]
