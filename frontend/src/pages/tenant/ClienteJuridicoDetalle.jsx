import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Pencil, FileText, FolderOpen, Clock } from 'lucide-react';

import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import { getClienteJuridico } from '../../api/clientesJuridicos';
import { fetchContratos } from '../../api/contratos';

// ─── Helpers de formato ──────────────────────────────────────
const MESES_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

function formatDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return iso || '—';
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${parseInt(d, 10)} de ${MESES_ES[parseInt(m, 10) - 1]} de ${y}`;
}

function formatQ(v) {
  if (v === null || v === undefined || v === '') return '—';
  const n = parseFloat(String(v).replace(/[^\d.\-]/g, ''));
  if (!Number.isFinite(n)) return String(v);
  return 'Q' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function emp(v) { return v === null || v === undefined || v === '' ? '—' : v; }

// ─── Pequeño componente: par label/valor en grid 2 cols ──────
function Row({ label, value, mono }) {
  return (
    <>
      <div style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 9.5, fontWeight: 500, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'var(--text-tertiary)',
        paddingTop: 4,
      }}>{label}</div>
      <div style={{
        fontSize: 13,
        color: 'var(--text-primary)',
        fontFamily: mono ? "'DM Mono', monospace" : "'DM Sans', sans-serif",
        wordBreak: 'break-word',
      }}>{value}</div>
    </>
  );
}

function gridStyle() {
  return {
    display: 'grid',
    gridTemplateColumns: '160px 1fr',
    columnGap: 18,
    rowGap: 12,
    alignItems: 'baseline',
  };
}

// ─── Tabs ───────────────────────────────────────────────────
const TABS = [
  { key: 'identificacion',  label: 'Identificación' },
  { key: 'constitucion',    label: 'Constitución' },
  { key: 'representacion',  label: 'Representación' },
  { key: 'domicilio',       label: 'Domicilio' },
  { key: 'fiscal',          label: 'Fiscal' },
  { key: 'contratos',       label: 'Contratos' }, // count se calcula
  { key: 'documentos',      label: 'Documentos' },
  { key: 'historial',       label: 'Historial', disabled: true, tooltip: 'Próximamente' },
];

export default function ClienteJuridicoDetalle() {
  const { inst } = useOutletContext() || {};
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState('identificacion');
  const [contratos, setContratos] = useState([]);

  useEffect(() => {
    if (!id || !inst) return;
    setLoading(true); setErr(null);
    Promise.all([
      getClienteJuridico(id),
      fetchContratos({ institucion: inst.slug }).catch(() => []),
    ])
      .then(([c, ct]) => { setData(c); setContratos(ct); })
      .catch((e) => setErr(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [id, inst?.id, inst?.slug]);

  // Contratos asociados — hoy sin link directo a cliente_id. Heurística mínima.
  // Cuenta 0 si no hay match; futuro: foreign key contratos.cliente_id.
  const contratosCount = useMemo(() => 0, [contratos]);

  if (!inst || loading) {
    return (<><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>);
  }
  if (err) {
    return (<><Topbar title="Cliente jurídico" /><div className="app-content"><div className="alert alert-danger">{err}</div></div></>);
  }
  if (!data) return null;

  return (
    <>
      <Topbar
        title={data.nombre}
        crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Clientes', 'Jurídicos', data.nombre)} />}
        actions={
          <button
            className="btn btn-gold"
            onClick={() => nav(`/instituciones/${inst.slug}/clientes/juridicos/${id}/editar`)}
          >
            <Pencil size={13} strokeWidth={1.75} />
            <span style={{ marginLeft: 6 }}>Editar</span>
          </button>
        }
      />
      <div className="app-content">

        {/* ─── Tarjeta resumen ─────────────────────────────── */}
        <div className="card" style={{ marginBottom: 16, padding: '22px 26px' }}>
          {/* Header: razón social + badge JUR */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <h2 style={{
                fontFamily: "'Libre Baskerville', Georgia, serif",
                fontWeight: 400, fontSize: 20, lineHeight: 1.2,
                margin: 0, color: 'var(--text-primary)',
              }}>
                {data.nombre}
                <span style={{
                  marginLeft: 10,
                  display: 'inline-block',
                  padding: '2px 8px', borderRadius: 3,
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 9, fontWeight: 500, letterSpacing: 0.1,
                  background: 'var(--gold-pale)',
                  color: 'var(--gold)',
                  border: '0.5px solid var(--gold-border)',
                  verticalAlign: 'middle',
                }}>JUR</span>
              </h2>
              <div className="muted" style={{ marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                {[data.nombre_comercial, data.nit, data.tipo_sociedad].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>

          {/* 3 datos clave en grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            gap: 18, marginTop: 18,
          }}>
            <KeyValueStat label="Constituida" value={formatDate(data.escritura_fecha)} />
            <KeyValueStat label="Escritura" value={emp(data.escritura_numero)} />
            <KeyValueStat label="Registro Mercantil" value={[data.registro_mercantil_numero, data.registro_mercantil_folio && `folio ${data.registro_mercantil_folio}`, data.registro_mercantil_libro && `libro ${data.registro_mercantil_libro}`].filter(Boolean).join(' · ')} />
          </div>

          {/* Línea separadora */}
          <hr style={{ border: 'none', borderTop: '0.5px solid var(--border-light)', margin: '20px 0 16px' }} />

          {/* Bloque del representante */}
          <RepresentanteBlock data={data} />
        </div>

        {/* ─── Tabs internos ────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 0,
          borderBottom: '0.5px solid var(--border-light)',
          marginBottom: 18,
          flexWrap: 'wrap',
        }}>
          {TABS.map((t) => {
            const isActive = tab === t.key;
            const count = t.key === 'contratos' ? ` (${contratosCount})` : '';
            return (
              <button
                key={t.key}
                type="button"
                disabled={t.disabled}
                title={t.tooltip}
                onClick={() => !t.disabled && setTab(t.key)}
                style={{
                  padding: '10px 16px',
                  marginBottom: -0.5,
                  background: 'transparent',
                  border: 'none',
                  borderBottom: isActive ? '1.5px solid var(--gold)' : '1.5px solid transparent',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  fontWeight: isActive ? 500 : 400,
                  color: t.disabled ? 'var(--text-disabled)' : (isActive ? 'var(--text-primary)' : 'var(--text-secondary)'),
                  cursor: t.disabled ? 'not-allowed' : 'pointer',
                }}
              >
                {t.label}{count}
              </button>
            );
          })}
        </div>

        {/* ─── Contenido del tab activo ──────────────────────── */}
        <div className="card" style={{ padding: '22px 26px' }}>
          {tab === 'identificacion' && (
            <div style={gridStyle()}>
              <Row label="Razón social" value={emp(data.nombre)} />
              <Row label="Nombre comercial" value={emp(data.nombre_comercial)} />
              <Row label="Tipo de sociedad" value={emp(data.tipo_sociedad)} />
              {data.tipo_sociedad === 'Otra' && (
                <Row label="Especificación" value={emp(data.tipo_sociedad_otra)} />
              )}
              <Row label="NIT" value={emp(data.nit)} mono />
              <Row label="Objeto social" value={emp(data.objeto_social)} />
            </div>
          )}

          {tab === 'constitucion' && (
            <div style={gridStyle()}>
              <Row label="Escritura — número" value={emp(data.escritura_numero)} />
              <Row label="Escritura — fecha" value={formatDate(data.escritura_fecha)} />
              <Row label="Escritura — notario" value={emp(data.escritura_notario)} />
              <Row label="R. Mercantil — número" value={emp(data.registro_mercantil_numero)} />
              <Row label="R. Mercantil — folio" value={emp(data.registro_mercantil_folio)} />
              <Row label="R. Mercantil — libro" value={emp(data.registro_mercantil_libro)} />
              <Row label="R. Mercantil — fecha" value={formatDate(data.registro_mercantil_fecha)} />
              <Row label="Patente Sociedad" value={`${emp(data.patente_sociedad_numero)} · ${formatDate(data.patente_sociedad_fecha)}`} />
              <Row label="Patente Empresa" value={`${emp(data.patente_empresa_numero)} · ${formatDate(data.patente_empresa_fecha)}`} />
              <Row label="Capital autorizado" value={formatQ(data.capital_autorizado)} mono />
              <Row label="Capital suscrito" value={formatQ(data.capital_suscrito)} mono />
              <Row label="Capital pagado" value={formatQ(data.capital_pagado)} mono />
            </div>
          )}

          {tab === 'representacion' && (
            <div style={gridStyle()}>
              <Row label="Nombre" value={emp(data.rep_nombre_completo)} />
              <Row label="DPI" value={emp(data.rep_dpi)} mono />
              <Row label="Profesión" value={emp(data.rep_profesion)} />
              <Row label="Cargo" value={emp(data.rep_cargo)} />
              <Row label="Acta" value={`${emp(data.rep_acta_numero)} · ${formatDate(data.rep_acta_fecha)} · ${emp(data.rep_acta_notario)}`} />
              <Row
                label="Inscripción"
                value={[data.rep_inscripcion_numero, data.rep_inscripcion_folio && `folio ${data.rep_inscripcion_folio}`, data.rep_inscripcion_libro && `libro ${data.rep_inscripcion_libro}`].filter(Boolean).join(' · ') || '—'}
              />
              <Row label="Vigencia" value={`${formatDate(data.rep_vigencia_inicio)} → ${formatDate(data.rep_vigencia_vencimiento)}`} />
              <Row
                label="Estado"
                value={data.rep_vigente
                  ? <VigenteBadge vigente />
                  : <VigenteBadge />}
              />
            </div>
          )}

          {tab === 'domicilio' && (
            <div style={gridStyle()}>
              <Row label="Domicilio fiscal" value={emp(data.domicilio)} />
              <Row label="Teléfono" value={emp(data.telefono)} mono />
              <Row label="Correo institucional" value={emp(data.email)} />
            </div>
          )}

          {tab === 'fiscal' && (
            <div style={gridStyle()}>
              <Row label="Régimen tributario" value={emp(data.regimen_tributario)} />
              <Row label="Actividad económica" value={emp(data.actividad_economica)} />
              <Row label="Inicio de actividades" value={formatDate(data.fecha_inicio_actividades)} />
            </div>
          )}

          {tab === 'contratos' && (
            <div className="empty">
              <FileText size={18} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
              <div>Aún no hay contratos vinculados a este cliente jurídico.</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                El módulo de contratos vinculados a clientes jurídicos llegará en una iteración futura.
              </div>
            </div>
          )}

          {tab === 'documentos' && (
            <div className="empty">
              <FolderOpen size={18} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
              <div>No hay documentos adjuntos.</div>
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                Carga de patentes, escrituras escaneadas, certificaciones — próxima fase.
              </div>
            </div>
          )}

          {tab === 'historial' && (
            <div className="empty">
              <Clock size={18} strokeWidth={1.5} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
              <div>Próximamente</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Componentes auxiliares ───────────────────────────────

function KeyValueStat({ label, value }) {
  return (
    <div>
      <div style={{
        fontFamily: "'DM Sans', sans-serif",
        fontSize: 9.5, fontWeight: 500,
        letterSpacing: '0.14em', textTransform: 'uppercase',
        color: 'var(--text-tertiary)',
      }}>{label}</div>
      <div style={{
        marginTop: 6,
        fontFamily: "'Libre Baskerville', serif",
        fontSize: 14, fontWeight: 400,
        color: 'var(--text-primary)',
      }}>{value}</div>
    </div>
  );
}

function VigenteBadge({ vigente }) {
  const styleBase = {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '3px 9px', borderRadius: 3,
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 9.5, fontWeight: 500, letterSpacing: 0.08,
    textTransform: 'uppercase',
    border: '0.5px solid',
  };
  if (vigente) {
    return (
      <span style={{
        ...styleBase,
        background: 'var(--success-bg)',
        color: 'var(--success)',
        borderColor: 'var(--success-border)',
      }}>
        <CheckCircle2 size={11} strokeWidth={1.75} />
        <span>Vigente</span>
      </span>
    );
  }
  return (
    <span style={{
      ...styleBase,
      background: 'var(--danger-bg)',
      color: 'var(--danger)',
      borderColor: 'var(--danger-border)',
    }}>
      <XCircle size={11} strokeWidth={1.75} />
      <span>Vencido</span>
    </span>
  );
}

function RepresentanteBlock({ data }) {
  const vigente = !!data.rep_vigente;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      {/* Avatar circular con check */}
      <div style={{
        width: 44, height: 44, borderRadius: '50%',
        background: vigente ? 'var(--success-bg)' : 'var(--bg-subtle)',
        border: `0.5px solid ${vigente ? 'var(--success-border)' : 'var(--border-mid)'}`,
        display: 'grid', placeItems: 'center',
        color: vigente ? 'var(--success)' : 'var(--text-tertiary)',
        flexShrink: 0,
      }}>
        {vigente
          ? <CheckCircle2 size={20} strokeWidth={1.5} />
          : <XCircle size={20} strokeWidth={1.5} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: "'DM Sans', sans-serif",
          fontSize: 13.5, fontWeight: 500,
          color: 'var(--text-primary)',
        }}>{emp(data.rep_nombre_completo)}</div>
        <div className="muted" style={{
          fontSize: 11.5, marginTop: 2,
          color: 'var(--text-secondary)',
        }}>
          {[data.rep_cargo, `vigente hasta ${formatDate(data.rep_vigencia_vencimiento)}`].filter(Boolean).join(' · ')}
        </div>
      </div>

      <VigenteBadge vigente={vigente} />
    </div>
  );
}
