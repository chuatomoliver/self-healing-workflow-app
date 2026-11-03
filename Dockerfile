FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY . .
# The root postinstall installs backend and frontend dependencies.
RUN NODE_ENV=development npm ci && npm run build && npm cache clean --force
USER node
EXPOSE 3001
CMD ["npm", "start"]
