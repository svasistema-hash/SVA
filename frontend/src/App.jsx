import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AppLayout from './components/AppLayout';
import TenantLayout from './components/TenantLayout';
import Login from './pages/Login';
import SolicitudPublica from './pages/SolicitudPublica';
import Dashboard from './pages/Dashboard';
import Instituciones from './pages/Instituciones';
import Contratos from './pages/Contratos';
import Contrato from './pages/Contrato';
import Wizard from './pages/Wizard';
import Pendientes from './pages/bufete/Pendientes';
import PendienteDetalle from './pages/bufete/PendienteDetalle';

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
import TenantSolicitudes from './pages/tenant/Solicitudes';
import TenantReportes from './pages/tenant/Reportes';
import Financiera from './pages/tenant/Financiera';
import FinancieraNueva from './pages/tenant/FinancieraNueva';
import FinancieraLista from './pages/tenant/FinancieraLista';
import FinancieraDetalle from './pages/tenant/FinancieraDetalle';

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
          <Route path="/contratos/:id" element={<Contrato />} />
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
          <Route path="contratos/nuevo" element={<Wizard />} />
          <Route path="contratos/:id/editar" element={<Wizard />} />
          <Route path="contratos/:id" element={<Contrato />} />
          <Route path="modelos" element={<TenantModelos />} />
          <Route path="modelos/:id" element={<TenantModeloEdit />} />
          <Route path="configuracion" element={<TenantConfiguracion />} />
          <Route path="solicitudes" element={<TenantSolicitudes />} />
          <Route path="reportes" element={<TenantReportes />} />
          {/* F1 C4: módulo Financiera */}
          <Route path="financiera" element={<Financiera />} />
          <Route path="financiera/nueva" element={<FinancieraNueva />} />
          <Route path="financiera/en-curso" element={<FinancieraLista />} />
          <Route path="financiera/en-revision" element={<FinancieraLista />} />
          <Route path="financiera/con-bufete" element={<FinancieraLista />} />
          <Route path="financiera/completadas" element={<FinancieraLista />} />
          <Route path="financiera/:id" element={<FinancieraDetalle />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
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
