import { useEffect, useRef, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import { fetchContratos } from '../../api/contratos';
import { crearToken } from '../../api/solicitudes';
import client from '../../api/client';

export default function TenantClientes() {
  const { inst } = useOutletContext() || {};
  const nav = useNavigate();
  const [clientes, setClientes] = useState([]);
  const [pendientes, setPendientes] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [q, setQ] = useState('');
  const [estadoFiltro, setEstadoFiltro] = useState('activo');
  const [loading, setLoading] = useState(true);
  const [showLink, setShowLink] = useState(false);
  const tRef = useRef(null);

  const reload = (qx = q, est = estadoFiltro) => {
    if (!inst) return;
    setLoading(true);
    Promise.all([
      client.get(`/clientes?q=${encodeURIComponent(qx)}&estado=${est}&institucion_id=${inst.id}`).then((r) => r.data),
      client.get(`/clientes?estado=pendiente&institucion_id=${inst.id}`).then((r) => r.data),
      fetchContratos({ institucion: inst.slug }),
    ])
      .then(([cs, p, ct]) => {
        setClientes(cs);
        setPendientes(p);
        setContratos(ct);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!inst) return;
    if (tRef.current) clearTimeout(tRef.current);
    tRef.current = setTimeout(() => reload(q, estadoFiltro), 200);
    return () => clearTimeout(tRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, estadoFiltro, inst?.id]);

  const contratosPorCliente = (dpi) => contratos.filter((c) => c.datos_cliente?.dpi === dpi).length;

  if (!inst) return (<><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>);

  return (
    <>
      <Topbar
        title="Clientes"
        crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Clientes')} />}
        actions={
          <>
            <button className="btn" onClick={() => nav('nuevo')}>+ Agregar cliente (escanear DPI)</button>
            <button className="btn btn-gold" onClick={() => setShowLink(true)}>Enviar link al cliente</button>
          </>
        }
      />
      <div className="app-content">
        {pendientes.length > 0 && (
          <div className="card" style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-border)', marginBottom: 14 }}>
            <div className="card-h">
              <h3>Solicitudes pendientes · {pendientes.length}</h3>
              <span className="muted" style={{ fontSize: 11.5 }}>Clientes que llenaron el formulario público y esperan tu verificación</span>
            </div>
            <table className="tbl">
              <thead><tr><th>Nombre</th><th>DPI</th><th>Teléfono</th><th>Recibido</th><th></th></tr></thead>
              <tbody>
                {pendientes.map((c) => (
                  <tr key={c.id} onClick={() => nav(`${c.id}?verificar=1`)}>
                    <td><strong>{c.nombre}</strong></td>
                    <td><code>{c.dpi || '—'}</code></td>
                    <td>{c.telefono || '—'}</td>
                    <td className="muted">{c.created_at}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="btn btn-gold" onClick={(e) => { e.stopPropagation(); nav(`${c.id}?verificar=1`); }}>
                        Verificar y activar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="toolbar">
          <input
            className="input"
            style={{ maxWidth: 360 }}
            placeholder="Buscar por nombre, DPI o NIT"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="select" style={{ maxWidth: 200 }} value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)}>
            <option value="activo">Activos</option>
            <option value="pendiente">Pendientes</option>
            <option value="">Todos</option>
          </select>
          <div className="spacer" />
        </div>

        {showLink && (
          <LinkGeneratorModal
            slug={inst.slug}
            onClose={() => setShowLink(false)}
          />
        )}

        {loading ? (
          <div className="empty"><span className="spinner" /></div>
        ) : clientes.length === 0 ? (
          <div className="empty">{q ? `Sin resultados para "${q}".` : 'No hay clientes con ese filtro.'}</div>
        ) : (
          <table className="tbl">
            <thead><tr><th>Nombre</th><th>DPI</th><th>NIT</th><th>Teléfono</th><th>Contratos</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} onClick={() => nav(`${c.id}`)}>
                  <td><strong>{c.nombre}</strong></td>
                  <td><code>{c.dpi || '—'}</code></td>
                  <td>{c.nit || '—'}</td>
                  <td>{c.telefono || '—'}</td>
                  <td>{contratosPorCliente(c.dpi)}</td>
                  <td><span className={'badge ' + (c.estado === 'pendiente' ? 'badge-revision' : 'badge-firmado')}>{c.estado || 'activo'}</span></td>
                  <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
                    <button className="btn btn-ghost" onClick={() => nav(`${c.id}`)}>Ver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function LinkGeneratorModal({ slug, onClose }) {
  const [token, setToken] = useState(null);
  const [creating, setCreating] = useState(true);
  const [copied, setCopied] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    crearToken(slug)
      .then((r) => setToken(r))
      .catch((e) => setErr(e.response?.data?.error || e.message))
      .finally(() => setCreating(false));
  }, [slug]);

  const link = token ? `${window.location.origin}/solicitud/${slug}?token=${token.token}` : '';
  const mensaje = `Hola! Te comparto el link para llenar tu solicitud de crédito:\n${link}\n(Vence en 48 horas)`;

  const copy = (text, kind) => {
    navigator.clipboard.writeText(text);
    setCopied(kind);
    setTimeout(() => setCopied(null), 2000);
  };
  const openWA = () => window.open(`https://wa.me/?text=${encodeURIComponent(mensaje)}`, '_blank');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(19,20,26,0.55)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div className="card" style={{ width: 560, maxWidth: '95vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="card-h">
          <h3>Enviar link al cliente</h3>
          <button className="btn-ghost btn" onClick={onClose}>Cerrar</button>
        </div>
        <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
          El cliente abrirá este link en su celular o PC y llenará su solicitud directamente.
          Vence en 48 horas y se invalida después de usarse una vez.
        </p>

        {creating && <div className="empty"><span className="spinner" /> Generando link…</div>}
        {err && <div className="alert alert-danger">{err}</div>}

        {token && (
          <>
            <div className="field">
              <label>Link de solicitud</label>
              <input className="input" value={link} readOnly style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-border)', fontSize: 11.5 }} onClick={(e) => e.target.select()} />
              <div className="help">Vence: {new Date(token.expires_at).toLocaleString('es-GT')}</div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
              <button className="btn" onClick={() => copy(link, 'link')}>
                {copied === 'link' ? 'Copiado' : 'Copiar link'}
              </button>
              <button className="btn btn-gold" onClick={openWA}>Compartir por WhatsApp</button>
              <button className="btn" onClick={() => copy(mensaje, 'email')}>
                {copied === 'email' ? 'Copiado' : 'Copiar para email'}
              </button>
            </div>

            <div style={{ marginTop: 14, padding: 10, background: '#faf9f4', borderRadius: 4, fontSize: 11.5, color: 'var(--text-soft)' }}>
              <strong>Mensaje sugerido:</strong><br />
              <pre style={{ margin: '6px 0 0', whiteSpace: 'pre-wrap', fontFamily: 'inherit', fontSize: 11.5 }}>{mensaje}</pre>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

