# Sprint LexDocs Legal — Fase 2 (Sociedad Anónima express)

**Fecha:** 2026-05-23
**Estado:** CP1 (diseño) — pendiente OK del usuario.
**Branch:** `sprint/legal-fase2-sa-diseno`.
**Alcance del sprint 1:** SOLO Sociedad Anónima. S.R.L., E.M.I., Cooperativa, Asociación quedan para sprints siguientes.

---

## Resumen ejecutivo

LexDocs Legal Fase 2 es un producto **separado** de Fase 1 (contratos bancarios) que vive en subdominio aparte (`legal.lexdocs.gt`) y reusa el backend, motor F7, cifrado AES-GCM y OCR ya en producción.

El producto permite a una **firma master** (LexDocs Legal del usuario) onboardear **sub-tenants** (otros bufetes, notarías, contadores) que usan la plataforma para acelerar la constitución de Sociedades Anónimas de sus clientes finales: link público al cliente → form en 7 pasos → revisión del abogado del sub-tenant → correcciones si aplica → minuta lista para protocolización notarial → tramitación manual en Registro Mercantil (sin API por ahora; integración RM es Fase 3 futura).

Value prop: **hacer una S.A. en 1 minuto** vs. semanas de back-and-forth. Compite con MINECO Ventanilla Ágil (estatal, gratis) y se diferencia por asesoría humana + UX superior.

Riesgos críticos identificados: sign-off legal del texto generado, aislamiento estricto entre sub-tenants, T&C + política de privacidad publicados antes del primer onboarding. Esfuerzo total Sprint 1: **3-4 semanas dev senior** (CP1-CP5 análogos al sprint de garantías-desacopladas).

---

## 1. Producto y flujo

### 1.1 Casos de uso por rol

| Rol | Acceso | Acciones principales |
|---|---|---|
| **Cliente final** | Link público con token (sin login) | Llenar form en 7 pasos: identidad (DPI con OCR) → denominación S.A. → objeto/giro → capital social y acciones → accionistas y % → representantes legales → direcciones (fiscal/comercial). Reenviar correcciones si abogado lo pide. Recibir comprobante cuando se inscriba. |
| **Abogado tercero (sub-tenant)** | Dashboard `legal.lexdocs.gt` con login | Crear caso nuevo + generar link para cliente. Bandeja de revisión: ver casos en `revision_abogado`. Editar inline + audit. Aprobar/rechazar/pedir correcciones. Generar minuta/escritura PDF para protocolización. Marcar como "enviado a RM" + "inscrito" (manual). Métricas de su bufete (volumen, tiempos). |
| **Abogado bufete master (LexDocs Legal)** | Dashboard master con login | Gestionar sub-tenants (alta/baja/suspensión de firmas terceras). Ver métricas cross-tenant (sin acceso a PII de casos individuales salvo override con audit). Configurar plantillas globales (cláusulas estándar, branding). Billing/quotas por sub-tenant. Auditoría compliance. |

### 1.2 Estados y transiciones del flujo S.A.

```
                  (abogado crea caso + genera link)
                              ↓
                         [en_curso] ←─────────┐
                              ↓                │
                  (cliente confirma form)      │
                              ↓                │
                    [revision_abogado] ────────┤
                       ↓        ↓              │
                       │   (correcciones)      │
                       │        ↓              │
                       │  [correcciones_cliente]
                       │              ↓        │
                       │  (cliente reenvía) ───┘
                       ↓
                  (abogado aprueba)
                       ↓
                  [listo_para_RM]
                       ↓
            (notario marca enviado)
                       ↓
                  [enviado_RM]
                       ↓
            (notario marca inscrito + folio)
                       ↓
                  [inscrito_RM]   ← estado terminal exitoso

   [anulada]   ← estado terminal desde cualquier estado activo (con motivo)
```

| De | A | Quién dispara | Validaciones |
|---|---|---|---|
| — | `en_curso` | Abogado tercero | Crea caso + token público de 7 días. Audit `CASO_SA_CREADO`. |
| `en_curso` | `revision_abogado` | Cliente final | Form completo: % accionistas = 100, ≥1 representante, DPI parseado. Audit `CASO_SA_ENVIADO_REVISION`. |
| `revision_abogado` | `correcciones_cliente` | Abogado | Debe registrar campos a corregir + comentario. Reabre token al cliente. Audit `CASO_SA_CORRECCIONES_SOLICITADAS`. |
| `correcciones_cliente` | `revision_abogado` | Cliente final | Marca todas las correcciones resueltas. Audit `CASO_SA_REENVIADO`. |
| `revision_abogado` | `listo_para_RM` | Abogado | Aprobación final, dispara freeze (snapshot inmutable) + genera minuta PDF. Audit `CASO_SA_APROBADO`. |
| `listo_para_RM` | `enviado_RM` | Abogado/Notario | Confirma presentación física en RM. Audit `CASO_SA_PRESENTADO_RM`. |
| `enviado_RM` | `inscrito_RM` | Abogado/Notario | Registra folio + libro + fecha de inscripción otorgados por RM. Audit `CASO_SA_INSCRITO_RM`. |
| cualquier activo | `anulada` | Abogado o master | Motivo obligatorio. Audit `CASO_SA_ANULADO` + motivo. |

**Decisión de diseño**: `enviado_RM` y `inscrito_RM` son manuales en Sprint 1 (sin API RM). Cuando llegue la integración RM (Fase 3), el `enviado_RM` se dispara automáticamente desde el sistema de RM y `inscrito_RM` se actualiza vía webhook/polling. El modelo de estados no cambia — solo cambia quién dispara las transiciones.

### 1.3 Arquitectura tenant jerárquica — Decisión: Opción B con `firmas`

| Comparación | A: `instituciones.parent_id` | B: tabla `firmas` separada |
|---|---|---|
| Reuso de schema | Alto | Bajo |
| Claridad semántica | **Mala** (banco y bufete en misma tabla) | Alta |
| Riesgo de regresión Fase 1 | Medio (CHECK constraints, queries existentes) | **Cero** |
| Extensión futura por tipo | Difícil (CHECK tipo se ensucia) | Fácil (`firmas.tipo IN ('bufete','notaria','contador','corredor_legal')`) |
| Cross-tenant queries | Simples | JOIN ligero |
| Time-to-market | Más rápido (-2 días) | +2 días |

**Recomendación: Opción B.** El ahorro de 2 días de Opción A se paga con interés en deuda técnica futura. "Banco RSG" y "Bufete Castillo & Asociados" son productos B2B distintos atendidos por verticales distintas — forzarlos a la misma tabla solo porque "ambos son tenants" es semantic overloading.

Schema esencial (CP2 detallará):
```
firmas (
  id, slug, nombre, tipo CHECK IN ('bufete','notaria','contador','corredor_legal'),
  parent_id REFERENCES firmas(id),  -- NULL = master; NOT NULL = sub-tenant
  nit, direccion, activo, suspendido_motivo, ...
)
users → agregar `firma_id` nullable (un user pertenece a institucion O firma, exclusivo)
audit_log → agregar `tenant_tipo TEXT` + `tenant_id INTEGER` (polimorfismo explícito)
```

### 1.4 Boundaries entre Fase 1 y Fase 2

| Aspecto | Decisión | Razón |
|---|---|---|
| Backend | **Mismo** (`lexdocs/backend`) | Reuso de auth/audit/encryption/OCR/PDF. Cero duplicación. |
| Dominio frontend | **Separado**: `app.lexdocs.gt` (Fase 1) y `legal.lexdocs.gt` (Fase 2) | Audiencias distintas. Branding y UX específicos por producto. |
| Frontend codebase | **Subdirectorio** `frontend/src/apps/legal/` o workspace `frontend-legal/` | Mismo monorepo, builds separados (Vite multi-app). Componentes UI base compartidos (`Topbar`, `Sidebar`). |
| Motor F7 (compilador legal) | **Mismo motor, módulos nuevos** | `legal-format.js` se reusa (números a letras, fechas a letras, género). Nuevo `sociedad-engine.js` con sus propias variables (`capital_social_legal`, `acciones_legal`, etc.). |
| Modelo de datos | **Tablas nuevas**, no se mezclan con `contratos/modelos/clausulas` de Fase 1 | Estructura de S.A. es fija (denominación, objeto, capital, accionistas, etc.), no plantilla libre como un contrato de crédito. |
| Multi-tenancy | `instituciones` ↔ Fase 1; `firmas` ↔ Fase 2 (jerárquica) | Ver §1.3. |
| Portal público de cliente | **Pattern reusado** | El `SolicitudPublica.jsx` que usa token + form por pasos sirve de plantilla; la nueva pantalla `SociedadPublica.jsx` lo copia/adapta. |

### 1.5 Roadmap CP1-CP5 (este sprint = CP1 doc)

| CP | Alcance | Entregable | Esfuerzo |
|---|---|---|---|
| **CP1** | Diseño aprobado | `docs/sprint-legal-fase2-sa-diseno.md` | 1 día (este sprint) |
| **CP2** | Schema + migración + tests | Tablas `firmas`, `sociedades`, `accionistas`, `representantes_sa`, `direcciones_sa`, `correcciones_sa`. Migración idempotente con backup. Tests de constraints (% = 100, capital ≥ Q5,000). | 3 días |
| **CP3** | Backend completo | Endpoints CRUD + flujo de estados + portal público + motor S.A. (con freeze snapshot al `listo_para_RM`). Tests E2E backend. | 5–7 días |
| **CP4** | Frontend (3 superficies) | Dashboard abogado tercero, dashboard master, portal público cliente. Subdominio configurado. | 7–10 días |
| **CP5** | Tests E2E + QA visual + reporte legal | Casos de uso completos (S.A. típica con N accionistas, N representantes). Reporte de validación legal pendiente de sign-off notarial. | 3 días |
| **Total Fase 2 Sprint 1** | Solo Sociedad Anónima | — | **3–4 semanas** dev senior |

