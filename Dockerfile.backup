FROM node:18-slim

# Install Python, FFmpeg, and curl (required for yt-dlp to download/stream videos)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install the latest yt-dlp binary globally
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp

# Set the working directory inside the container
WORKDIR /app

# Copy package configuration files from your root directory
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy all your project files (including the 'server' folder and cookies.txt) into the container
COPY . .

# Expose the port your backend runs on
EXPOSE 3000

# Command to start your backend server (pointing to your server/server.cjs or server/index.ts)
CMD ["node", "server/server.cjs"]