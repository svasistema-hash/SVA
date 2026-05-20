require('dotenv').config();
const path = require('path');

const BACKEND_DIR = __dirname;

if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET no definido en .env');
if (!process.env.ENCRYPTION_KEY) throw new Error('ENCRYPTION_KEY no definido en .env');

module.exports = {
  BACKEND_DIR,
  PORT: parseInt(process.env.PORT || '3001', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET,
  ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
  DB_PATH: path.resolve(BACKEND_DIR, process.env.DB_PATH || './lexdocs.db'),
  UPLOADS_PATH: path.resolve(BACKEND_DIR, process.env.UPLOADS_PATH || '../uploads'),
  PDFS_PATH: path.resolve(BACKEND_DIR, process.env.PDFS_PATH || '../pdfs'),
  // CORS: en dev acepta localhost:7777 + 127.0.0.1:7777.
  // En producción: setear CORS_ORIGIN como CSV con los dominios permitidos
  // (e.g. CORS_ORIGIN=https://tu-app.vercel.app,https://otro.vercel.app).
  CORS_ORIGIN: process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean)
    : ['http://localhost:7777', 'http://127.0.0.1:7777'],
};
