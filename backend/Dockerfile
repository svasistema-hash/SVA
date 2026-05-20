# LexDocs backend — Dockerfile para Railway / cualquier plataforma con builder
# Docker. Reemplaza nixpacks / railpack para evitar el problema del auto-provider
# de Puppeteer (que intentaba instalar 38 paquetes apt y se quedaba sin disco).
#
# Estrategia:
#  - Node 24 sobre Debian slim (~80MB base).
#  - Instalamos solo chromium del sistema + las fuentes necesarias para el PDF
#    notarial (Libre Baskerville se carga via Google Fonts en runtime, pero
#    chromium necesita el fontconfig + algunas fuentes base).
#  - Puppeteer NO descarga su propio Chromium (PUPPETEER_SKIP_DOWNLOAD=true)
#    → usa el del sistema en /usr/bin/chromium.
#  - Tesseract.js descarga su modelo spa.traineddata al boot (no en build),
#    se cachea en disco persistente.

FROM node:24-bookworm-slim

# Variables para Puppeteer: skip download y usar chromium del sistema.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

# Dependencias del sistema:
#  - chromium       → engine de render para Puppeteer (~150 MB)
#  - fonts-liberation, fonts-noto-color-emoji → fonts fallback para el PDF
#  - ca-certificates → HTTPS hacia Google Fonts y APIs externas
#  - dumb-init      → manejo correcto de señales (PID 1) en contenedor
#  - libvips        → requerido por sharp para procesamiento de imágenes OCR
#  - build-essential, python3 → para compilar better-sqlite3 native
#
# --no-install-recommends mantiene la imagen lo más chica posible.
# rm -rf /var/lib/apt/lists/* libera ~50MB.
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    fonts-liberation \
    fonts-noto-color-emoji \
    ca-certificates \
    dumb-init \
    libvips \
    build-essential \
    python3 \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

WORKDIR /app

# Cachear npm install: copiar SOLO manifests primero. Si package.json no cambia,
# Docker reusa esta capa en builds siguientes.
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copiar el resto del código del backend.
COPY . .

# Puerto que el código escucha. Railway inyecta PORT y server.js lo lee.
EXPOSE 3002

# dumb-init como PID 1 → reenvía SIGTERM correctamente al proceso de Node.
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]