**Sprints posteriores** (no en este alcance):
- Sprint 2: agregar S.R.L. y E.M.I. (extensión del schema + cláusulas, mismo flujo).
- Sprint 3: integración RM (API o RPA, según lo que esté disponible).
- Sprint 4: billing/quotas + métricas por bufete.

### 1.6 Riesgos de producto

| # | Riesgo | Severidad | Mitigación |
|---|---|---|---|
| 1 | **Validación legal del texto generado** — la escritura de constitución debe cumplir Cód. Comercio art. 86 GT y ser protocolizable por notario sin reescritura. | Alta | Sign-off explícito de notario senior antes de producción. Bloqueador de CP5. Mismo pattern que el reporte CP5 de garantías-desacopladas. |
| 2 | **Competencia con MINECO Ventanilla Ágil** (estatal, gratis, constitución de empresa en 6 horas). | Media-alta | Posicionamiento: LexDocs vende "asesoría notarial + revisión humana + velocidad", no solo velocidad. UX debe ser claramente superior. Pricing competitivo (no premium). |
| 3 | **Riesgo regulatorio Ley del Notariado** — la plataforma NO ejerce notariado, solo genera plantillas. | Alta | Términos y condiciones deben dejar explícito: "LexDocs genera el borrador; un notario colegiado debe protocolizarlo y presentarlo en RM". UI debe reforzar este mensaje (ej. "Pendiente de protocolización notarial" en estado `listo_para_RM`). |
| 4 | **Pricing implícito** — sub-tenants pagan suscripción, master fee por sociedad. Sweet spot incierto. | Media | No definir pricing en este sprint. Lanzar Sprint 1 con bufetes piloto (free tier) + telemetría. Modelar pricing con datos reales en Sprint 4. |
| 5 | **Cuello de botella del revisor humano** — value-prop "1 minuto" no aplica si el abogado tarda 2 días en revisar. | Media | UI con bandeja priorizada + notificaciones email/push + métrica de "tiempo en revisión" por abogado. Mostrarle al bufete sus propios cuellos. |
| 6 | **Integración RM en Fase 3 incierta** — sin API ni timeline confirmado. | Media-alta | Diseñar el schema y los estados con un slot listo para integración (campo `rm_folio`, `rm_libro`, `rm_fecha_inscripcion` nullable). Hablar con MINECO/RM proactivamente sobre programa de partners API. Plan B: RPA con consentimiento explícito del notario. |
| 7 | **Multi-tenancy correctness** — bug que filtre datos cross-tenant es catastrófico (PII de accionistas, capital social). | **Crítica** | WHERE `firma_id = req.user.firma_id` en TODOS los endpoints sin excepción. Tests de aislamiento obligatorios en CP5 (suite específica). Code review con `security-trust-engineer` antes de mergear CP3. |
| 8 | **Privacy en cadena jerárquica** — ¿qué ve el master tenant de los datos de los clientes finales del sub-tenant? | Media | Master tenant ve metadata (volumen, fechas, estados) por defecto. Acceso a PII requiere "override de compliance" con motivo + audit. Documentar en T&C que sub-tenants firmen con sus clientes. |

**Bloqueadores de producción identificados ahora**: #1 (sign-off notarial), #3 (T&C), #7 (tests de aislamiento). El resto son riesgos administrables durante el sprint.

---

## 2. Backend — schema, motor y endpoints

### 2.1 Esquema SQL completo

Pegable directo en [backend/db.js](../backend/db.js) dentro del bloque `db.exec()`. Conserva el patrón existente: cifrado AES-GCM en PII, HMAC para búsqueda exacta, snapshot inmutable al freeze, CHECK constraints estrictos.

#### 2.1.1 Multi-tenant jerárquico

```sql
-- ─────────────────────────────────────────────────────────────────
-- Sprint Fase 2 — multi-tenancy jerárquica para bufetes.
-- firmas son tenants nuevos, separados de instituciones (Fase 1).
-- parent_id NULL  = firma master (LexDocs Legal).
-- parent_id NOT NULL = sub-tenant (otro bufete/notaría/corredor).
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS firmas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('bufete','notaria','contador','corredor_legal')),
  parent_id INTEGER REFERENCES firmas(id) ON DELETE RESTRICT,
  -- Datos de contacto (NIT y dirección de bufete son info pública, no cifrados)
  nit TEXT,
  nit_hash TEXT,
  direccion TEXT,
  telefono TEXT,
  email TEXT,
  -- Correlativo propio por firma: cada bufete tiene su prefijo y contador
  correlativo_prefijo TEXT NOT NULL,
  correlativo_actual INTEGER NOT NULL DEFAULT 0,
  -- Lifecycle
  activo INTEGER NOT NULL DEFAULT 1,
  suspendido_motivo TEXT,
  suspendido_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Constraint: una firma no puede ser su propio padre
  CHECK (parent_id IS NULL OR parent_id != id)
);
CREATE INDEX IF NOT EXISTS idx_firmas_parent ON firmas(parent_id);
CREATE INDEX IF NOT EXISTS idx_firmas_slug ON firmas(slug);

CREATE TRIGGER IF NOT EXISTS trg_firmas_updated
AFTER UPDATE ON firmas FOR EACH ROW BEGIN
  UPDATE firmas SET updated_at = datetime('now') WHERE id = OLD.id;
END;
```

#### 2.1.2 Sociedades (la S.A.)

```sql
-- ─────────────────────────────────────────────────────────────────
-- Sprint Fase 2 — sociedades = entidad principal (análoga a contratos).
-- Sólo Sociedad Anónima en sprint 1. Tipo en CHECK para soportar
-- S.R.L./E.M.I. en sprint 2 sin breaking change.
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sociedades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  firma_id INTEGER NOT NULL REFERENCES firmas(id) ON DELETE RESTRICT,
  correlativo TEXT NOT NULL,                   -- ej. SA-LXL-2026-0001
  tipo_sociedad TEXT NOT NULL CHECK (tipo_sociedad IN ('sa')),  -- sprint 1: solo 'sa'
  estado TEXT NOT NULL DEFAULT 'en_curso' CHECK (estado IN (
    'en_curso',
    'revision_abogado',
    'correcciones_cliente',
    'listo_para_RM',
    'enviado_RM',
    'inscrito_RM',
    'anulada'
  )),
  -- Datos básicos de la S.A. — públicos en RM una vez constituida
  denominacion TEXT NOT NULL,
  objeto_social TEXT NOT NULL,
  plazo_anios INTEGER,                         -- NULL = indefinido
  -- Capital y acciones (plaintext: requeridos en CHECK numérico)
  moneda TEXT NOT NULL DEFAULT 'GTQ' CHECK (moneda IN ('GTQ','USD')),
  capital_social NUMERIC NOT NULL,             -- en moneda local
  valor_nominal_accion NUMERIC NOT NULL,
  total_acciones INTEGER NOT NULL,
  -- Constraints duros del Cód. Comercio GT
  CHECK (capital_social >= 5000.00),           -- mínimo legal S.A. en GT
  CHECK (total_acciones > 0),
  CHECK (valor_nominal_accion > 0),
  CHECK (capital_social = ROUND(total_acciones * valor_nominal_accion, 2)),
  -- Trazabilidad
  created_by_user_id INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- Estados intermedios
  aprobado_por_user_id INTEGER REFERENCES users(id),
  aprobado_at TEXT,
  listo_para_rm_at TEXT,
  -- RM (manual en sprint 1, automatizable cuando llegue la API)
  enviado_rm_por INTEGER REFERENCES users(id),
  enviado_rm_at TEXT,
  rm_folio TEXT,
  rm_libro TEXT,
  rm_fecha_inscripcion TEXT,
  inscrito_rm_por INTEGER REFERENCES users(id),
  -- Anulación
  anulado_motivo TEXT,
  anulado_por INTEGER REFERENCES users(id),
  anulado_at TEXT,
  -- Snapshot inmutable: poblado al freeze (estado → listo_para_RM)
  snapshot_datos TEXT,                         -- JSON cifrado con foto inmutable
  snapshot_at TEXT,
  -- Borrador del portal (JSON serializado para resume del cliente)
  datos_borrador TEXT,
  UNIQUE (firma_id, correlativo)
);
CREATE INDEX IF NOT EXISTS idx_sociedades_firma ON sociedades(firma_id);
CREATE INDEX IF NOT EXISTS idx_sociedades_estado ON sociedades(firma_id, estado);
CREATE INDEX IF NOT EXISTS idx_sociedades_created ON sociedades(created_at);

CREATE TRIGGER IF NOT EXISTS trg_sociedades_updated
AFTER UPDATE ON sociedades FOR EACH ROW BEGIN
  UPDATE sociedades SET updated_at = datetime('now') WHERE id = OLD.id;
END;
```

#### 2.1.3 Accionistas (sub-entidad con PII cifrada)

