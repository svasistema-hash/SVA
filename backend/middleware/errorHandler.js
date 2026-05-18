const { NODE_ENV } = require('../config');

module.exports = function errorHandler(err, req, res, next) {
  if (NODE_ENV !== 'test') console.error('[ERROR]', req.method, req.originalUrl, '-', err.message);
  const code = err.status || err.statusCode || 500;
  const message = code >= 500 && NODE_ENV === 'production'
    ? 'Error interno del servidor'
    : err.message || 'Error interno del servidor';
  res.status(code).json({ error: message, code });
};
