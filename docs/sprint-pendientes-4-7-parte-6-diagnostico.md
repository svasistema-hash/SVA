# Sprint pendientes-4-7 — Parte 6 (diagnóstico): garantías desacopladas

**Fecha:** 2026-05-21
**Estado:** SOLO DIAGNÓSTICO — pendiente aprobación del usuario para implementar.

---

## 1. Modelo actual

### 1.1 Almacenamiento

Las garantías se guardan como **JSON cifrado AES-256-GCM** dentro de la columna
`contratos.datos_garantia` ([backend/db.js:197-239](../backend/db.js#L197-L239)).
Estructura típica:

```jsonc
{
  "tipos": ["hipoteca", "prenda", "ninguna"],
  "hipoteca": { "finca", "folio", "libro", "registro", "direccion", "area", "seguro_inmueble" },
  "prenda":   { "tipo_bien", "marca", "modelo", "serie", "placa", "valor_bien" },
  "fiadores": [
    { "nombre", "dpi", "profesion", "domicilio",
      "tipo_garantia": "hipotecaria|prendaria|personal",
      "hipoteca": {...},      // solo si tipo_garantia=hipotecaria
      "prenda":   {...}       // solo si tipo_garantia=prendaria
    }
  ]
}
```

### 1.2 Tabla `fiadores` — existe pero está sin usar

[backend/db.js:241-252](../backend/db.js#L241-L252) declara una tabla con
`contrato_id`, `nombre`, `dpi` cifrado, `dpi_hash`, `tipo_garantia`,
`datos_garantia` (JSON). **Ningún `INSERT` la pobla**; solo hay un `SELECT`
defensivo en [backend/routes/contratos.js:253](../backend/routes/contratos.js#L253)
que siempre devuelve `[]`. Es un artefacto de un diseño anterior.

### 1.3 Enum `tipo_garantia` (a nivel de modelo)

CHECK constraint en `modelos.tipo_garantia`
([backend/db.js:71](../backend/db.js#L71)):

| valor          | uso actual                                  |
|----------------|---------------------------------------------|
| `personal`     | Fiduciaria pura (solo fiadores)             |
| `hipotecaria`  | Bien inmueble + opcional fiadores           |
| `prendaria`    | Bien mueble + opcional fiadores             |
| `mixta`        | Combinación de hipoteca + prenda + fiadores |

### 1.4 Motor F7 — cómo compila el texto legal

Una sola variable `{{garantias}}` en la cláusula `quinta-garantias`
([backend/shared/legal/clausulas-base.json:80-87](../backend/shared/legal/clausulas-base.json#L80-L87)).

Se renderiza en [backend/contrato-engine.js:116-144](../backend/contrato-engine.js#L116-L144)
con `buildGarantiasText(datos_garantia)` que concatena:

- `hipoteca` → "hipoteca de primer grado sobre finca N°… folio… libro…"
- `prenda` → "prenda sin desplazamiento sobre vehículo marca… serie… placa…"
- `fiadores[]` → según `fiador.tipo_garantia`:
  - `hipotecaria` → frase con sus propios finca/folio/libro
  - `prendaria` → frase con su propio bien
  - resto → "fianza solidaria, mancomunada y de pago"

No existen variables `{{hipoteca_*}}` ni `{{fiador_*}}` por separado: todo va a un solo string.

### 1.5 UI actual

[frontend/src/pages/tenant/FinancieraDetalle.jsx:382-393](../frontend/src/pages/tenant/FinancieraDetalle.jsx#L382-L393)
expone un form **plano** (`CAMPOS_GARANTIA`: tipo, descripcion, finca, folio,
libro, municipio, placa, serie, marca, modelo). **No hay UI para añadir/quitar
fiadores como array** — el usuario tiene que editar JSON crudo si quiere fiadores.

---

## 2. Limitaciones que sí son problema

1. **No hay integridad referencial.** Garantía es un blob, no una entidad.
   Si la finca 123 se ingresa mal en 5 contratos, hay que corregir 5 lugares.
2. **No hay reutilización.** El mismo fiador en 3 contratos = 3 copias de su
   DPI/profesión/domicilio. Cambia su domicilio → no se propaga.
3. **Tabla `fiadores` muerta.** Está en el schema pero nadie escribe. Si
   alguien la "descubre" puede asumir que tiene datos y devolver respuestas
   inconsistentes.
4. **`tipo_garantia` del modelo no restringe `datos_garantia` del contrato.**
   Un modelo `personal` puede guardar `datos_garantia.hipoteca`. No hay
   validación.
5. **Representación dual confusa.** `datos_garantia.hipoteca` (a nivel
   contrato) **y** `fiador.hipoteca` (a nivel fiador) coexisten. El motor
   F7 las trata como si fueran lo mismo
   ([contrato-engine.js:124](../backend/contrato-engine.js#L124)).
6. **Sin historial granular.** El `audit_log` ve que `datos_garantia` cambió,
   no qué campo concreto. Para auditoría legal eso es débil.
7. **UI no edita fiadores como array.** Bug funcional concreto, no solo
   arquitectónico.

---

## 3. Propuesta — garantías como entidad independiente

> **No implementar todavía. Esperar OK del usuario sobre este diseño.**

### 3.1 Nuevo enum `tipo_garantia`

Pasar de 4 a 4 tipos pero con semántica más limpia:

| valor              | descripción                                                     | fiadores |
|--------------------|-----------------------------------------------------------------|----------|
| `fiduciaria`       | Garantía personal pura: 1+ fiadores responden por el crédito.   | SÍ (>=1) |
| `fianza_solidaria` | Variante de fiduciaria con cláusula de solidaridad mancomunada. | SÍ (>=1) |
| `hipotecaria`      | Bien inmueble como garantía real. Fiadores opcionales.          | opcional |
| `prendaria`        | Bien mueble como garantía real. Fiadores opcionales.            | opcional |

> Migración del enum viejo: `personal` → `fiduciaria`. `mixta` se elimina y
> se reemplaza por **múltiples garantías por contrato** (la "mixtura" emerge
> de tener N filas en la tabla).

### 3.2 Schema propuesto

```sql
CREATE TABLE garantias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  institucion_id INTEGER NOT NULL REFERENCES instituciones(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('fiduciaria','fianza_solidaria','hipotecaria','prendaria')),
  -- Datos del bien según tipo (cifrado AES-GCM si tipo='hipotecaria' o 'prendaria')
  datos TEXT,                       -- JSON
  -- Trazabilidad
  creado_por_user_id INTEGER REFERENCES users(id),
  creado_en TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en TEXT
);

CREATE TABLE fiadores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  institucion_id INTEGER NOT NULL REFERENCES instituciones(id),
  nombre TEXT NOT NULL,
  dpi TEXT NOT NULL,                -- cifrado AES-GCM
  dpi_hash TEXT NOT NULL,           -- HMAC para búsqueda
  profesion TEXT,
  domicilio TEXT,
  -- Búsqueda y reutilización
  UNIQUE(institucion_id, dpi_hash)
);

-- N:N entre contratos y garantías (un contrato puede tener varias garantías)
CREATE TABLE contrato_garantias (
  contrato_id INTEGER NOT NULL REFERENCES contratos(id) ON DELETE CASCADE,
  garantia_id INTEGER NOT NULL REFERENCES garantias(id),
  orden INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (contrato_id, garantia_id)
);

-- N:N entre garantías fiduciarias/fianza_solidaria y fiadores
CREATE TABLE garantia_fiadores (
  garantia_id INTEGER NOT NULL REFERENCES garantias(id) ON DELETE CASCADE,
  fiador_id INTEGER NOT NULL REFERENCES fiadores(id),
  PRIMARY KEY (garantia_id, fiador_id)
);
```

### 3.3 Reglas de validación (constraint a nivel app)

- `garantias.tipo IN ('fiduciaria','fianza_solidaria')` ⇒ **debe** tener
  >=1 fiador en `garantia_fiadores`.
- `garantias.tipo IN ('hipotecaria','prendaria')` ⇒ los fiadores son
  opcionales; `garantias.datos` debe contener los campos del bien según
  el tipo (validación con JSON schema o función `validarDatosGarantia()`).
- Un mismo `fiador` (mismo `dpi_hash`) puede aparecer en N garantías
  (reutilización entre contratos).
- `contrato_garantias` permite N garantías por contrato → reemplaza
  `tipo_garantia: 'mixta'`.

### 3.4 Impacto en el motor F7

`{{garantias}}` se sigue compilando como una sola variable, pero ahora
`buildGarantiasText()` recibe `garantias[]` (array de filas) en vez de
`datos_garantia` (blob). La firma queda:

```js
buildGarantiasText({ contratoId, garantias, fiadoresPorGarantia })
```

`contrato-engine.js` carga las garantías con un JOIN en lugar de parsear
un JSON cifrado. El texto generado debe ser **idéntico** al actual para
contratos que no se migren — los tests F7 existentes son la red de
seguridad.

### 3.5 Migración de datos

Migración idempotente al boot
(`backend/scripts/migrate-garantias-desacopladas.js`):

1. Para cada `contrato` con `datos_garantia != NULL`:
   1. Descifrar `datos_garantia`.
   2. Si hay `hipoteca` → INSERT en `garantias` tipo=hipotecaria con sus campos.
   3. Si hay `prenda` → INSERT en `garantias` tipo=prendaria.
   4. Si hay `fiadores[]` → para cada uno:
      - INSERT/SELECT en `fiadores` (UNIQUE por dpi_hash → reuso).
      - Crear garantía tipo `fiduciaria` (o `fianza_solidaria` si el F7
        usa la frase solidaria) si el fiador no estaba ligado a una
        garantía real.
      - INSERT en `garantia_fiadores`.
   5. Vincular `contrato_garantias`.
2. **No borrar `datos_garantia`** en la primera versión: dejarlo como
   backup hasta validar que el motor F7 produce el mismo texto que antes
   (rollback fácil).
3. Marcar la migración como ejecutada en una tabla
   `migrations_aplicadas` para que sea idempotente.

### 3.6 Impacto en UI

`FinancieraDetalle.jsx`:
- Eliminar `CAMPOS_GARANTIA` plano.
- Componente nuevo `GarantiasEditor` con:
  - Botón "+ Añadir garantía" → selector tipo (4 opciones).
  - Form contextual según tipo (hipoteca = finca/folio/libro/área/seguro,
    prenda = marca/serie/placa/valor, fiduciaria/fianza = selector de
    fiadores existentes o "+ Nuevo fiador").
  - Lista editable de garantías del contrato.
- Componente `FiadorPicker` con búsqueda por dpi_hash (reutilización
  cross-contratos en la misma institución).

### 3.7 Endpoints nuevos

- `GET    /api/garantias?institucion_id=&tipo=` (catálogo).
- `POST   /api/garantias` (crear).
- `PUT    /api/garantias/:id` (editar — solo si no está ligada a contrato
  firmado).
- `GET    /api/fiadores?institucion_id=&q=` (búsqueda por nombre o DPI).
- `POST   /api/fiadores`.
- `POST   /api/contratos/:id/garantias` ({ garantia_id }) — vincular.
- `DELETE /api/contratos/:id/garantias/:garantiaId`.

---

## 4. Riesgos y trade-offs

| Riesgo                                                | Mitigación                                                                  |
|-------------------------------------------------------|-----------------------------------------------------------------------------|
| Migración rompe motor F7 → cambia el texto de PDF     | Mantener `datos_garantia` viejo como backup; comparar output con snapshot. |
| Reutilización de fiadores cambia datos en contratos firmados | Garantías de contratos firmados se vuelven inmutables (campo `congelada`).   |
| Más queries en el render del PDF (JOINs)              | Cachear por contrato; el render ya no es hot-path.                          |
| UI nueva = más complejidad para el usuario banco      | Mantener form "rápido" para casos simples (1 garantía); avanzado para mixtas. |
| Doble fuente de verdad durante migración              | Feature flag `GARANTIAS_DESACOPLADAS=1`; switch atómico cuando F7 valide.   |

---

## 5. Esfuerzo estimado

| Fase                                            | Horas |
|-------------------------------------------------|-------|
| Schema + migración idempotente + tests          | 4     |
| Endpoints CRUD garantías/fiadores               | 5     |
| Refactor motor F7 (buildGarantiasText)          | 3     |
| UI GarantiasEditor + FiadorPicker               | 8     |
| Tests E2E (crear contrato con garantía mixta)   | 3     |
| QA + ajuste de PDF                              | 2     |
| **Total**                                       | **25**|

---

## 6. Preguntas para el usuario antes de implementar

1. **`tipo_garantia` legacy en `modelos`**: ¿lo mantenemos como hint
   informativo o lo eliminamos? Hoy es CHECK constraint duro.
2. **`fianza_solidaria` vs `fiduciaria`**: ¿son dos tipos distintos o
   `fianza_solidaria` es un flag (`solidaria: true`) sobre `fiduciaria`?
3. **Reutilización de fiadores cross-tenant**: ¿un fiador puede estar en
   contratos de Banco RSG **y** Banco X, o se aísla por `institucion_id`?
   (Propuesta actual: aislado por institución.)
4. **Edición de garantía con contrato firmado**: ¿permitido con
   audit_log, o totalmente bloqueado? (Propuesta: bloqueado, garantía
   `congelada=1`.)
5. **Migración**: ¿corre al boot (riesgo si la BD es grande) o en un
   script `npm run migrate:garantias` manual?
6. **Roadmap**: ¿esta refactorización entra en el sprint siguiente o se
   pospone?

**STOP.** Esperando feedback del usuario antes de tocar código.
