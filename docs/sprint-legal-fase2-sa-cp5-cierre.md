# Sprint LexDocs Legal Fase 2 (S.A. express) — Reporte de cierre CP5

**Fecha de cierre:** 2026-06-03
**Branch principal:** `sprint/legal-fase2-sa-cp5` (encadenada desde CP1→CP2→CP3→CP4).
**Status:** Cerrado en código. **Pendiente de aprobación del usuario para merge a main + migración en producción.**

---

## Resumen ejecutivo

El sprint construyó el producto **LexDocs Legal Fase 2 — Constitución de Sociedad Anónima express**, un producto multi-tenant jerárquico (master + sub-tenants) separado de Fase 1 (contratos bancarios) que reusa el backend, motor F7, cifrado AES-GCM y OCR existentes.

Cinco checkpoints, cada uno con su entregable verificable:

| CP | Alcance | Entregable | Tests |
|---|---|---|---|
| CP1 | Diseño aprobado | `docs/sprint-legal-fase2-sa-diseno.md` | n/a |
| CP2 | Schema + migración manual + tests de schema | 7 tablas nuevas, ALTERs polimórficos audit_log, firma master | **38 PASS** |
| CP3 | Backend completo + motor F7 SA + 6 sub-tests de aislamiento bloqueantes | 4 rutas (firmas/sociedades/master/public), motor, freeze trigger | **48 PASS** |
| CP4 | Frontend con 3 superficies + facturación placeholder | Sub-tenant + portal cliente + master, Vite build OK | n/a (visual) |
| CP5 | Tests E2E del motor + doc sign-off notarial + cierre | 5 escenarios compilados verbatim, doc legal generado | **47 PASS** |

**Tests acumulados del proyecto completo (Fase 1 + Fase 2):**

```
test:garantias-schema    → 32 PASS
test:cp3                  → 48 PASS
test:cp5 (garantías)      → 40 PASS
test:fase2-sa-schema      → 38 PASS
test:fase2-sa-e2e         → 48 PASS
test:fase2-sa-cp5         → 47 PASS
─────────────────────────────────
Total                     → 253 PASS / 0 FAIL
```

---

## Lo que quedó funcional

### Backend
- 7 tablas nuevas con CHECK constraints estrictos (capital ≥ Q5,000, etc.).
- 4 routers Express (`firmas`, `sociedades`, `master`, `public/sociedades`).
- Motor F7 extendido en `backend/sociedad-engine.js`:
  - 9 cláusulas siguiendo Cód. Comercio art. 86 GT.
  - 16+ variables F7 nuevas (denominación_legal, capital_social_legal, distribución_accionistas_legal, etc.).
  - Snapshot vs vivo según estado.
  - `freezeSociedad()` con validaciones críticas pre-RM.
- Middleware `requireFirmaScope` + `requireMasterFirma` con **6 tests de aislamiento bloqueantes** verificando que sub-tenant A no ve datos de B (404 anti-enumeration).
- Auth: JWT extendido con `firma_id`.
- Migración manual idempotente `npm run migrate:fase2-sa` + guard `MIGRATE_FASE2_SA_NOW=true` para producción.

### Frontend
- Subdominio conceptual `legal.lexdocs.gt` (en sprint 1 montado bajo `/legal/*` del mismo dominio, configurable como Vercel project separado).
- API client unificado `frontend/src/api/legal.js`.
- Layout específico `LegalLayout.jsx` con sidebar contextual sub-tenant vs master.
- **Superficie 1** (sub-tenant): Dashboard, Bandeja, Crear S.A., Detalle completo con preview de minuta + modal de correcciones + transiciones de estado.
- **Superficie 2** (portal cliente público, `/legal/portal/:token`): form de accionistas/representantes/direcciones, validación de suma % = 100 en vivo, anti-enumeration en token inválido.
- **Superficie 3** (master): Vista global cross-tenant, CRUD de sub-tenants, métricas por firma.
- **Facturación**: placeholder con conteo en vivo (lógica real de billing en sprint específico).
- **Login**: redirige por `user.firma_id` (a `/legal` si presente, a `/` si Fase 1).

### Estilo
- ES neutro profesional, tratamiento "usted" formal en todo el copy del producto. Cumple [[lexdocs-copy-style]] guardado en memory.

---

## Bloqueadores P0 — estado al cierre del sprint

Lista de la sección 3.8 del CP1:

