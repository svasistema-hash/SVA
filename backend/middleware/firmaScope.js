// Sprint LexDocs Legal Fase 2 CP3 — Middleware de scope por firma.
//
// Filtra TODOS los endpoints de Fase 2 (/api/firmas, /api/sociedades,
// /api/master) por `firma_id` del JWT. La regla:
//   - User sin firma_id ni institucion_id → 401 (no autenticado en Fase 2).
//   - User con institucion_id NULL pero firma_id NULL → 403 (es admin global,
//     no aplicable a Fase 2 que requiere firma).
//   - User con firma_id = 1 → es master tenant (LexDocs Legal).
//   - User con firma_id > 1 → es sub-tenant (debe ver SOLO su firma).
//
// El middleware setea `req.scope` con:
//   firma_id: el firma_id del user.
//   es_master: true sólo si firma_id === 1.
//
// Endpoints /api/master/* exigen es_master === true.
// Endpoints /api/sociedades/* aplican WHERE firma_id = req.scope.firma_id
// SIEMPRE, incluso para master (master accede a otras firmas vía /api/master/*).

const MASTER_FIRMA_ID = 1;

function requireFirmaScope(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Auth requerida', code: 401 });
  }
  if (!req.user.firma_id) {
    return res.status(403).json({
      error: 'Este endpoint requiere un usuario asociado a una firma legal',
      code: 403,
    });
  }
  req.scope = {
    firma_id: req.user.firma_id,
    es_master: req.user.firma_id === MASTER_FIRMA_ID,
  };
  next();
}

function requireMasterFirma(req, res, next) {
  requireFirmaScope(req, res, (err) => {
    if (err) return next(err);
    if (!req.scope.es_master) {
      return res.status(403).json({
        error: 'Este endpoint requiere acceso master',
        code: 403,
      });
    }
    next();
  });
}

module.exports = { requireFirmaScope, requireMasterFirma, MASTER_FIRMA_ID };
