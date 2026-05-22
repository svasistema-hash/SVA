import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import { fetchContratos } from '../../api/contratos';
import { searchClientes } from '../../api/clientes';

function monthsBetween(a, b) {
  const ms = b - a;
  return Math.round(ms / (1000 * 60 * 60 * 24 * 30.44));
}

export default function TenantDashboard() {
  const { inst } = useOutletContext() || {};
  const nav = useNavigate();
  const [contratos, setContratos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!inst) return;
    setLoading(true);
    Promise.all([
      fetchContratos({ institucion: inst.slug }),
      searchClientes('', inst.id).catch(() => []),
    ])
      .then(([c, cl]) => {
        setContratos(c);
        setClientes(cl);
      })
      .finally(() => setLoading(false));
  }, [inst?.id]);

  if (!inst) return (<><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const contratosEsteMes = contratos.filter((c) => new Date(c.created_at) >= startOfMonth);
  const contratosActivos = contratos.filter((c) => c.estado !== 'cancelado');
  const montoTotal = contratos.reduce((sum, c) => sum + (Number(c.datos_credito?.monto) || 0), 0);

  const rep = inst.representante;
  const monthsToVenc = rep?.vencimiento ? monthsBetween(now, new Date(rep.vencimiento)) : null;
  const repAlert = monthsToVenc !== null && monthsToVenc < 6;

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const borradoresViejos = contratos.filter(
    (c) => c.estado === 'borrador' && new Date(c.updated_at) < sevenDaysAgo
  );

  const recientes = contratos.slice(0, 10);

  return (
    <>
      <Topbar
        title={inst.nombre}
        crumbs={<Breadcrumb segments={tenantBreadcrumb(inst)} />}
        actions={
          <>
            <button className="btn" onClick={() => nav('solicitudes')}>Ver solicitudes</button>
            <button className="btn btn-gold" onClick={() => nav('financiera/nueva')}>Nuevo contrato</button>
          </>
        }
      />
      <div className="app-content">
        <div className="grid-stats">
          <div className="stat"><div className="label">Contratos activos</div><div className="value">{contratosActivos.length}</div></div>
          <div className="stat"><div className="label">Clientes registrados</div><div className="value">{clientes.length}</div></div>
          <div className="stat"><div className="label">Contratos este mes</div><div className="value">{contratosEsteMes.length}</div></div>
          <div className="stat"><div className="label">Monto cartera</div><div className="value">Q{montoTotal.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div>
        </div>

        <div className="grid-2" style={{ alignItems: 'start', marginBottom: 22 }}>
          <div className="card">
            <div className="card-h"><h3>Alertas</h3></div>
            {repAlert && (
              <div className="alert alert-warn">
                <strong>Mandato del representante vence en {monthsToVenc} meses</strong><br />
                {rep.nombre} · vencimiento {rep.vencimiento}
              </div>
            )}
            {borradoresViejos.length > 0 && (
              <div className="alert alert-info">
                <strong>{borradoresViejos.length} contrato(s) en borrador hace más de 7 días</strong><br />
                Revise si están listos para pasar a revisión.
              </div>
            )}
            <div className="alert alert-info">
              <strong>Portal del cliente pendiente</strong><br />
              Aún no hay solicitudes externas registradas.
            </div>
            {!repAlert && borradoresViejos.length === 0 && (
              <div className="muted" style={{ fontSize: 12.5 }}>Sin alertas activas.</div>
            )}
          </div>

          <div className="card">
            <div className="card-h"><h3>Acciones rápidas</h3></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="btn btn-gold" onClick={() => nav('financiera/nueva')}>Nuevo contrato</button>
              <button className="btn" onClick={() => nav('solicitudes')}>Ver solicitudes pendientes</button>
              <button className="btn" onClick={() => nav('clientes')}>Ver clientes</button>
              <button className="btn" onClick={() => nav('modelos')}>Gestionar modelos</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Contratos recientes</h3>
            <button className="btn btn-ghost" onClick={() => nav('contratos')}>Ver todos →</button>
          </div>
          {loading ? (
            <div className="empty"><span className="spinner" /></div>
          ) : recientes.length === 0 ? (
            <div className="empty">Aún no hay contratos generados.</div>
          ) : (
            <table className="tbl">
              <thead><tr><th>No.</th><th>Cliente</th><th>Modelo</th><th>Monto</th><th>Fecha</th><th>Estado</th></tr></thead>
              <tbody>
                {recientes.map((c) => (
                  <tr key={c.id} onClick={() => nav(`contratos/${c.id}`)}>
                    <td><code>{c.no_contrato}</code></td>
                    <td>{c.datos_cliente?.nombre || <span className="muted">—</span>}</td>
                    <td>{c.modelo_nombre}</td>
                    <td>{c.datos_credito?.moneda || 'Q'} {c.datos_credito?.monto || '—'}</td>
                    <td className="muted">{c.created_at}</td>
                    <td><span className={'badge badge-' + c.estado}>{c.estado}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
