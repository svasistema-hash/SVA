import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { fetchInstitucion } from '../api/instituciones';

const NAV = [
  { to: '', end: true, label: 'Dashboard' },
  { to: 'clientes', label: 'Clientes' },
  { to: 'contratos', label: 'Contratos' },
  { to: 'modelos', label: 'Modelos' },
  { to: 'configuracion', label: 'Institución' },
  { to: 'solicitudes', label: 'Portal del cliente' },
  { to: 'reportes', label: 'Reportes' },
];

const TIPO_LABEL = {
  banco: 'Banco',
  financiera: 'Financiera',
  desarrolladora: 'Desarrolladora',
  prestamista: 'Prestamista',
};

export default function TenantLayout() {
  const { slug } = useParams();
  const nav = useNavigate();
  const [inst, setInst] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    setInst(null);
    setErr(null);
    fetchInstitucion(slug)
      .then(setInst)
      .catch((e) => setErr(e.response?.data?.error || e.message));
  }, [slug]);

  if (err) {
    return (
      <div className="app-shell">
        <aside className="sidebar" />
        <div className="app-main">
          <header className="topbar"><h1>Error</h1></header>
          <div className="app-content"><div className="empty">{err}</div></div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="tenant-brand">
          <div className="tipo">{inst ? TIPO_LABEL[inst.tipo] || inst.tipo : '…'}</div>
          <div className="nombre">{inst?.nombre || 'Cargando…'}</div>
          <div className="meta">{inst?.nit ? `NIT ${inst.nit}` : ''}</div>
        </div>

        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
          >
            <span>{n.label}</span>
          </NavLink>
        ))}

        <div className="sidebar-back" onClick={() => nav('/')}>
          Todos los módulos →
        </div>
      </aside>
      <div className="app-main">
        <Outlet context={{ inst, refetchInst: () => fetchInstitucion(slug).then(setInst) }} />
      </div>
    </div>
  );
}