```sql
CREATE TABLE IF NOT EXISTS accionistas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sociedad_id INTEGER NOT NULL REFERENCES sociedades(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL DEFAULT 1,
  tipo_persona TEXT NOT NULL CHECK (tipo_persona IN ('individual','juridico')),
  -- PII cifrada AES-GCM
  nombre TEXT NOT NULL,                        -- ciphertext
  nombre_hash TEXT NOT NULL,                   -- HMAC para búsqueda exacta
  dpi_o_nit TEXT NOT NULL,                     -- ciphertext (DPI individuos, NIT jurídicos)
  dpi_o_nit_hash TEXT NOT NULL,                -- HMAC
  profesion TEXT,                              -- ciphertext (solo individuos)
  estado_civil TEXT,                           -- ciphertext (solo individuos)
  fecha_nac TEXT,                              -- plaintext YYYY-MM-DD (solo individuos)
  genero TEXT CHECK (genero IS NULL OR genero IN ('M','F')),
  nacionalidad TEXT,                           -- plaintext, default 'guatemalteca'
  domicilio TEXT,                              -- ciphertext
  -- Participación accionaria (plaintext)
  acciones_cantidad INTEGER NOT NULL,
  porcentaje NUMERIC NOT NULL,                 -- duplicado para queries fáciles
  CHECK (acciones_cantidad > 0 AND porcentaje > 0 AND porcentaje <= 100),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (sociedad_id, dpi_o_nit_hash)         -- un mismo DPI no puede ser accionista 2x
);
CREATE INDEX IF NOT EXISTS idx_accionistas_sociedad ON accionistas(sociedad_id);
CREATE INDEX IF NOT EXISTS idx_accionistas_dpi_hash ON accionistas(dpi_o_nit_hash);

CREATE TRIGGER IF NOT EXISTS trg_accionistas_updated
AFTER UPDATE ON accionistas FOR EACH ROW BEGIN
  UPDATE accionistas SET updated_at = datetime('now') WHERE id = OLD.id;
END;
```

**Nota sobre suma de %**: SQLite no soporta CHECK con subqueries de forma eficiente. Patrón adoptado:

- A nivel de app: `validarSumaAccionistas(sociedad_id)` se llama en cada `POST/PUT/DELETE accionistas`. Devuelve `{ valido: bool, suma: num, deficit: num }`.
- A nivel de transición de estado: el endpoint `/avanzar` que pasa de `revision_abogado → listo_para_RM` valida estrictamente `SUM(porcentaje) = 100` antes de freeze.
- Permite inconsistencia temporal durante edición (suma puede ser 80% mientras editás).

#### 2.1.4 Representantes legales de la S.A.

```sql
CREATE TABLE IF NOT EXISTS representantes_sa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sociedad_id INTEGER NOT NULL REFERENCES sociedades(id) ON DELETE CASCADE,
  orden INTEGER NOT NULL DEFAULT 1,
  -- PII cifrada
  nombre TEXT NOT NULL,
  nombre_hash TEXT NOT NULL,
  dpi TEXT NOT NULL,
  dpi_hash TEXT NOT NULL,
  profesion TEXT,                              -- ciphertext
  estado_civil TEXT,                           -- ciphertext
  fecha_nac TEXT,                              -- YYYY-MM-DD
  genero TEXT CHECK (genero IS NULL OR genero IN ('M','F')),
  nacionalidad TEXT DEFAULT 'guatemalteca',
  domicilio TEXT,                              -- ciphertext
  -- Cargo y vigencia
  cargo TEXT NOT NULL CHECK (cargo IN (
    'Administrador Único','Presidente','Vicepresidente','Secretario',
    'Tesorero','Vocal','Gerente General','Apoderado'
  )),
  vigencia_inicio TEXT NOT NULL,               -- YYYY-MM-DD
  vigencia_vencimiento TEXT,                   -- YYYY-MM-DD, NULL = indefinido
  facultades TEXT,                             -- texto libre, descripción de facultades
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (sociedad_id, dpi_hash, cargo)        -- mismo DPI no puede tener el mismo cargo 2x
);
CREATE INDEX IF NOT EXISTS idx_representantes_sa_sociedad ON representantes_sa(sociedad_id);

CREATE TRIGGER IF NOT EXISTS trg_representantes_sa_updated
AFTER UPDATE ON representantes_sa FOR EACH ROW BEGIN
  UPDATE representantes_sa SET updated_at = datetime('now') WHERE id = OLD.id;
END;
```

#### 2.1.5 Direcciones de la S.A.

```sql
CREATE TABLE IF NOT EXISTS direcciones_sa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sociedad_id INTEGER NOT NULL REFERENCES sociedades(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('fiscal','comercial','notificaciones')),
  -- Las direcciones de una S.A. constituida son públicas en RM.
  -- Plaintext para queries simples (filtrado por municipio/depto).
  direccion TEXT NOT NULL,
  municipio TEXT NOT NULL,
  departamento TEXT NOT NULL,
  pais TEXT NOT NULL DEFAULT 'Guatemala',
  codigo_postal TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (sociedad_id, tipo)                   -- una dirección por tipo
);
CREATE INDEX IF NOT EXISTS idx_direcciones_sa_sociedad ON direcciones_sa(sociedad_id);

CREATE TRIGGER IF NOT EXISTS trg_direcciones_sa_updated
AFTER UPDATE ON direcciones_sa FOR EACH ROW BEGIN
  UPDATE direcciones_sa SET updated_at = datetime('now') WHERE id = OLD.id;
END;
```

#### 2.1.6 Tokens públicos para el portal cliente

```sql
CREATE TABLE IF NOT EXISTS sociedades_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sociedad_id INTEGER NOT NULL REFERENCES sociedades(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,                    -- default 7 días
  usado INTEGER NOT NULL DEFAULT 0,
  iteracion INTEGER NOT NULL DEFAULT 1,        -- incrementa cuando abogado pide correcciones
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by INTEGER REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sociedades_tokens_token ON sociedades_tokens(token);
CREATE INDEX IF NOT EXISTS idx_sociedades_tokens_sociedad ON sociedades_tokens(sociedad_id, usado);
```

#### 2.1.7 Correcciones (iteración cliente ↔ abogado)

```sql
CREATE TABLE IF NOT EXISTS correcciones_sa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sociedad_id INTEGER NOT NULL REFERENCES sociedades(id) ON DELETE CASCADE,
  iteracion INTEGER NOT NULL,
  -- Lista de campos a corregir (JSON array)
  -- ej. ["denominacion","objeto_social","accionistas[1].porcentaje"]
  campos_a_corregir TEXT NOT NULL,
  comentario TEXT NOT NULL,                    -- explicación del abogado
  solicitado_por_user_id INTEGER REFERENCES users(id),
  solicitado_at TEXT NOT NULL DEFAULT (datetime('now')),
  resuelto_at TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK (status IN ('pendiente','resuelto'))
);
CREATE INDEX IF NOT EXISTS idx_correcciones_sa_sociedad ON correcciones_sa(sociedad_id, status);
```

#### 2.1.8 Cambios a tablas existentes (ALTERs idempotentes)

Estos van en el bloque de migraciones idempotentes al final de [backend/db.js](../backend/db.js):

```js
// Sprint Fase 2 — users puede pertenecer a institucion O firma (exclusivo).
const usersCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
if (!usersCols.includes('firma_id')) {
  db.exec("ALTER TABLE users ADD COLUMN firma_id INTEGER REFERENCES firmas(id)");
}

// Sprint Fase 2 — audit_log polimórfico: tenant_tipo + tenant_id
// reemplazan implícitamente a institucion_id (que se mantiene por compat).
const auditCols = db.prepare('PRAGMA table_info(audit_log)').all().map((c) => c.name);
if (!auditCols.includes('tenant_tipo')) {
  db.exec("ALTER TABLE audit_log ADD COLUMN tenant_tipo TEXT");
}
if (!auditCols.includes('tenant_id')) {
  db.exec("ALTER TABLE audit_log ADD COLUMN tenant_id INTEGER");
}
// Backfill idempotente: rows viejos con institucion_id IS NOT NULL
db.exec(`
  UPDATE audit_log
  SET tenant_tipo = 'institucion', tenant_id = institucion_id
  WHERE institucion_id IS NOT NULL
    AND (tenant_tipo IS NULL OR tenant_id IS NULL)
`);
```

CHECK exclusividad users → manejado a nivel de app (better-sqlite3 no permite CHECK cross-column con UPDATE):

```js
// En POST/PUT /api/users:
if (data.institucion_id && data.firma_id) {
  throw new Error("Un usuario pertenece a una institución O una firma, no a ambas");
}
```

---

### 2.2 Endpoints REST — agrupados por sub-router

Mismo patrón que [backend/server.js](../backend/server.js): cada dominio en su archivo `backend/routes/<dominio>.js`.

#### 2.2.1 Master CRUD de firmas → `routes/firmas.js`

| Método | Path | Hace | Validación clave | Audit |
|---|---|---|---|---|
| POST | `/api/firmas` | Crea sub-tenant. Solo usuarios con `firma_id = 1` (master). | `tipo` válido, `slug` único, `parent_id` debe existir o ser NULL para master. | `FIRMA_CREADA` |
| GET | `/api/firmas` | Lista firmas accesibles. Master ve todas; sub-tenant ve solo la suya. | — | — |
| GET | `/api/firmas/:id` | Detalle de firma. | Ownership: el caller debe ser de esa firma o su master. | — |
| PUT | `/api/firmas/:id` | Edita datos básicos. | Master puede; sub-tenant solo edita su propia firma (campos limitados). | `FIRMA_EDITADA` |
| POST | `/api/firmas/:id/suspender` | `{ motivo }` — suspende sub-tenant. Solo master. | Motivo obligatorio. No se permite suspender al master. | `FIRMA_SUSPENDIDA` |
| POST | `/api/firmas/:id/reactivar` | Re-activa sub-tenant. Solo master. | — | `FIRMA_REACTIVADA` |

