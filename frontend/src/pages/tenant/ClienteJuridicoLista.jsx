import { useOutletContext } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';

// Stub F6.A — la implementación completa va en F6.B (lista con tabs,
// search, filtros, tabla paginada).
export default function ClienteJuridicoLista() {
  const { inst } = useOutletContext() || {};
  if (!inst) return (<><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>);
  return (
    <>
      <Topbar title="Clientes jurídicos" crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Clientes', 'Jurídicos')} />} />
      <div className="app-content">
        <div className="empty">Lista de clientes jurídicos — pantalla pendiente de F6.B.</div>
      </div>
    </>
  );
}
