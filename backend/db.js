const Database = require('better-sqlite3');
const { DB_PATH } = require('./config');

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Schema. Las columnas sensibles (dpi, nit, conyuge_dpi, ingresos, domicilio en
// clientes; dpi en representantes y fiadores; datos_cliente y datos_garantia en
// contratos) guardan ciphertext base64(AES-256-GCM). Las columnas *_hash son
// HMAC-SHA256(subkey=HMAC(KEY,'purpose:<name>')) para búsqueda exacta.
// Ver backend/encryption.js para detalles.
db.exec(`
  CREATE TABLE IF NOT EXISTS instituciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL UNIQUE,
    tipo TEXT NOT NULL CHECK (tipo IN ('banco','financiera','desarrolladora','prestamista')),
    nombre TEXT NOT NULL,
    nit TEXT,
    registro_mercantil TEXT,
    autorizacion_sib TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    correlativo_prefijo TEXT,
    cuenta_cobro TEXT,
    -- Hotfix Fix 3 (2026-05-20): datos completos de persona jurídica acreedora.
    razon_social TEXT,
    tipo_sociedad TEXT,
    objeto_social TEXT,
    direccion_fiscal TEXT,
    escritura_numero TEXT,
    escritura_fecha TEXT,
    escritura_notario TEXT,
    rm_numero TEXT,
    rm_folio TEXT,
    rm_libro TEXT,
    rm_fecha TEXT,
    patente_sociedad_numero TEXT,
    patente_sociedad_fecha TEXT,
    patente_empresa_numero TEXT,
    patente_empresa_fecha TEXT,
    capital_autorizado TEXT,
    capital_suscrito TEXT,
    capital_pagado TEXT,
    regimen_tributario TEXT,
    actividad_economica TEXT,
    fecha_inicio_actividades TEXT
  );

  CREATE TABLE IF NOT EXISTS representantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institucion_id INTEGER NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    dpi TEXT,                  -- ciphertext AES-GCM
    cargo TEXT,
    escritura_no TEXT,
    escritura_fecha TEXT,
    notario_escritura TEXT,
    vencimiento TEXT,
    activo INTEGER NOT NULL DEFAULT 1
    -- UNIQUE (institucion_id, dpi) removido: dpi es ciphertext con IV random,
    -- la unicidad de plaintext ya no se puede chequear desde el motor SQL.
  );
  CREATE INDEX IF NOT EXISTS idx_representantes_inst ON representantes(institucion_id);

  CREATE TABLE IF NOT EXISTS modelos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institucion_id INTEGER NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    tipo_garantia TEXT NOT NULL CHECK (tipo_garantia IN ('personal','hipotecaria','prendaria','mixta')),
    clausulas TEXT NOT NULL DEFAULT '[]',
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (institucion_id, nombre)
  );
  CREATE INDEX IF NOT EXISTS idx_modelos_inst ON modelos(institucion_id);

  CREATE TABLE IF NOT EXISTS clausulas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institucion_id INTEGER REFERENCES instituciones(id) ON DELETE CASCADE,
    modelo_id INTEGER REFERENCES modelos(id) ON DELETE CASCADE,
    orden INTEGER NOT NULL DEFAULT 0,
    codigo TEXT NOT NULL,
    titulo TEXT NOT NULL,
    texto_base TEXT NOT NULL,
    variables TEXT NOT NULL DEFAULT '[]',
    obligatoria INTEGER NOT NULL DEFAULT 0,
    UNIQUE (modelo_id, codigo)
  );
  CREATE INDEX IF NOT EXISTS idx_clausulas_modelo ON clausulas(modelo_id, orden);
  CREATE INDEX IF NOT EXISTS idx_clausulas_inst ON clausulas(institucion_id);

  CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institucion_id INTEGER NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    dpi TEXT,                  -- ciphertext AES-GCM
    dpi_scan_path TEXT,
    fecha_nac TEXT,
    lugar_nac TEXT,
    profesion TEXT,
    estado_civil TEXT,
    nit TEXT,                  -- ciphertext AES-GCM
    telefono TEXT,
    email TEXT,
    domicilio TEXT,            -- ciphertext AES-GCM
    recibo_path TEXT,
    ingresos TEXT,             -- ciphertext de string canónico "18500.00"
    empleo TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    estado TEXT NOT NULL DEFAULT 'activo',
    autorizaciones TEXT,
    genero TEXT,
    conyuge_nombre TEXT,
    conyuge_dpi TEXT,          -- ciphertext AES-GCM
    ingresos_rango TEXT,
    dpi_hash TEXT,             -- HMAC purpose 'dpi'
    nit_hash TEXT,             -- HMAC purpose 'nit'
    conyuge_dpi_hash TEXT,     -- HMAC purpose 'dpi' (mismo namespace que dpi_hash)
    tipo_persona TEXT NOT NULL DEFAULT 'individual'
      CHECK (tipo_persona IN ('individual','juridica'))
  );
  CREATE INDEX IF NOT EXISTS idx_clientes_inst ON clientes(institucion_id);
  CREATE UNIQUE INDEX IF NOT EXISTS uq_clientes_inst_dpi_hash
    ON clientes(institucion_id, dpi_hash)
    WHERE dpi_hash IS NOT NULL;
  CREATE INDEX IF NOT EXISTS idx_clientes_dpi_hash ON clientes(dpi_hash);
  CREATE INDEX IF NOT EXISTS idx_clientes_nit_hash ON clientes(nit_hash);
  CREATE INDEX IF NOT EXISTS idx_clientes_conyuge_dpi_hash ON clientes(conyuge_dpi_hash);
  CREATE INDEX IF NOT EXISTS idx_clientes_tipo_persona ON clientes(tipo_persona);

  -- Datos extra para clientes con tipo_persona = 'juridica' (relación 1:1).
  -- rep_dpi y capital_* viven como ciphertext AES-GCM; rep_dpi_hash con HMAC purpose 'dpi'.
  CREATE TABLE IF NOT EXISTS clientes_juridicos (
    cliente_id INTEGER PRIMARY KEY REFERENCES clientes(id) ON DELETE CASCADE,

    nombre_comercial TEXT,
    tipo_sociedad TEXT NOT NULL CHECK (tipo_sociedad IN
      ('S.A.','S.R.L.','Sociedad Civil','E.M.I.',
       'Cooperativa','Asociación/Fundación','Otra')),
    tipo_sociedad_otra TEXT,
    objeto_social TEXT NOT NULL,

    escritura_numero TEXT NOT NULL,
    escritura_fecha TEXT NOT NULL,
    escritura_notario TEXT NOT NULL,

    registro_mercantil_numero TEXT NOT NULL,
    registro_mercantil_folio TEXT NOT NULL,
    registro_mercantil_libro TEXT NOT NULL,
    registro_mercantil_fecha TEXT NOT NULL,

    patente_sociedad_numero TEXT NOT NULL,
    patente_sociedad_fecha TEXT NOT NULL,
    patente_empresa_numero TEXT NOT NULL,
    patente_empresa_fecha TEXT NOT NULL,

    capital_autorizado TEXT NOT NULL,   -- ciphertext AES-GCM (normalizeMoney)
    capital_suscrito TEXT NOT NULL,
    capital_pagado TEXT NOT NULL,

    regimen_tributario TEXT,
    actividad_economica TEXT,
    fecha_inicio_actividades TEXT,

    rep_nombre_completo TEXT NOT NULL,
    rep_dpi TEXT NOT NULL,              -- ciphertext AES-GCM
    rep_dpi_hash TEXT NOT NULL,         -- HMAC purpose 'dpi'
    rep_profesion TEXT,
    rep_cargo TEXT NOT NULL CHECK (rep_cargo IN
      ('Administrador Único','Presidente','Gerente General',
       'Representante Legal designado','Apoderado')),
    rep_acta_numero TEXT NOT NULL,
    rep_acta_fecha TEXT NOT NULL,
    rep_acta_notario TEXT NOT NULL,
    rep_inscripcion_numero TEXT NOT NULL,
    rep_inscripcion_folio TEXT,
    rep_inscripcion_libro TEXT,
    rep_vigencia_inicio TEXT NOT NULL,
    rep_vigencia_vencimiento TEXT NOT NULL,

    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_clientes_juridicos_rep_dpi_hash
    ON clientes_juridicos(rep_dpi_hash);

  CREATE TRIGGER IF NOT EXISTS trg_clientes_juridicos_updated
  AFTER UPDATE ON clientes_juridicos
  FOR EACH ROW
  BEGIN
    UPDATE clientes_juridicos SET updated_at = datetime('now')
      WHERE cliente_id = OLD.cliente_id;
  END;

  CREATE TABLE IF NOT EXISTS contratos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institucion_id INTEGER NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
    modelo_id INTEGER NOT NULL REFERENCES modelos(id),
    no_contrato TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'en_curso' CHECK (estado IN (
      'en_curso',
      'revision_tenant',
      'revision_abogados',
      'completado',
      'abandonada_sin_inicio',
      'abandonada_incompleta',
      'anulada'
    )),
    datos_cliente TEXT,        -- ciphertext de JSON
    datos_credito TEXT,        -- JSON plaintext (no sensible)
    datos_garantia TEXT,       -- ciphertext de JSON
    datos_firmas TEXT,         -- JSON plaintext (no sensible)
    pdf_path TEXT,             -- nombre legible (BI-2026-0001.pdf)
    pdf_filename TEXT,         -- nombre real en disco (con sufijo UUID)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    -- F1: estados extendidos y trazabilidad
    anulado_motivo TEXT,
    anulado_por INTEGER REFERENCES users(id),
    anulado_at TEXT,
    completado_at TEXT,
    dpi_fisico_recibido INTEGER NOT NULL DEFAULT 0,
    dpi_fisico_recibido_por INTEGER REFERENCES users(id),
    dpi_fisico_recibido_at TEXT,
    -- F1 C3: borrador del wizard público del cliente (JSON serializado).
    datos_borrador TEXT,
    UNIQUE (institucion_id, no_contrato)
  );
  CREATE INDEX IF NOT EXISTS idx_contratos_inst ON contratos(institucion_id);
  CREATE INDEX IF NOT EXISTS idx_contratos_estado ON contratos(institucion_id, estado);

  CREATE TRIGGER IF NOT EXISTS trg_contratos_updated
  AFTER UPDATE ON contratos
  FOR EACH ROW
  BEGIN
    UPDATE contratos SET updated_at = datetime('now') WHERE id = OLD.id;
  END;

  CREATE TABLE IF NOT EXISTS fiadores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    dpi TEXT,                  -- ciphertext AES-GCM
    profesion TEXT,
    domicilio TEXT,
    tipo_garantia TEXT,
    datos_garantia TEXT,       -- JSON plaintext (datos de la garantía aportada)
    dpi_hash TEXT              -- HMAC purpose 'dpi'
  );
  CREATE INDEX IF NOT EXISTS idx_fiadores_contrato ON fiadores(contrato_id);
  CREATE INDEX IF NOT EXISTS idx_fiadores_dpi_hash ON fiadores(dpi_hash);

  CREATE TABLE IF NOT EXISTS notarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institucion_id INTEGER NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    colegiado TEXT,
    telefono TEXT,
    email TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (institucion_id, colegiado)
  );
  CREATE INDEX IF NOT EXISTS idx_notarios_inst ON notarios(institucion_id, activo);

  CREATE TABLE IF NOT EXISTS solicitudes_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    institucion_id INTEGER NOT NULL REFERENCES instituciones(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    usado INTEGER NOT NULL DEFAULT 0,
    cliente_id INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_tokens_token ON solicitudes_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_tokens_inst ON solicitudes_tokens(institucion_id, usado);

  -- F1 C3: tokens públicos por contrato (link del cliente, 48h).
  CREATE TABLE IF NOT EXISTS contratos_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    usado INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_by INTEGER REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_contratos_tokens_token ON contratos_tokens(token);
  CREATE INDEX IF NOT EXISTS idx_contratos_tokens_contrato ON contratos_tokens(contrato_id);

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    nombre TEXT,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
    institucion_id INTEGER REFERENCES instituciones(id) ON DELETE CASCADE,
    activo INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_users_inst ON users(institucion_id);

  -- F1: registro inmutable de acciones para auditoría legal.
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp TEXT NOT NULL DEFAULT (datetime('now')),
    user_id INTEGER REFERENCES users(id),
    user_email TEXT,
    user_role TEXT,
    institucion_id INTEGER,
    accion TEXT NOT NULL,
    entidad_tipo TEXT,
    entidad_id INTEGER,
    detalles TEXT,
    ip TEXT,
    user_agent TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_audit_log_entidad ON audit_log(entidad_tipo, entidad_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
`);

// Migraciones idempotentes para DBs que existían con schema previo.
// Si la DB ya tiene todas las columnas (caso post-3.4), estos ALTERs no se ejecutan.
const instCols = db.prepare('PRAGMA table_info(instituciones)').all().map((c) => c.name);
if (!instCols.includes('correlativo_prefijo')) db.exec("ALTER TABLE instituciones ADD COLUMN correlativo_prefijo TEXT");
if (!instCols.includes('cuenta_cobro')) db.exec("ALTER TABLE instituciones ADD COLUMN cuenta_cobro TEXT");
// Hotfix Fix 3 (2026-05-20): datos completos de persona jurídica acreedora.
for (const col of [
  'razon_social','tipo_sociedad','objeto_social','direccion_fiscal',
  'escritura_numero','escritura_fecha','escritura_notario',
  'rm_numero','rm_folio','rm_libro','rm_fecha',
  'patente_sociedad_numero','patente_sociedad_fecha','patente_empresa_numero','patente_empresa_fecha',
  'capital_autorizado','capital_suscrito','capital_pagado',
  'regimen_tributario','actividad_economica','fecha_inicio_actividades',
]) {
  if (!instCols.includes(col)) db.exec(`ALTER TABLE instituciones ADD COLUMN ${col} TEXT`);
}

const contratosCols = db.prepare('PRAGMA table_info(contratos)').all().map((c) => c.name);
if (!contratosCols.includes('pdf_filename')) db.exec("ALTER TABLE contratos ADD COLUMN pdf_filename TEXT");
if (!contratosCols.includes('anulado_motivo'))           db.exec("ALTER TABLE contratos ADD COLUMN anulado_motivo TEXT");
if (!contratosCols.includes('anulado_por'))              db.exec("ALTER TABLE contratos ADD COLUMN anulado_por INTEGER REFERENCES users(id)");
if (!contratosCols.includes('anulado_at'))               db.exec("ALTER TABLE contratos ADD COLUMN anulado_at TEXT");
if (!contratosCols.includes('completado_at'))            db.exec("ALTER TABLE contratos ADD COLUMN completado_at TEXT");
if (!contratosCols.includes('dpi_fisico_recibido'))      db.exec("ALTER TABLE contratos ADD COLUMN dpi_fisico_recibido INTEGER NOT NULL DEFAULT 0");
if (!contratosCols.includes('dpi_fisico_recibido_por'))  db.exec("ALTER TABLE contratos ADD COLUMN dpi_fisico_recibido_por INTEGER REFERENCES users(id)");
if (!contratosCols.includes('dpi_fisico_recibido_at'))   db.exec("ALTER TABLE contratos ADD COLUMN dpi_fisico_recibido_at TEXT");
if (!contratosCols.includes('datos_borrador'))           db.exec("ALTER TABLE contratos ADD COLUMN datos_borrador TEXT");

const clientesCols = db.prepare('PRAGMA table_info(clientes)').all().map((c) => c.name);
if (!clientesCols.includes('estado')) db.exec("ALTER TABLE clientes ADD COLUMN estado TEXT NOT NULL DEFAULT 'activo'");
if (!clientesCols.includes('autorizaciones')) db.exec("ALTER TABLE clientes ADD COLUMN autorizaciones TEXT");
if (!clientesCols.includes('genero')) db.exec("ALTER TABLE clientes ADD COLUMN genero TEXT");
if (!clientesCols.includes('conyuge_nombre')) db.exec("ALTER TABLE clientes ADD COLUMN conyuge_nombre TEXT");
if (!clientesCols.includes('conyuge_dpi')) db.exec("ALTER TABLE clientes ADD COLUMN conyuge_dpi TEXT");
if (!clientesCols.includes('ingresos_rango')) db.exec("ALTER TABLE clientes ADD COLUMN ingresos_rango TEXT");
if (!clientesCols.includes('dpi_hash')) db.exec("ALTER TABLE clientes ADD COLUMN dpi_hash TEXT");
if (!clientesCols.includes('nit_hash')) db.exec("ALTER TABLE clientes ADD COLUMN nit_hash TEXT");
if (!clientesCols.includes('conyuge_dpi_hash')) db.exec("ALTER TABLE clientes ADD COLUMN conyuge_dpi_hash TEXT");
if (!clientesCols.includes('tipo_persona')) {
  db.exec("ALTER TABLE clientes ADD COLUMN tipo_persona TEXT NOT NULL DEFAULT 'individual' CHECK (tipo_persona IN ('individual','juridica'))");
}

const fiadoresCols = db.prepare('PRAGMA table_info(fiadores)').all().map((c) => c.name);
if (!fiadoresCols.includes('dpi_hash')) db.exec("ALTER TABLE fiadores ADD COLUMN dpi_hash TEXT");

module.exports = db;