#### 2.2.2 Sociedades (autenticado, scoped por `firma_id` del JWT) → `routes/sociedades.js`

| Método | Path | Hace | Validación clave | Audit |
|---|---|---|---|---|
| POST | `/api/sociedades` | Crea caso `en_curso` + emite token público (7 días). | `denominacion`, `tipo_sociedad='sa'`. Capital ≥ Q5,000. Asigna `correlativo` siguiente de la firma. | `SOCIEDAD_CREADA` |
| GET | `/api/sociedades` | Lista sociedades del JWT.firma_id. Filtros: `estado`, `desde`, `hasta`, `q`. | WHERE firma_id = req.user.firma_id estricto. | — |
| GET | `/api/sociedades/:id` | Detalle. Usa snapshot vs vivo según estado. | Ownership por firma_id. | — |
| PUT | `/api/sociedades/:id` | Edita datos base de la S.A. | Bloqueado en estados terminales (`inscrito_RM`, `anulada`). | `SOCIEDAD_EDITADA` con `campos_modificados`. |
| GET | `/api/sociedades/:id/audit-log` | Audit completo del caso. | Ownership. | — |
| GET | `/api/sociedades/:id/compilar` | Compila el texto de la escritura con motor F7. | — | — |
| POST | `/api/sociedades/:id/pdf` | Genera minuta PDF Puppeteer. | Estado IN (`listo_para_RM`,`enviado_RM`,`inscrito_RM`). | `SOCIEDAD_PDF_GENERADO` |

#### 2.2.3 Sub-entidades (sub-routers con `mergeParams`)

`/api/sociedades/:sociedadId/accionistas` → `routes/accionistas.js`
`/api/sociedades/:sociedadId/representantes` → `routes/representantesSa.js`
`/api/sociedades/:sociedadId/direcciones` → `routes/direccionesSa.js`

Cada uno expone: `GET (list)`, `POST (crear)`, `PUT /:id`, `DELETE /:id`.

| Método | Path | Validación clave | Audit |
|---|---|---|---|
| POST | `.../accionistas` | tipo_persona válido. Si `tipo=individual`: DPI 13 dígitos, fecha_nac válida. UNIQUE (sociedad_id, dpi_hash). Suma de % se mantiene válida (warning si pasa 100, no error hasta freeze). | `ACCIONISTA_AGREGADO` |
| POST | `.../representantes` | DPI 13 dígitos, cargo válido, vigencia coherente. | `REPRESENTANTE_SA_AGREGADO` |
| POST | `.../direcciones` | tipo único por sociedad (fiscal, comercial, notificaciones). | `DIRECCION_SA_AGREGADA` |
| PUT | `.../:tipo/:id` | Bloqueado si sociedad en estado terminal. | `<TIPO>_EDITADO` |
| DELETE | `.../:tipo/:id` | Bloqueado en estado terminal. | `<TIPO>_QUITADO` |

#### 2.2.4 Transiciones de estado → `routes/sociedades.js` (sigue)

Patrón análogo al `routes/contratos.js` de Fase 1, con freeze trigger en `listo_para_RM`.

| Método | Path | Hace | Validación crítica | Audit |
|---|---|---|---|---|
| POST | `/api/sociedades/:id/avanzar` | Avanza al siguiente estado según workflow. | Si destino = `listo_para_RM`: validar `SUM(porcentaje)=100`, `total_acciones * valor_nominal = capital_social`, ≥1 representante, ≥1 dirección fiscal. Dispara freeze (snapshot inmutable). | `SOCIEDAD_TRANSICION` + freeze: `SOCIEDAD_CONGELADA` |
| POST | `/api/sociedades/:id/regresar` | `{ motivo? }` — regresa al estado anterior. | Solo transiciones backward permitidas (revision_abogado → en_curso, listo_para_RM → revision_abogado). | `SOCIEDAD_TRANSICION` |
| POST | `/api/sociedades/:id/correcciones` | `{ campos_a_corregir: [...], comentario }` — abogado solicita correcciones. Transiciona `revision_abogado → correcciones_cliente`. Reabre token al cliente. | Estado actual = `revision_abogado`. `campos_a_corregir` no vacío. | `CORRECCIONES_SOLICITADAS` |
| POST | `/api/sociedades/:id/anular` | `{ motivo }` — anula desde cualquier estado activo. | Motivo obligatorio, estado no terminal. | `SOCIEDAD_ANULADA` |
| POST | `/api/sociedades/:id/marcar-enviado-rm` | Estado `listo_para_RM → enviado_RM` (manual, sin API RM aún). | Estado = `listo_para_RM`. | `SOCIEDAD_PRESENTADA_RM` |
| POST | `/api/sociedades/:id/marcar-inscrito-rm` | `{ folio, libro, fecha }` — registra inscripción RM. | Estado = `enviado_RM`. Campos obligatorios. | `SOCIEDAD_INSCRITA_RM` con datos RM. |

#### 2.2.5 Portal público sin login → `routes/sociedades.js` (publicRouter)

Patrón análogo a `publicRouter` de Fase 1 con token de 7 días.

| Método | Path | Hace |
|---|---|---|
| GET | `/api/public/sociedades/:token` | Valida token, devuelve estado + datos borrador + correcciones pendientes. |
| PUT | `/api/public/sociedades/:token/datos` | Guarda `datos_borrador` (silencioso, auto-save). |
| POST | `/api/public/sociedades/:token/dpi-accionista` | Sube imagen DPI, OCR, devuelve datos parseados (no persiste). |
| POST | `/api/public/sociedades/:token/dpi-representante` | Igual. |
| GET/POST/PUT/DELETE | `/api/public/sociedades/:token/accionistas[/:id]` | CRUD de accionistas desde el portal. |
| GET/POST/PUT/DELETE | `/api/public/sociedades/:token/representantes[/:id]` | Idem. |
| GET/POST/PUT/DELETE | `/api/public/sociedades/:token/direcciones[/:tipo]` | Idem. |
| POST | `/api/public/sociedades/:token/confirmar` | Cliente envía a revisión: `en_curso → revision_abogado`. Marca token usado. |
| GET | `/api/public/sociedades/:token/correcciones` | Lista correcciones pendientes que el abogado pidió (visible al cliente). |
| POST | `/api/public/sociedades/:token/reenviar` | Cliente marca correcciones como resueltas: `correcciones_cliente → revision_abogado`. |

**Cap de uso del portal público**: no aplica límite numérico (a diferencia de la cap 1+1 de garantías), porque accionistas/representantes son inherentes al producto y pueden ser N. Sí aplica:
- Rate limit por IP: 30 req/min.
- Body size: 200 KB (mismo que Fase 1).
- Foto DPI: 10 MB (multer).

#### 2.2.6 Master cross-tenant → `routes/master.js`

Solo accesible con `req.user.firma_id = 1` (LexDocs Legal master).

| Método | Path | Hace |
|---|---|---|
| GET | `/api/master/sociedades` | Bandeja cross-tenant. Lista TODAS las sociedades de TODAS las firmas. Filtros + paginación. **No incluye PII descifrada** por defecto. |
| GET | `/api/master/metricas` | Volumen y tiempos por firma: casos creados, tiempo promedio en cada estado, % aprobación. |
| GET | `/api/master/firmas/:id/usage` | Uso por sub-tenant: # casos, conversion rate, ARPU implícito (para futuro billing). |
| POST | `/api/master/sociedades/:id/override-compliance` | `{ motivo }` — acceso explícito a PII descifrada de un caso de otra firma. Requiere motivo. Audit fuerte. → `MASTER_OVERRIDE_COMPLIANCE` con motivo en clear. |

---

### 2.3 Motor F7 extendido — `backend/sociedad-engine.js`

Nuevo módulo paralelo a `contrato-engine.js`. Reusa los helpers de [backend/utils/legal-format/](../backend/utils/legal-format/).

#### 2.3.1 Variables F7 nuevas

