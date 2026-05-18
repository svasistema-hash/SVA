const db = require('../db');

function isSuperAdmin(user) {
  return user && user.role === 'admin' && !user.institucion_id;
}

function deny(res, msg = 'Sin acceso a esta institución') {
  return res.status(403).json({ error: msg, code: 403 });
}

function requireTenant(getInstitucionId) {
  return (req, res, next) => {
    try {
      if (isSuperAdmin(req.user)) return next();
      const target = getInstitucionId(req);
      if (target == null) return deny(res, 'institucion_id requerido');
      if (Number(req.user?.institucion_id) !== Number(target)) return deny(res);
      next();
    } catch (err) {
      next(err);
    }
  };
}

function resolveInstitucionFromSlug(req) {
  const slug = req.params.slug;
  if (!slug) return null;
  const row = db.prepare('SELECT id FROM instituciones WHERE slug = ?').get(slug);
  return row ? row.id : null;
}

function resolveInstitucionFromContratoId(req) {
  const id = req.params.id;
  if (!id) return null;
  const row = db.prepare('SELECT institucion_id FROM contratos WHERE id = ?').get(id);
  return row ? row.institucion_id : null;
}

function resolveInstitucionFromClienteId(req) {
  const id = req.params.id;
  if (!id) return null;
  const row = db.prepare('SELECT institucion_id FROM clientes WHERE id = ?').get(id);
  return row ? row.institucion_id : null;
}

function resolveInstitucionFromBody(req) {
  return req.body?.institucion_id;
}

module.exports = {
  isSuperAdmin,
  requireTenant,
  resolveInstitucionFromSlug,
  resolveInstitucionFromContratoId,
  resolveInstitucionFromClienteId,
  resolveInstitucionFromBody,
};
