import { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import { getClienteJuridico } from '../../api/clientesJuridicos';

// Stub F6.A — la implementación completa va en F6.E (tarjeta resumen,
// tabs internos, datos descifrados desde el backend).
export default function ClienteJuridicoDetalle() {
  const { inst } = useOutletContext() || {};
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setData(null);
    setErr(null);
    if (id) getClienteJuridico(id).then(setData).catch((e) => setErr(e.response?.data?.error || e.message));
  }, [id]);

  if (!inst) return (<><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>);
  return (
    <>
      <Topbar title={data?.nombre || 'Cliente jurídico'} crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Clientes', 'Jurídicos', data?.nombre || `#${id}`)} />} />
      <div className="app-content">
        {err && <div className="alert alert-danger">{err}</div>}
        <div className="card">
          <p className="muted">Detalle de cliente jurídico — pantalla pendiente de F6.E.</p>
          {data && (
            <pre style={{ background: 'var(--bg-subtle)', padding: 12, borderRadius: 6, fontSize: 11, overflow: 'auto' }}>
              {JSON.stringify(data, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </>
  );
}
