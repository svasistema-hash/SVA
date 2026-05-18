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
import TenantContratos from './pages/tenant/Contratos';
import TenantModelos from './pages/tenant/Modelos';
import TenantModeloEdit from './pages/tenant/ModeloEdit';
import TenantConfiguracion from './pages/tenant/Configuracion';
import TenantSolicitudes from './pages/tenant/Solicitudes';
import TenantReportes from './pages/tenant/Reportes';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/solicitud/:slug" element={<SolicitudPublica />} />

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
          <Route path="clientes/nuevo" element={<TenantClienteNuevo />} />
          <Route path="clientes/:id" element={<TenantCliente />} />
          <Route path="contratos" element={<TenantContratos />} />
          <Route path="contratos/nuevo" element={<Wizard />} />
          <Route path="contratos/:id/editar" element={<Wizard />} />
          <Route path="contratos/:id" element={<Contrato />} />
          <Route path="modelos" element={<TenantModelos />} />
          <Route path="modelos/:id" element={<TenantModeloEdit />} />
          <Route path="configuracion" element={<TenantConfiguracion />} />
          <Route path="solicitudes" element={<TenantSolicitudes />} />
          <Route path="reportes" element={<TenantReportes />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
