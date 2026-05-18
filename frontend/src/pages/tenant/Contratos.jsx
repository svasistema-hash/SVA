import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import { fetchContratos, openPdf } from '../../api/contratos';

export default function TenantContratos() {
  const { inst } = useOutletContext() || {};
  const nav = useNavigate();
  const [contratos, setContratos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtros, setFiltros] = useState({ estado: '', modelo: '', desde: '', hasta: '', q: '' });

  useEffect(() => {
    if (!inst) return;
    setLoading(true);
    fetchContratos({ institucion: inst.slug }).then(setContratos).finally(() => setLoading(false));
  }, [inst?.slug]);

  const filtrados = useMemo(() => {
    return contratos.filter((c) => {
      if (filtros.estado && c.estado !== filtros.estado) return false;
      if (filtros.modelo && c.modelo_nombre !== filtros.modelo) return false;
      if (filtros.desde && c.created_at < filtros.desde) return false;
      if (filtros.hasta && c.created_at > filtros.hasta + ' 23:59:59') return false;
      if (filtros.q) {
        const q = filtros.q.toLowerCase();
        const txt = `${c.no_contrato} ${c.datos_cliente?.nombre || ''}`.toLowerCase();
        if (!txt.includes(q)) return false;
      }
      return true;
    });
  }, [contratos, filtros]);

  const modelos = useMemo(
    () => Array.from(new Set(contratos.map((c) => c.modelo_nombre).filter(Boolean))),
    [contratos]
  );

  if (!inst) return (<><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>);

  return (
    <>
      <Topbar
        title="Contratos"
        crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Contratos')} />}
        actions={<button className="btn btn-gold" onClick={() => nav('nuevo')}>+ Nuevo contrato</button>}
      />
      <div className="app-content">
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="row-3">
            <div className="field">
              <label>Buscar</label>
              <input className="input" placeholder="No. contrato o cliente" value={filtros.q} onChange={(e) => setFiltros({ ...filtros, q: e.target.value })} />
            </div>
            <div className="field">
              <label>Estado</label>
              <select className="select" value={filtros.estado} onChange={(e) => setFiltros({ ...filtros, estado: e.target.value })}>
                <option value="">Todos</option>
                <option value="borrador">Borrador</option>
                <option value="revision">Revisión</option>
                <option value="firmado">Firmado</option>
              </select>
            </div>
            <div className="field">
              <label>Modelo</label>
              <select className="select" value={filtros.modelo} onChange={(e) => setFiltros({ ...filtros, modelo: e.target.value })}>
                <option value="">Todos</option>
                {modelos.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="row-2">
            <div className="field"><label>Desde</label><input className="input" type="date" value={filtros.desde} onChange={(e) => setFiltros({ ...filtros, desde: e.target.value })} /></div>
            <div className="field"><label>Hasta</label><input className="input" type="date" value={filtros.hasta} onChange={(e) => setFiltros({ ...filtros, hasta: e.target.value })} /></div>
          </div>
        </div>

        {loading ? (
          <div className="empty"><span className="spinner" /></div>
        ) : filtrados.length === 0 ? (
          <div className="empty">Sin resultados con esos filtros.</div>
        ) : (
          <table className="tbl">
            <thead><tr><th>No.</th><th>Cliente</th><th>Modelo</th><th>Monto</th><th>Fecha</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {filtrados.map((c) => (
                <tr key={c.id} onClick={() => nav(`${c.id}`)}>
                  <td><code>{c.no_contrato}</code></td>
                  <td>{c.datos_cliente?.nombre || <span className="muted">—</span>}</td>
                  <td>{c.modelo_nombre}</td>
                  <td>{c.datos_credito?.moneda || 'Q'} {c.datos_credito?.monto || '—'}</td>
                  <td className="muted">{c.created_at}</td>
                  <td><span className={'badge badge-' + c.estado}>{c.estado}</span></td>
                  <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
                    {c.pdf_path && <button className="btn btn-ghost" onClick={() => openPdf(c.id)}>PDF</button>}
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
