# Migraciones de LexDocs GT

Rastro de auditoría de cada migración aplicada a la base de datos
(`backend/lexdocs.db`). Cada archivo es un snapshot histórico de cómo se
modificó el schema o los datos en un momento dado.

## Convención de nombres

```
YYYY-MM-DD-descripcion-corta.js
```

- Fecha en formato ISO al inicio.
- Descripción en kebab-case, breve, en castellano o inglés según convenga.
- Sufijo `.js` (Node.js + `better-sqlite3`).

## Reglas

1. **Idempotente**: cada script debe poder re-ejecutarse sin romper la DB
   ni duplicar trabajo. Usar `CREATE … IF NOT EXISTS`, chequear
   `PRAGMA table_info` antes de `ALTER`, `isEncrypted()` para skip de
   filas ya migradas, etc.
2. **No automático**: ninguno corre solo. Se ejecutan a mano con
   `node backend/scripts/migrations/<archivo>.js` cuando aplica.
3. **Backup obligatorio antes de migrar datos**: las migraciones que
   transforman datos (no sólo schema) deben crear un backup binario y
   un dump SQL bajo `backend/lexdocs.db.pre-<sprint>-<fecha>(.sql)`,
   gitignored por el patrón `lexdocs.db.pre-*` en el `.gitignore` raíz.
4. **Una transacción única**: todo el script DDL/DML va dentro de
   `BEGIN; … COMMIT;` (o `db.transaction(...)`). Cualquier error → rollback.
5. **Verificaciones post**: cada script imprime conteos y spot-checks
   para confirmar el resultado.

## Cronología

| Fecha | Archivo | Descripción |
|---|---|---|
| 2026-05-15 | [2026-05-15-schema-encryption-prep.js](2026-05-15-schema-encryption-prep.js) | Sprint Seguridad paso 3.3 — recrea `clientes` con `ingresos TEXT`, agrega columnas `dpi_hash`/`nit_hash`/`conyuge_dpi_hash` + índices; mueve `UNIQUE(institucion_id, dpi)` a `UNIQUE(institucion_id, dpi_hash)` parcial. Agrega `fiadores.dpi_hash`. |
| 2026-05-15 | [2026-05-15-encrypt-data.js](2026-05-15-encrypt-data.js) | Sprint Seguridad paso 3.4 — encripta in-place todos los DPI/NIT/conyuge_dpi/ingresos/domicilio en `clientes`, `representantes.dpi`, `fiadores.dpi`, y JSON `datos_cliente`/`datos_garantia` en `contratos`. Pobla los `*_hash` correspondientes. |
| 2026-05-15 | [2026-05-15-templates-money.js](2026-05-15-templates-money.js) | Sprint Seguridad paso 3.5 (preparación) — limpia `{{moneda}} {{monto}}` y `Q{{monto}}` duplicados en `clausulas.texto_base` (idem cuota_mensual / seguro_inmueble / valor_bien). `formatQuetzal` en el motor ya inyecta `Q`. |
| 2026-05-19 | [2026-05-19-f2-schema-juridicos.js](2026-05-19-f2-schema-juridicos.js) | Sprint Funcional F2 fase 1 — agrega `clientes.tipo_persona` (discriminador) + tabla `clientes_juridicos` 1:1 con FK CASCADE, índices, trigger `updated_at`. Hace backup `lexdocs.db.pre-f2-<fecha>(.sql)`. |
| 2026-05-19 | [2026-05-19-f2-nit-canonical.js](2026-05-19-f2-nit-canonical.js) | Sprint Funcional F2 fase 3 — re-hashea `clientes.nit_hash` con `normalizeNit()` (strip del dígito verificador después del último guión), para que la búsqueda `?nit=78901234` matchee al NIT almacenado `78901234-5`. |

## Cómo correr

Backend detenido (para liberar el lock de WAL/SHM):

```powershell
# desde la raíz del proyecto
node backend/scripts/migrations/2026-05-19-f2-schema-juridicos.js
```

Reinicia backend después.
