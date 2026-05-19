// Sidebar del bufete (vista admin LexDocs).
// Header minimalista: "SVA".
// Item "Pendientes (N)" con contador en vivo desde /api/pendientes/conteo.

import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { fetchInstituciones } from '../api/instituciones';
import { fetchPendientesConteo } from '../api/pendientes';
import { useStore } from '../store/useStore';

const TIPOS = [
  { key: 'banco', label: 'Bancos' },
  { key: 'financiera', label: 'Financieras' },
  { key: 'desarrolladora', label: 'Desarrolladoras' },
  { key: 'prestamista', label: 'Prestamistas' },
];

export default function Sidebar() {
  const [insts, setInsts] = useState([]);
  const [openTipo, setOpenTipo] = useState('banco');
  const [conteoPendientes, setConteoPendientes] = useState(null);
  const loc = useLocation();
  const user = useStore((s) => s.user);
  const esBufete = user?.role === 'admin' && !user?.institucion_id;

  useEffect(() => {
    fetchInstituciones().then(setInsts).catch(() => setInsts([]));
  }, []);

  // Refresca contador on-nav (solo si es bufete).
  useEffect(() => {
    if (!esBufete) return;
    fetchPendientesConteo().then(setConteoPendientes).catch(() => setConteoPendientes(null));
  }, [esBufete, loc.pathname]);

  const grouped = TIPOS.map((t) => ({ ...t, items: insts.filter((i) => i.tipo === t.key) }));

  return (
    <aside className="sidebar">
      <div className="sidebar-brand" style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
        <div className="name" style={{ fontSize: 22, letterSpacing: '0.18em', fontWeight: 400 }}>SVA</div>
      </div>

      {esBufete && (
        <NavLink to="/pendientes" className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}>
          <span>Pendientes</span>
          {conteoPendientes?.n > 0 && (
            <span className="count" style={{ background: 'var(--gold)', color: '#fff', padding: '1px 8px', borderRadius: 999, fontSize: 11 }}>{conteoPendientes.n}</span>
          )}
        </NavLink>
      )}

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

      <div className="sidebar-section" style={{ marginTop: 'auto', paddingTop: 16, fontSize: 10, color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
        Plataforma LexDocs
      </div>
    </aside>
  );
}
