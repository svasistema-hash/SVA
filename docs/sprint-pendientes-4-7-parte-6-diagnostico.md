# Sprint pendientes-4-7 — Parte 6: garantías desacopladas (diseño final v2)

**Fecha original (diagnóstico):** 2026-05-21
**Última revisión:** 2026-05-21 — incorpora modelo real de garantías (cliente / fiador / tercero garante; aportante por garantía).
**Estado:** DISEÑO FINAL APROBADO pendiente de OK al doc para arrancar CP2.

---

## 1. Modelo actual (diagnóstico — sin cambios)

### 1.1 Almacenamiento

Garantías guardadas como JSON cifrado AES-256-GCM en `contratos.datos_garantia`
([backend/db.js:197-239](../backend/db.js#L197-L239)).

### 1.2 Tabla `fiadores` — existe pero está sin usar

[backend/db.js:241-252](../backend/db.js#L241-L252). Sin INSERTs. Será DROP en
la migración.

### 1.3 Enum `tipo_garantia` actual

`personal | hipotecaria | prendaria | mixta` (CHECK constraint en
`modelos.tipo_garantia`).

### 1.4 Motor F7

Una variable `{{garantias}}` compilada en
[backend/contrato-engine.js:116-144](../backend/contrato-engine.js#L116-L144).

### 1.5 UI actual

Form plano en `FinancieraDetalle.jsx` sin soporte para fiadores como array,
sin concepto de terceros garantes.

---

## 2. Limitaciones (sin cambios)

1. Sin integridad referencial.
2. Sin reutilización de fiadores ni de garantías.
3. Tabla `fiadores` muerta.
4. `tipo_garantia` no restringe `datos_garantia`.
5. Representación dual confusa.
6. Sin historial granular.
7. UI no edita fiadores como array.
8. **No existe el concepto de "tercero garante" en el modelo actual** — un
   bien aportado por alguien que no es ni el cliente ni un fiador no se
   puede representar.

---

## 3. Diseño final aprobado (v2 — modelo real)

### 3.1 Modelo de personas

Un contrato tiene **3 tipos de personas físicas** que comparecen y firman:

| Persona            | Cardinalidad | Firma | Responsabilidad                              |
|--------------------|--------------|-------|----------------------------------------------|
| Cliente            | exactamente 1 | sí   | Es quien recibe el crédito.                  |
| Fiador             | 0 o más      | sí    | Responde solidariamente del crédito completo. Puede además aportar un bien. |
| Tercero garante    | 0 o más      | sí    | NO es fiador. Solo aporta un bien (hipoteca/prenda). Responde solo con el bien aportado. |

Adicionalmente comparece el **representante del banco** (ya modelado en
`instituciones.representante_*`).

**Fiadores y terceros garantes** comparten estructura PII idéntica y comparten
el flujo de firma. Se modelan en una **tabla única `comparecientes`** con el
rol viviendo en la pivote `contrato_comparecientes`. Justificación en el
mensaje previo del diseñador.

### 3.2 Modelo de garantías

Una **garantía real** (hipotecaria o prendaria) tiene un **aportante**:

| `aportante_tipo` | `aportante_cliente_id` | `aportante_compareciente_id` |
|------------------|------------------------|------------------------------|
| `cliente`        | FK a `clientes(id)`    | NULL                         |
| `compareciente`  | NULL                   | FK a `comparecientes(id)`    |

Casos válidos que el modelo soporta:

| Caso real                                                              | Garantías               | Comparecientes                                    |
|------------------------------------------------------------------------|-------------------------|---------------------------------------------------|
| Solo cliente firma, sin bienes ni fiadores                             | 0                       | 0                                                 |
| Solo fiador                                                            | 1 fiduciaria            | 1 con rol=fiador                                  |
| Cliente hipoteca, sin fiadores                                         | 1 hipotecaria (aportante=cliente) | 0                                       |
| Fiador + cliente hipoteca                                              | 1 hipotecaria (aportante=cliente) + 1 fiduciaria | 1 con rol=fiador             |
| Fiador que además hipoteca                                             | 1 hipotecaria (aportante=ese fiador) + 1 fiduciaria | 1 con rol=fiador (el mismo)  |
| Tercero hipoteca, sin ser fiador                                       | 1 hipotecaria (aportante=ese tercero) | 1 con rol=tercero_garante              |
| Mixta: 2 fiadores + cliente prenda + tercero hipoteca                  | 1 prenda (cliente) + 1 hipotecaria (tercero) + 1 fiduciaria | 2 fiadores + 1 tercero |

La garantía `fiduciaria` no tiene aportante (todos los fiadores responden
colectivamente; los fiadores viven en `contrato_comparecientes`, no en la
garantía).

### 3.3 Ajustes confirmados

- **Ajuste A (snapshot en pivote):** snapshots inmutables al firmar en
  `contrato_garantias.snapshot_*` y `contrato_comparecientes.snapshot_*`.
- **Ajuste B (cifrar PII):** `nombre`, `dpi`, `profesion`, **`estado_civil`**
  (nuevo), `domicilio` con AES-GCM. Hash HMAC en `nombre_hash` y `dpi_hash`.
- **Ajuste C (`solidaria` como flag):** `tipo IN ('fiduciaria','hipotecaria','prendaria')`,
  flag `solidaria` aplica solo a `fiduciaria`.

### 3.4 Decisión Opción 1 vs 2 — tabla única `comparecientes`

**Adoptada: Opción 1 con el rol en la pivote.** Razones (ya argumentadas):

1. PII 100% compartida entre fiador y tercero.
2. El rol es per-contrato, no per-persona.
3. Un fiador-que-hipoteca es UNA fila reutilizable.
4. UI única (`ComparecientePicker`) en lugar de dos.
5. Motor F7 trata ambos igual en la comparecencia.

### 3.5 Esquema SQL final

```sql
-- ─────────────────────────────────────────────────────────────────
-- 1. Catálogo de personas comparecientes (fiadores + terceros)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE comparecientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  institucion_id INTEGER NOT NULL REFERENCES instituciones(id),
  nombre TEXT NOT NULL,            -- AES-GCM
  nombre_hash TEXT NOT NULL,       -- HMAC, búsqueda exacta
  dpi TEXT NOT NULL,               -- AES-GCM
  dpi_hash TEXT NOT NULL,          -- HMAC, búsqueda exacta + UNIQUE
  profesion TEXT,                  -- AES-GCM
  estado_civil TEXT,               -- AES-GCM
  domicilio TEXT,                  -- AES-GCM
  creado_por_user_id INTEGER REFERENCES users(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT,
  UNIQUE(institucion_id, dpi_hash)
);
CREATE INDEX idx_comparecientes_institucion ON comparecientes(institucion_id);
CREATE INDEX idx_comparecientes_nombre_hash ON comparecientes(institucion_id, nombre_hash);

-- ─────────────────────────────────────────────────────────────────
-- 2. Catálogo de garantías (reutilizable por institución)
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE garantias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  institucion_id INTEGER NOT NULL REFERENCES instituciones(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('fiduciaria','hipotecaria','prendaria')),
  solidaria INTEGER NOT NULL DEFAULT 0,    -- solo aplica si tipo='fiduciaria'
  datos TEXT,                              -- JSON cifrado AES-GCM, NULL si fiduciaria
                                           -- hipotecaria: { finca, folio, libro, registro, direccion, area, seguro_inmueble }
                                           -- prendaria:   { tipo_bien, marca, modelo, serie, placa, valor_bien }
  -- Aportante del bien (NULL si tipo=fiduciaria)
  aportante_tipo TEXT CHECK (aportante_tipo IN ('cliente','compareciente') OR aportante_tipo IS NULL),
  aportante_cliente_id INTEGER REFERENCES clientes(id),
  aportante_compareciente_id INTEGER REFERENCES comparecientes(id),
  creado_por_user_id INTEGER REFERENCES users(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT,
  -- CHECK: si tipo=fiduciaria, aportante_* todos NULL.
  --        si tipo IN (hipotecaria, prendaria), aportante_tipo NOT NULL y exactamente uno de los dos FK no NULL.
  CHECK (
    (tipo = 'fiduciaria' AND aportante_tipo IS NULL AND aportante_cliente_id IS NULL AND aportante_compareciente_id IS NULL)
    OR
    (tipo IN ('hipotecaria','prendaria') AND aportante_tipo = 'cliente' AND aportante_cliente_id IS NOT NULL AND aportante_compareciente_id IS NULL)
    OR
    (tipo IN ('hipotecaria','prendaria') AND aportante_tipo = 'compareciente' AND aportante_compareciente_id IS NOT NULL AND aportante_cliente_id IS NULL)
  )
);
CREATE INDEX idx_garantias_institucion ON garantias(institucion_id);
CREATE INDEX idx_garantias_aportante_cliente ON garantias(aportante_cliente_id);
CREATE INDEX idx_garantias_aportante_compareciente ON garantias(aportante_compareciente_id);

-- ─────────────────────────────────────────────────────────────────
-- 3. Pivote contrato↔compareciente con rol y snapshot
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE contrato_comparecientes (
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  compareciente_id INTEGER NOT NULL REFERENCES comparecientes(id),
  rol TEXT NOT NULL CHECK (rol IN ('fiador','tercero_garante')),
  orden INTEGER NOT NULL DEFAULT 1,
  -- Quién agregó al compareciente al contrato (mostrable sin join al audit_log)
  agregado_por_actor TEXT NOT NULL CHECK (agregado_por_actor IN ('cliente','banco','bufete')),
  agregado_por_user_id INTEGER REFERENCES users(id),
  agregado_en TEXT NOT NULL DEFAULT (datetime('now')),
  -- Snapshot inmutable al firmar
  snapshot_nombre TEXT,            -- AES-GCM
  snapshot_dpi TEXT,               -- AES-GCM
  snapshot_profesion TEXT,         -- AES-GCM
  snapshot_estado_civil TEXT,      -- AES-GCM
  snapshot_domicilio TEXT,         -- AES-GCM
  snapshot_rol TEXT,               -- copia del rol al congelar
  congelado_en TEXT,
  PRIMARY KEY (contrato_id, compareciente_id)
);
CREATE INDEX idx_contrato_comparecientes_comp ON contrato_comparecientes(compareciente_id);

-- ─────────────────────────────────────────────────────────────────
-- 4. Pivote contrato↔garantía con snapshot
-- ─────────────────────────────────────────────────────────────────

CREATE TABLE contrato_garantias (
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  garantia_id INTEGER NOT NULL REFERENCES garantias(id),
  orden INTEGER NOT NULL DEFAULT 1,
  -- Snapshot inmutable de la garantía al firmar
  snapshot_tipo TEXT,
  snapshot_solidaria INTEGER,
  snapshot_datos TEXT,             -- JSON cifrado AES-GCM
  -- Snapshot del aportante al firmar:
  --   tipo='cliente'        → snapshot vive en contratos.datos_cliente (ya inmutable)
  --   tipo='compareciente'  → snapshot vive en contrato_comparecientes(snapshot_*)
  -- Aquí solo guardamos quién era el aportante referencialmente al freeze.
  snapshot_aportante_tipo TEXT,
  snapshot_aportante_cliente_id INTEGER,
  snapshot_aportante_compareciente_id INTEGER,
  congelado_en TEXT,
  PRIMARY KEY (contrato_id, garantia_id)
);
CREATE INDEX idx_contrato_garantias_garantia ON contrato_garantias(garantia_id);

-- ─────────────────────────────────────────────────────────────────
-- 5. DROP del fiadores viejo (vacío)
-- ─────────────────────────────────────────────────────────────────
-- DROP TABLE IF EXISTS fiadores;   -- ejecutado por el script de migración
```

**Total: 4 tablas nuevas + DROP de `fiadores` viejo.**

### 3.6 Reglas de validación (a nivel app)

1. **Garantía `fiduciaria`**: `datos`, `aportante_*` todo NULL. `solidaria` puede
   ser 0 o 1.
2. **Garantía `hipotecaria`/`prendaria`**: `datos` no NULL, `aportante_tipo` no
   NULL, exactamente uno de `aportante_cliente_id`/`aportante_compareciente_id`
   poblado. `solidaria` debe ser 0.
3. **Vincular garantía a contrato**: si la garantía tiene aportante compareciente
   Z, Z debe estar en `contrato_comparecientes(contrato_id)`. Si no está, el
   endpoint rechaza con 409 ("agregue primero al compareciente al contrato").
4. **Contrato listo para firmar** debe satisfacer:
   - Si tiene al menos una garantía con `aportante_tipo='cliente'`, el cliente
     compareció (siempre lo hace).
   - Para cada garantía con `aportante_tipo='compareciente'`, el compareciente
     correspondiente está en `contrato_comparecientes` con cualquier rol.
   - Si tiene al menos una garantía `fiduciaria`, debe haber >=1 fila en
     `contrato_comparecientes` con `rol='fiador'`.
5. **Edición de PII** de compareciente/garantía después de `congelado_en` no
   afecta el snapshot.

### 3.7 Motor F7 — regla de lectura y compilación

```js
// backend/contrato-engine.js (pseudocódigo)

function loadDatosCompilacion(contrato_id) {
  const contrato = db.prepare('SELECT estado, datos_cliente FROM contratos WHERE id = ?').get(contrato_id);
  const congelado = ['completado', 'firmado'].includes(contrato.estado);
  return congelado ? loadCongelado(contrato_id) : loadVivo(contrato_id);
}

function loadVivo(contrato_id) {
  const garantias = db.prepare(`
    SELECT g.id, g.tipo, g.solidaria, g.datos,
           g.aportante_tipo, g.aportante_cliente_id, g.aportante_compareciente_id,
           cg.orden
    FROM contrato_garantias cg
    JOIN garantias g ON g.id = cg.garantia_id
    WHERE cg.contrato_id = ?
    ORDER BY cg.orden
  `).all(contrato_id);

  const comparecientes = db.prepare(`
    SELECT c.id, c.nombre, c.dpi, c.profesion, c.estado_civil, c.domicilio,
           cc.rol, cc.orden
    FROM contrato_comparecientes cc
    JOIN comparecientes c ON c.id = cc.compareciente_id
    WHERE cc.contrato_id = ?
    ORDER BY cc.orden
  `).all(contrato_id);

  return { garantias, comparecientes, aportanteResolver: resolverAportanteVivo };
}

function loadCongelado(contrato_id) {
  const garantias = db.prepare(`
    SELECT garantia_id AS id, snapshot_tipo AS tipo, snapshot_solidaria AS solidaria,
           snapshot_datos AS datos, snapshot_aportante_tipo AS aportante_tipo,
           snapshot_aportante_cliente_id, snapshot_aportante_compareciente_id, orden
    FROM contrato_garantias
    WHERE contrato_id = ? AND congelado_en IS NOT NULL
    ORDER BY orden
  `).all(contrato_id);

  const comparecientes = db.prepare(`
    SELECT compareciente_id AS id, snapshot_nombre AS nombre, snapshot_dpi AS dpi,
           snapshot_profesion AS profesion, snapshot_estado_civil AS estado_civil,
           snapshot_domicilio AS domicilio, snapshot_rol AS rol, orden
    FROM contrato_comparecientes
    WHERE contrato_id = ? AND congelado_en IS NOT NULL
    ORDER BY orden
  `).all(contrato_id);

  return { garantias, comparecientes, aportanteResolver: resolverAportanteCongelado };
}

// Resuelve el aportante de una garantía a un objeto persona con PII descifrada
function resolverAportanteVivo(g, contrato_id) {
  if (g.aportante_tipo === 'cliente') {
    return resolverClienteVivo(contrato_id);
  }
  return resolverComparecienteVivo(g.aportante_compareciente_id);
}

function resolverAportanteCongelado(g, contrato_id) {
  if (g.aportante_tipo === 'cliente') {
    // Cliente ya está snapshotted en contratos.datos_cliente
    return resolverClienteSnapshot(contrato_id);
  }
  // Compareciente snapshotted en contrato_comparecientes
  return resolverComparecienteSnapshot(contrato_id, g.snapshot_aportante_compareciente_id);
}

function buildContrato({ garantias, comparecientes, cliente, banco, aportanteResolver, contrato_id }) {
  // 1. Bloque COMPARECENCIA — el cliente + cada compareciente + representante banco
  const compsTexto = [
    fraseCompareciente(cliente, 'cliente'),
    ...comparecientes.map((c) => fraseCompareciente(c, c.rol)),  // 'fiador' o 'tercero_garante'
    fraseRepresentanteBanco(banco),
  ].join('; ');

  // 2. Cláusula de GARANTÍAS — para cada garantía resolver aportante y construir frase
  const garsTexto = garantias.map((g) => {
    if (g.tipo === 'fiduciaria') {
      return g.solidaria
        ? frasesFianzaSolidaria(comparecientes.filter((c) => c.rol === 'fiador'))
        : fraseFianzaSimple(comparecientes.filter((c) => c.rol === 'fiador'));
    }
    const aportante = aportanteResolver(g, contrato_id);
    return g.tipo === 'hipotecaria'
      ? fraseHipoteca(g.datos, aportante)
      : frasePrenda(g.datos, aportante);
  }).join('. ');

  // Inserción en {{comparecencia}} y {{garantias}} variables F7
  return { comparecencia: compsTexto, garantias: garsTexto };
}
```

**Cambios concretos en el motor F7:**

- Nueva variable F7: **`{{comparecencia}}`** (o reemplaza el bloque actual de
  comparecencia hardcoded en alguna cláusula).
- Variable existente `{{garantias}}` ahora se compila desde el modelo nuevo.
- Función `fraseCompareciente(persona, rol)`: misma estructura para los 3 roles,
  diferenciando solo el participio ("compareciente y deudor" / "compareciente y
  fiador solidario" / "compareciente y tercero garante").
- Función `fraseHipoteca(datos, aportante)`: incluye el nombre del aportante
  en la frase legal ("…hipoteca aportada por [aportante.nombre]…").

> ⚠️ **PENDIENTE DE VALIDACIÓN LEGAL.** El texto que se genere para el rol
> `tercero_garante` (frase de comparecencia + cláusula de garantía con
> aportante distinto al deudor) debe ser **validado por un abogado del
> bufete antes de producción**. Hasta entonces, las funciones
> `fraseCompareciente(p, 'tercero_garante')` y `fraseHipoteca(datos, aportanteCompareciente)`
> son provisorias y NO pueden usarse en contratos firmados reales.
> Bloqueador de CP5 (no se puede cerrar el sprint sin el sign-off del
> abogado en la redacción).

**Garantía de regresión:** los tests F7 actuales (`test-legal-format.js`,
`test-e2e-f1.js`) **van a fallar** porque el texto cambia para incluir
aportante y porque la comparecencia se enriquece. Hay que **regenerar
snapshots** y actualizar fixtures con cuidado, validando manualmente cada
caso del modelo real.

**Freeze trigger:** al cambiar `contratos.estado` a `completado`/`firmado`, en
transacción atómica:

1. Para cada fila en `contrato_garantias(contrato_id)`: copiar
   `garantias.tipo/solidaria/datos/aportante_*` → `snapshot_*` y setear
   `congelado_en = now()`.
2. Para cada fila en `contrato_comparecientes(contrato_id)`: copiar
   `comparecientes.nombre/dpi/...` (descifrar y re-cifrar al snapshot) →
   `snapshot_*` y setear `congelado_en = now()`.

### 3.8 Migración manual

Script: `backend/scripts/migrate-garantias-desacopladas.js`.
Invocación: `npm run migrate:garantias`.

**Pre-condición confirmada por el usuario:** todos los contratos y modelos
actuales son **de prueba y descartables**. La migración los limpia antes de
crear el schema nuevo. **No hay legacy real a migrar**.

Pasos del script:

1. **Backup automático** del archivo SQLite (patrón F1):
   `data/lexdocs.db` → `data/lexdocs.db.bak-YYYYMMDD-HHmmss`. Si la base
   está en otro path (`LEXDOCS_DB_PATH`), respetar.
2. **Cleanup residuales** (en transacción):
   - DELETE FROM `audit_log` WHERE `entidad_tipo IN ('contrato','modelo','clausula','cliente')`.
   - DELETE FROM `solicitudes_tokens`.
   - DELETE FROM `contratos`.
   - DELETE FROM `clausulas`.
   - DELETE FROM `modelos`.
   - DELETE FROM `clientes` (incluye juridicos).
   - Resetear contadores `correlativo_actual` en `instituciones`.
3. **DROP de `fiadores` viejo**: SELECT COUNT verifica que esté vacía;
   si tiene filas, ABORTAR migración con error claro.
4. **CREATE** de las 4 tablas nuevas (`comparecientes`, `garantias`,
   `contrato_comparecientes`, `contrato_garantias`) con todos los CHECK
   constraints e índices.
5. **Migración de datos legacy** — código defensivo por si se corre en
   una DB con datos reales en el futuro. **En el entorno actual no aplica
   (cleanup vació todo)**. Lógica documentada para referencia futura:
   1. Descifrar `datos_garantia` de cada contrato.
   2. Si `hipoteca` ⇒ `INSERT garantias (tipo='hipotecaria',
      aportante_tipo='cliente', aportante_cliente_id=contrato.cliente_id,
      datos=cifrado de hipoteca)`. **Asunción**: aportante = cliente (el
      modelo viejo no permitía declarar tercero garante).
   3. Igual para `prenda`.
   4. Si `fiadores[]` no vacío: crear `comparecientes` (idempotente por
      dpi_hash) + garantía `fiduciaria solidaria=1` + filas en ambas
      pivotes con `agregado_por_actor='banco'`.
   5. Si el contrato estaba `completado`/`firmado` ⇒ poblar snapshots y
      `congelado_en`.
6. **NO borrar `contratos.datos_garantia`** — queda como backup (la columna
   permanece). Después del cleanup esto no aplica (la tabla está vacía).
7. `PRAGMA foreign_key_check` post-migración. Si retorna alguna fila,
   ABORTAR con detalle de la violación.
8. Registrar en `migrations_aplicadas` (idempotente).

### 3.9 Impacto en UI — 3 superficies (CP4)

#### Superficie 1: Portal cliente C6

- Componente `ComparecientesEditor` con CRUD simple. Cada fila: nombre, DPI,
  profesión, estado_civil, domicilio, **selector de rol (fiador / tercero
  garante)**.
- Componente `GarantiaAportadaPorMi` (opcional): si el cliente quiere
  declarar una hipoteca/prenda propia, completa los campos del bien.
  Aportante automático = el cliente.
- **No** ve garantías aportadas por comparecientes (eso lo gestiona el banco
  o bufete con info de los documentos).
- Cualquier escritura graba en pivotes con `agregado_por_actor='cliente'`,
  `user_id=NULL`.
- **Límites estrictos (decisión de producto):**
  - Máximo **1 fiador** desde el portal.
  - Máximo **1 garantía** propia desde el portal.
  - Ambos son **opcionales** — el cliente puede dejar todo vacío. Banco y
    bufete completan o corrigen después.

#### Superficie 2: Wizard banco (`FinancieraDetalle.jsx`)

- `ComparecientesEditor` (igual que en C6 + reutilización vía
  `ComparecientePicker` que busca por dpi_hash en la institución).
- `GarantiasEditor`:
  - Lista de garantías del contrato.
  - "+ Añadir garantía" → modal con selector de tipo (3 opciones).
  - Form contextual según tipo.
  - **Selector de aportante**: dropdown con [cliente] + cada compareciente
    actualmente en el contrato. Si no hay comparecientes y se quiere uno
    nuevo, abre `ComparecientesEditor` inline.
- **Límites:**
  - Fiadores: **sin tope práctico** (la realidad legal sí pone topes pero el
    sistema no los impone).
  - Garantías: **máximo 5 por contrato.**
- Audit por actor: `agregado_por_actor='banco'`.

#### Superficie 3: Wizard bufete

- UI idéntica al banco. Es revisor final, dispara el freeze al marcar
  listo-para-firmar.
- **Límites:** mismos que el banco (sin tope fiadores, máximo 5 garantías).
- Audit por actor: `agregado_por_actor='bufete'`.

#### Audit log granular

Acciones nuevas:
- `COMPARECIENTE_AGREGADO`, `COMPARECIENTE_EDITADO`, `COMPARECIENTE_QUITADO`,
  `COMPARECIENTE_ROL_CAMBIADO`.
- `GARANTIA_AGREGADA`, `GARANTIA_EDITADA`, `GARANTIA_QUITADA`,
  `GARANTIA_APORTANTE_CAMBIADO`.

### 3.10 Endpoints nuevos (CP3)

Catálogo y CRUD vivo:

- `GET    /api/comparecientes?institucion_id=&q=` — búsqueda por
  nombre_hash o dpi_hash.
- `POST   /api/comparecientes`
- `PUT    /api/comparecientes/:id`
- `GET    /api/garantias?institucion_id=&tipo=&aportante_cliente_id=&aportante_compareciente_id=`
- `POST   /api/garantias`
- `PUT    /api/garantias/:id`
- `DELETE /api/garantias/:id` (rechaza con 409 si está en contratos no
  congelados).

Vínculo con contratos:

- `GET    /api/contratos/:id/comparecientes`
- `POST   /api/contratos/:id/comparecientes` ({ compareciente_id, rol, orden })
- `PUT    /api/contratos/:id/comparecientes/:compId` (cambiar rol u orden)
- `DELETE /api/contratos/:id/comparecientes/:compId`
- `GET    /api/contratos/:id/garantias`
- `POST   /api/contratos/:id/garantias` ({ garantia_id, orden })
- `DELETE /api/contratos/:id/garantias/:garantiaId`

Portal público C6 (token-cliente):

- `GET    /api/public/contratos/:token/comparecientes`
- `POST   /api/public/contratos/:token/comparecientes`
- `PUT    /api/public/contratos/:token/comparecientes/:compId`
- `DELETE /api/public/contratos/:token/comparecientes/:compId`
- `GET    /api/public/contratos/:token/garantias` (solo lectura para ver
  lo que el banco/bufete ingresó).
- `POST   /api/public/contratos/:token/garantias` (solo si aportante=cliente).

---

## 4. Riesgos y trade-offs

| Riesgo                                                              | Mitigación                                                                            |
|---------------------------------------------------------------------|---------------------------------------------------------------------------------------|
| Texto F7 cambia → tests legacy fallan                               | Regenerar snapshots con validación manual caso por caso. Documentar deltas esperados. |
| Migración asume aportante=cliente para legacy                       | Doc explícita; banco edita post-migración los contratos con tercero garante.          |
| 3 actores editando comparecientes concurrentemente                  | Optimistic UI + último-en-escribir-gana. Audit_log preserva historia.                 |
| Cliente público (C6) podría agregar comparecientes spam             | Cap 1 fiador / 1 garantía desde el portal público. Banco/bufete sin tope de fiadores, máx 5 garantías. |
| Freeze parcial (algunas filas congeladas, otras no)                 | Freeze en transacción atómica con rollback.                                           |
| Tercero garante editado pierde firma                                | Re-firma requerida si tercero modificado post-firma. Snapshot protege el contrato firmado. |
| Garantía con aportante compareciente sin compareciente en contrato  | Validación app rechaza con 409. Endpoint guía a agregar primero al compareciente.     |
| Reutilización de un compareciente cambia su PII en contratos pasados | Snapshot al firmar es inmutable. Vivo cambia, congelado no.                           |

---

## 5. Esfuerzo recalculado

| Checkpoint | Tarea                                                                  | Horas (v1) | Horas (v2) |
|------------|------------------------------------------------------------------------|------------|------------|
| CP2        | Schema (4 tablas) + migración manual + tests de migración              | 5          | **7**      |
| CP3        | Endpoints CRUD comparecientes + garantías + portal C6                  | 5          | **7**      |
| CP3        | Refactor motor F7 (loadCompilacion + buildContrato + frases nuevas)    | 3          | **6**      |
| CP3        | Freeze trigger en cambio de estado                                     | 2          | **3**      |
| CP4        | UI banco (`GarantiasEditor` + `ComparecientesEditor` + `AportantePicker`) | 6       | **8**      |
| CP4        | UI bufete (reutiliza componentes)                                      | 2          | **2**      |
| CP4        | UI portal cliente C6 (`ComparecientesEditor` + opcional garantía propia) | 3        | **4**      |
| CP5        | Tests E2E (todos los casos del cuadro 3.2)                             | 4          | **6**      |
| CP5        | QA visual + diff PDF + validación legal con notario                    | 2          | **4**      |
| **Total**  |                                                                        | **32**     | **47**     |

15 horas más por: tercer tipo de persona (tercero garante), garantías con
aportante explícito, motor F7 con comparecencia generada, y más casos E2E.

---

## 6. Plan de checkpoints (sin cambios)

| CP  | Alcance                                                           | Entregable                                                       |
|-----|-------------------------------------------------------------------|------------------------------------------------------------------|
| CP1 | Diseño aprobado                                                   | **Este doc v2.** (pendiente OK)                                  |
| CP2 | Schema + migración manual                                         | Migración corrida en dev; tests de migración pasan.              |
| CP3 | Endpoints CRUD + motor F7 + freeze trigger                        | Endpoints documentados, motor F7 regresivo, tests unit + integ.  |
| CP4 | UI banco + UI bufete + UI portal C6                               | 3 superficies funcionales con audit_log por actor.               |
| CP5 | Tests E2E + QA visual + diff PDF                                  | Sprint cerrado, listo para merge a main.                         |

OK explícito entre cada CP. Sin merges intermedios a `main`.

---

**FIN del diseño aprobado v2.** Esperando OK al doc para arrancar CP2.
