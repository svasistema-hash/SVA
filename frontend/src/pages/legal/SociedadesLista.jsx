// Lista de sociedades del sub-tenant — bandeja con filtros.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import { fetchSociedades, ESTADOS_SOCIEDAD, labelEstado } from '../../api/legal';

export default function SociedadesLista() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(params.get('q') || '');

  const estadoFiltro = params.get('estado') || '';

  useEffect(() => {
    setLoading(true);
    fetchSociedades({ estado: estadoFiltro, q })
      .then(setRows)
      .finally(() => setLoading(false));
  }, [estadoFiltro, q]);

  const titulo = estadoFiltro ? labelEstado(estadoFiltro) : 'Todas las sociedades';

  return (
    <>
      <Topbar
        title={titulo}
        crumbs={`${rows.length} resultados`}
        actions={
          <button className="btn btn-gold" onClick={() => nav('/legal/sociedades/nueva')}>
            Iniciar nueva sociedad
          </button>
        }
      />
      <div className="app-content">
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              className="input"
              style={{ flex: 1, minWidth: 220 }}
              placeholder="Buscar por denominación o correlativo"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <select
              className="input"
              style={{ width: 240 }}
              value={estadoFiltro}
              onChange={(e) => {
                const np = new URLSearchParams(params);
                if (e.target.value) np.set('estado', e.target.value); else np.delete('estado');
                setParams(np);
              }}
            >
              <option value="">Todos los estados</option>
              {ESTADOS_SOCIEDAD.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="empty"><span className="spinner" /></div>
        ) : rows.length === 0 ? (
          <div className="empty">No se encontraron sociedades con esos filtros.</div>
        ) : (
          <div className="card">
            <table className="table-light" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-dim)', fontSize: 11 }}>
                  <th style={{ paddingBottom: 6 }}>Correlativo</th>
                  <th>Denominación</th>
                  <th>Estado</th>
                  <th>Capital social</th>
                  <th>Creada</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id} onClick={() => nav(`/legal/sociedades/${s.id}`)} style={{ cursor: 'pointer', borderTop: '0.5px solid var(--border)' }}>
                    <td style={{ padding: '8px 0' }}>{s.correlativo}</td>
                    <td>{s.denominacion}</td>
                    <td><span className="badge">{labelEstado(s.estado)}</span></td>
                    <td>{s.moneda || 'GTQ'} {Number(s.capital_social).toLocaleString('es', { minimumFractionDigits: 2 })}</td>
                    <td className="muted" style={{ fontSize: 11 }}>{s.created_at?.slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
