import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import TenantLayout from './components/TenantLayout';
import Login from './pages/Login';
import SolicitudPublica from './pages/SolicitudPublica';
import Dashboard from './pages/Dashboard';
import Instituciones from './pages/Instituciones';
import Contratos from './pages/Contratos';
// Sprint garantías-desacopladas CP4-A: Contrato.jsx (vista vieja con preview)
// ya no se monta como ruta — toda entrada al detalle pasa por SolicitudDetalle.
// El archivo se conserva por ahora para incorporar el preview/PDF en CP4-A.5.
import Pendientes from './pages/bufete/Pendientes';
import PendienteDetalle from './pages/bufete/PendienteDetalle';
import VersionFooter from './components/VersionFooter';

import TenantDashboard from './pages/tenant/Dashboard';
import TenantClientes from './pages/tenant/Clientes';
import TenantCliente from './pages/tenant/Cliente';
import TenantClienteNuevo from './pages/tenant/ClienteNuevo';
import ClienteJuridicoNuevo from './pages/tenant/ClienteJuridicoNuevo';
import ClienteJuridicoDetalle from './pages/tenant/ClienteJuridicoDetalle';
import TenantContratos from './pages/tenant/Contratos';
import TenantModelos from './pages/tenant/Modelos';
import TenantModeloEdit from './pages/tenant/ModeloEdit';
import TenantConfiguracion from './pages/tenant/Configuracion';
import TenantReportes from './pages/tenant/Reportes';
// Sprint garantías-desacopladas CP4-A — rename del módulo "Financiera" a "Solicitudes".
// "Financiera" sobrevive solo como TIPO de institución, no como nombre de módulo.
import TenantSolicitudes from './pages/tenant/Solicitudes';
import SolicitudNueva from './pages/tenant/SolicitudNueva';
import SolicitudesLista from './pages/tenant/SolicitudesLista';
import SolicitudDetalle from './pages/tenant/SolicitudDetalle';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/solicitud/:token" element={<SolicitudPublica />} />

        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/instituciones" element={<Instituciones />} />
          <Route path="/contratos" element={<Contratos />} />
          {/* Sprint garantías-desacopladas CP4-A: vista unificada del contrato.
              El /contratos/:id global redirige al detalle dentro de la
              institución correspondiente: /instituciones/:slug/solicitudes/:id.
              Eso resuelve la duplicación de componentes (antes: Contrato.jsx
              + FinancieraDetalle.jsx). */}
          <Route path="/contratos/:id" element={<RedirectContratoGlobal />} />
          {/* F1 C5: panel del bufete */}
          <Route path="/pendientes" element={<Pendientes />} />
          <Route path="/pendientes/:id" element={<PendienteDetalle />} />
        </Route>

        <Route
          path="/instituciones/:slug"
          element={<ProtectedRoute><TenantLayout /></ProtectedRoute>}
        >
          <Route index element={<TenantDashboard />} />
          <Route path="clientes" element={<TenantClientes />} />
          <Route path="clientes/individuales" element={<TenantClientes />} />
          <Route path="clientes/individuales/nuevo" element={<TenantClienteNuevo />} />
          <Route path="clientes/individuales/:id" element={<TenantCliente />} />
          {/* Legacy: paths sin /individuales/ siguen funcionando para compat con código existente. */}
          <Route path="clientes/nuevo" element={<TenantClienteNuevo />} />
          <Route path="clientes/:id" element={<TenantCliente />} />
          <Route path="clientes/juridicos" element={<TenantClientes />} />
          <Route path="clientes/juridicos/nuevo" element={<ClienteJuridicoNuevo />} />
          <Route path="clientes/juridicos/:id" element={<ClienteJuridicoDetalle />} />
          <Route path="clientes/juridicos/:id/editar" element={<ClienteJuridicoNuevo />} />
          <Route path="contratos" element={<TenantContratos />} />
          {/* Sprint garantías-desacopladas CP4-A:
              - Wizard legacy redirige al flujo nuevo "Solicitudes" (antes "Financiera").
              - /contratos/:id (vista vieja con preview PDF) se unifica con /solicitudes/:id.
                Toda entrada al detalle de un contrato pasa por SolicitudDetalle ahora.
          */}
          <Route path="contratos/nuevo" element={<RedirectToSolicitudNueva />} />
          <Route path="contratos/:id/editar" element={<RedirectToSolicitudDetalle />} />
          <Route path="contratos/:id" element={<RedirectToSolicitudDetalle />} />
          <Route path="modelos" element={<TenantModelos />} />
          <Route path="modelos/:id" element={<TenantModeloEdit />} />
          <Route path="configuracion" element={<TenantConfiguracion />} />
          <Route path="reportes" element={<TenantReportes />} />
          {/* Sprint garantías-desacopladas CP4-A — Módulo "Solicitudes"
              (antes "Financiera"). El segmento de módulo cambia; el TIPO de
              institución 'financiera' sigue intacto, y los slugs (banco-rsg,
              financiera-del-sur, etc.) también. */}
          <Route path="solicitudes" element={<TenantSolicitudes />} />
          <Route path="solicitudes/nueva" element={<SolicitudNueva />} />
          <Route path="solicitudes/en-curso" element={<SolicitudesLista />} />
          <Route path="solicitudes/en-revision" element={<SolicitudesLista />} />
          <Route path="solicitudes/con-bufete" element={<SolicitudesLista />} />
          <Route path="solicitudes/completadas" element={<SolicitudesLista />} />
          <Route path="solicitudes/:id" element={<SolicitudDetalle />} />
          {/* Redirects permanentes /financiera/* → /solicitudes/* para no romper
              links guardados, bookmarks ni código externo que apunte al path viejo. */}
          <Route path="financiera" element={<Navigate to="../solicitudes" replace />} />
          <Route path="financiera/nueva" element={<Navigate to="../solicitudes/nueva" replace />} />
          <Route path="financiera/en-curso" element={<Navigate to="../solicitudes/en-curso" replace />} />
          <Route path="financiera/en-revision" element={<Navigate to="../solicitudes/en-revision" replace />} />
          <Route path="financiera/con-bufete" element={<Navigate to="../solicitudes/con-bufete" replace />} />
          <Route path="financiera/completadas" element={<Navigate to="../solicitudes/completadas" replace />} />
          <Route path="financiera/:id" element={<RedirectFinancieraId />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
      <VersionFooter />
    </BrowserRouter>
  );
}

