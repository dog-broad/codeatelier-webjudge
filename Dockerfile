# Pinned to match the playwright npm version in package.json so the browsers
# bundled in the image are the ones the package drives (no runtime download).
FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

# Install production deps first for layer caching. Browsers are already in the
# base image, so the playwright package does not re-download them.
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src

ENV PORT=4400
EXPOSE 4400

# The image provides a non-root user; the browser is launched with --no-sandbox
# in code, which is the standard container posture for headless Chromium.
USER pwuser

CMD ["node", "src/server.js"]
