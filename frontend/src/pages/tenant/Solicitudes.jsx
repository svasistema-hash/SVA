import { useOutletContext } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';

export default function TenantSolicitudes() {
  const { inst } = useOutletContext() || {};
  if (!inst) return <Topbar title="Cargando…" />;

  return (
    <>
      <Topbar title="Portal del cliente" crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Portal del cliente')} />} />
      <div className="app-content">
        <div className="alert alert-info">
          <strong>Portal público pendiente de habilitar</strong><br />
          Cuando el portal esté en línea, las solicitudes de crédito de clientes nuevos aparecerán aquí
          para que el abogado revise, apruebe o rechace antes de iniciar el wizard de contrato.
        </div>

        <div className="card">
          <div className="card-h"><h3>Solicitudes pendientes · 0</h3></div>
          <div className="empty">
            Aún no hay solicitudes recibidas.<br />
            <span className="muted" style={{ fontSize: 11.5 }}>
              La URL pública será <code>https://lexdocs.gt/{inst.slug}/solicitud</code>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
