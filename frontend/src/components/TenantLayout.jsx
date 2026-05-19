import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { fetchInstitucion } from '../api/instituciones';

// NAV: links simples + un grupo expandible para Clientes (con subitems Todos/Ind/Jur).
const NAV = [
  { type: 'link', to: '', end: true, label: 'Dashboard' },
  {
    type: 'group',
    label: 'Clientes',
    match: 'clientes', // ruta cuyo prefijo activa el grupo
    children: [
      { to: 'clientes', end: true, label: 'Todos' },
      { to: 'clientes/individuales', label: 'Individuales' },
      { to: 'clientes/juridicos', label: 'Jurídicos' },
    ],
  },
  { type: 'link', to: 'contratos', label: 'Contratos' },
  { type: 'link', to: 'modelos', label: 'Modelos' },
  { type: 'link', to: 'configuracion', label: 'Institución' },
  { type: 'link', to: 'solicitudes', label: 'Portal del cliente' },
  { type: 'link', to: 'reportes', label: 'Reportes' },
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
  const loc = useLocation();
  const [inst, setInst] = useState(null);
  const [err, setErr] = useState(null);
  const [openGroup, setOpenGroup] = useState(null);

  useEffect(() => {
    setInst(null);
    setErr(null);
    fetchInstitucion(slug)
      .then(setInst)
      .catch((e) => setErr(e.response?.data?.error || e.message));
  }, [slug]);

  // Mantener abierto el grupo cuyo path matchea la URL actual.
  useEffect(() => {
    const sub = loc.pathname.replace(`/instituciones/${slug}/`, '').replace(`/instituciones/${slug}`, '');
    const groupActive = NAV.find((n) => n.type === 'group' && n.match && sub.startsWith(n.match));
    if (groupActive) setOpenGroup(groupActive.label);
  }, [loc.pathname, slug]);

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

        {NAV.map((n) => {
          if (n.type === 'group') {
            const isOpen = openGroup === n.label;
            const sub = loc.pathname.replace(`/instituciones/${slug}/`, '').replace(`/instituciones/${slug}`, '');
            const groupActive = n.match && sub.startsWith(n.match);
            return (
              <div key={n.label}>
                <div
                  className={'sidebar-link' + (groupActive ? ' active' : '')}
                  onClick={() => setOpenGroup(isOpen ? null : n.label)}
                  style={{ cursor: 'pointer' }}
                >
                  <span>{n.label}</span>
                  <span className="count" aria-hidden>{isOpen ? '▾' : '▸'}</span>
                </div>
                {isOpen && n.children.map((c) => (
                  <NavLink
                    key={c.to}
                    to={c.to}
                    end={c.end}
                    className={({ isActive }) =>
                      'sidebar-link sidebar-sublink' + (isActive ? ' active' : '')
                    }
                  >
                    <span className="ico">·</span>
                    <span>{c.label}</span>
                  </NavLink>
                ))}
              </div>
            );
          }
          return (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}
            >
              <span>{n.label}</span>
            </NavLink>
          );
        })}

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
