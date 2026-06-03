// Dashboard del módulo Legal — sub-tenant ve resumen de su firma.
// Master ve un acceso directo a la Vista global.

import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import { fetchConteoEstadosSociedades, fetchSociedades, ESTADOS_SOCIEDAD, labelEstado } from '../../api/legal';

const ETAPAS_PRINCIPALES = [
  { key: 'en_curso', label: 'En curso del cliente', hint: 'El cliente está completando los datos.' },
  { key: 'revision_abogado', label: 'En revisión', hint: 'Pendiente de su revisión profesional.' },
  { key: 'correcciones_cliente', label: 'Correcciones', hint: 'El cliente está aplicando las correcciones solicitadas.' },
  { key: 'listo_para_RM', label: 'Listas para protocolización', hint: 'Esperan firma notarial.' },
];

export default function LegalDashboard() {
  const { user, esMaster } = useOutletContext() || {};
  const nav = useNavigate();
  const [conteo, setConteo] = useState(null);
  const [recientes, setRecientes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchConteoEstadosSociedades().catch(() => null),
      fetchSociedades({}).catch(() => []),
    ]).then(([c, lst]) => {
      setConteo(c);
      setRecientes(lst.slice(0, 5));
    }).finally(() => setLoading(false));
  }, []);

  return (
    <>
      <Topbar
        title="LexDocs Legal"
        crumbs={esMaster ? 'Bufete master' : 'Sub-tenant'}
        actions={
          <button className="btn btn-gold" onClick={() => nav('/legal/sociedades/nueva')}>
            Iniciar nueva sociedad
          </button>
        }
      />
      <div className="app-content">
        <p style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 0, marginBottom: 18 }}>
          Bienvenido, {user?.nombre || user?.email}. Desde este panel puede iniciar una nueva constitución de Sociedad Anónima,
          revisar las que están en proceso y consultar el detalle de cada caso.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 22 }}>
          {ETAPAS_PRINCIPALES.map((e) => (
            <div key={e.key} className="card" style={{ cursor: 'pointer' }} onClick={() => nav(`/legal/sociedades?estado=${e.key}`)}>
              <div className="muted" style={{ fontSize: 11 }}>{e.hint}</div>
              <div style={{ fontSize: 28, fontWeight: 500, marginTop: 4, color: 'var(--gold)' }}>
                {conteo?.[e.key] ?? '—'}
              </div>
              <div style={{ fontSize: 13 }}>{e.label}</div>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Últimas sociedades</h3>
            <button className="btn btn-ghost" onClick={() => nav('/legal/sociedades')}>Ver todas →</button>
          </div>
          {loading ? <div className="empty"><span className="spinner" /></div>
            : recientes.length === 0 ? (
            <div className="empty">
              Aún no hay sociedades registradas.<br />
              <button className="btn btn-gold" style={{ marginTop: 12 }} onClick={() => nav('/legal/sociedades/nueva')}>
                Iniciar la primera
              </button>
            </div>
          ) : (
            <table className="table-light" style={{ width: '100%', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-dim)', fontSize: 11 }}>
                  <th style={{ paddingBottom: 6 }}>Correlativo</th>
                  <th>Denominación</th>
                  <th>Estado</th>
                  <th>Capital</th>
                </tr>
              </thead>
              <tbody>
                {recientes.map((s) => (
                  <tr key={s.id} onClick={() => nav(`/legal/sociedades/${s.id}`)} style={{ cursor: 'pointer', borderTop: '0.5px solid var(--border)' }}>
                    <td style={{ padding: '8px 0' }}>{s.correlativo}</td>
                    <td>{s.denominacion}</td>
                    <td><span className="badge">{labelEstado(s.estado)}</span></td>
                    <td>{s.moneda || 'GTQ'} {Number(s.capital_social).toLocaleString('es', { minimumFractionDigits: 2 })}</td>
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
