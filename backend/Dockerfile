FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json bun.lock ./
RUN npm install --omit=dev --ignore-scripts
COPY src ./src
COPY scripts ./scripts
RUN mkdir /data && chown node:node /data
USER node
ENV DATA_DIR=/data PORT=4000
EXPOSE 4000
CMD ["node", "src/main.mjs"]