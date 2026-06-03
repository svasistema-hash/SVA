// Sprint LexDocs Legal Fase 2 CP4 — Layout del módulo Legal (subdominio
// conceptual `legal.lexdocs.gt`; en sprint 1 vive bajo /legal/* del mismo
// dominio para acelerar despliegue).
//
// Sidebar específico del producto Legal, distinto del de Fase 1.
// Tratamiento formal "usted" en todo copy.

import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { fetchConteoEstadosSociedades } from '../api/legal';

export default function LegalLayout() {
  const nav = useNavigate();
  const loc = useLocation();
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  const [conteo, setConteo] = useState(null);

  const esMaster = user?.firma_id === 1;

  useEffect(() => {
    if (!user?.firma_id) return;
    fetchConteoEstadosSociedades().then(setConteo).catch(() => setConteo(null));
  }, [loc.pathname, user?.firma_id]);

  const total =
    conteo
      ? (conteo.en_curso || 0) +
        (conteo.revision_abogado || 0) +
        (conteo.correcciones_cliente || 0) +
        (conteo.listo_para_RM || 0) +
        (conteo.enviado_RM || 0)
      : null;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="tenant-brand">
          <div className="tipo">{esMaster ? 'Bufete Master' : 'Sub-tenant'}</div>
          <div className="nombre">LexDocs Legal</div>
          <div className="meta">Constitución de Sociedades</div>
        </div>

        <NavLink to="/legal" end className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}>
          <span>Resumen</span>
        </NavLink>

        <div className="sidebar-section">Mis sociedades</div>
        <NavLink to="/legal/sociedades/nueva" className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}>
          <span>Nueva sociedad</span>
        </NavLink>
        <NavLink to="/legal/sociedades" end className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}>
          <span>Bandeja</span>
          {total != null && total > 0 && <span className="count" style={{ color: 'var(--gold)' }}>{total}</span>}
        </NavLink>

        {esMaster && (
          <>
            <div className="sidebar-section">Master</div>
            <NavLink to="/legal/master" end className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}>
              <span>Vista global</span>
            </NavLink>
            <NavLink to="/legal/master/firmas" className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}>
              <span>Sub-tenants</span>
            </NavLink>
            <NavLink to="/legal/master/metricas" className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}>
              <span>Métricas</span>
            </NavLink>
          </>
        )}

        <div className="sidebar-section">Cuenta</div>
        <NavLink to="/legal/facturacion" className={({ isActive }) => 'sidebar-link' + (isActive ? ' active' : '')}>
          <span>Facturación</span>
        </NavLink>

        <div className="sidebar-back" onClick={() => { logout(); nav('/login'); }}>
          Cerrar sesión
        </div>
      </aside>
      <div className="app-main">
        <Outlet context={{ user, esMaster }} />
      </div>
    </div>
  );
}
