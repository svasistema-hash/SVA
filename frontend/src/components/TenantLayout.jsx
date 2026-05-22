import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';
import { fetchInstitucion } from '../api/instituciones';
import { fetchConteoEstados } from '../api/contratos';

// NAV: links simples + grupos expandibles (Clientes, Solicitudes con contadores).
const NAV = [
  { type: 'link', to: '', end: true, label: 'Dashboard' },
  {
    type: 'group',
    label: 'Clientes',
    match: 'clientes',
    children: [
      { to: 'clientes', end: true, label: 'Todos' },
      { to: 'clientes/individuales', label: 'Individuales' },
      { to: 'clientes/juridicos', label: 'Jurídicos' },
    ],
  },
  {
    type: 'group',
    label: 'Solicitudes',
    // Sprint garantías-desacopladas CP4-A — match a 'solicitudes' (antes 'financiera').
    // Array para que el sub-item "contratos" también active el grupo.
    match: ['solicitudes', 'contratos'],
    counterKey: 'total_solicitudes', // suma de en_curso + revision_tenant + revision_abogados
    children: [
      { to: 'solicitudes', end: true, label: 'Resumen' },
      { to: 'solicitudes/nueva', label: 'Nueva solicitud' },
      { to: 'solicitudes/en-curso', label: 'En curso',     counterKey: 'en_curso' },
      { to: 'solicitudes/en-revision', label: 'En revisión', counterKey: 'revision_tenant' },
      { to: 'solicitudes/con-bufete', label: 'Con bufete',  counterKey: 'revision_abogados' },
      { to: 'solicitudes/completadas', label: 'Completadas', counterKey: 'completado' },
      // Reubicado desde un link top-level "Contratos" — vivía duplicado con el
      // grupo Solicitudes (CP4-A unificación). La página da búsqueda por estado/
      // modelo/fecha/texto, útil cuando se quiere ver TODO en un solo lugar.
      { to: 'contratos', label: 'Todas / Buscar' },
    ],
  },
  { type: 'link', to: 'modelos', label: 'Modelos' },
  { type: 'link', to: 'configuracion', label: 'Institución' },
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
  const [conteo, setConteo] = useState(null);

  useEffect(() => {
    setInst(null);
    setErr(null);
    setConteo(null);
    fetchInstitucion(slug)
      .then(setInst)
      .catch((e) => setErr(e.response?.data?.error || e.message));
  }, [slug]);

  // Refresca conteos en cada cambio de ruta (no es polling, solo on-nav) para que
  // el sidebar quede sincronizado tras acciones como "marcar como listo" o "anular".
  useEffect(() => {
    if (!slug) return;
    fetchConteoEstados(slug).then(setConteo).catch(() => setConteo(null));
  }, [slug, loc.pathname]);

  const totalSolicitudes = conteo
    ? (conteo.en_curso || 0) + (conteo.revision_tenant || 0) + (conteo.revision_abogados || 0)
    : null;
  const contadorValor = (key) => {
    if (!conteo) return null;
    if (key === 'total_solicitudes') return totalSolicitudes;
    return conteo[key] || 0;
  };

  // Mantener abierto el grupo cuyo path matchea la URL actual.
  // match puede ser string o array de strings (cualquier prefix coincide).
  const matchesGroup = (match, sub) => {
    if (!match) return false;
    const arr = Array.isArray(match) ? match : [match];
    return arr.some((m) => sub.startsWith(m));
  };
  useEffect(() => {
    const sub = loc.pathname.replace(`/instituciones/${slug}/`, '').replace(`/instituciones/${slug}`, '');
    const groupActive = NAV.find((n) => n.type === 'group' && matchesGroup(n.match, sub));
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
            const groupActive = matchesGroup(n.match, sub);
            const groupCounter = n.counterKey ? contadorValor(n.counterKey) : null;
            return (
              <div key={n.label}>
                <div
                  className={'sidebar-link' + (groupActive ? ' active' : '')}
                  onClick={() => setOpenGroup(isOpen ? null : n.label)}
                  style={{ cursor: 'pointer' }}
                >
                  <span>{n.label}</span>
                  <span className="count" aria-hidden>
                    {groupCounter != null && groupCounter > 0 && (
                      <span style={{ marginRight: 6, color: 'var(--gold)' }}>{groupCounter}</span>
                    )}
                    {isOpen ? '▾' : '▸'}
                  </span>
                </div>
                {isOpen && n.children.map((c) => {
                  const subCounter = c.counterKey ? contadorValor(c.counterKey) : null;
                  return (
                    <NavLink
                      key={c.to}
                      to={c.to}
                      end={c.end}
                      className={({ isActive }) =>
                        'sidebar-link sidebar-sublink' + (isActive ? ' active' : '')
                      }
                    >
                      <span className="ico">·</span>
                      <span style={{ flex: 1 }}>{c.label}</span>
                      {subCounter != null && subCounter > 0 && (
                        <span className="count" style={{ fontSize: 11 }}>{subCounter}</span>
                      )}
                    </NavLink>
                  );
                })}
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
