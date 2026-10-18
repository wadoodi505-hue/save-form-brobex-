FROM node:20-alpine

# Install Python 3, pip, and ffmpeg, and create a python symlink
RUN apk update && apk add --no-cache python3 py3-pip ffmpeg \
    && ln -sf python3 /usr/bin/python

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install npm dependencies
RUN npm install

# Copy source code
COPY . .

# Expose port and run server
EXPOSE 8787
CMD ["npm", "start"]