| Variable | Tipo | Origen | Ejemplo render |
|---|---|---|---|
| `{{denominacion}}` | TEXT | `sociedades.denominacion` | "TECNOLOGÍAS DEL VALLE" |
| `{{denominacion_legal}}` | TEXT | computed | "TECNOLOGÍAS DEL VALLE, SOCIEDAD ANÓNIMA" |
| `{{objeto_social_legal}}` | TEXT | `sociedades.objeto_social` (texto del cliente) | "el desarrollo, comercialización y mantenimiento de software, así como la prestación de servicios de consultoría..." |
| `{{plazo_legal}}` | TEXT | `plazo_anios` con `formatoLegal({tipo:'plazo',sufijo:'años'})` o "indefinido" | "cien (100) años" o "tiempo indefinido" |
| `{{domicilio_legal}}` | TEXT | computed desde `direcciones_sa.fiscal` | "el municipio y departamento de Guatemala, República de Guatemala" |
| `{{capital_social_legal}}` | TEXT | `formatoLegal({tipo:'dinero'})` | "cien mil quetzales exactos (Q100,000.00)" |
| `{{moneda_legal}}` | TEXT | computed | "quetzales" o "dólares de los Estados Unidos de América" |
| `{{valor_nominal_accion_legal}}` | TEXT | `formatoLegal({tipo:'dinero'})` | "cien quetzales exactos (Q100.00)" |
| `{{total_acciones_legal}}` | TEXT | `formatoLegal({tipo:'entero'})` | "un mil (1,000)" |
| `{{distribucion_accionistas_legal}}` | TEXT | computed (frase larga) | "El señor JUAN PÉREZ suscribe y paga seiscientas (600) acciones; la señora ANA LÓPEZ suscribe y paga cuatrocientas (400) acciones" |
| `{{accionista_N_compareciente}}` | TEXT (indexado) | `renderClienteCompareciente` con datos del accionista N (1-based) | frase legal completa estándar |
| `{{comparecencia}}` | TEXT | computed | "En la ciudad de Guatemala el día X de Y del año Z, ante mí, NOTARIO_NOMBRE, comparecen: [accionista 1]; [accionista 2]; quienes me solicitan..." |
| `{{representantes_compareciente_legal}}` | TEXT | computed | "El cargo de Administrador Único recae en el señor JUAN PÉREZ, mayor de edad..." |
| `{{fecha_constitucion_legal}}` | TEXT | `fechaALetras` | "el día primero de junio del año dos mil veintiséis" |
| `{{ciudad_constitucion}}` | TEXT | constante "Guatemala" o de `direcciones_sa.fiscal.municipio` | "Guatemala" |
| `{{notario_compareciente}}` | TEXT | del JWT user del abogado/notario | "el infrascrito notario LIC. ROBERTO CASTILLO ALDANA, Colegiado N° 8765" |
| `{{folio_protocolo_legal}}` | TEXT | input al freeze (`POST avanzar` payload opcional) | "folio doscientos (200) del protocolo del año dos mil veintiséis" |

#### 2.3.2 Cláusulas de constitución (Cód. Comercio GT art. 86)

El motor compila el siguiente bloque de cláusulas fijas. **No hay plantillas editables como `modelos`+`clausulas` de Fase 1**: la S.A. tiene estructura rígida del Cód. Comercio.

| Orden | Código | Contenido | Variables |
|---|---|---|---|
| 1 | `comparecencia` | Apertura notarial + identificación de accionistas comparecientes. | `comparecencia`, `notario_compareciente`, `fecha_constitucion_legal`, `ciudad_constitucion` |
| 2 | `denominacion-y-forma` | "Se constituye una sociedad denominada {{denominacion_legal}}". | `denominacion_legal` |
| 3 | `objeto` | Objeto social literal del cliente, con preámbulo legal. | `objeto_social_legal` |
| 4 | `plazo` | Duración. | `plazo_legal`, `fecha_constitucion_legal` |
| 5 | `domicilio` | Domicilio legal de la sociedad. | `domicilio_legal` |
| 6 | `capital-y-acciones` | Capital, valor nominal, total acciones, distribución entre accionistas. | `capital_social_legal`, `valor_nominal_accion_legal`, `total_acciones_legal`, `distribucion_accionistas_legal` |
| 7 | `administracion` | Cargo administrativo, facultades, vigencia. | `representantes_compareciente_legal` |
| 8 | `disposiciones-generales` | Asambleas, dividendos, ejercicio social, disolución (boilerplate Cód. Comercio). | — (fijas) |
| 9 | `aceptacion-y-firma` | Aceptación, lectura, firma de comparecientes y notario. | `accionista_N_compareciente`, `notario_compareciente` |

⚠️ **El texto exacto de cada cláusula es bloqueador de CP5**: debe ser sign-off por notario senior antes de habilitar generación de PDFs reales. Mismo patrón que Fase 1 (doc `sprint-garantias-cp5-casos.md`).

#### 2.3.3 Regla snapshot vs vivo (idéntica al patrón de garantías)

```js
// backend/sociedad-engine.js (pseudocódigo)
function compilarSociedad(sociedad_id) {
  const soc = db.prepare('SELECT * FROM sociedades WHERE id = ?').get(sociedad_id);
  const congelado = ['listo_para_RM','enviado_RM','inscrito_RM'].includes(soc.estado);
  if (congelado && soc.snapshot_datos) {
    const snap = JSON.parse(decrypt(soc.snapshot_datos));
    return interpolarClausulas(snap);
  }
  // Vivo: cargar accionistas, representantes, direcciones de las tablas
  return interpolarClausulas(loadDatosVivos(sociedad_id));
}
```

Freeze trigger en `POST /:id/avanzar` cuando destino = `listo_para_RM`:

```js
// Transacción atómica
const tx = db.transaction(() => {
  const datosVivos = {
    sociedad: {...},
    accionistas: db.prepare('SELECT * FROM accionistas WHERE sociedad_id = ? ORDER BY orden').all(id),
    representantes: db.prepare('SELECT * FROM representantes_sa WHERE sociedad_id = ? ORDER BY orden').all(id),
    direcciones: db.prepare('SELECT * FROM direcciones_sa WHERE sociedad_id = ?').all(id),
  };
  // Validar estricto
  const sumaPct = datosVivos.accionistas.reduce((s, a) => s + Number(a.porcentaje), 0);
  if (Math.abs(sumaPct - 100) > 0.01) throw new Error('Suma % accionistas != 100');
  // ... más validaciones
  // Cifrar y guardar
  db.prepare(`
    UPDATE sociedades
    SET estado = 'listo_para_RM',
        snapshot_datos = ?,
        snapshot_at = datetime('now'),
        listo_para_rm_at = datetime('now'),
        aprobado_por_user_id = ?,
        aprobado_at = datetime('now')
    WHERE id = ?
  `).run(encrypt(JSON.stringify(datosVivos)), req.user.userId, id);
  audit(req, 'SOCIEDAD_CONGELADA', 'sociedad', id, { accionistas: datosVivos.accionistas.length });
});
tx();
```

---

### 2.4 Migración manual — `backend/scripts/migrate-fase2-sa.js`

Patrón idéntico a `migrate-garantias-desacopladas.js` (CP2 sprint anterior):

```
Pasos:
1. Backup automático: /data/lexdocs.db.pre-fase2-sa-<ISO_TIMESTAMP>
2. Pre-conteo: usuarios existentes, tablas Fase 1 (verificar no romper nada)
3. CREATE TABLE (todas las nuevas, con CREATE IF NOT EXISTS — idempotente)
4. ALTERs idempotentes: users.firma_id, audit_log.tenant_tipo + tenant_id
5. Backfill audit_log: tenant_tipo='institucion' donde institucion_id IS NOT NULL
6. INSERT firma master:
   INSERT INTO firmas (id, slug, nombre, tipo, parent_id, correlativo_prefijo)
   VALUES (1, 'lexdocs-legal', 'LexDocs Legal', 'bufete', NULL, 'SA-LXL');
7. PRAGMA foreign_key_check (abort si hay violaciones)
8. Reporte: filas en cada tabla nueva, firma master creada
```

**NO destructiva**: no toca `instituciones`, `contratos`, `comparecientes`, `garantias`. Solo agrega tablas/columnas nuevas. Riesgo de regresión sobre Fase 1 = cero.

Trigger de ejecución: usar el mismo patrón `MIGRATE_FASE2_SA_NOW=true` guard en `server.js` que diseñamos para el seed CP2.5 — evita el pitfall del Custom Start Command con `&&` que ya nos jugó una mala pasada.

---

### 2.5 Tests E2E backend a escribir (CP3)

Archivo: `backend/scripts/test-fase2-sa-e2e.js`. Mismo patrón que `test-cp5-casos-modelo.js`.

#### Escenarios funcionales

| # | Escenario | Cobertura |
|---|---|---|
| T1 | **S.A. con 1 accionista** (mínimo viable) | Crear sociedad → portal cliente → 1 accionista 100% → 1 representante → 1 dirección fiscal → confirmar → abogado aprueba → freeze → compilar texto. Validar % = 100, capital = total_acciones × valor_nominal. |
| T2 | **S.A. con N accionistas (3)** | Suma % = 100 distribuida (40/30/30). Validar `distribucion_accionistas_legal` con 3 nombres y montos correctos en letras. |
| T3 | **Representante único vs múltiples** | T3a: Administrador Único. T3b: 3 representantes (Presidente, Vicepresidente, Secretario) con cargos distintos. |
| T4 | **Flujo de correcciones cliente↔abogado** | Cliente envía → abogado solicita correcciones (`campos_a_corregir`) → token reabierto → cliente corrige → reenvía → abogado aprueba al 2do intento. Validar 2 entries en `correcciones_sa` con `resuelto_at`. |
| T5 | **Anulación desde cada estado activo** | T5a: anular desde `en_curso`. T5b: desde `revision_abogado`. T5c: desde `correcciones_cliente`. T5d: desde `listo_para_RM`. Validar `anulado_motivo` requerido en todos. |

#### Escenario crítico de seguridad

| # | Escenario | Cobertura |
|---|---|---|
| T6 | **Aislamiento firma A ≠ firma B** | Crear firma A, sociedad A1. Crear firma B (sub-tenant distinto), sociedad B1. Como user de A: GET /api/sociedades NO debe incluir B1. GET /api/sociedades/B1.id debe ser 404 (no 403, para no filtrar existencia). Idem POST/PUT/DELETE de sub-entidades. Idem audit-log no debe filtrar tenant_id de otra firma. **6 sub-tests mínimos**. |
| T7 | **Master ve cross-tenant; sub-tenant NO** | Master (firma_id=1) hace GET /api/master/sociedades y ve A1 y B1. Sub-tenant intenta el mismo endpoint y recibe 403. Override compliance del master requiere motivo y queda en audit con `MASTER_OVERRIDE_COMPLIANCE`. |

