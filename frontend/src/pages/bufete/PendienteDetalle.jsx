// F1 C5 — Detalle del expediente desde el bufete + wizard B1-B6.
// Ruta: /pendientes/:id
//
// Layout 2 columnas:
//   IZQUIERDA  → info read-only + DPI físico + audit log
//   DERECHA    → wizard del bufete (6 pasos)

import { useEffect, useMemo, useState, Fragment } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Pencil, X as XIcon, Save, ChevronRight, ChevronLeft, FileText, Printer } from 'lucide-react';
import { fetchContrato, updateContrato, fetchAuditLog, avanzarContrato, generatePdf, openPdf } from '../../api/contratos';
import { marcarDpiFisicoRecibido, fetchNotariosPorSlug } from '../../api/pendientes';
import { fetchModelos } from '../../api/instituciones';
import { BadgeDpiFisico } from './Pendientes';
// Sprint garantías-desacopladas CP4-B — wizard del bufete usa los mismos
// componentes nuevos que el banco. El backend infiere actor='bufete' del JWT
// (admin sin institucion_id).
import ComparecientesEditor from '../../components/ComparecientesEditor';
import GarantiasEditor from '../../components/GarantiasEditor';
import { listComparecientesDelContrato } from '../../api/garantias';
import { listClientes } from '../../api/clientes';

const WIZARD_STEPS = [
  { id: 1, label: 'Modelo' },
  { id: 2, label: 'Cliente' },
  { id: 3, label: 'Condiciones' },
  { id: 4, label: 'Garantías' },
  { id: 5, label: 'Notario' },
  { id: 6, label: 'Generar PDF' },
];

export default function PendienteDetalle() {
  const { id } = useParams();
  const nav = useNavigate();
  const [contrato, setContrato] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paso, setPaso] = useState(1);

  const recargar = () => Promise.all([
    fetchContrato(id),
    fetchAuditLog(id).catch(() => []),
  ]).then(([c, a]) => { setContrato(c); setAudit(a); });

  useEffect(() => {
    setLoading(true);
    recargar()
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <><Header onBack={() => nav('/pendientes')} /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>;
  if (error) return <><Header onBack={() => nav('/pendientes')} /><div className="app-content"><div className="alert alert-danger">{error}</div></div></>;
  if (!contrato) return null;

  return (
    <>
      <Header onBack={() => nav('/pendientes')} contrato={contrato} />
      <div className="app-content">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
          <ColumnaInfo contrato={contrato} audit={audit} onCambio={recargar} />
          <ColumnaWizard contrato={contrato} paso={paso} setPaso={setPaso} onCambio={recargar} />
        </div>
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// Header
// ──────────────────────────────────────────────────────────────

function Header({ onBack, contrato }) {
  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button className="btn btn-ghost" onClick={onBack}>
          <ChevronLeft size={14} style={{ verticalAlign: 'text-bottom' }} /> Pendientes
        </button>
        {contrato && (
          <>
            <code style={{ fontSize: 14, fontWeight: 500 }}>{contrato.no_contrato}</code>
            <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>· {contrato.institucion_nombre}</span>
            <span style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>· {contrato.modelo_nombre}</span>
          </>
        )}
      </div>
    </header>
  );
}

// ──────────────────────────────────────────────────────────────
// Columna izquierda — información + DPI físico + audit
// ──────────────────────────────────────────────────────────────

function ColumnaInfo({ contrato, audit, onCambio }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <DpiFisicoCard contrato={contrato} onCambio={onCambio} />
      <SeccionRO titulo="Datos del cliente" valor={contrato.datos_cliente} campos={CAMPOS_CLIENTE} />
      <SeccionRO titulo="Condiciones del crédito" valor={contrato.datos_credito} campos={CAMPOS_CREDITO} />
      <SeccionRO titulo="Garantía" valor={contrato.datos_garantia} campos={CAMPOS_GARANTIA} />
      <FiadoresRO fiadores={contrato.fiadores || []} />
      <AuditLog entradas={audit} />
    </div>
  );
}

function DpiFisicoCard({ contrato, onCambio }) {
  const [marcando, setMarcando] = useState(false);
  const [err, setErr] = useState(null);

  const marcar = async () => {
    if (!confirm('¿Confirma haber recibido el DPI físico del cliente?')) return;
    setMarcando(true); setErr(null);
    try {
      await marcarDpiFisicoRecibido(contrato.id);
      await onCambio();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setMarcando(false);
    }
  };

  return (
    <section style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 6, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>DPI físico</div>
          <div style={{ marginTop: 6 }}>
            <BadgeDpiFisico recibido={contrato.dpi_fisico_recibido} />
          </div>
          {contrato.dpi_fisico_recibido_at && (
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 6 }}>
              Recibido el {new Date(contrato.dpi_fisico_recibido_at).toLocaleString('es-GT')}
            </div>
          )}
        </div>
        {!contrato.dpi_fisico_recibido && (
          <button className="btn btn-gold" onClick={marcar} disabled={marcando}>
            <Check size={14} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
            {marcando ? 'Registrando…' : 'Marcar recibido por mí'}
          </button>
        )}
      </div>
      {err && <div className="alert alert-danger" style={{ marginTop: 10 }}>{err}</div>}
    </section>
  );
}

