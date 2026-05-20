# Deploy de LexDocs — Vercel (frontend) + Railway (backend)

Esta guía describe paso a paso cómo poner LexDocs en producción para pruebas en
vivo. **No es deploy productivo** — falta hardening que se cubre después.

## Topología

```
┌─────────────────────────┐         HTTPS         ┌──────────────────────────┐
│  Vercel                 │ ───────────────────▶  │  Railway                 │
│  frontend (Vite + React)│   VITE_API_URL=https  │  backend (Express)       │
│  https://X.vercel.app   │                       │  https://Y.up.railway.app│
└─────────────────────────┘                       │  + Volumen persistente:  │
                                                  │    lexdocs.db            │
                                                  │    uploads/              │
                                                  │    pdfs/                 │
                                                  │    spa.traineddata       │
                                                  └──────────────────────────┘
```

## 1. Generar secretos para producción

En tu terminal local, generar valores nuevos (NO usar los de dev):

```bash
# JWT_SECRET (64 bytes hex)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# ENCRYPTION_KEY (32 bytes hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Guarda ambos en un gestor de contraseñas. **Si pierdes ENCRYPTION_KEY los
datos encriptados son irrecuperables.**

## 2. Railway — backend

### 2.1 Cuenta y proyecto
1. Crea cuenta en https://railway.com con GitHub (usa la misma org de `svasistema-hash`).
2. **New Project → Deploy from GitHub repo → svasistema-hash/SVA**.
3. Elegir branch `main` (o el branch a deployar para pruebas).
4. Railway autodetecta nixpacks. Como el repo tiene `backend/` como subdirectorio:
   - Settings → **Root Directory: `lexdocs/backend`**.

### 2.2 Volumen persistente
Crítico para que la BD SQLite y las imágenes/PDFs sobrevivan reinicios.

1. En el servicio del backend: **Settings → Volumes → New Volume**.
2. Mount path: `/data`
3. Size: 1GB (suficiente para pruebas).

### 2.3 Variables de entorno
En el servicio backend → **Variables**:

| Variable | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | (el hex de 64 bytes generado en paso 1) |
| `ENCRYPTION_KEY` | (el hex de 32 bytes generado en paso 1) |
| `DB_PATH` | `/data/lexdocs.db` |
| `UPLOADS_PATH` | `/data/uploads` |
| `PDFS_PATH` | `/data/pdfs` |
| `CORS_ORIGIN` | (dejar vacío hasta saber la URL de Vercel — completar después) |

`PORT` lo inyecta Railway automáticamente. `PUPPETEER_EXECUTABLE_PATH` y
`PUPPETEER_SKIP_DOWNLOAD` los pone `nixpacks.toml`.

### 2.4 Primer deploy
1. **Deploy** desde la UI o esperar al push.
2. Logs deben mostrar:
   ```
   LexDocs API escuchando en http://localhost:<PORT>
   [ocr] tesseract worker listo (spa)
   ```
3. Obtener la URL pública: **Settings → Networking → Generate Domain**.
   Anotala: `https://lexdocs-backend-production-XXXX.up.railway.app`

### 2.5 Probar
```bash
curl https://lexdocs-backend-production-XXXX.up.railway.app/health
# → {"ok":true,"service":"lexdocs-api"}
```

### 2.6 Seed inicial (primera vez)
Si la BD está vacía, conectar por shell y correr el seed:

1. Railway → servicio → **Shell**.
2. `cd /app/lexdocs/backend && node seed.js`
3. Anota las credenciales `admin@lexdocs.gt` / `lexdocs2026`. Cámbialas
   después manualmente con bcrypt si esto va a quedar abierto al público.

## 3. Vercel — frontend

### 3.1 Importar repo
1. https://vercel.com/new → seleccionar `svasistema-hash/SVA`.
2. **Root Directory: `lexdocs/frontend`**.
3. Framework Preset: **Vite** (debe detectarse solo).
4. Build Command: `npm run build` · Output: `dist`.

### 3.2 Variables de entorno
En Vercel → **Settings → Environment Variables**:

| Variable | Valor |
|---|---|
| `VITE_API_URL` | `https://lexdocs-backend-production-XXXX.up.railway.app/api` |

(La URL del backend Railway del paso 2.4.)

### 3.3 Deploy
1. **Deploy** desde la UI.
2. Una vez listo, obtener la URL: `https://lexdocs-XXXX.vercel.app`.

### 3.4 Configurar CORS en Railway
1. Volver a Railway → servicio backend → **Variables**.
2. Setear `CORS_ORIGIN=https://lexdocs-XXXX.vercel.app` con tu URL real.
3. Railway reinicia el servicio automáticamente.

## 4. Verificación end-to-end

1. Abrir el dominio Vercel.
2. Login con `admin@lexdocs.gt` / `lexdocs2026`.
3. Si funciona el dashboard, el círculo está cerrado.

## 5. Pruebas en vivo (smoke)

| Test | Pasos |
|---|---|
| Login | Usuario admin entra al dashboard |
| Crear contrato | Solicitudes → Nueva solicitud → Generar link |
| Portal público | Abrir link generado en ventana incógnita, llenar wizard C1-C7 |
| PDF | Bufete entra a /pendientes → completa B1-B6 → PDF se descarga |
| Encriptación | DPI/NIT/capital nunca se ven plaintext en la BD |

## 6. Pendientes para producción REAL (no esta prueba)

- Migrar SQLite a Postgres (Railway lo provee, mejor concurrencia + backups)
- Subir credenciales del admin a un secret manager, NO `lexdocs2026` por default
- Dominio propio en lugar de `*.vercel.app` y `*.up.railway.app`
- Backups automáticos del volumen `/data` y de la BD
- Logs estructurados (pino o winston) + log aggregator
- Rate limiting más agresivo en login (actualmente 10 intentos/15min)
- Tesseract con modelo `tessdata_best` (~20MB) en lugar del `tessdata_fast` actual
- Service worker + caché del frontend para reducir cold loads
- Monitoreo (Sentry o equivalente) en frontend y backend
- Auditoría legal completa del flujo notarial guatemalteco
- 2FA para usuarios del bufete

## 7. Troubleshooting común

### Backend "Cannot find module" en Railway
Asegurar Root Directory = `lexdocs/backend` (no la raíz del monorepo).

### Frontend recibe 401 después de login
`VITE_API_URL` en Vercel apunta al backend equivocado. Verificar con DevTools
Network qué URL está llamando.

### Backend 500 al generar PDF
Logs probablemente muestran `Failed to launch the browser process` o
`Chromium not found`. Verificar que `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`
está en el environment y que `nixpacks.toml` se aplicó (el log de build debe
mencionar chromium).

### `decrypt failed: tampered or wrong key`
ENCRYPTION_KEY cambió desde que se guardaron datos. Restaurar la KEY anterior
o aceptar que esos datos se perdieron y borrarlos con un cleanup.

### CORS error en el navegador
`CORS_ORIGIN` en Railway no incluye el dominio exacto de Vercel. Comparar
URL del navegador con la variable.
