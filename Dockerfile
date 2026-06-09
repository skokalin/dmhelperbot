FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm install
# Копируем структуру директории src целиком
COPY src/ ./src/
CMD ["npm", "start"]
