FROM node:22-bullseye

# Install Playwright dependencies
RUN npx playwright install-deps chromium

WORKDIR /app

COPY package*.json ./
RUN npm install

# Install Playwright browsers
RUN npx playwright install chromium

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
