# Use official Node.js 18 LTS image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --omit=dev

# Copy application code
COPY . .

# Create temp directory for file uploads
RUN mkdir -p temp

# Expose port (Railway will override this)
EXPOSE 3001

# Health check
# Railway will handle health checks via railway.json

# Start the application
CMD ["npm", "start"]
