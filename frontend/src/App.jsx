import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
