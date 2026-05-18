import { useState } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { login } from '../api/contratos';

export default function Login() {
  const nav = useNavigate();
  const loc = useLocation();
  const token = useStore((s) => s.token);
  const setAuth = useStore((s) => s.setAuth);

  const [email, setEmail] = useState('admin@lexdocs.gt');
  const [password, setPassword] = useState('lexdocs2026');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (token) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { token, user } = await login(email, password);
      setAuth(user, token);
      const to = loc.state?.from || '/';
      nav(to, { replace: true });
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={onSubmit}>
        <div className="brand">LexDocs<small>Generador legal · Guatemala</small></div>

        {error && <div className="error">{error}</div>}

        <div className="field">
          <label htmlFor="email">Correo electrónico</label>
          <input
            id="email"
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
          />
        </div>
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <input
            id="password"
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button className="btn btn-gold" style={{ width: '100%', justifyContent: 'center' }} disabled={loading}>
          {loading ? <span className="spinner" /> : 'Ingresar'}
        </button>
        <div className="login-hint">Credenciales de prueba precargadas</div>
      </form>
    </div>
  );
}
