import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/useStore';

export default function Topbar({ title, crumbs, actions }) {
  const nav = useNavigate();
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);

  const initial = (user?.nombre || user?.email || 'U').charAt(0).toUpperCase();

  return (
    <header className="topbar">
      <div>
        <h1>{title}</h1>
        {crumbs && <div className="crumbs">{crumbs}</div>}
      </div>
      <div className="topbar-actions">
        {actions}
        <div className="topbar-user">
          <div className="avatar">{initial}</div>
          <span>{user?.email || 'invitado'}</span>
        </div>
        <button
          className="btn-ghost btn"
          onClick={() => {
            logout();
            nav('/login');
          }}
        >
          Salir
        </button>
      </div>
    </header>
  );
}