// Redirects del Wizard legacy al flujo nuevo "Solicitudes" (antes "Financiera").
// Permanecen para que links guardados, bookmarks o cualquier código externo
// que apunte al path viejo no se rompa.
function RedirectToSolicitudNueva() {
  const { slug } = useParams();
  return <Navigate to={`/instituciones/${slug}/solicitudes/nueva`} replace />;
}

function RedirectToSolicitudDetalle() {
  const { slug, id } = useParams();
  return <Navigate to={`/instituciones/${slug}/solicitudes/${id}`} replace />;
}

// Redirect /instituciones/:slug/financiera/:id → /instituciones/:slug/solicitudes/:id
function RedirectFinancieraId() {
  const { slug, id } = useParams();
  return <Navigate to={`/instituciones/${slug}/solicitudes/${id}`} replace />;
}

// Redirect /contratos/:id (vista admin/bufete global) → vista tenant unificada.
// Necesita resolver el slug del contrato; lo fetcheamos y redirigimos.
function RedirectContratoGlobal() {
  const { id } = useParams();
  const [target, setTarget] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    import('./api/contratos').then(({ fetchContrato }) => fetchContrato(id))
      .then((c) => setTarget(`/instituciones/${c.institucion_slug}/solicitudes/${id}`))
      .catch((e) => setError(e.response?.data?.error || e.message));
  }, [id]);
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>Contrato no encontrado: {error}</div>;
  if (!target) return <div style={{ padding: 40, textAlign: 'center' }}><span className="spinner" /></div>;
  return <Navigate to={target} replace />;
}

// F1 hotfix P6: catch-all visible en lugar de redirect silencioso al dashboard.
// El comportamiento anterior (<Navigate to="/" replace />) hacía que cualquier
// ruta no matcheada (incluyendo bundles cacheados sin las rutas nuevas) tirara
// al usuario al dashboard sin explicación. Ahora muestra qué pasó.
function NotFound() {
  const loc = useLocation();
  const nav = useNavigate();
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg, #f8f5ec)', padding: 24, fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontSize: 48, fontWeight: 200, color: 'var(--gold, #a07d2e)', marginBottom: 16 }}>404</div>
        <h2 style={{ fontWeight: 500, fontSize: 22, marginBottom: 12 }}>Página no encontrada</h2>
        <p style={{ color: 'var(--text-dim, #6b6452)', lineHeight: 1.6, marginBottom: 8 }}>
          La ruta <code style={{ background: '#faf9f4', padding: '2px 6px', borderRadius: 3, fontSize: 13 }}>{loc.pathname}</code> no existe.
        </p>
        <p style={{ color: 'var(--text-dim, #6b6452)', lineHeight: 1.6, fontSize: 13, marginBottom: 24 }}>
          Si llegaste aquí desde un link interno, tu navegador puede tener una versión vieja en caché.
          Hacé <strong>Ctrl + Shift + R</strong> (Windows/Linux) o <strong>Cmd + Shift + R</strong> (Mac) para forzar recarga.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={() => nav(-1)} style={{ padding: '8px 16px', background: 'transparent', border: '0.5px solid var(--border, #e7ddc4)', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit' }}>Atrás</button>
          <button onClick={() => nav('/')} style={{ padding: '8px 16px', background: 'var(--gold, #a07d2e)', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit' }}>Ir al dashboard</button>
        </div>
      </div>
    </div>
  );
}
