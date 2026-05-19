// F1 C4 — Lista de solicitudes filtrada por estado.
//
// Una sola página, varios filtros por route:
//   en-curso       → en_curso
//   en-revision    → revision_tenant
//   con-bufete     → revision_abogados
//   completadas    → completado

import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useLocation } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import { fetchContratos } from '../../api/contratos';
import { EstadoBadge, formatRelative } from './Financiera';

const FILTRO_POR_RUTA = {
  'en-curso':       { estado: 'en_curso',          titulo: 'En curso',     descripcion: 'Cliente completando el formulario' },
  'en-revision':    { estado: 'revision_tenant',   titulo: 'En revisión',  descripcion: 'Solicitudes listas para que el banco revise y complete los datos del préstamo' },
  'con-bufete':     { estado: 'revision_abogados', titulo: 'Con bufete',   descripcion: 'Bufete preparando la escritura final' },
  'completadas':    { estado: 'completado',        titulo: 'Completadas',  descripcion: 'Contratos firmados' },
};

export default function FinancieraLista() {
  const { inst } = useOutletContext() || {};
  const nav = useNavigate();
  const loc = useLocation();
  const ruta = loc.pathname.split('/').pop();
  const filtro = FILTRO_POR_RUTA[ruta] || FILTRO_POR_RUTA['en-curso'];
  const [contratos, setContratos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!inst) return;
    setLoading(true);
    fetchContratos({ institucion: inst.slug, estado: filtro.estado })
      .then(setContratos)
      .catch(() => setContratos([]))
      .finally(() => setLoading(false));
  }, [inst?.id, filtro.estado]);

  if (!inst) return <Topbar title="Cargando…" />;

  const filtradas = q.trim()
    ? contratos.filter((c) => {
        const t = q.toLowerCase();
        return (
          c.no_contrato?.toLowerCase().includes(t) ||
          c.datos_cliente?.nombre?.toLowerCase().includes(t) ||
          c.modelo_nombre?.toLowerCase().includes(t)
        );
      })
    : contratos;

  return (
    <>
      <Topbar
        title={filtro.titulo}
        crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Financiera', filtro.titulo)} />}
        actions={ruta === 'en-curso' && <button className="btn btn-gold" onClick={() => nav('../nueva')}>Nueva solicitud</button>}
      />
      <div className="app-content">
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', marginBottom: 14 }}>{filtro.descripcion}</div>

        <input
          className="input"
          placeholder="Filtrar por número, cliente o modelo…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ maxWidth: 360, marginBottom: 14 }}
        />

        <div className="card" style={{ padding: 0 }}>
          {loading ? (
            <div className="empty"><span className="spinner" /></div>
          ) : filtradas.length === 0 ? (
            <div className="empty" style={{ padding: 40 }}>
              {q.trim() ? 'Ningún resultado coincide con su búsqueda.' : 'No hay solicitudes en este estado.'}
            </div>
          ) : (
            <table className="tbl">
              <thead><tr><th>No.</th><th>Cliente</th><th>Modelo</th><th>Monto</th><th>Días</th><th>Estado</th><th>Actualizado</th></tr></thead>
              <tbody>
                {filtradas.map((c) => (
                  <tr key={c.id} onClick={() => nav(`../${c.id}`)} style={{ cursor: 'pointer' }}>
                    <td><code>{c.no_contrato}</code></td>
                    <td>{c.datos_cliente?.nombre || <span className="muted">—</span>}</td>
                    <td>{c.modelo_nombre}</td>
                    <td>{c.datos_credito?.moneda || 'Q'} {c.datos_credito?.monto || '—'}</td>
                    <td>{diasDesde(c.created_at)}</td>
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

function diasDesde(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const dias = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  return dias;
}
