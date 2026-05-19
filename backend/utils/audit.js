// Helper para escribir en audit_log desde cualquier ruta.
//
// Uso típico:
//   audit(req, 'CONTRATO_TRANSICION', 'contrato', id, { de, a, motivo });
//
// El req se usa para extraer user (de req.user inyectado por authenticate) +
// ip + user-agent. Si req es null, se registra anónimo (ej. cron job).

const db = require('../db');

const insertStmt = db.prepare(`
  INSERT INTO audit_log
    (user_id, user_email, user_role, institucion_id, accion, entidad_tipo, entidad_id, detalles, ip, user_agent)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function extractIp(req) {
  if (!req) return null;
  const xff = req.headers?.['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return req.ip || req.connection?.remoteAddress || null;
}

function audit(req, accion, entidadTipo, entidadId, detalles = {}) {
  if (!accion) throw new Error('audit: accion requerida');
  const user = (req && req.user) || {};
  insertStmt.run(
    user.userId || null,
    user.email || null,
    user.role || null,
    user.institucion_id || null,
    accion,
    entidadTipo || null,
    entidadId != null ? Number(entidadId) : null,
    detalles ? JSON.stringify(detalles) : null,
    extractIp(req),
    req?.headers?.['user-agent'] || null
  );
}

function auditAnonimo(accion, entidadTipo, entidadId, detalles = {}, extra = {}) {
  insertStmt.run(
    extra.user_id ?? null,
    extra.user_email ?? null,
    extra.user_role ?? null,
    extra.institucion_id ?? null,
    accion,
    entidadTipo || null,
    entidadId != null ? Number(entidadId) : null,
    detalles ? JSON.stringify(detalles) : null,
    extra.ip ?? null,
    extra.user_agent ?? null
  );
}

module.exports = { audit, auditAnonimo };
