// F1 C4 — Detalle de una solicitud + audit log + acciones.
//
// Pantalla 2-en-1:
//   - En estados 'en_curso' / 'revision_tenant' permite al banco revisar/editar.
//   - En estados posteriores muestra read-only + audit log.
//
// Secciones editables (cada una con botón "Editar" individual y audit_log automático):
//   1. Datos del cliente (nombre, DPI, fecha_nac, etc.)
//   2. Datos del préstamo (monto, plazo, tasa, cuota — todo manual)
//   3. Garantía (si aplica según modelo)
//
// Botón final "Marcar como listo para escritura" → /avanzar → revision_abogados.

import { useEffect, useState, Fragment } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { Pencil, Save, X as XIcon, Send, Ban, Clock, FileText, Eye } from 'lucide-react';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import Preview from '../../components/Preview';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import {
  fetchContrato, updateContrato, avanzarContrato, anularContrato,
  fetchAuditLog, reenviarLink, generarTokenCliente,
  generatePdf, openPdf,
} from '../../api/contratos';
import { fetchInstitucion } from '../../api/instituciones';
import { EstadoBadge, formatRelative } from './Solicitudes';

export default function SolicitudDetalle() {
  const { inst } = useOutletContext() || {};
  const { id } = useParams();
  const nav = useNavigate();
  const [contrato, setContrato] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accionando, setAccionando] = useState(false);
  const [generandoPdf, setGenerandoPdf] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  // Para el Preview cargamos la institución expandida (con modelos) — el motor
  // F7 backend lee de DB de todos modos, pero la UI del Preview espera este
  // contexto para mostrar la lista de fiadores del bloque de firmas.
  const [instExpandida, setInstExpandida] = useState(null);
  useEffect(() => {
    if (!inst?.slug) return;
    fetchInstitucion(inst.slug).then(setInstExpandida).catch(() => setInstExpandida(null));
  }, [inst?.slug]);

  const recargar = () => {
    return Promise.all([
      fetchContrato(id),
      fetchAuditLog(id).catch(() => []),
    ]).then(([c, a]) => {
      setContrato(c);
      setAudit(a);
    });
  };

  useEffect(() => {
    setLoading(true);
    recargar()
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const marcarListo = async () => {
    if (!confirm('¿Marcar esta solicitud como lista para escritura? Pasará al bufete.')) return;
    setAccionando(true); setError(null);
    try {
      await avanzarContrato(id);
      await recargar();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setAccionando(false);
    }
  };

  const anular = async () => {
    const motivo = prompt('Motivo de la anulación (obligatorio):');
    if (!motivo || !motivo.trim()) return;
    setAccionando(true); setError(null);
    try {
      await anularContrato(id, motivo.trim());
      await recargar();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setAccionando(false);
    }
  };

  // Sprint garantías-desacopladas CP4-A — botones de PDF unificados aquí
  // (antes vivían en /contratos/:id Contrato.jsx, hoy redirige a este detalle).
  const onGenerarPdf = async () => {
    setGenerandoPdf(true); setError(null);
    try {
      await generatePdf(id);
      await recargar();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setGenerandoPdf(false);
    }
  };

  const reenviar = async () => {
    if (!confirm('¿Generar un link nuevo para el cliente? El link anterior dejará de funcionar.')) return;
    setAccionando(true); setError(null);
    try {
      let r;
      if (contrato.estado.startsWith('abandonada') || contrato.estado === 'en_curso') {
        r = await reenviarLink(id);
      } else {
        r = await generarTokenCliente(id);
      }
      const url = `${window.location.origin}/solicitud/${r.token}`;
      navigator.clipboard.writeText(url);
      alert(`Link copiado al portapapeles:\n\n${url}`);
      await recargar();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setAccionando(false);
    }
  };

  if (loading) return <><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>;
  if (error) return <><Topbar title="Error" /><div className="app-content"><div className="alert alert-danger">{error}</div></div></>;
  if (!contrato) return null;

  const tituloRetorno = retornoSegunEstado(contrato.estado);

  return (
    <>
      <Topbar
        title={contrato.no_contrato}
        crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Solicitudes', tituloRetorno.label, contrato.no_contrato)} />}
        actions={
          <>
            {contrato.estado === 'revision_tenant' && (
              <button className="btn btn-gold" onClick={marcarListo} disabled={accionando}>
                <Send size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                Marcar como listo para escritura
              </button>
            )}
            {(contrato.estado === 'en_curso' || contrato.estado.startsWith('abandonada')) && (
              <button className="btn" onClick={reenviar} disabled={accionando}>
                <Send size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                Regenerar link cliente
              </button>
            )}
            {['en_curso', 'revision_tenant', 'abandonada_sin_inicio', 'abandonada_incompleta'].includes(contrato.estado) && (
              <button className="btn btn-danger" onClick={anular} disabled={accionando}>
                <Ban size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                Anular
              </button>
            )}
            {/* CP4-A: vista unificada — preview siempre disponible; generar/abrir
                PDF cuando el contrato pase a estados donde tenga sentido. */}
            <button className="btn" onClick={() => setShowPreview((v) => !v)}>
              <Eye size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
              {showPreview ? 'Ocultar preview' : 'Ver preview'}
            </button>
            {['revision_abogados', 'completado'].includes(contrato.estado) && (
              <>
                <button className="btn" onClick={onGenerarPdf} disabled={generandoPdf}>
                  <FileText size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                  {generandoPdf ? 'Generando…' : 'Generar PDF'}
                </button>
                {contrato.pdf_path && (
                  <button className="btn btn-primary" onClick={() => openPdf(id)}>
                    <FileText size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                    Abrir PDF
                  </button>
                )}
              </>
            )}
          </>
        }
      />
      <div className="app-content">
        <Cabecera contrato={contrato} />

        {error && <div className="alert alert-danger">{error}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 18, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SeccionEditable
              titulo="Datos del cliente"
              valor={contrato.datos_cliente}
              campos={CAMPOS_CLIENTE}
              editable={['en_curso', 'revision_tenant'].includes(contrato.estado)}
              onSave={async (nuevo) => { await updateContrato(id, { datos_cliente: nuevo }); await recargar(); }}
            />
            <SeccionEditable
              titulo="Datos del préstamo"
              hint="Ingrese los valores acordados. LexDocs no recalcula."
              valor={contrato.datos_credito}
              campos={CAMPOS_CREDITO}
              editable={['en_curso', 'revision_tenant'].includes(contrato.estado)}
              onSave={async (nuevo) => { await updateContrato(id, { datos_credito: nuevo }); await recargar(); }}
            />
            <SeccionEditable
              titulo="Garantía"
              valor={contrato.datos_garantia}
              campos={CAMPOS_GARANTIA}
              editable={['en_curso', 'revision_tenant'].includes(contrato.estado)}
              onSave={async (nuevo) => { await updateContrato(id, { datos_garantia: nuevo }); await recargar(); }}
            />
          </div>

          <AuditLog entradas={audit} />
        </div>

        {/* CP4-A — Preview del PDF compilado (cuando el usuario lo solicita).
            Reusa el componente Preview de la vista vieja /contratos/:id. */}
        {showPreview && (
          <div style={{ marginTop: 22 }}>
            <Preview contratoId={contrato.id} contrato={contrato} institucion={instExpandida} />
          </div>
        )}
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// Cabecera con estado + correlativo + meta
// ──────────────────────────────────────────────────────────────

function Cabecera({ contrato }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, padding: '12px 16px', background: '#fff', border: '0.5px solid var(--border)', borderRadius: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <code style={{ fontSize: 14, fontWeight: 500 }}>{contrato.no_contrato}</code>
        <EstadoBadge estado={contrato.estado} />
        <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{contrato.modelo_nombre}</span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-dim)', display: 'flex', gap: 14 }}>
        <span><Clock size={11} style={{ verticalAlign: 'middle' }} /> Creado {formatRelative(contrato.created_at)}</span>
        <span>· Actualizado {formatRelative(contrato.updated_at)}</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Sección editable
// ──────────────────────────────────────────────────────────────

function SeccionEditable({ titulo, hint, valor, campos, editable, onSave }) {
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState(valor || {});
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState(null);

  const empezarEdit = () => {
    setDraft(valor || {});
    setEditando(true);
    setErr(null);
  };
  const cancelarEdit = () => { setEditando(false); setErr(null); };
  const guardar = async () => {
    setGuardando(true); setErr(null);
    try {
      await onSave(draft);
      setEditando(false);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 6, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{titulo}</h3>
          {hint && <div style={{ fontSize: 11.5, color: 'var(--text-dim)', marginTop: 3 }}>{hint}</div>}
        </div>
        {editable && !editando && (
          <button className="btn btn-ghost" onClick={empezarEdit} style={{ fontSize: 12 }}>
            <Pencil size={12} style={{ marginRight: 5, verticalAlign: 'text-bottom' }} />
            Editar
          </button>
        )}
      </div>

      {editando ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
            {campos.map((c) => (
              <div className="field" key={c.key}>
                <label>{c.label}</label>
                <input
                  className="input"
                  value={draft[c.key] || ''}
                  onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })}
                  inputMode={c.numeric ? 'decimal' : 'text'}
                  type={c.type || 'text'}
                />
              </div>
            ))}
          </div>
          {err && <div className="alert alert-danger" style={{ marginTop: 8 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button className="btn" onClick={cancelarEdit} disabled={guardando}>
              <XIcon size={12} style={{ marginRight: 5, verticalAlign: 'text-bottom' }} />
              Cancelar
            </button>
            <button className="btn btn-gold" onClick={guardar} disabled={guardando}>
              <Save size={12} style={{ marginRight: 5, verticalAlign: 'text-bottom' }} />
              {guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </>
      ) : (
        <ListaValores valor={valor} campos={campos} />
      )}
    </section>
  );
}

function ListaValores({ valor, campos }) {
  if (!valor || Object.keys(valor).length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Aún no hay datos en esta sección.</div>;
  }
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '6px 14px', margin: 0, fontSize: 13 }}>
      {campos.map((c) => (
        <Fragment key={c.key}>
          <dt style={{ color: 'var(--text-dim)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.04em', alignSelf: 'baseline' }}>{c.label}</dt>
          <dd style={{ margin: 0, wordBreak: 'break-word' }}>{valor[c.key] || <span className="muted">—</span>}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

// ──────────────────────────────────────────────────────────────
// Audit log
// ──────────────────────────────────────────────────────────────

const ETIQUETAS_ACCION = {
  generar_token_cliente: 'Se generó link para el cliente',
  cliente_confirmo_solicitud: 'Cliente envió la solicitud',
  CONTRATO_TRANSICION: 'Cambio de estado',
  CONTRATO_ANULADO: 'Contrato anulado',
  CONTRATO_DATOS_MODIFICADOS: 'Datos modificados',
  CONTRATO_DPI_FISICO_RECIBIDO: 'DPI físico recibido',
  ABANDONO_AUTOMATICO: 'Abandono automático',
};

function AuditLog({ entradas }) {
  if (!entradas || entradas.length === 0) {
    return (
      <aside style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 6, padding: 18 }}>
        <h3 style={{ fontSize: 14, fontWeight: 500, marginTop: 0, marginBottom: 10 }}>Historial</h3>
        <div style={{ fontSize: 13, color: 'var(--text-dim)' }}>Aún no hay actividad registrada.</div>
      </aside>
    );
  }
  return (
    <aside style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 6, padding: 18, position: 'sticky', top: 18 }}>
      <h3 style={{ fontSize: 14, fontWeight: 500, marginTop: 0, marginBottom: 12 }}>Historial</h3>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 600, overflow: 'auto' }}>
        {entradas.slice().reverse().map((e) => (
          <li key={e.id} style={{ borderLeft: '0.5px solid var(--border)', paddingLeft: 12, position: 'relative' }}>
            <div style={{ position: 'absolute', left: -3, top: 4, width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)' }} />
            <div style={{ fontSize: 12, fontWeight: 500 }}>
              {ETIQUETAS_ACCION[e.accion] || e.accion}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              {e.user_email || 'Sistema'} · {new Date(e.timestamp).toLocaleString('es-GT')}
            </div>
            {e.detalles && (e.detalles.de || e.detalles.a) && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
                {e.detalles.de && e.detalles.a ? `${e.detalles.de} → ${e.detalles.a}` : ''}
              </div>
            )}
            {e.detalles?.motivo && (
              <div style={{ fontSize: 11, marginTop: 3, padding: '4px 8px', background: '#faf9f4', borderRadius: 3 }}>
                Motivo: {e.detalles.motivo}
              </div>
            )}
            {e.detalles?.secciones && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
                Secciones: {e.detalles.secciones.map(seccionLabel).join(', ')}
              </div>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}

function seccionLabel(s) {
  return ({
    datos_cliente: 'cliente',
    datos_credito: 'préstamo',
    datos_garantia: 'garantía',
    datos_firmas: 'firmas',
  })[s] || s;
}

// ──────────────────────────────────────────────────────────────
// Definición de campos por sección
// ──────────────────────────────────────────────────────────────

const CAMPOS_CLIENTE = [
  { key: 'nombre', label: 'Nombre completo' },
  { key: 'dpi', label: 'DPI' },
  { key: 'fecha_nac', label: 'Fecha nacimiento', type: 'date' },
  { key: 'genero', label: 'Género' },
  { key: 'estado_civil', label: 'Estado civil' },
  { key: 'profesion', label: 'Profesión' },
  { key: 'nit', label: 'NIT' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'email', label: 'Correo' },
  { key: 'domicilio', label: 'Domicilio' },
  { key: 'ingresos', label: 'Ingresos mensuales' },
  { key: 'empleo', label: 'Empleo' },
];

const CAMPOS_CREDITO = [
  { key: 'monto', label: 'Monto', numeric: true },
  { key: 'moneda', label: 'Moneda' },
  { key: 'plazo_meses', label: 'Plazo (meses)', numeric: true },
  { key: 'tasa_anual', label: 'Tasa anual (%)', numeric: true },
  { key: 'cuota_mensual', label: 'Cuota mensual', numeric: true },
  { key: 'proposito', label: 'Propósito' },
];

const CAMPOS_GARANTIA = [
  { key: 'tipo', label: 'Tipo' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'finca', label: 'Finca' },
  { key: 'folio', label: 'Folio' },
  { key: 'libro', label: 'Libro' },
  { key: 'municipio', label: 'Municipio' },
  { key: 'placa', label: 'Placa' },
  { key: 'serie', label: 'Serie / VIN' },
  { key: 'marca', label: 'Marca' },
  { key: 'modelo', label: 'Modelo' },
];

function retornoSegunEstado(estado) {
  const map = {
    en_curso: { label: 'En curso', path: 'en-curso' },
    revision_tenant: { label: 'En revisión', path: 'en-revision' },
    revision_abogados: { label: 'Con bufete', path: 'con-bufete' },
    completado: { label: 'Completadas', path: 'completadas' },
  };
  return map[estado] || { label: 'Solicitudes', path: '' };
}
