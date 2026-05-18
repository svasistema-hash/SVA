import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { fetchInstituciones } from '../api/instituciones';

const TIPOS = [
  { key: 'banco', label: 'Bancos' },
  { key: 'financiera', label: 'Financieras' },
  { key: 'desarrolladora', label: 'Desarrolladoras' },
  { key: 'prestamista', label: 'Prestamistas' },
];

export default function Sidebar() {
  const [insts, setInsts] = useState([]);
  const [openTipo, setOpenTipo] = useState('banco');
  const loc = useLocation();

  useEffect(() => {
    fetchInstituciones().then(setInsts).catch(() => setInsts([]));
  }, []);

  const grouped = TIPOS.map((t) => ({
    ...t,
    items: insts.filter((i) => i.tipo === t.key),
  }));

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="name">LexDocs<small>Guatemala</small></div>
      </div>

      <NavLink to="/" end className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}>
        <span>Dashboard</span>
      </NavLink>
      <NavLink to="/contratos" className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}>
        <span>Contratos</span>
      </NavLink>
      <NavLink to="/instituciones" className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}>
        <span>Instituciones</span>
        <span className="count">{insts.length}</span>
      </NavLink>

      <div className="sidebar-section">Módulos</div>
      {grouped.map((g) => (
        <div key={g.key}>
          <div
            className={'sidebar-link' + (openTipo === g.key ? ' active' : '')}
            onClick={() => setOpenTipo(openTipo === g.key ? null : g.key)}
          >
            <span>{g.label}</span>
            <span className="count">{g.items.length}</span>
          </div>
          {openTipo === g.key &&
            g.items.map((i) => (
              <NavLink
                key={i.id}
                to={`/instituciones/${i.slug}`}
                className={
                  'sidebar-link sidebar-sublink' +
                  (loc.pathname.startsWith(`/instituciones/${i.slug}`) ? ' active' : '')
                }
              >
                <span className="ico">·</span>
                <span>{i.nombre}</span>
              </NavLink>
            ))}
        </div>
      ))}
    </aside>
  );
}