function SeccionRO({ titulo, valor, campos }) {
  return (
    <section style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 6, padding: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 500, marginTop: 0, marginBottom: 10 }}>{titulo}</h3>
      <ListaValores valor={valor} campos={campos} />
    </section>
  );
}

function ListaValores({ valor, campos }) {
  if (!valor || Object.keys(valor).length === 0) {
    return <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>Sin datos.</div>;
  }
  const hayValor = (k) => valor[k] != null && String(valor[k]).trim() !== '';
  const campos_con_valor = campos.filter((c) => hayValor(c.key));
  if (campos_con_valor.length === 0) {
    return <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>Sin datos.</div>;
  }
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: '4px 12px', margin: 0, fontSize: 12.5 }}>
      {campos_con_valor.map((c) => (
        <Fragment key={c.key}>
          <dt style={{ color: 'var(--text-dim)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em', alignSelf: 'baseline', paddingTop: 2 }}>{c.label}</dt>
          <dd style={{ margin: 0, wordBreak: 'break-word' }}>{valor[c.key]}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

function FiadoresRO({ fiadores }) {
  if (!fiadores || fiadores.length === 0) return null;
  return (
    <section style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 6, padding: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 500, marginTop: 0, marginBottom: 10 }}>Fiadores ({fiadores.length})</h3>
      {fiadores.map((f, i) => (
        <div key={f.id || i} style={{ padding: '10px 0', borderBottom: i < fiadores.length - 1 ? '0.5px solid var(--border)' : 'none' }}>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{f.nombre}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
            DPI {f.dpi || '—'} · {f.tipo_garantia || 'personal'}
          </div>
        </div>
      ))}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────
// Audit log
// ──────────────────────────────────────────────────────────────

const ETIQUETAS_ACCION = {
  generar_token_cliente: 'Banco generó link para el cliente',
  cliente_confirmo_solicitud: 'Cliente envió la solicitud',
  CONTRATO_TRANSICION: 'Cambio de estado',
  CONTRATO_ANULADO: 'Contrato anulado',
  CONTRATO_DATOS_MODIFICADOS: 'Datos modificados',
  DPI_FISICO_RECIBIDO: 'DPI físico recibido',
  TOKEN_GENERADO: 'Nuevo link generado',
  ABANDONO_AUTOMATICO: 'Abandono automático',
};

function AuditLog({ entradas }) {
  if (!entradas || entradas.length === 0) {
    return (
      <section style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 6, padding: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 500, marginTop: 0, marginBottom: 10 }}>Historial</h3>
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>Sin entradas.</div>
      </section>
    );
  }
  return (
    <section style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 6, padding: 16 }}>
      <h3 style={{ fontSize: 13, fontWeight: 500, marginTop: 0, marginBottom: 12 }}>Historial ({entradas.length})</h3>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 400, overflow: 'auto' }}>
        {entradas.slice().reverse().map((e) => (
          <li key={e.id} style={{ borderLeft: '0.5px solid var(--border)', paddingLeft: 12, position: 'relative' }}>
            <div style={{ position: 'absolute', left: -3, top: 4, width: 5, height: 5, borderRadius: '50%', background: 'var(--gold)' }} />
            <div style={{ fontSize: 12.5, fontWeight: 500 }}>{ETIQUETAS_ACCION[e.accion] || e.accion}</div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
              {e.user_email || 'Sistema'} · {new Date(e.timestamp).toLocaleString('es-GT')}
            </div>
            {e.detalles?.de && e.detalles?.a && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>{e.detalles.de} → {e.detalles.a}</div>
            )}
            {e.detalles?.motivo && (
              <div style={{ fontSize: 11, marginTop: 3, padding: '3px 8px', background: '#faf9f4', borderRadius: 3, display: 'inline-block' }}>Motivo: {e.detalles.motivo}</div>
            )}
            {e.detalles?.secciones && (
              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>Secciones: {e.detalles.secciones.map(seccionLabel).join(', ')}</div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function seccionLabel(s) {
  return ({ datos_cliente: 'cliente', datos_credito: 'crédito', datos_garantia: 'garantía', datos_firmas: 'firmas' })[s] || s;
}

// ──────────────────────────────────────────────────────────────
// Columna derecha — wizard del bufete (B1..B6)
// ──────────────────────────────────────────────────────────────

function ColumnaWizard({ contrato, paso, setPaso, onCambio }) {
  return (
    <div style={{ position: 'sticky', top: 18 }}>
      <section style={{ background: '#fff', border: '0.5px solid var(--border)', borderRadius: 6, padding: 18 }}>
        <h2 style={{ fontSize: 14, fontWeight: 500, margin: '0 0 14px' }}>Revisión del bufete</h2>
        <WizardNav paso={paso} setPaso={setPaso} />
        <div style={{ marginTop: 16 }}>
          {paso === 1 && <B1Modelo contrato={contrato} onSiguiente={() => setPaso(2)} onCambio={onCambio} />}
          {paso === 2 && <B2Cliente contrato={contrato} onSiguiente={() => setPaso(3)} onAtras={() => setPaso(1)} onCambio={onCambio} />}
          {paso === 3 && <B3Condiciones contrato={contrato} onSiguiente={() => setPaso(4)} onAtras={() => setPaso(2)} onCambio={onCambio} />}
          {paso === 4 && <B4Garantia contrato={contrato} onSiguiente={() => setPaso(5)} onAtras={() => setPaso(3)} onCambio={onCambio} />}
          {paso === 5 && <B5Notario contrato={contrato} onSiguiente={() => setPaso(6)} onAtras={() => setPaso(4)} onCambio={onCambio} />}
          {paso === 6 && <B6Generar contrato={contrato} onAtras={() => setPaso(5)} onCambio={onCambio} />}
        </div>
      </section>
    </div>
  );
}

function WizardNav({ paso, setPaso }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {WIZARD_STEPS.map((s) => {
        const activo = s.id === paso;
        const completo = s.id < paso;
        return (
          <button
            key={s.id}
            onClick={() => setPaso(s.id)}
            style={{
              flex: 1,
              minWidth: 80,
              padding: '8px 10px',
              border: '0.5px solid',
              borderColor: activo ? 'var(--gold)' : 'var(--border)',
              background: activo ? 'var(--gold)' : completo ? '#faf9f4' : '#fff',
              color: activo ? '#fff' : completo ? 'var(--gold)' : 'var(--text)',
              borderRadius: 4,
              fontFamily: 'inherit',
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <div style={{ fontSize: 10, opacity: 0.75 }}>Paso B{s.id}</div>
            <div>{s.label}</div>
          </button>
        );
      })}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Pasos del wizard del bufete
// ──────────────────────────────────────────────────────────────

function B1Modelo({ contrato, onSiguiente, onCambio }) {
  const [modelos, setModelos] = useState([]);
  const [modeloId, setModeloId] = useState(contrato.modelo_id);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetchModelos(contrato.institucion_slug).then(setModelos).catch(() => setModelos([]));
  }, [contrato.institucion_slug]);

  const guardar = async () => {
    if (modeloId === contrato.modelo_id) { onSiguiente(); return; }
    setGuardando(true); setErr(null);
    try {
      // PUT no permite cambiar modelo_id directamente. Es decisión de diseño:
      // si el abogado quiere cambiar el modelo, lo hace anotando en datos_firmas y guardando
      // el modelo_id solicitado para que un admin lo cambie. Por simplicidad ahora dejamos
      // un campo en datos_firmas y mostramos warning. (En F8 esto se vuelve una acción real.)
      await updateContrato(contrato.id, { datos_firmas: { ...(contrato.datos_firmas || {}), modelo_solicitado: modeloId, motivo: 'Cambio de modelo solicitado por el bufete' } });
      await onCambio();
      onSiguiente();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <Hint>Verifique que el modelo asignado por el banco sea el correcto para este caso. Si necesita cambiarlo, seleccione otro y deje constancia.</Hint>
      <div className="field">
        <label>Modelo asignado</label>
        <select className="select" value={modeloId} onChange={(e) => setModeloId(Number(e.target.value))}>
          {modelos.map((m) => (
            <option key={m.id} value={m.id}>{m.nombre} ({m.tipo_garantia})</option>
          ))}
        </select>
      </div>
      {modeloId !== contrato.modelo_id && (
        <div className="alert alert-warn" style={{ marginTop: 10, fontSize: 12.5 }}>
          El cambio quedará registrado como observación. Un administrador deberá aplicarlo después.
        </div>
      )}
      {err && <div className="alert alert-danger" style={{ marginTop: 10 }}>{err}</div>}
      <BotonesPaso onSiguiente={guardar} cargando={guardando} primero />
    </>
  );
}

function B2Cliente({ contrato, onSiguiente, onAtras, onCambio }) {
  return <SeccionEditableWizard titulo="Verifique los datos del cliente" hint="Compare contra el DPI físico recibido. Edite cualquier dato que difiera." valor={contrato.datos_cliente} campos={CAMPOS_CLIENTE} onSave={async (v) => { await updateContrato(contrato.id, { datos_cliente: v }); await onCambio(); }} onSiguiente={onSiguiente} onAtras={onAtras} />;
}

function B3Condiciones({ contrato, onSiguiente, onAtras, onCambio }) {
  return <SeccionEditableWizard titulo="Verifique las condiciones del crédito" hint="Confirme monto, plazo, tasa y cuota. Si modifica algo, agregue una justificación que quede en el audit log." valor={contrato.datos_credito} campos={CAMPOS_CREDITO} conJustificacion onSave={async (v, motivo) => { await updateContrato(contrato.id, { datos_credito: v, motivo }); await onCambio(); }} onSiguiente={onSiguiente} onAtras={onAtras} />;
}

function B4Garantia({ contrato, onSiguiente, onAtras, onCambio }) {
  // Sprint garantías-desacopladas CP4-B — reemplaza el form plano por los
  // componentes nuevos. El bufete revisa lo que el banco/cliente ya ingresó
  // y puede ajustar antes de marcar el contrato como listo para escritura.
  const [comparecientes, setComparecientes] = useState([]);
  const [clienteId, setClienteId] = useState(null);

  const recargarComps = () => listComparecientesDelContrato(contrato.id).then(setComparecientes).catch(() => setComparecientes([]));
  useEffect(() => { recargarComps(); }, [contrato.id]);
  useEffect(() => {
    if (!contrato.datos_cliente?.dpi || !contrato.institucion_id) return;
    listClientes({ dpi: contrato.datos_cliente.dpi, institucion_id: contrato.institucion_id })
      .then((rows) => {
        const c = (rows || []).find((x) => x.dpi === contrato.datos_cliente.dpi) || (rows || [])[0];
        if (c) setClienteId(c.id);
      })
      .catch(() => setClienteId(null));
  }, [contrato.datos_cliente?.dpi, contrato.institucion_id]);

  const readOnly = ['completado', 'firmado'].includes(contrato.estado);

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Verifique las garantías y comparecientes</h3>
      <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
        Revise lo que el banco y el cliente ingresaron. Puede agregar, editar o quitar.
        Cualquier cambio queda en el audit log con su firma como bufete.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 14 }}>
        <ComparecientesEditor
          contratoId={contrato.id}
          institucionId={contrato.institucion_id}
          mode="auth"
          readOnly={readOnly}
          onChange={() => { recargarComps(); onCambio?.(); }}
        />
        <GarantiasEditor
          contratoId={contrato.id}
          institucionId={contrato.institucion_id}
          comparecientes={comparecientes}
          datosCliente={{ ...contrato.datos_cliente, id: clienteId }}
          mode="auth"
          readOnly={readOnly}
          onChange={onCambio}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
        <button className="btn" onClick={onAtras}>← Atrás</button>
        <button className="btn btn-gold" onClick={onSiguiente}>Siguiente →</button>
      </div>
    </div>
  );
}

function B5Notario({ contrato, onSiguiente, onAtras, onCambio }) {
  const [notarios, setNotarios] = useState([]);
  const [notarioId, setNotarioId] = useState(contrato.datos_firmas?.notario_id || '');
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetchNotariosPorSlug(contrato.institucion_slug, true)
      .then(setNotarios)
      .catch(() => setNotarios([]));
  }, [contrato.institucion_slug]);

  const seleccionado = notarios.find((n) => n.id === Number(notarioId));

  const guardar = async () => {
    if (!notarioId) { setErr('Seleccione un notario'); return; }
    setGuardando(true); setErr(null);
    try {
      const datos = {
        ...(contrato.datos_firmas || {}),
        notario_id: Number(notarioId),
        notario_nombre: seleccionado?.nombre,
        notario_colegiado: seleccionado?.colegiado,
      };
      await updateContrato(contrato.id, { datos_firmas: datos });
      await onCambio();
      onSiguiente();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <Hint>Asigne el notario autorizado del tenant que cartulará la escritura.</Hint>
      {notarios.length === 0 ? (
        <div className="alert alert-warn" style={{ fontSize: 12.5 }}>
          No hay notarios activos registrados para {contrato.institucion_nombre}. Agréguelos desde la sección de notarios del tenant.
        </div>
      ) : (
        <div className="field">
          <label>Notario autorizado</label>
          <select className="select" value={notarioId} onChange={(e) => setNotarioId(e.target.value)}>
            <option value="">Seleccione un notario</option>
            {notarios.map((n) => (
              <option key={n.id} value={n.id}>{n.nombre}{n.colegiado ? ` · ${n.colegiado}` : ''}</option>
            ))}
          </select>
        </div>
      )}
      {err && <div className="alert alert-danger" style={{ marginTop: 10 }}>{err}</div>}
      <BotonesPaso onSiguiente={guardar} onAtras={onAtras} cargando={guardando} deshabilitado={!notarioId} />
    </>
  );
}

function B6Generar({ contrato, onAtras, onCambio }) {
  const [generando, setGenerando] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(contrato.pdf_filename ? `/api/contratos/${contrato.id}/pdf` : null);
  const [completado, setCompletado] = useState(contrato.estado === 'completado');
  const [recienGenerado, setRecienGenerado] = useState(false);
  const [err, setErr] = useState(null);

  // Genera el PDF y lo abre automáticamente en nueva pestaña. Si ya había uno, lo regenera.
  const generar = async () => {
    setGenerando(true); setErr(null); setRecienGenerado(false);
    try {
      const r = await generatePdf(contrato.id);
      setPdfUrl(r.url);
      setRecienGenerado(true);
      await onCambio();
      // Abrir el PDF en nueva pestaña. openPdf descarga el blob autenticado.
      openPdf(contrato.id);
      // Banner verde "PDF generado" se oculta a los 6 segundos.
      setTimeout(() => setRecienGenerado(false), 6000);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setGenerando(false);
    }
  };

  const finalizar = async () => {
    if (!confirm('¿Marcar el contrato como completado? Esta acción es definitiva.')) return;
    setGenerando(true); setErr(null);
    try {
      await avanzarContrato(contrato.id);
      setCompletado(true);
      await onCambio();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setGenerando(false);
    }
  };

  if (completado) {
    return (
      <>
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', border: '1px solid #2d6a4f', background: '#e6f7ed', margin: '0 auto 14px', display: 'grid', placeItems: 'center' }}>
            <Check size={26} color="#2d6a4f" />
          </div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>Contrato completado</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-dim)' }}>Listo para entregar al cliente.</div>
        </div>
        {pdfUrl && (
          <button className="btn btn-gold" onClick={() => openPdf(contrato.id)} style={{ width: '100%', padding: 10 }}>
            <Printer size={14} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />
            Ver PDF final
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <Hint>Genere el PDF con formato legal aplicado. Cuando esté conforme, marque el contrato como completado.</Hint>
      <ResumenFinal contrato={contrato} />

      {err && <div className="alert alert-danger" style={{ marginTop: 10 }}>{err}</div>}

      {recienGenerado && (
        <div style={{ marginTop: 12, padding: '10px 14px', background: '#e6f7ed', border: '0.5px solid #2d6a4f', borderRadius: 4, fontSize: 13, color: '#2d6a4f', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Check size={14} />
          <span>PDF generado correctamente. Se abrió en una nueva pestaña.</span>
        </div>
      )}

      {!pdfUrl ? (
        // Primera generación.
        <button className="btn btn-gold" onClick={generar} disabled={generando} style={{ width: '100%', padding: 10, marginTop: 14 }}>
          <FileText size={14} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />
          {generando ? 'Generando…' : 'Generar PDF'}
        </button>
      ) : (
        // Ya existe un PDF: mostrar siempre "Ver PDF" + opción de regenerar + finalizar.
        <div style={{ marginTop: 14 }}>
          <button className="btn btn-gold" onClick={() => openPdf(contrato.id)} style={{ width: '100%', padding: 10, marginBottom: 8 }}>
            <Printer size={14} style={{ marginRight: 8, verticalAlign: 'text-bottom' }} />
            Ver PDF
          </button>
          <button className="btn" onClick={generar} disabled={generando} style={{ width: '100%', marginBottom: 14, fontSize: 12 }}>
            <FileText size={12} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
            {generando ? 'Regenerando…' : 'Regenerar PDF'}
          </button>
          <button className="btn btn-gold" onClick={finalizar} disabled={generando} style={{ width: '100%', padding: 10 }}>
            {generando ? 'Procesando…' : 'Marcar como completado'}
          </button>
        </div>
      )}

      <BotonesPaso onAtras={onAtras} soloAtras />
    </>
  );
}

function ResumenFinal({ contrato }) {
  const c = contrato.datos_cliente || {};
  const cr = contrato.datos_credito || {};
  const f = contrato.datos_firmas || {};
  return (
    <div style={{ background: '#faf9f4', border: '0.5px solid var(--border)', borderRadius: 4, padding: 14, fontSize: 12.5 }}>
      <Resumen label="Cliente" valor={c.nombre} />
      <Resumen label="DPI" valor={c.dpi} />
      <Resumen label="Monto" valor={cr.monto ? `${cr.moneda || 'Q'} ${cr.monto}` : null} />
      <Resumen label="Plazo" valor={cr.plazo_meses ? `${cr.plazo_meses} meses` : null} />
      <Resumen label="Tasa" valor={cr.tasa_anual ? `${cr.tasa_anual}%` : null} />
      <Resumen label="Notario" valor={f.notario_nombre} />
    </div>
  );
}

function Resumen({ label, valor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '0.5px solid #ecead8' }}>
      <span style={{ color: 'var(--text-dim)' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{valor || <em style={{ color: 'var(--text-dim)' }}>—</em>}</span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Sección editable inline (B2/B3/B4)
// ──────────────────────────────────────────────────────────────

function SeccionEditableWizard({ titulo, hint, valor, campos, conJustificacion, onSave, onSiguiente, onAtras }) {
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState(valor || {});
  const [justificacion, setJustificacion] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState(null);

  const empezar = () => { setDraft(valor || {}); setJustificacion(''); setEditando(true); setErr(null); };
  const cancelar = () => { setEditando(false); setErr(null); };
  const guardar = async () => {
    if (conJustificacion && !justificacion.trim()) { setErr('Indique una justificación para el cambio.'); return; }
    setGuardando(true); setErr(null);
    try {
      await onSave(draft, justificacion.trim());
      setEditando(false);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally { setGuardando(false); }
  };

  return (
    <>
      <Hint>{hint}</Hint>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{titulo}</div>
        {!editando && (
          <button className="btn btn-ghost" onClick={empezar} style={{ fontSize: 12 }}>
            <Pencil size={12} style={{ marginRight: 5, verticalAlign: 'text-bottom' }} /> Editar
          </button>
        )}
      </div>

      {editando ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 8 }}>
            {campos.map((c) => (
              <div className="field" key={c.key}>
                <label>{c.label}</label>
                <input className="input" value={draft[c.key] || ''} onChange={(e) => setDraft({ ...draft, [c.key]: e.target.value })} type={c.type || 'text'} />
              </div>
            ))}
          </div>
          {conJustificacion && (
            <div className="field" style={{ marginTop: 8 }}>
              <label>Justificación del cambio</label>
              <textarea className="input" value={justificacion} onChange={(e) => setJustificacion(e.target.value)} rows={2} placeholder="Por qué se modificaron estos datos…" style={{ resize: 'vertical' }} />
            </div>
          )}
          {err && <div className="alert alert-danger" style={{ marginTop: 8 }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
            <button className="btn" onClick={cancelar} disabled={guardando}>
              <XIcon size={12} style={{ marginRight: 5, verticalAlign: 'text-bottom' }} />Cancelar
            </button>
            <button className="btn btn-gold" onClick={guardar} disabled={guardando}>
              <Save size={12} style={{ marginRight: 5, verticalAlign: 'text-bottom' }} />{guardando ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </>
      ) : (
        <ListaValores valor={valor} campos={campos} />
      )}

      <BotonesPaso onAtras={onAtras} onSiguiente={onSiguiente} />
    </>
  );
}

function BotonesPaso({ onAtras, onSiguiente, cargando, primero, soloAtras, deshabilitado }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 18, paddingTop: 14, borderTop: '0.5px solid var(--border)' }}>
      {onAtras ? (
        <button className="btn" onClick={onAtras} disabled={cargando}>
          <ChevronLeft size={12} style={{ verticalAlign: 'text-bottom' }} /> Atrás
        </button>
      ) : <span />}
      {!soloAtras && onSiguiente && (
        <button className="btn btn-gold" onClick={onSiguiente} disabled={cargando || deshabilitado}>
          {cargando ? 'Procesando…' : 'Siguiente'} <ChevronRight size={12} style={{ verticalAlign: 'text-bottom' }} />
        </button>
      )}
    </div>
  );
}

function Hint({ children }) {
  return (
    <div style={{ background: '#faf9f4', border: '0.5px solid var(--border)', borderRadius: 4, padding: '10px 12px', marginBottom: 14, fontSize: 12.5, color: 'var(--text-dim)', lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Definición de campos
// ──────────────────────────────────────────────────────────────

const CAMPOS_CLIENTE = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'dpi', label: 'DPI' },
  { key: 'fecha_nac', label: 'Fecha nacimiento', type: 'date' },
  { key: 'lugar_nac', label: 'Lugar nacimiento' },
  { key: 'genero', label: 'Género' },
  { key: 'estado_civil', label: 'Estado civil' },
  { key: 'profesion', label: 'Profesión' },
  { key: 'nit', label: 'NIT' },
  { key: 'telefono', label: 'Teléfono' },
  { key: 'email', label: 'Correo' },
  { key: 'domicilio', label: 'Domicilio' },
  { key: 'ingresos', label: 'Ingresos' },
  { key: 'empleo', label: 'Empleo' },
];

const CAMPOS_CREDITO = [
  { key: 'monto', label: 'Monto' },
  { key: 'moneda', label: 'Moneda' },
  { key: 'plazo_meses', label: 'Plazo (meses)' },
  { key: 'tasa_anual', label: 'Tasa anual (%)' },
  { key: 'cuota_mensual', label: 'Cuota mensual' },
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
