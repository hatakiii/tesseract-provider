FROM node:18-slim

# Системд шаардлагатай сангуудыг суулгах
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libtesseract-dev \
    tesseract-ocr-eng \
    tesseract-ocr-mon \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Түр зуур файл хадгалах фолдер үүсгэх (Permission алдаанаас сэргийлнэ)
RUN mkdir -p /tmp/uploads && chmod 777 /tmp/uploads

EXPOSE 3000

CMD ["node", "server.js"]