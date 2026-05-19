import { useOutletContext } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';

// Stub F6.A — la implementación completa va en F6.D (formulario jurídico
// con 5 secciones, validación Zod + react-hook-form, encriptación al backend).
export default function ClienteJuridicoNuevo() {
  const { inst } = useOutletContext() || {};
  if (!inst) return (<><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>);
  return (
    <>
      <Topbar title="Nuevo cliente jurídico" crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Clientes', 'Jurídicos', 'Nuevo')} />} />
      <div className="app-content">
        <div className="empty">Formulario de nuevo cliente jurídico — pantalla pendiente de F6.D.</div>
      </div>
    </>
  );
}
