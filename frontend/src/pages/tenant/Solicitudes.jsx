// Dashboard del módulo Solicitudes (Sprint garantías-desacopladas CP4-A
// rename del antiguo módulo "Financiera" — el flujo F1 conserva su lógica
// intacta, solo cambia la etiqueta/ruta visibles).
// Vista principal del usuario banco con contadores por estado, últimas solicitudes,
// botón "Nueva solicitud".

import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import { fetchContratos, fetchConteoEstados } from '../../api/contratos';

const CARDS = [
  { key: 'en_curso',          label: 'En curso',     ruta: 'en-curso',     hint: 'Cliente completando datos' },
  { key: 'revision_tenant',   label: 'En revisión',  ruta: 'en-revision',  hint: 'Pendiente de su revisión' },
  { key: 'revision_abogados', label: 'Con bufete',   ruta: 'con-bufete',   hint: 'Bufete preparando escritura' },
  { key: 'completado',        label: 'Completadas',  ruta: 'completadas',  hint: 'Contratos firmados' },
];

export default function TenantSolicitudes() {
  const { inst } = useOutletContext() || {};
  const nav = useNavigate();
  const [conteo, setConteo] = useState(null);
  const [recientes, setRecientes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!inst) return;
    setLoading(true);
    Promise.all([
      fetchConteoEstados(inst.slug).catch(() => null),
      fetchContratos({ institucion: inst.slug }).catch(() => []),
    ])
      .then(([c, ctr]) => {
        setConteo(c);
        setRecientes(ctr.slice(0, 5));
      })
      .finally(() => setLoading(false));
  }, [inst?.id]);

  if (!inst) return <><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>;

  return (
    <>
      <Topbar
        title={`${inst.nombre} — Resumen`}
        crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Solicitudes')} />}
        actions={<button className="btn btn-gold" onClick={() => nav('nueva')}>Nueva solicitud</button>}
      />
      <div className="app-content">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 22 }}>
          {CARDS.map((c) => (
            <button
              key={c.key}
              onClick={() => nav(c.ruta)}
              style={{
                background: '#fff', border: '0.5px solid var(--border)', borderRadius: 6,
                padding: '20px 18px', textAlign: 'left', cursor: 'pointer',
                fontFamily: 'inherit', color: 'inherit', transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--gold)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>{c.label}</div>
              <div style={{ fontSize: 28, fontWeight: 500, marginBottom: 4 }}>{conteo ? (conteo[c.key] || 0) : '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{c.hint}</div>
            </button>
          ))}
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Solicitudes recientes</h3>
            <button className="btn btn-ghost" onClick={() => nav('en-curso')}>Ver todas →</button>
          </div>
          {loading ? (
            <div className="empty"><span className="spinner" /></div>
          ) : recientes.length === 0 ? (
            <div className="empty">
              Aún no ha creado solicitudes.<br />
              <button className="btn btn-gold" style={{ marginTop: 12 }} onClick={() => nav('nueva')}>Crear la primera</button>
            </div>
          ) : (
            <table className="tbl">
              <thead><tr><th>No.</th><th>Cliente</th><th>Modelo</th><th>Estado</th><th>Actualizado</th></tr></thead>
              <tbody>
                {recientes.map((c) => (
                  <tr key={c.id} onClick={() => nav(`${c.id}`)} style={{ cursor: 'pointer' }}>
                    <td><code>{c.no_contrato}</code></td>
                    <td>{c.datos_cliente?.nombre || <span className="muted">—</span>}</td>
                    <td>{c.modelo_nombre}</td>
                    <td><EstadoBadge estado={c.estado} /></td>
                    <td className="muted">{formatRelative(c.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

export function EstadoBadge({ estado }) {
  const map = {
    en_curso: { bg: '#fff8e6', color: '#a07d2e', label: 'En curso' },
    revision_tenant: { bg: '#e6f0fd', color: '#1e4e8c', label: 'En revisión' },
    revision_abogados: { bg: '#f0e6fd', color: '#5a2e8c', label: 'Con bufete' },
    completado: { bg: '#e6f7ed', color: '#2d6a4f', label: 'Completado' },
    abandonada_sin_inicio: { bg: '#f5f5f5', color: '#666', label: 'Abandonado' },
    abandonada_incompleta: { bg: '#f5f5f5', color: '#666', label: 'Abandonado' },
    anulada: { bg: '#fce8e8', color: '#a52a2a', label: 'Anulado' },
  };
  const s = map[estado] || { bg: '#f5f5f5', color: '#666', label: estado };
  return (
    <span style={{
      display: 'inline-block', padding: '3px 10px', borderRadius: 999,
      background: s.bg, color: s.color, fontSize: 11, fontWeight: 500, letterSpacing: '0.02em',
    }}>
      {s.label}
    </span>
  );
}

export function formatRelative(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'hace segundos';
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 30) return `hace ${Math.floor(diff / 86400)} d`;
  return d.toLocaleDateString('es-GT');
}
