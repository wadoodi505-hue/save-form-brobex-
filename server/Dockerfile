FROM node:20-alpine

RUN apk update && apk add --no-cache python3 py3-pip ffmpeg curl && ln -sf python3 /usr/bin/python
RUN pip install --no-cache-dir --upgrade pip && pip install --no-cache-dir --upgrade yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . ./

EXPOSE 8787

CMD ["npm", "start"]