#### Escenarios regresivos

| # | Escenario | Cobertura |
|---|---|---|
| T8 | **Fase 1 sigue funcionando** | Verificar que después de la migración: GET /api/instituciones funciona, GET /api/contratos funciona, los tests CP3 + CP5 de Fase 1 siguen 100% verde. |
| T9 | **Boot del server con `SEED_GARANTIAS_NOW=false` + `MIGRATE_FASE2_SA_NOW=false`** | Server arranca limpio, sin disparar migraciones ni seeds. Idempotente. |

#### Esperado al cierre de CP3

- ≥30 tests pass (T1-T9 + sub-tests).
- 0 fails.
- Schema migrado en dev local sin error.
- Boot del server estable con la migración aplicada.
- `npm run test:fase2-sa` se agrega a `package.json`.

Sign-off legal del texto generado (cláusulas 1-9) sigue pendiente para CP5, igual que en sprint anterior.

---

## 3. Seguridad, aislamiento y compliance

### 3.1 Modelo de threats — actores y vectores específicos de Fase 2

La superficie de ataque cambia respecto a Fase 1 por dos cosas: jerarquía de tenants (master ↔ sub-tenant) y portal público sin login con datos altamente sensibles (DPI, capital social, distribución accionaria). Cinco actores con motivación realista:

