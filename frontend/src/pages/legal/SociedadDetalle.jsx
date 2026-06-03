// Detalle de sociedad — vista del abogado sub-tenant. Muestra datos base,
// accionistas, representantes, direcciones, correcciones pendientes, audit log,
// y los botones de transición de estado según corresponda.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import {
  fetchSociedad, avanzarSociedad, anularSociedad, solicitarCorrecciones,
  fetchAuditLogSociedad, compilarSociedad, marcarInscritoRM,
  labelEstado,
} from '../../api/legal';

const ESTADOS_BLOQUEADOS = new Set(['listo_para_RM', 'enviado_RM', 'inscrito_RM', 'anulada']);

export default function SociedadDetalle() {
  const { id } = useParams();
  const nav = useNavigate();
  const [soc, setSoc] = useState(null);
  const [audit, setAudit] = useState([]);
  const [compilado, setCompilado] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accionando, setAccionando] = useState(false);
  const [mostrarCorr, setMostrarCorr] = useState(false);

  const recargar = async () => {
    setLoading(true); setError(null);
    try {
      const [s, a] = await Promise.all([
        fetchSociedad(id),
        fetchAuditLogSociedad(id).catch(() => []),
      ]);
      setSoc(s);
      setAudit(a);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { recargar(); }, [id]);

  const avanzar = async () => {
    if (!confirm('¿Confirma el avance al siguiente estado del flujo?')) return;
    setAccionando(true); setError(null);
    try {
      await avanzarSociedad(id);
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
      await anularSociedad(id, motivo.trim());
      await recargar();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setAccionando(false);
    }
  };

  const verPDF = async () => {
    try {
      const c = await compilarSociedad(id);
      setCompilado(c);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const marcarInscrito = async () => {
    const folio = prompt('Folio en RM:');
    if (!folio) return;
    const libro = prompt('Libro:');
    if (!libro) return;
    const fecha = prompt('Fecha de inscripción (YYYY-MM-DD):', new Date().toISOString().slice(0, 10));
    if (!fecha) return;
    try {
      await marcarInscritoRM(id, { folio, libro, fecha });
      await recargar();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  if (loading) return <><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>;
  if (error && !soc) return <><Topbar title="Sociedad" /><div className="app-content"><div className="alert alert-danger">{error}</div></div></>;
  if (!soc) return null;

  const bloqueado = ESTADOS_BLOQUEADOS.has(soc.estado);
  const puedeAvanzar = ['en_curso', 'revision_abogado', 'listo_para_RM', 'enviado_RM'].includes(soc.estado);
  const puedeCorrecciones = soc.estado === 'revision_abogado';
  const puedeMarcarInscrito = soc.estado === 'enviado_RM';
  const tokenActivo = (soc.tokens || []).find((t) => !t.usado);
  const linkPublico = tokenActivo ? `${window.location.origin}/legal/portal/${tokenActivo.token}` : null;

  return (
    <>
      <Topbar
        title={`${soc.correlativo} — ${soc.denominacion}`}
        crumbs={<span className="badge">{labelEstado(soc.estado)}</span>}
        actions={
          <>
            {puedeAvanzar && (
              <button className="btn btn-gold" onClick={avanzar} disabled={accionando}>
                {soc.estado === 'revision_abogado' ? 'Aprobar y congelar' :
                 soc.estado === 'listo_para_RM' ? 'Marcar como enviado al RM' :
                 'Avanzar'}
              </button>
            )}
            {puedeCorrecciones && (
              <button className="btn" onClick={() => setMostrarCorr(true)}>Solicitar correcciones</button>
            )}
            {puedeMarcarInscrito && (
              <button className="btn btn-gold" onClick={marcarInscrito}>Registrar inscripción RM</button>
            )}
            {!['anulada', 'inscrito_RM'].includes(soc.estado) && (
              <button className="btn btn-ghost" onClick={anular} disabled={accionando}>Anular</button>
            )}
            <button className="btn" onClick={verPDF}>Ver minuta</button>
          </>
        }
      />
      <div className="app-content">
        {error && <div className="alert alert-danger">{error}</div>}

        {linkPublico && (
          <div className="alert alert-info" style={{ fontSize: 12.5 }}>
            <strong>Enlace activo para el cliente</strong>: <code>{linkPublico}</code>
            <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => { navigator.clipboard?.writeText(linkPublico); alert('Enlace copiado'); }}>Copiar</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Seccion titulo="Datos base">
              <Fila label="Denominación" valor={soc.denominacion + ', Sociedad Anónima'} />
              <Fila label="Objeto social" valor={soc.objeto_social} />
              <Fila label="Plazo" valor={soc.plazo_anios ? `${soc.plazo_anios} años` : 'Indefinido'} />
              <Fila label="Capital social" valor={`${soc.moneda} ${Number(soc.capital_social).toLocaleString('es', { minimumFractionDigits: 2 })}`} />
              <Fila label="Total de acciones" valor={Number(soc.total_acciones).toLocaleString('es')} />
              <Fila label="Valor nominal por acción" valor={`${soc.moneda} ${Number(soc.valor_nominal_accion).toLocaleString('es', { minimumFractionDigits: 2 })}`} />
            </Seccion>

            <Seccion titulo={`Accionistas (${soc.accionistas?.length || 0})`}>
              {soc.accionistas?.length === 0 ? (
                <div className="muted" style={{ fontSize: 12.5 }}>El cliente aún no registró accionistas.</div>
              ) : (
                <table className="table-light" style={{ width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-dim)', fontSize: 11 }}>
                      <th>Nombre</th><th>DPI/NIT</th><th>Acciones</th><th>%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {soc.accionistas.map((a) => (
                      <tr key={a.id} style={{ borderTop: '0.5px solid var(--border)' }}>
                        <td style={{ padding: '6px 0' }}>{a.nombre || '—'}</td>
                        <td className="muted">{a.dpi_o_nit || '—'}</td>
                        <td>{a.acciones_cantidad}</td>
                        <td>{a.porcentaje}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Seccion>

            <Seccion titulo={`Representantes legales (${soc.representantes?.length || 0})`}>
              {soc.representantes?.length === 0 ? (
                <div className="muted" style={{ fontSize: 12.5 }}>Aún no se registraron representantes.</div>
              ) : (
                <table className="table-light" style={{ width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: 'var(--text-dim)', fontSize: 11 }}>
                      <th>Nombre</th><th>Cargo</th><th>DPI</th><th>Vigencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {soc.representantes.map((r) => (
                      <tr key={r.id} style={{ borderTop: '0.5px solid var(--border)' }}>
                        <td style={{ padding: '6px 0' }}>{r.nombre || '—'}</td>
                        <td>{r.cargo}</td>
                        <td className="muted">{r.dpi || '—'}</td>
                        <td className="muted" style={{ fontSize: 11 }}>{r.vigencia_inicio} {r.vigencia_vencimiento ? `→ ${r.vigencia_vencimiento}` : '(indefinido)'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Seccion>

            <Seccion titulo={`Direcciones (${soc.direcciones?.length || 0})`}>
              {soc.direcciones?.length === 0 ? (
                <div className="muted" style={{ fontSize: 12.5 }}>Sin direcciones registradas.</div>
              ) : (
                <ul style={{ paddingLeft: 18, margin: 0, fontSize: 13 }}>
                  {soc.direcciones.map((d) => (
                    <li key={d.id} style={{ marginBottom: 4 }}>
                      <strong style={{ textTransform: 'capitalize' }}>{d.tipo}:</strong> {d.direccion}, {d.municipio}, {d.departamento}
                    </li>
                  ))}
                </ul>
              )}
            </Seccion>

            {soc.correcciones?.filter((c) => c.status === 'pendiente').length > 0 && (
              <Seccion titulo="Correcciones pendientes">
                {soc.correcciones.filter((c) => c.status === 'pendiente').map((c) => (
                  <div key={c.id} className="alert alert-warn" style={{ fontSize: 12.5, marginBottom: 6 }}>
                    <strong>Iteración {c.iteracion}:</strong> {c.comentario}
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                      Campos: {(() => { try { return JSON.parse(c.campos_a_corregir).join(', '); } catch { return c.campos_a_corregir; } })()}
                    </div>
                  </div>
                ))}
              </Seccion>
            )}

            {soc.rm_folio && (
              <Seccion titulo="Inscripción en Registro Mercantil">
                <Fila label="Folio" valor={soc.rm_folio} />
                <Fila label="Libro" valor={soc.rm_libro} />
                <Fila label="Fecha de inscripción" valor={soc.rm_fecha_inscripcion} />
              </Seccion>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Seccion titulo="Cronología (audit log)">
              {audit.length === 0 ? (
                <div className="muted" style={{ fontSize: 12 }}>Sin eventos registrados.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 480, overflow: 'auto' }}>
                  {audit.slice(0, 30).map((e) => (
                    <div key={e.id} style={{ fontSize: 11.5, padding: 6, background: '#faf9f4', borderRadius: 4 }}>
                      <div style={{ fontWeight: 500 }}>{e.accion}</div>
                      <div className="muted">{e.timestamp} · {e.user_email || '(público)'}</div>
                    </div>
                  ))}
                </div>
              )}
            </Seccion>
          </div>
        </div>

        {compilado && (
          <PreviewMinutaModal compilado={compilado} onClose={() => setCompilado(null)} />
        )}

        {mostrarCorr && (
          <CorreccionesModal
            sociedadId={id}
            onClose={() => setMostrarCorr(false)}
            onSolicitada={async () => { setMostrarCorr(false); await recargar(); }}
          />
        )}
      </div>
    </>
  );
}

function Seccion({ titulo, children }) {
  return (
    <div className="card">
      <div className="card-h"><h3>{titulo}</h3></div>
      <div style={{ padding: '4px 0' }}>{children}</div>
    </div>
  );
}

function Fila({ label, valor }) {
  return (
    <div style={{ display: 'flex', gap: 14, padding: '6px 0', borderBottom: '0.5px solid var(--border)', fontSize: 13 }}>
      <div className="muted" style={{ width: 180, fontSize: 12 }}>{label}</div>
      <div style={{ flex: 1 }}>{valor || '—'}</div>
    </div>
  );
}

function PreviewMinutaModal({ compilado, onClose }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(19,20,26,0.55)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div className="card" style={{ width: 820, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="card-h">
          <h3>Minuta de constitución (borrador)</h3>
          <button className="btn-ghost btn" onClick={onClose}>Cerrar</button>
        </div>
        <div className="alert alert-info" style={{ fontSize: 12.5 }}>
          <strong>BORRADOR — Pendiente de protocolización notarial.</strong> Este documento debe ser
          protocolizado por un notario colegiado conforme al Decreto 314 antes de su presentación al
          Registro Mercantil.
        </div>
        {compilado.clausulas.map((c) => (
          <div key={c.codigo} style={{ marginBottom: 14, fontFamily: 'Libre Baskerville, serif', fontSize: 14, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, marginBottom: 6, fontSize: 13, textTransform: 'uppercase' }}>{c.titulo}</div>
            <div>{c.texto}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CorreccionesModal({ sociedadId, onClose, onSolicitada }) {
  const [campos, setCampos] = useState('');
  const [comentario, setComentario] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    const lista = campos.split(',').map((s) => s.trim()).filter(Boolean);
    if (lista.length === 0) { setErr('Debe indicar al menos un campo a corregir'); return; }
    if (!comentario.trim()) { setErr('El comentario es obligatorio'); return; }
    setGuardando(true); setErr(null);
    try {
      await solicitarCorrecciones(sociedadId, lista, comentario.trim());
      onSolicitada();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(19,20,26,0.55)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div className="card" style={{ width: 560, maxWidth: '95vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="card-h">
          <h3>Solicitar correcciones al cliente</h3>
          <button className="btn-ghost btn" onClick={onClose}>Cerrar</button>
        </div>
        <div className="field">
          <label>Campos a corregir (separados por coma)</label>
          <input className="input" value={campos} onChange={(e) => setCampos(e.target.value)}
            placeholder="denominacion, objeto_social, accionistas" />
        </div>
        <div className="field">
          <label>Comentario para el cliente</label>
          <textarea className="input" rows={4} value={comentario} onChange={(e) => setComentario(e.target.value)}
            placeholder="Indique claramente qué debe corregir y por qué." style={{ resize: 'vertical' }} />
        </div>
        {err && <div className="alert alert-danger" style={{ fontSize: 12.5 }}>{err}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="btn btn-gold" onClick={submit} disabled={guardando}>
            {guardando ? 'Enviando…' : 'Solicitar correcciones'}
          </button>
        </div>
      </div>
    </div>
  );
}
