# Use a lightweight Node.js base image
FROM node:20-alpine

# Install Python3, pip, and ffmpeg (required for yt-dlp to merge audio/video)
RUN apk add --no-cache python3 py3-pip ffmpeg

# Set the working directory inside the container
WORKDIR /app

# Copy package management files and install dependencies
COPY package*.json ./
RUN npm install

# Copy all server code into the container
COPY . .

# Build TypeScript code if you are using TypeScript
RUN npm run build --if-present

# Expose the backend port
EXPOSE 5000

# Start the Express server
CMD ["npm", "start"]