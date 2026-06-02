// Panel master cross-tenant — vista global de todas las sociedades de todos
// los sub-tenants. Sin PII descifrada por default; el master puede invocar
// override compliance con motivo auditado.

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import {
  fetchMasterSociedades, fetchMasterMetricas, fetchFirmas,
  createFirma, suspenderFirma, reactivarFirma, overrideCompliance,
  ESTADOS_SOCIEDAD, labelEstado, TIPOS_FIRMA,
} from '../../api/legal';

export function MasterPanelGlobal() {
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const [rows, setRows] = useState([]);
  const [firmas, setFirmas] = useState([]);
  const [loading, setLoading] = useState(true);

  const estado = params.get('estado') || '';
  const firmaId = params.get('firma_id') || '';

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetchMasterSociedades({ estado, firma_id: firmaId }),
      fetchFirmas(),
    ]).then(([s, f]) => { setRows(s); setFirmas(f); })
      .finally(() => setLoading(false));
  }, [estado, firmaId]);

  return (
    <>
      <Topbar title="Vista global cross-tenant" crumbs={`${rows.length} sociedades en todas las firmas`} />
      <div className="app-content">
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <select className="input" style={{ width: 220 }} value={estado} onChange={(e) => {
              const np = new URLSearchParams(params); if (e.target.value) np.set('estado', e.target.value); else np.delete('estado'); setParams(np);
            }}>
              <option value="">Todos los estados</option>
              {ESTADOS_SOCIEDAD.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select className="input" style={{ width: 240 }} value={firmaId} onChange={(e) => {
              const np = new URLSearchParams(params); if (e.target.value) np.set('firma_id', e.target.value); else np.delete('firma_id'); setParams(np);
            }}>
              <option value="">Todas las firmas</option>
              {firmas.map((f) => <option key={f.id} value={f.id}>{f.nombre}</option>)}
            </select>
          </div>
        </div>

        {loading ? <div className="empty"><span className="spinner" /></div>
          : rows.length === 0 ? <div className="empty">Sin resultados.</div>
          : (
          <div className="card">
            <table className="table-light" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-dim)', fontSize: 11 }}>
                  <th>Correlativo</th><th>Firma</th><th>Denominación</th><th>Estado</th><th>Capital</th><th>Acc.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} style={{ borderTop: '0.5px solid var(--border)' }}>
                    <td style={{ padding: '6px 0' }}>{r.correlativo}</td>
                    <td className="muted">{r.firma_nombre}</td>
                    <td>{r.denominacion}</td>
                    <td><span className="badge">{labelEstado(r.estado)}</span></td>
                    <td>{r.moneda} {Number(r.capital_social).toLocaleString('es', { minimumFractionDigits: 2 })}</td>
                    <td className="muted">{r.accionistas_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 11, marginTop: 12 }}>
              Las firmas listadas aquí pertenecen a sub-tenants. Para acceder al detalle (con datos
              cifrados de los accionistas y representantes) debe ejercer un override de compliance
              con motivo justificado, el cual queda registrado en el audit log.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

export function MasterPanelFirmas() {
  const [firmas, setFirmas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [error, setError] = useState(null);

  const recargar = () => {
    setLoading(true);
    fetchFirmas().then(setFirmas).finally(() => setLoading(false));
  };

  useEffect(() => { recargar(); }, []);

  const suspender = async (f) => {
    const motivo = prompt(`Motivo para suspender a ${f.nombre}:`);
    if (!motivo) return;
    try { await suspenderFirma(f.id, motivo); recargar(); }
    catch (e) { setError(e.response?.data?.error || e.message); }
  };
  const reactivar = async (f) => {
    if (!confirm(`¿Reactivar a ${f.nombre}?`)) return;
    try { await reactivarFirma(f.id); recargar(); }
    catch (e) { setError(e.response?.data?.error || e.message); }
  };

  return (
    <>
      <Topbar title="Sub-tenants" crumbs={`${firmas.length} firmas registradas`}
        actions={<button className="btn btn-gold" onClick={() => setMostrarForm(true)}>Agregar sub-tenant</button>} />
      <div className="app-content">
        {error && <div className="alert alert-danger">{error}</div>}
        {loading ? <div className="empty"><span className="spinner" /></div> : (
          <div className="card">
            <table className="table-light" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-dim)', fontSize: 11 }}>
                  <th>Slug</th><th>Nombre</th><th>Tipo</th><th>Estado</th><th>Prefijo</th><th />
                </tr>
              </thead>
              <tbody>
                {firmas.map((f) => (
                  <tr key={f.id} style={{ borderTop: '0.5px solid var(--border)' }}>
                    <td style={{ padding: '6px 0' }}>{f.slug}</td>
                    <td>{f.nombre} {f.id === 1 && <span className="muted">(master)</span>}</td>
                    <td>{TIPOS_FIRMA.find((t) => t.value === f.tipo)?.label || f.tipo}</td>
                    <td>{f.activo ? <span className="badge">Activa</span> : <span className="badge badge-borrador">Suspendida</span>}</td>
                    <td className="muted">{f.correlativo_prefijo}</td>
                    <td>
                      {f.id !== 1 && (
                        f.activo ?
                          <button className="btn btn-sm" onClick={() => suspender(f)}>Suspender</button>
                          : <button className="btn btn-sm btn-gold" onClick={() => reactivar(f)}>Reactivar</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {mostrarForm && <FormFirma onClose={() => setMostrarForm(false)} onCreated={() => { setMostrarForm(false); recargar(); }} />}
      </div>
    </>
  );
}

function FormFirma({ onClose, onCreated }) {
  const [d, setD] = useState({ slug: '', nombre: '', tipo: 'bufete', correlativo_prefijo: '', nit: '', direccion: '', telefono: '', email: '' });
  const [error, setError] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const valid = d.slug && d.nombre && d.tipo && d.correlativo_prefijo;

  const submit = async () => {
    setGuardando(true); setError(null);
    try { await createFirma(d); onCreated(); }
    catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setGuardando(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(19,20,26,0.55)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div className="card" style={{ width: 560 }} onClick={(e) => e.stopPropagation()}>
        <div className="card-h"><h3>Agregar sub-tenant</h3><button className="btn-ghost btn" onClick={onClose}>Cerrar</button></div>
        <div className="row-2">
          <div className="field"><label>Slug *</label><input className="input" value={d.slug} onChange={(e) => setD({ ...d, slug: e.target.value })} placeholder="bufete-castillo" /></div>
          <div className="field"><label>Tipo *</label>
            <select className="input" value={d.tipo} onChange={(e) => setD({ ...d, tipo: e.target.value })}>
              {TIPOS_FIRMA.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div className="field"><label>Nombre completo *</label><input className="input" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} placeholder="Bufete Castillo & Asociados" /></div>
        <div className="row-2">
          <div className="field"><label>Prefijo correlativo *</label><input className="input" value={d.correlativo_prefijo} onChange={(e) => setD({ ...d, correlativo_prefijo: e.target.value })} placeholder="SA-BCA" /></div>
          <div className="field"><label>NIT</label><input className="input" value={d.nit} onChange={(e) => setD({ ...d, nit: e.target.value })} /></div>
        </div>
        <div className="field"><label>Dirección</label><input className="input" value={d.direccion} onChange={(e) => setD({ ...d, direccion: e.target.value })} /></div>
        <div className="row-2">
          <div className="field"><label>Teléfono</label><input className="input" value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} /></div>
          <div className="field"><label>Correo</label><input className="input" type="email" value={d.email} onChange={(e) => setD({ ...d, email: e.target.value })} /></div>
        </div>
        {error && <div className="alert alert-danger" style={{ fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose} disabled={guardando}>Cancelar</button>
          <button className="btn btn-gold" onClick={submit} disabled={!valid || guardando}>{guardando ? 'Creando…' : 'Crear sub-tenant'}</button>
        </div>
      </div>
    </div>
  );
}

export function MasterMetricas() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetchMasterMetricas().then(setData).finally(() => setLoading(false)); }, []);

  return (
    <>
      <Topbar title="Métricas globales" crumbs="Volumen y desempeño por firma" />
      <div className="app-content">
        {loading ? <div className="empty"><span className="spinner" /></div> : !data ? <div className="empty">Sin datos.</div> : (
          <>
            <div className="card" style={{ marginBottom: 14 }}>
              <div className="card-h"><h3>Conteo global por estado</h3></div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                {ESTADOS_SOCIEDAD.map((s) => (
                  <div key={s.value} style={{ padding: 10, background: '#faf9f4', borderRadius: 6 }}>
                    <div className="muted" style={{ fontSize: 11 }}>{s.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--gold)' }}>{data.conteo_global?.[s.value] || 0}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="card-h"><h3>Por firma</h3></div>
              <table className="table-light" style={{ width: '100%', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: 'var(--text-dim)', fontSize: 11 }}>
                    <th>Firma</th><th>Total</th><th>Inscritas</th><th>En proceso</th><th>Anuladas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.por_firma.map((f) => (
                    <tr key={f.id} style={{ borderTop: '0.5px solid var(--border)' }}>
                      <td style={{ padding: '6px 0' }}>{f.nombre} {f.id === 1 && <span className="muted">(master)</span>}</td>
                      <td>{f.sociedades_total}</td>
                      <td style={{ color: 'var(--gold)' }}>{f.inscritas}</td>
                      <td>{f.en_proceso}</td>
                      <td className="muted">{f.anuladas}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
