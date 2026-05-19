const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const { PORT, CORS_ORIGIN, UPLOADS_PATH, NODE_ENV } = require('./config');
require('./db');

const authRoutes = require('./routes/auth');
const institucionesRoutes = require('./routes/instituciones');
const contratosRoutes = require('./routes/contratos');
const clientesRoutes = require('./routes/clientes');
const modelosRoutes = require('./routes/modelos');
const clausulasRoutes = require('./routes/clausulas');
const clientesJuridicosRoutes = require('./routes/clientesJuridicos');
const { authRouter: solicitudesAuthRouter, publicRouter: solicitudesPublicRouter } = require('./routes/solicitudes');
const { authenticate } = require('./middleware/auth');
const errorHandler = require('./middleware/errorHandler');
const ocr = require('./utils/ocr');

const app = express();

app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '5mb' }));

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: NODE_ENV === 'production' ? 100 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta de nuevo más tarde', code: 429 },
});
app.use('/api', apiLimiter);

app.get('/health', (req, res) => res.json({ ok: true, service: 'lexdocs-api' }));

app.use('/api/auth', authRoutes);
app.use('/api/public', solicitudesPublicRouter);
app.use(solicitudesAuthRouter);

app.get('/api/files/:filename', authenticate, (req, res, next) => {
  try {
    const name = req.params.filename;
    if (!name || name.includes('..') || name.includes('/') || name.includes('\\')) {
      return res.status(400).json({ error: 'Nombre de archivo inválido', code: 400 });
    }
    const abs = path.join(UPLOADS_PATH, name);
    if (path.dirname(abs) !== UPLOADS_PATH) {
      return res.status(400).json({ error: 'Ruta inválida', code: 400 });
    }
    if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Archivo no encontrado', code: 404 });
    res.sendFile(abs);
  } catch (err) {
    next(err);
  }
});

app.use('/api/instituciones', authenticate, institucionesRoutes);
app.use('/api/contratos', authenticate, contratosRoutes);
// /api/clientes/juridicos DEBE registrarse ANTES de /api/clientes para que la
// segunda ruta (con GET /:id) no capture "juridicos" como un id.
app.use('/api/clientes/juridicos', authenticate, clientesJuridicosRoutes);
app.use('/api/clientes', authenticate, clientesRoutes);
app.use('/api/modelos', authenticate, modelosRoutes);
app.use('/api/clausulas', authenticate, clausulasRoutes);

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada', code: 404 }));
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`LexDocs API escuchando en http://localhost:${PORT}`);
  // Pre-carga del modelo Tesseract 'spa' en background (no bloquea el listen).
  ocr.warmUp();
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));

module.exports = app;
