import { Link } from 'react-router-dom';

export default function Breadcrumb({ segments }) {
  return (
    <nav className="crumbs">
      {segments.map((s, i) => (
        <span key={i}>
          {i > 0 && <span className="sep">›</span>}
          {s.to ? (
            <Link to={s.to}>{s.label}</Link>
          ) : (
            <span className="current">{s.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
