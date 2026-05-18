import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import InstCard from '../components/InstCard';
import { fetchInstituciones } from '../api/instituciones';
import { fetchContratos } from '../api/contratos';

export default function Dashboard() {
  const nav = useNavigate();
  const [insts, setInsts] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([fetchInstituciones(), fetchContratos()])
      .then(([i, c]) => {
        setInsts(i);
        setContratos(c);
      })
      .catch((err) => setError(err.response?.data?.error || err.message))
      .finally(() => setLoading(false));
  }, []);

  const stats = {
    instituciones: insts.length,
    contratos: contratos.length,
    borradores: contratos.filter((c) => c.estado === 'borrador').length,
    firmados: contratos.filter((c) => c.estado === 'firmado').length,
  };
  const recientes = contratos.slice(0, 6);

  return (
    <>
      <Topbar title="Dashboard" crumbs="Resumen general" />
      <div className="app-content">
        {error && <div className="card" style={{ background: '#fbeae8', color: '#b54034' }}>{error}</div>}

        <div className="grid-stats">
          <div className="stat"><div className="label">Instituciones</div><div className="value">{stats.instituciones}</div></div>
          <div className="stat"><div className="label">Contratos totales</div><div className="value">{stats.contratos}</div></div>
          <div className="stat"><div className="label">Borradores</div><div className="value">{stats.borradores}</div></div>
          <div className="stat"><div className="label">Firmados</div><div className="value">{stats.firmados}</div></div>
        </div>

        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <div className="card-h">
              <h3>Contratos recientes</h3>
              <button className="btn btn-ghost" onClick={() => nav('/contratos')}>Ver todos →</button>
            </div>
            {loading ? (
              <div className="empty"><span className="spinner" /> Cargando…</div>
            ) : recientes.length === 0 ? (
              <div className="empty">Aún no hay contratos generados.</div>
            ) : (
              <table className="tbl">
                <thead>
                  <tr><th>No.</th><th>Institución</th><th>Modelo</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {recientes.map((c) => (
                    <tr key={c.id} onClick={() => nav(`/contratos/${c.id}`)}>
                      <td>{c.no_contrato}</td>
                      <td>{c.institucion_nombre}</td>
                      <td>{c.modelo_nombre}</td>
                      <td><span className={'badge badge-' + c.estado}>{c.estado}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Acceso rápido</h3>
              <button className="btn btn-ghost" onClick={() => nav('/instituciones')}>Ver todas →</button>
            </div>
            {loading ? (
              <div className="empty"><span className="spinner" /> Cargando…</div>
            ) : insts.length === 0 ? (
              <div className="empty">No hay instituciones registradas.</div>
            ) : (
              <div className="grid-cards">
                {insts.slice(0, 4).map((i) => (
                  <InstCard key={i.id} inst={i} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
