const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { JWT_SECRET } = require('../config');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login, intenta de nuevo en 15 minutos', code: 429 },
});

router.post('/login', loginLimiter, (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email y password requeridos', code: 400 });
    }
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND activo = 1').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Credenciales inválidas', code: 401 });
    }
    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      institucion_id: user.institucion_id,
      // Sprint Fase 2 CP3 — firma_id en JWT para que el middleware de scope
      // pueda filtrar consultas a /api/firmas, /api/sociedades, /api/master.
      // Exclusivo con institucion_id (uno de los dos debe ser NULL).
      firma_id: user.firma_id || null,
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        role: user.role,
        institucion_id: user.institucion_id,
        firma_id: user.firma_id || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
