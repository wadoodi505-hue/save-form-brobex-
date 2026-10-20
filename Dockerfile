
FROM node:22-bookworm-slim

# Install required system tools

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python-is-python3 \
    ffmpeg \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Make the python command available to npm install scripts
RUN ln -sf /usr/bin/python3 /usr/local/bin/python \
    && python --version


# Install yt-dlp at a known executable path
RUN curl -fL --retry 3 \
    https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp \
    && chmod 755 /usr/local/bin/yt-dlp

WORKDIR /app

# Install Node.js dependencies
COPY package*.json ./
RUN npm ci --include=dev

# Copy application source
COPY . .

EXPOSE 8787

CMD ["npm", "start"]