| Actor | Vector | Impacto si tiene éxito | Mitigación primaria |
|---|---|---|---|
| **Sub-tenant malicioso** (bufete competidor que se registra para espiar) | Enumera IDs / fuerza `firma_id` en query params / abusa endpoints master sin tener permiso. | Lee sociedades de otros bufetes → roba clientes, PII de accionistas (DPI, %, capital). **Catastrófico legal y reputacionalmente.** | Middleware obligatorio de aislamiento (§3.2). Tests de aislamiento bloqueantes en CP5. Audit fuerte de cada acceso master. |
| **Cliente público con token robado** (atacante con el link público que se robó por phishing/error de UX) | Llena form con datos falsos, descarga PII parcial visible en el form de revisión. | Suplantación de identidad para constituir una S.A. fraudulenta. Posible lavado. | Token de un solo uso por iteración (§3.4). Revalidación de DPI con OCR + foto. Notificación al cliente real cuando se accede al link (futuro). KYC humano del abogado revisor. |
| **Master tenant abusivo** (empleado de LexDocs Legal que abusa override) | Usa `/api/master/sociedades/:id/override-compliance` para descifrar PII de cualquier caso de cualquier sub-tenant sin causa legítima. | Espionaje industrial, venta de info a competidores, violación de privacidad. | Override exige motivo + IP + user-agent en audit. Reporte diario de overrides al CISO. Acceso restringido a 1-2 usuarios master. (§3.3) |
| **Ex-empleado del sub-tenant** (cuenta del abogado que dejó el bufete sigue activa) | Sigue accediendo al sistema y descarga casos viejos / fillean nuevos. | Fuga de info, sabotaje de casos. | Suspender usuarios al offboarding (responsabilidad del sub-tenant). JWT con TTL corto (8h, no refresh tokens largos). Audit log de "primer acceso después de N días" como flag. Política contractual con sub-tenants. |
| **Atacante externo** (no autenticado, intenta enumerar tokens / endpoints) | Brute-force de tokens públicos / SQL injection / XSS en form / DoS. | Robo de casos sin necesidad de auth previa. | Rate limit por IP estricto en endpoints públicos. Tokens con entropía 256 bits. Validation de inputs en cada endpoint. CSP y headers Helmet ajustados (§3.7). |
| **Bot scraper** (intenta enumerar nombres de S.A. en formación) | GET /api/firmas/:id, GET /api/master/* sin auth, OAuth tokens leaked en frontend. | Filtración de cartera de clientes del bufete, scraping de competencia. | Anti-enumeration 404. JWT siempre server-side, nunca en localStorage sin httpOnly. Robots.txt + monitoreo de UA sospechosos. |

### 3.2 Aislamiento entre sub-tenants — pattern obligatorio

**Riesgo crítico #7 del producto.** El sistema de Fase 1 ya tiene un patrón con `req.user.institucion_id`, pero ahí los tenants no son jerárquicos. Fase 2 introduce master ↔ sub-tenants y el riesgo crece.

#### Middleware `requireFirmaScope` — obligatorio en todos los endpoints `/api/sociedades/*` y `/api/firmas/*`

```js
// pseudocódigo, no es para pegarse — solo ilustra el contrato
function requireFirmaScope(req, res, next) {
  if (!req.user || !req.user.firma_id) {
    return res.status(401).json({ error: 'Auth requerida', code: 401 });
  }
  // Inyectar scope al objeto req — TODO query debe usar req.scope.firma_id
  req.scope = {
    firma_id: req.user.firma_id,
    es_master: req.user.firma_id === 1,
  };
  next();
}
```

#### Helper `scopedQuery` — patrón anti-olvido

Cada modelo expone helpers que ya tienen el WHERE inyectado. **No se permite hacer `db.prepare('SELECT * FROM sociedades WHERE id = ?')` directo**, debe ser:

```js
// backend/repos/sociedades.js (nuevo módulo)
module.exports = {
  findById(scope, id) {
    return db.prepare(`
      SELECT * FROM sociedades WHERE id = ? AND firma_id = ?
    `).get(id, scope.firma_id);
  },
  list(scope, { estado, desde, hasta, q } = {}) {
    // ... siempre incluye firma_id = ? en WHERE
  },
  // etc.
};
```

**Regla en code review**: cualquier query a `sociedades`/`accionistas`/`representantes_sa`/`direcciones_sa` que NO esté en `repos/*` debe ser rechazada. Tooling: agregar lint rule custom o grep CI que rechace `db.prepare(...sociedades...)` fuera de `repos/`.

#### Master override

El master (`req.scope.es_master === true`) puede acceder cross-tenant **solo vía endpoints `/api/master/*`**, nunca implícitamente vía `/api/sociedades`. El middleware enforced esta separación:

```
/api/sociedades/:id  → siempre WHERE firma_id = req.scope.firma_id (master incluido)
/api/master/sociedades  → ignora firma_id (cross-tenant)
                          PERO exige req.scope.es_master === true
                          Y graba audit log de cada GET
```

#### Tests de aislamiento bloqueantes (CP5)

Mínimo 6 sub-tests, cada uno debe fallar el merge si no pasa:

| # | Test | Verifica |
|---|---|---|
| ISO-1 | GET /api/sociedades como user de firma A NO incluye sociedades de firma B | Filtrado en lista |
| ISO-2 | GET /api/sociedades/{B.id} como user de firma A devuelve **404** (no 403, anti-enumeration) | Filtrado en detalle |
| ISO-3 | PUT /api/sociedades/{B.id} como A devuelve 404 sin modificar | Filtrado en write |
| ISO-4 | POST /api/sociedades/{B.id}/accionistas como A devuelve 404 | Filtrado en sub-entidades |
| ISO-5 | GET /api/sociedades/{B.id}/audit-log como A devuelve 404 | No leak de actividad de otra firma |
| ISO-6 | POST /api/sociedades/{B.id}/avanzar como A devuelve 404 | No mutación de estado cross-tenant |

Tests adicionales (no bloqueantes pero deseables):
- ISO-7: master GET `/api/master/sociedades` ve A1 y B1 → OK, deja audit `MASTER_LISTED_SOCIEDADES_X_RESULTADOS`.
- ISO-8: sub-tenant GET `/api/master/sociedades` → 403 (no es master).
- ISO-9: POST `/api/master/sociedades/{A.id}/override-compliance` sin motivo → 400.

### 3.3 PII en cadena jerárquica master → sub-tenant → cliente final

Tres niveles de acceso a PII. La regla: **mínimo privilegio por defecto, acceso explícito con audit cuando se justifica.**

| Quién | Default | Override |
|---|---|---|
| **Cliente final (token público)** | Solo sus propios datos del caso al que el token apunta. PII descifrada al render del form (su DPI, su nombre, etc.). | No aplica — no puede ver datos de otros casos. |
| **Sub-tenant (abogado tercero)** | PII descifrada de las sociedades de **su firma** (su `firma_id`). No ve PII de otras firmas. | No aplica — el sub-tenant nunca tiene override. |
| **Master tenant (LexDocs Legal)** | **Metadata only** de sociedades cross-tenant: id, correlativo, estado, firma_id, fechas, conteo de accionistas. **NO** ve nombres, DPI, capital, ni objeto social. | Override explícito vía `POST /api/master/sociedades/:id/override-compliance { motivo }`. Devuelve PII descifrada + graba audit `MASTER_OVERRIDE_COMPLIANCE` con motivo en clear + IP + user-agent. |

#### Cuándo se descifra PII y dónde

| Punto del flujo | Descifra? | Quién lo ve | Audit |
|---|---|---|---|
| Persistencia (INSERT/UPDATE de DB) | No (cifra en encrypt → DB) | Nadie | No |
| Listing endpoints (`GET /api/sociedades`) | **No** | Solo metadata visible (correlativo, estado, denominación, fechas) | No |
| Detail endpoints (`GET /api/sociedades/:id`) | **Sí**, solo si scope.firma_id matchea | El sub-tenant del caso | Audit `SOCIEDAD_VIEWED` con id, sin PII en log |
| Motor compile/render (PDF / preview) | **Sí** | El sub-tenant del caso | Audit `SOCIEDAD_COMPILADA` |
| Master listing cross-tenant | **No** (devuelve metadata sin PII) | Master | Audit `MASTER_LISTED_SOCIEDADES` |
| Master override compliance | **Sí** (descifra y devuelve) | Master con motivo justificado | Audit `MASTER_OVERRIDE_COMPLIANCE` con motivo + IP + user-agent |
| Logs (console.log, console.error) | **NUNCA** | — | Anti-pattern, refactor inmediato si se detecta |
| Métricas / analytics | **NUNCA** | — | Solo conteos, percentiles, hashes prefix |
| Snapshot (al freeze) | Sí, descifra y re-cifra con misma key en `sociedades.snapshot_datos` | Motor F7 al render post-freeze | Audit `SOCIEDAD_CONGELADA` |

### 3.4 Token público del portal cliente — ciclo de vida

#### 3.4.1 Generación

```
token = crypto.randomBytes(32).toString('hex')  // 256 bits de entropía, 64 chars hex
```

64 hex chars = `2^256` espacio de búsqueda → infactible de brute-force aun con rate limit relajado.

#### 3.4.2 Expiración

**7 días** vs los **48h** de Fase 1. Justificación:

| Producto | TTL | Razón |
|---|---|---|
| Fase 1 (contratos) | 48h | El cliente del banco está listo, solo confirma datos pre-cargados. Tarea de 10-15 min. |
| Fase 2 (S.A.) | 7 días | El cliente debe **decidir** cosas legales no-obvias (objeto social, distribución accionaria, representantes). Suele consultarlo con socios, contador, etc. Tarea distribuida en días. |

Si el cliente no termina en 7 días, el caso pasa a estado `abandonada_sin_inicio` o `abandonada_incompleta` (análogo a Fase 1) y el sub-tenant decide si reabre token o cierra el caso.

#### 3.4.3 Revocación al solicitar correcciones

Decisión: **emitir token NUEVO** en cada iteración, NO reutilizar el anterior.

| Aspecto | Token nuevo cada iteración | Token reutilizado |
|---|---|---|
| Seguridad | El link viejo queda invalidado → si fue compartido por error/phishing, deja de funcionar | El link viejo sigue accesible → riesgo persiste |
| UX | Cliente recibe email con link NUEVO (claridad de qué iteración estamos) | Cliente puede confundir qué iteración mira |
| Implementación | `sociedades_tokens` ya tiene columna `iteracion`, insertar nueva fila | Reutilizar reset de `usado=0` |

**Decisión: emitir token NUEVO.** Beneficio de seguridad supera el costo de implementación.

#### 3.4.4 Anti-enumeration: 404 vs 403

**Todas las respuestas a tokens inválidos/expirados/usados devuelven HTTP 404 con cuerpo genérico:**

```json
{ "error": "Link no válido o expirado", "code": 404 }
```

No 403 (revelaría que el token existe pero está revocado), no 410 (revelaría que existió), no 401 (revelaría que se necesita auth). Cuerpo idéntico para "no existe" / "vencido" / "ya usado" → no permite distinguir el caso.

#### 3.4.5 Rate limit por token + por IP

Dos rate limits paralelos en endpoints `/api/public/sociedades/:token/*`:

| Bucket | Límite | Razón |
|---|---|---|
| Por IP | 30 req/min | Evita brute-force masivo desde una sola IP. |
| Por token (si válido) | 60 req/min | Cliente legítimo puede tener múltiples tabs/devices. No hace falta más. |
| Por token (si inválido en últimos 5min) | 5 intentos/IP/15min | **Brute-force protection específica.** Si una IP genera >5 GETs con tokens inválidos, queda bloqueada 15 min. |

#### 3.4.6 Estado "usado"

Cuando el cliente confirma envío (`POST /api/public/sociedades/:token/confirmar`):

```
sociedades_tokens.usado = 1
```

Token queda **bloqueado** definitivamente para esa iteración. Si el abogado pide correcciones, se emite token NUEVO con `iteracion = N+1` (§3.4.3).

### 3.5 Logging de seguridad y audit_log granular

#### 3.5.1 Acciones obligatorias con detalles forzosos

Cada una de estas acciones DEBE quedar en `audit_log` con los campos especificados:

| Acción | `entidad_tipo` | `detalles` (JSON) obligatorios |
|---|---|---|
| `SOCIEDAD_CREADA` | `sociedad` | `{ correlativo, firma_id, tipo_sociedad }` |
| `SOCIEDAD_VIEWED` | `sociedad` | `{ acceso: 'detail'\|'compile'\|'pdf' }` — no PII |
| `SOCIEDAD_TRANSICION` | `sociedad` | `{ de, a, motivo? }` |
| `SOCIEDAD_CONGELADA` | `sociedad` | `{ accionistas_count, representantes_count, suma_porcentaje }` |
| `SOCIEDAD_ANULADA` | `sociedad` | `{ motivo, estado_previo }` |
| `CORRECCIONES_SOLICITADAS` | `sociedad` | `{ iteracion, campos_count, hash_comentario_8 }` (no clear text del comentario) |
| `MASTER_OVERRIDE_COMPLIANCE` | `sociedad` | `{ motivo, master_user_email, sociedad_firma_id }` **— motivo en clear text** |
| `MASTER_LISTED_SOCIEDADES` | `master` | `{ filtros_aplicados, resultados_count }` |
| `FIRMA_CREADA` | `firma` | `{ slug, tipo }` |
| `FIRMA_SUSPENDIDA` | `firma` | `{ motivo, suspendido_por_user_id }` |
| `TOKEN_GENERADO` | `sociedad` | `{ iteracion, token_prefix_8, expires_at }` — `token_prefix_8` es los primeros 8 chars hex |
| `TOKEN_USADO` | `sociedad` | `{ token_prefix_8 }` |
| `RATE_LIMIT_EXCEEDED` (sample) | `request` | `{ endpoint, ip_prefix }` — IP truncada a /24 para privacidad |
| `LOGIN_EXITOSO` / `LOGIN_FALLIDO` | `user` | `{ email_hash_8, ip_prefix }` |
| `PASSWORD_CHANGED` | `user` | `{}` |

#### 3.5.2 Anti-pattern: PII en logs

**Prohibido** loguear:
- Nombres completos, DPI, NIT, direcciones de personas físicas.
- Comentarios libres del abogado (pueden contener PII).
- Valores de capital social acompañado del nombre de la sociedad o accionista.
- Tokens completos (solo prefix 8 chars).
- IPs completas en alta verbosidad (truncar a /24 para Audit; full IP solo si hay incidente activo).

**Permitido** loguear:
- IDs opacos (sociedad_id, firma_id, user_id).
- Hashes prefix 8 chars (de DPI, email, nombre, comentario).
- Conteos y agregados.
- Estados y timestamps.

#### 3.5.3 Retención de audit_log

Guatemala no tiene una LGPD/GDPR formal, pero:
- Cód. Notariado obliga al notario a conservar el protocolo **indefinidamente**.
- Buena práctica internacional para registros notariales: **mínimo 5 años, recomendado 10**.

**Política propuesta**: `audit_log` se conserva **indefinidamente** mientras la sociedad esté en estado distinto de `anulada` con anulación > 5 años. Job de archivo (no de borrado) que mueve audit_log de casos `anulada` > 5 años a `audit_log_archive` (tabla separada, fuera del index de queries comunes). Borrado físico solo bajo orden judicial.

### 3.6 Compliance regulatorio GT-específico

#### 3.6.1 Ley del Notariado (Decreto 314)

La plataforma **NO ejerce notariado**. Refuerzos en código y UX:

| Capa | Refuerzo |
|---|---|
| **Código** | Endpoint `POST /api/sociedades/:id/pdf` genera **minuta** o **borrador de escritura**, nunca "escritura pública". Filename del PDF: `minuta_constitucion_SA_<correlativo>.pdf`. Header del PDF en grande: "BORRADOR – PENDIENTE DE PROTOCOLIZACIÓN NOTARIAL". |
| **UX** | Estado `listo_para_RM` se llama en frontend "Listo para protocolización notarial", NUNCA "Listo para firmar". Botón "Generar minuta" (no "Generar escritura"). |
| **Términos** | T&C explícitos: "LexDocs Legal genera un borrador de minuta basado en los datos suministrados. Un notario colegiado en ejercicio activo debe protocolizar la escritura pública conforme al Decreto 314 y normas del Cód. Notariado de Guatemala antes de su presentación al Registro Mercantil." |

#### 3.6.2 Cód. Comercio art. 86 — requisitos de la escritura constitutiva

Validación en backend (al freeze `listo_para_RM`):

| Requisito art. 86 | Validación en código |
|---|---|
| Denominación + "Sociedad Anónima" o "S.A." | `denominacion` no vacío, no contiene caracteres prohibidos. |
| Domicilio (municipio + departamento) | `direcciones_sa.fiscal` existe + `municipio` y `departamento` no vacíos. |
| Objeto social | `objeto_social` ≥ 50 caracteres. |
| Plazo | `plazo_anios` no NULL (indefinido = 99 años por convención registral). |
| Capital social y forma de pago | `capital_social ≥ 5000.00`, `valor_nominal_accion > 0`, `total_acciones > 0`, `capital_social = total_acciones * valor_nominal_accion`. |
| Valor nominal de acciones | Cubierto arriba. |
| Régimen de administración (uno o varios administradores) | `representantes_sa` tiene ≥ 1 fila, cargo válido. |
| Identificación de socios suscriptores | `accionistas` tiene ≥ 1, suma de % = 100, cada uno con DPI/NIT válido. |

Si CUALQUIERA falla, `POST /api/sociedades/:id/avanzar` (a `listo_para_RM`) devuelve **400** con detalle del campo faltante.

#### 3.6.3 Protección de datos personales

GT no tiene LGPD formal. Aplican:

- **Constitución art. 24**: inviolabilidad de la correspondencia y comunicaciones privadas. Aplica analógicamente a datos personales en plataformas digitales.
- **Ley de Acceso a la Información Pública (Decreto 57-2008)** art. 9 inciso 6: define "datos personales sensibles" como aquellos referentes a salud, raza, religión, opinión política, sexualidad, situación moral o económica. **DPI, dirección, capital aportado entran en económica/moral** → datos sensibles.
- **Ley de Bancos**: aplica a bancos pero no a bufetes; igual norma de mejor práctica para la cifrado y aislamiento.

**Política aplicable**:
- Cifrado en reposo (AES-GCM ya implementado).
- Cifrado en tránsito (HTTPS obligatorio, ya con HSTS).
- Acceso restringido a "mínimo privilegio" (ya cubierto por §3.3).
- Derecho del titular de los datos a solicitar borrado: implementar endpoint `/api/public/sociedades/:token/right-to-erasure` que anonimice los datos del cliente si lo solicita ANTES de inscribir en RM. Post-inscripción, los datos pasan a ser públicos en RM y el derecho no aplica.

#### 3.6.4 KYC del accionista — extranjeros y PEP

Sprint 1: validación **manual por el abogado** (no automatizada). UI agrega checkbox obligatorio en `revision_abogado` antes de aprobar:

- "Confirmo que verifiqué identidad de los accionistas mediante DPI/pasaporte físico."
- "Confirmo que ningún accionista es Persona Expuesta Políticamente (PEP) según definición de SAT/SIB."
- "Confirmo que se aplicó debida diligencia conforme a Acdo Gubernativo 118-2002 (prevención de lavado)."

Sprint 2+: integración con listas PEP públicas (Banguat, OFAC) — fuera de alcance ahora.

Audit log `KYC_CONFIRMADO` con los checkboxes marcados y user_id del abogado revisor.

### 3.7 Hardening del codebase actual — gaps a cerrar

| Gap | Estado actual | Acción para Fase 2 |
|---|---|---|
| `app.set('trust proxy', 1)` | ✅ ya hecho post-hotfix | — |
| Helmet HSTS | Default Helmet (max-age 180 días) | Subir a `max-age=31536000; includeSubDomains; preload` (1 año) |
| CSP | Permite Google Fonts inline | Mover Libre Baskerville/DM Sans a self-hosted en `/fonts/`. CSP estricto: `default-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:`. |
| JWT TTL | 8h (asumo del contexto) | Mantener 8h. NO implementar refresh tokens en sprint 1 (más superficie de ataque). Re-login post-8h. |
| Password policy | bcrypt + sin mínimo de complejidad explícito | **Bloqueador para sprint 1**: agregar política en `POST /api/users` y `POST /api/auth/change-password`: mínimo 12 chars, debe contener mayúscula + minúscula + dígito. Validar contra rainbow-list (top 10k passwords). bcrypt rounds = 12 (CPU >100ms — suficiente para 2026). |
| Rate limit master endpoints | Global 100/15min | Override en `/api/firmas` y `/api/master/*`: **5 req/min, 50 req/hora**. Crear sub-tenant es acción rara. |
| Rate limit portal público por token | Sin lim específico | Implementar §3.4.5 |
| Rotación de `ENCRYPTION_KEY` | No implementada | **Decisión Sprint 2+**: implementar pattern de "encryption key id" en cada ciphertext + tabla `encryption_keys` con id, key cifrada con master key. Por ahora, documentar que rotación requiere re-cifrar todo (procedimiento manual). |
| Backup SQLite encryption | `.pre-fase2-sa-*.db` en `/data/` sin cifrar | **P1 para Sprint 2**: Encriptar archivos de backup con gpg+passphrase antes de dejarlos en `/data/`. Riesgo actual: si el volumen Railway se compromete (improbable pero no-cero), backups exponen PII histórica. |
| Logs de aplicación | console.log sin estructura | **Sprint 2**: estructurar con pino/winston. Por ahora, cuidar manualmente que no se logueen PII. |
| Secrets en repo | `.env` excluido vía `.gitignore` | Verificar git history: `git log -p -S 'ENCRYPTION_KEY'` no debe revelar la key. Si revela: rotar key inmediatamente. |

### 3.8 Riesgos críticos (P0) — bloqueantes de producción

| # | Riesgo | Cómo se cierra |
|---|---|---|
| **P0-1** | Test de aislamiento sub-tenant ISO-1 a ISO-6 (§3.2) no 100% verde | Tests deben pasar en CI antes de mergear CP3. Mergear sin esto = vulnerabilidad crítica conocida. |
| **P0-2** | Sign-off legal del texto de cláusulas 1-9 (§ sección 1) | Notario senior firma documento `docs/sprint-legal-fase2-sa-aprobacion-notarial.md` con los 9 textos compilados verbatim por motor F7 (mismo patrón que `sprint-garantias-cp5-casos.md`). |
| **P0-3** | T&C del producto publicados antes de onboard de cualquier sub-tenant | Lawyer del bufete master redacta T&C incluyendo: rol de LexDocs como generador de borradores (NO ejerce notariado), responsabilidad del sub-tenant sobre KYC de sus clientes, limitación de responsabilidad ante errores del cliente. Publicado en `legal.lexdocs.gt/terminos`. |
| **P0-4** | Política de privacidad cumple buenas prácticas (no LGPD GT formal) | Doc publicado en `legal.lexdocs.gt/privacidad`. Explica: tipos de datos recolectados, base legal (consentimiento al firmar T&C), retención (indefinida para audit notarial, anonimización post-derecho-al-olvido si aplica), derecho del cliente a solicitar borrado pre-inscripción RM. |
| **P0-5** | Password policy implementada (§3.7) | Sin esto, accounts comprometidos por brute-force trivial. |
| **P0-6** | Rate limit estricto en endpoints master (§3.7) | Sin esto, master endpoints vulnerables a abuso interno o token leak. |

**Cierre formal de CP5**: doc `docs/sprint-fase2-sa-cp5-cierre.md` que checkea P0-1 a P0-6 explícitamente con evidencia (links a tests CI, links a docs publicados, screenshots de policy).

---

## 4. Decisiones críticas y preguntas para el usuario

Antes de arrancar CP2 (schema) necesito confirmación explícita sobre estos 6 puntos. Default sugerido en cursiva — decí "OK default" si te parece bien o sobreescribí.

| # | Decisión | Default sugerido | Tu llamada |
|---|---|---|---|
| 1 | **Arquitectura tenant jerárquica** | *Opción B: tabla `firmas` separada de `instituciones` con `parent_id`. Master = id 1.* | |
| 2 | **Frontend nuevo: subdirectorio o workspace separado** | *Subdirectorio `frontend/src/apps/legal/` reusando Vite del frontend actual. Multi-app build.* | |
| 3 | **Dominio Vercel para el producto Fase 2** | *Nuevo subdominio `legal.lexdocs.gt` (otro Vercel project apuntando al mismo backend Railway).* | |
| 4 | **Token público portal cliente — TTL** | *7 días (vs 48h de Fase 1).* | |
| 5 | **Bloqueador legal P0-2 (sign-off notarial del texto)** | *Sí, mismo patrón que Fase 1. Generamos doc en CP5 para que un notario senior firme.* | |
| 6 | **T&C y Política de Privacidad antes del onboarding** | *Sí, bloqueador P0-3 y P0-4 antes de cualquier sub-tenant tercero use el producto.* | |

### Preguntas abiertas que no decidí solo (necesito tu input)

1. **Quién va a redactar T&C y política de privacidad?** ¿Vos como abogado, o tercero? (No es esfuerzo dev, pero bloquea CP5).
2. **Tenés contacto con notario senior para sign-off del texto F7 generado?** (Bloqueador P0-2 de CP5).
3. **Pricing del Sprint 1 — free tier con piloto, o cobrás desde día 1?** (Afecta UI de billing en CP4; default mío es free tier con telemetría).
4. **Branding visual del producto Fase 2 — usamos el de Fase 1 (gold + dm-sans) o creamos algo distinto para legal.lexdocs.gt?** (Default mío: misma identidad, copa-mod tipográficos sutiles).
5. **Idioma**: español GT en todo. ¿Confirmás o querés ES neutro? (Default: GT, "vos" en mensajería interna del bufete, "usted" en portal cliente.)

---

## 5. Próximos pasos

1. Tu OK al doc + respuestas a las preguntas abiertas (§4).
2. Si OK → arranco **CP2** (schema + migración manual) en branch `sprint/legal-fase2-sa-cp2` desde la rama de diseño.
3. Mismo patrón que el sprint anterior: backup pre-migración, ALTERs idempotentes, `MIGRATE_FASE2_SA_NOW=true` env var guard para producción cuando llegue el momento.

Sin tu OK no toco código — este doc es CP1 y termina acá.
