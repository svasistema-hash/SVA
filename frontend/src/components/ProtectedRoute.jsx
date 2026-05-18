import { Navigate, useLocation } from 'react-router-dom';
import { useStore } from '../store/useStore';

export default function ProtectedRoute({ children }) {
  const token = useStore((s) => s.token);
  const loc = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return children;
}
