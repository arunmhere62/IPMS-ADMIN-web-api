# Use Debian-based image (important for Prisma)
FROM node:20

WORKDIR /app

# Install OpenSSL (required for Prisma)
RUN apt-get update && apt-get install -y openssl

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy full project
COPY . .

# Generate Prisma client for both schemas + build app
RUN npm run prisma:generate:all
RUN npm run build

# Expose port
EXPOSE 3000

# Start app
CMD ["node", "dist/main.js"]