| # | Riesgo | Estado |
|---|---|---|
| P0-1 | Tests de aislamiento sub-tenant ISO-1 a ISO-6 | ✅ **48 PASS en `test:fase2-sa-e2e`**, incluyendo los 6 sub-tests bloqueantes |
| P0-2 | Sign-off legal del texto de cláusulas 1-9 | 📄 **Doc generado** `docs/sprint-legal-fase2-sa-cp5-minutas.md` con 5 escenarios compilados verbatim. **Pendiente revisión y firma del notario senior** antes de habilitar PDFs reales. |
| P0-3 | T&C del producto publicados | ⏳ Pendiente — los redacta el usuario (master tenant). Bloqueante de onboarding de sub-tenants terceros. |
| P0-4 | Política de privacidad publicada | ⏳ Pendiente — idem T&C. |
| P0-5 | Password policy implementada | ⏳ Pendiente — sugerido como hotfix corto separado, no bloquea el merge a main del backend pero sí el onboarding. |
| P0-6 | Rate limit estricto en endpoints master | ⏳ Pendiente — heredan el rate limit global de 100/15min. Hotfix corto a aplicar antes de exponer el endpoint master a internet. |

**Nota:** P0-3 a P0-6 son trabajo del usuario (escritura legal de docs + decisión política sobre password / rate limit). El sprint puede mergerarse a main para habilitar QA visual de las 3 superficies, sin onboardear sub-tenants terceros hasta cerrar P0-3 y P0-4.

---

## Documento clave generado: `sprint-legal-fase2-sa-cp5-minutas.md`

Contiene 5 escenarios de constitución de S.A., cada uno con:
- Datos de entrada.
- 9 cláusulas compiladas verbatim por el motor F7.
- Verificación de las 4 reglas de formato (R1-R4) — todas PASS.

| Escenario | Accionistas | Representantes | Domicilio |
|---|---|---|---|
| E1 | 1 (100%) | Administrador Único | Guatemala |
| E2 | 2 (50/50) | Presidente + Vicepresidente | Guatemala |
| E3 | 3 (60/25/15) | Gerente General único | Guatemala |
| E4 | 1 (100%) | Administrador Único con facultades amplias | Quetzaltenango |
| E5 | 2 (60/40) | Presidente + Vicepresidente + Secretario | Guatemala |

**Acción requerida del usuario:** entregar este doc al notario senior asociado para revisión y sign-off de los textos antes de habilitar la generación de PDFs reales en producción.

---

## Pendientes documentados para sprints siguientes

| Sprint | Alcance |
|---|---|
| Sprint 2 Legal | Persona jurídica como accionista (extensión del motor F7). S.R.L., E.M.I., Cooperativa (cada tipo extiende `tipo_sociedad` con sus cláusulas específicas). |
| Sprint 3 Legal | Integración con Registro Mercantil GT (API si aparece, scraping con consentimiento como fallback). Hoy `enviado_RM` e `inscrito_RM` son manuales. |
| Sprint 4 Legal | Billing real (Stripe / facturación electrónica SAT GT). Métricas por firma con telemetría productiva. |
| Hotfix corto post-merge | Password policy (mínimo 12 chars + complejidad). Rate limit master 5/min · 50/hora. T&C y privacy publicados en URLs estables. |

---

## Workflow propuesto para llevar el sprint a producción

Sigue el patrón que funcionó en el sprint anterior (garantías-desacopladas):

1. **Merge en cadena a main** (todas las branches del sprint):
   - `sprint/legal-fase2-sa-diseno` → main (doc CP1).
   - `sprint/legal-fase2-sa-cp2` → main (schema + migración).
   - `sprint/legal-fase2-sa-cp3` → main (backend).
   - `sprint/legal-fase2-sa-cp4` → main (frontend).
   - `sprint/legal-fase2-sa-cp5` → main (cierre).

2. **Push a main** → Railway + Vercel redeployan automáticamente.

3. **Verificar deploys** vivos en el nuevo commit.

4. **Aplicar migración en producción** (Railway → Variables):
   - Setear `MIGRATE_FASE2_SA_NOW=true`.
   - Esperar redeploy y verificar logs `[boot] migración Fase 2 OK: {firma_master_id: 1, ...}`.
   - **DESSETEAR la variable** inmediatamente (igual que `SEED_GARANTIAS_NOW` del sprint anterior).

5. **QA visual en producción**:
   - Crear sub-tenant de prueba vía `/api/firmas` (autenticado como master).
   - Crear un usuario para ese sub-tenant (vía CLI o seed).
   - Login → debe redirigir a `/legal`.
   - Crear S.A. → portal cliente → completar → revisión → freeze → preview minuta.

6. **Cerrar P0-3 a P0-6** (escritura legal + hardening) **antes de onboardear sub-tenants terceros reales**.

---

## Esperando OK del usuario para arrancar el merge

Si el usuario aprueba el cierre del sprint, los siguientes pasos son:

1. Yo hago el merge en cadena de las 5 branches a `main`.
2. Push a `main` con el workaround `https://svasistema-hash@…` (mismo que sprints anteriores).
3. Verifico ambos deploys vivos (Railway `/api/version` y Vercel bundle).
4. Te guío en setear la env var `MIGRATE_FASE2_SA_NOW=true` en Railway.
5. Confirmo en logs que la migración corrió OK.
6. Te recordo desetear la env var.
7. Cierro este sprint con tu OK.

**Sin tu OK no toco main.**
