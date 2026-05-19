import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';

import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import { clienteJuridicoSchema } from '../../schemas/clienteJuridico';
import {
  createClienteJuridico,
  updateClienteJuridico,
  getClienteJuridico,
} from '../../api/clientesJuridicos';

const TIPOS_SOCIEDAD = ['S.A.','S.R.L.','Sociedad Civil','E.M.I.','Cooperativa','Asociación/Fundación','Otra'];
const CARGOS_REP   = ['Administrador Único','Presidente','Gerente General','Representante Legal designado','Apoderado'];
const REGIMENES    = ['Régimen General','Pequeño Contribuyente','Especial agro'];
const CARGOS_LIMITADOS = ['Administrador Único', 'Presidente'];

// Estilos compartidos para títulos de sección.
const sectionHeaderStyle = {
  fontFamily: "'DM Sans', sans-serif",
  fontSize: 11,
  fontWeight: 500,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  margin: 0,
  paddingBottom: 4,
};
const sectionStyle = {
  borderTop: '0.5px solid var(--border-light)',
  paddingTop: 18,
  marginTop: 18,
};

// Helper para input formateado en quetzales (preview no controlado del valor real).
function formatQuetzalPreview(v) {
  const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
  if (!Number.isFinite(n)) return null;
  return 'Q' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Pequeño componente de campo que muestra label + input + error en rojo.
function Field({ label, required, error, hint, children }) {
  return (
    <div className="field" style={{ margin: 0 }}>
      <label>
        {label}
        {required && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>*</span>}
      </label>
      {children}
      {hint && !error && <div className="help">{hint}</div>}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

// Mapea null → '' para que react-hook-form no renderice "null" en inputs.
function toFormDefaults(data) {
  if (!data) return {};
  const out = {};
  for (const k of Object.keys(data)) {
    out[k] = data[k] === null || data[k] === undefined ? '' : data[k];
  }
  return out;
}

export default function ClienteJuridicoNuevo() {
  const { inst } = useOutletContext() || {};
  const nav = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [serverError, setServerError] = useState(null);
  // En modo edición no requerimos re-aceptar autorización (asumimos ya consentida al crear).
  const [authConsent, setAuthConsent] = useState(isEdit);
  const [fiscalOpen, setFiscalOpen] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);

  const {
    register, handleSubmit, watch, setError, reset,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(clienteJuridicoSchema),
    mode: 'onBlur',
    defaultValues: {
      tipo_sociedad: '',
      rep_cargo: '',
    },
  });

  // En modo edición: cargar datos existentes y pre-llenar.
  useEffect(() => {
    if (!isEdit) return;
    setLoadingExisting(true);
    getClienteJuridico(id)
      .then((c) => reset(toFormDefaults(c)))
      .catch((e) => setServerError(e.response?.data?.error || e.message))
      .finally(() => setLoadingExisting(false));
  }, [id, isEdit, reset]);

  const tipoSociedad = watch('tipo_sociedad');
  const repCargo = watch('rep_cargo');
  const capAutorizado = watch('capital_autorizado');
  const capSuscrito = watch('capital_suscrito');
  const capPagado = watch('capital_pagado');

  const showOtra = tipoSociedad === 'Otra';
  const showBanner162 = CARGOS_LIMITADOS.includes(repCargo);

  const onSubmit = async (data) => {
    setServerError(null);
    try {
      const result = isEdit
        ? await updateClienteJuridico(id, data)
        : await createClienteJuridico(data);
      const newId = result?.id || id;
      nav(`/instituciones/${inst.slug}/clientes/juridicos/${newId}`);
    } catch (e) {
      const resp = e?.response?.data;
      if (resp?.issues?.length) {
        for (const i of resp.issues) {
          if (i.path) setError(i.path, { type: 'server', message: i.message });
        }
        setServerError(resp.error || 'La validación del servidor falló. Revisá los campos.');
      } else {
        setServerError(resp?.error || e.message || `Error al ${isEdit ? 'actualizar' : 'crear'} el cliente.`);
      }
    }
  };

  if (!inst || loadingExisting) {
    return (<><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>);
  }

  return (
    <>
      <Topbar
        title={isEdit ? `Editar ${watch('nombre') || 'cliente jurídico'}` : 'Nuevo cliente jurídico'}
        crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Clientes', 'Jurídicos', isEdit ? (watch('nombre') || 'Editar') : 'Nuevo')} />}
        actions={
          <>
            <button
              type="button"
              className="btn"
              onClick={() => nav(`/instituciones/${inst.slug}/clientes/juridicos`)}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              form="cliente-juridico-form"
              className="btn btn-gold"
              disabled={isSubmitting || !authConsent}
            >
              {isSubmitting ? <span className="spinner" /> : (isEdit ? 'Guardar cambios' : 'Guardar')}
            </button>
          </>
        }
      />
      <div className="app-content">
        {serverError && (
          <div className="alert alert-danger" style={{ marginBottom: 14 }}>
            <strong>No se pudo guardar:</strong> {serverError}
          </div>
        )}

        <form id="cliente-juridico-form" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="card">
            {/* ─── Sección 1: Identificación ─────────────────────── */}
            <h3 style={sectionHeaderStyle}>Identificación</h3>
            <div className="row-2" style={{ marginTop: 12 }}>
              <Field label="Denominación social" required error={errors.nombre?.message}>
                <input className="input" {...register('nombre')} placeholder="Constructora del Sur, S.A." />
              </Field>
              <Field label="Nombre comercial" error={errors.nombre_comercial?.message}>
                <input className="input" {...register('nombre_comercial')} placeholder="CDS" />
              </Field>
            </div>
            <div className="row-2">
              <Field label="Tipo de sociedad" required error={errors.tipo_sociedad?.message}>
                <select className="select" {...register('tipo_sociedad')}>
                  <option value="">— Seleccionar —</option>
                  {TIPOS_SOCIEDAD.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="NIT" required error={errors.nit?.message}
                hint='Formato: dígitos opcionalmente con guion y dígito/K verificador (ej. "78901234-5").'>
                <input className="input" {...register('nit')} placeholder="78901234-5" />
              </Field>
            </div>
            {showOtra && (
              <div className="row-2">
                <Field label="Especifique tipo de sociedad" required error={errors.tipo_sociedad_otra?.message}>
                  <input className="input" {...register('tipo_sociedad_otra')} />
                </Field>
                <div />
              </div>
            )}
            <Field label="Objeto social" required error={errors.objeto_social?.message}>
              <textarea
                className="textarea"
                rows={3}
                {...register('objeto_social')}
                placeholder="Construcción y desarrollo inmobiliario"
              />
            </Field>

            {/* ─── Sección 2: Constitución ──────────────────────── */}
            <div style={sectionStyle}>
              <h3 style={sectionHeaderStyle}>Constitución</h3>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4, marginBottom: 12 }}>
                Escritura constitutiva, registro mercantil y patentes.
              </div>
              <div className="row-3">
                <Field label="No. escritura" required error={errors.escritura_numero?.message}>
                  <input className="input" {...register('escritura_numero')} />
                </Field>
                <Field label="Fecha de escritura" required error={errors.escritura_fecha?.message}>
                  <input type="date" className="input" {...register('escritura_fecha')} />
                </Field>
                <Field label="Notario autorizante" required error={errors.escritura_notario?.message}>
                  <input className="input" {...register('escritura_notario')} placeholder="Lic. Roberto García" />
                </Field>
              </div>
              <div className="row-2" style={{ marginTop: 4 }}>
                <Field label="Registro Mercantil — número" required error={errors.registro_mercantil_numero?.message}>
                  <input className="input" {...register('registro_mercantil_numero')} />
                </Field>
                <Field label="Fecha de inscripción" required error={errors.registro_mercantil_fecha?.message}>
                  <input type="date" className="input" {...register('registro_mercantil_fecha')} />
                </Field>
              </div>
              <div className="row-2">
                <Field label="Folio" required error={errors.registro_mercantil_folio?.message}>
                  <input className="input" {...register('registro_mercantil_folio')} />
                </Field>
                <Field label="Libro" required error={errors.registro_mercantil_libro?.message}>
                  <input className="input" {...register('registro_mercantil_libro')} />
                </Field>
              </div>
              <div className="row-2" style={{ marginTop: 4 }}>
                <Field label="Patente de Sociedad — número" required error={errors.patente_sociedad_numero?.message}>
                  <input className="input" {...register('patente_sociedad_numero')} />
                </Field>
                <Field label="Fecha" required error={errors.patente_sociedad_fecha?.message}>
                  <input type="date" className="input" {...register('patente_sociedad_fecha')} />
                </Field>
              </div>
              <div className="row-2">
                <Field label="Patente de Empresa — número" required error={errors.patente_empresa_numero?.message}>
                  <input className="input" {...register('patente_empresa_numero')} />
                </Field>
                <Field label="Fecha" required error={errors.patente_empresa_fecha?.message}>
                  <input type="date" className="input" {...register('patente_empresa_fecha')} />
                </Field>
              </div>
              <div className="row-3" style={{ marginTop: 4 }}>
                <Field label="Capital autorizado" required
                  hint={capAutorizado && !errors.capital_autorizado ? formatQuetzalPreview(capAutorizado) : null}
                  error={errors.capital_autorizado?.message}>
                  <input className="input" {...register('capital_autorizado')} placeholder="5000000" />
                </Field>
                <Field label="Capital suscrito" required
                  hint={capSuscrito && !errors.capital_suscrito ? formatQuetzalPreview(capSuscrito) : null}
                  error={errors.capital_suscrito?.message}>
                  <input className="input" {...register('capital_suscrito')} placeholder="2000000" />
                </Field>
                <Field label="Capital pagado" required
                  hint={capPagado && !errors.capital_pagado ? formatQuetzalPreview(capPagado) : null}
                  error={errors.capital_pagado?.message}>
                  <input className="input" {...register('capital_pagado')} placeholder="500000" />
                </Field>
              </div>
            </div>

            {/* ─── Sección 3: Representación Legal ──────────────── */}
            <div style={sectionStyle}>
              <h3 style={sectionHeaderStyle}>Representación legal</h3>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 4, marginBottom: 12 }}>
                Persona facultada para firmar en nombre de la sociedad.
              </div>
              <div className="row-2">
                <Field label="Nombre completo del representante" required error={errors.rep_nombre_completo?.message}>
                  <input className="input" {...register('rep_nombre_completo')} placeholder="Luis Roberto Ramírez Soto" />
                </Field>
                <Field label="DPI del representante" required error={errors.rep_dpi?.message}
                  hint='13 dígitos. Aceptamos espacios (ej. "2345 67890 0301").'>
                  <input className="input" {...register('rep_dpi')} placeholder="2345 67890 0301" />
                </Field>
              </div>
              <div className="row-2">
                <Field label="Profesión" error={errors.rep_profesion?.message}>
                  <input className="input" {...register('rep_profesion')} placeholder="Ingeniero Civil" />
                </Field>
                <Field label="Cargo" required error={errors.rep_cargo?.message}>
                  <select className="select" {...register('rep_cargo')}>
                    <option value="">— Seleccionar —</option>
                    {CARGOS_REP.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
              {showBanner162 && (
                <div className="alert alert-warn" style={{ marginTop: 4, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <AlertCircle size={14} strokeWidth={1.5} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    Por <strong>Art. 162 del Código de Comercio</strong>, el nombramiento de
                    Administrador Único o Presidente se limita a un máximo de <strong>3 años</strong>.
                  </span>
                </div>
              )}
              <div className="row-3" style={{ marginTop: 4 }}>
                <Field label="No. acta" required error={errors.rep_acta_numero?.message}>
                  <input className="input" {...register('rep_acta_numero')} />
                </Field>
                <Field label="Fecha del acta" required error={errors.rep_acta_fecha?.message}>
                  <input type="date" className="input" {...register('rep_acta_fecha')} />
                </Field>
                <Field label="Notario del acta" required error={errors.rep_acta_notario?.message}>
                  <input className="input" {...register('rep_acta_notario')} />
                </Field>
              </div>
              <div className="row-3">
                <Field label="Inscripción — número" required error={errors.rep_inscripcion_numero?.message}>
                  <input className="input" {...register('rep_inscripcion_numero')} />
                </Field>
                <Field label="Folio" error={errors.rep_inscripcion_folio?.message}>
                  <input className="input" {...register('rep_inscripcion_folio')} />
                </Field>
                <Field label="Libro" error={errors.rep_inscripcion_libro?.message}>
                  <input className="input" {...register('rep_inscripcion_libro')} />
                </Field>
              </div>
              <div className="row-2">
                <Field label="Vigencia — inicio" required error={errors.rep_vigencia_inicio?.message}>
                  <input type="date" className="input" {...register('rep_vigencia_inicio')} />
                </Field>
                <Field label="Vigencia — vencimiento" required error={errors.rep_vigencia_vencimiento?.message}>
                  <input type="date" className="input" {...register('rep_vigencia_vencimiento')} />
                </Field>
              </div>
            </div>

            {/* ─── Sección 4: Domicilio ─────────────────────────── */}
            <div style={sectionStyle}>
              <h3 style={sectionHeaderStyle}>Domicilio</h3>
              <Field label="Domicilio fiscal" required error={errors.domicilio?.message}>
                <textarea
                  className="textarea"
                  rows={2}
                  {...register('domicilio')}
                  placeholder="5a avenida 10-25 zona 9, Ciudad de Guatemala"
                />
              </Field>
              <div className="row-2">
                <Field label="Teléfono" error={errors.telefono?.message}>
                  <input className="input" {...register('telefono')} placeholder="2222-3333" />
                </Field>
                <Field label="Correo institucional" error={errors.email?.message}>
                  <input type="email" className="input" {...register('email')} placeholder="contacto@empresa.gt" />
                </Field>
              </div>
              <div className="help" style={{ marginTop: 6, fontSize: 11 }}>
                Departamento / Municipio / Zona se documentarán en una iteración futura.
              </div>
            </div>

            {/* ─── Sección 5: Datos fiscales (colapsable) ───────── */}
            <div style={sectionStyle}>
              <button
                type="button"
                onClick={() => setFiscalOpen((o) => !o)}
                style={{
                  ...sectionHeaderStyle,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  width: '100%', textAlign: 'left',
                }}
                aria-expanded={fiscalOpen}
              >
                {fiscalOpen
                  ? <ChevronDown size={12} strokeWidth={1.5} />
                  : <ChevronRight size={12} strokeWidth={1.5} />}
                Datos fiscales (opcional)
              </button>
              {fiscalOpen && (
                <div style={{ marginTop: 12 }}>
                  <div className="row-3">
                    <Field label="Régimen tributario" error={errors.regimen_tributario?.message}>
                      <select className="select" {...register('regimen_tributario')}>
                        <option value="">— Sin especificar —</option>
                        {REGIMENES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </Field>
                    <Field label="Actividad económica" error={errors.actividad_economica?.message}>
                      <input className="input" {...register('actividad_economica')} placeholder="Construcción" />
                    </Field>
                    <Field label="Inicio de actividades" error={errors.fecha_inicio_actividades?.message}>
                      <input type="date" className="input" {...register('fecha_inicio_actividades')} />
                    </Field>
                  </div>
                </div>
              )}
            </div>

            {/* ─── Sección 6: Autorizaciones (solo en creación) ─── */}
            {!isEdit && (
              <div style={sectionStyle}>
                <h3 style={sectionHeaderStyle}>Autorizaciones</h3>
                <label
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                    marginTop: 12, padding: '12px 14px',
                    border: '0.5px solid var(--border-light)',
                    borderRadius: 6,
                    background: authConsent ? 'var(--success-bg)' : 'var(--bg-subtle)',
                    cursor: 'pointer',
                    fontSize: 12.5,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={authConsent}
                    onChange={(e) => setAuthConsent(e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span>
                    Autorizo el tratamiento de los datos de la sociedad conforme a la legislación
                    aplicable.{' '}
                    <strong style={{ color: 'var(--danger)' }}>*</strong>
                  </span>
                </label>
                {!authConsent && (
                  <div className="help" style={{ marginTop: 6 }}>
                    La autorización es obligatoria para poder guardar el cliente.
                  </div>
                )}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button
              type="button"
              className="btn"
              onClick={() => nav(isEdit
                ? `/instituciones/${inst.slug}/clientes/juridicos/${id}`
                : `/instituciones/${inst.slug}/clientes/juridicos`)}
              disabled={isSubmitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="btn btn-gold"
              disabled={isSubmitting || !authConsent}
            >
              {isSubmitting ? <span className="spinner" /> : (isEdit ? 'Guardar cambios' : 'Guardar cliente')}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
