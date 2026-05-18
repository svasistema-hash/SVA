import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Topbar from '../components/Topbar';
import InstCard from '../components/InstCard';
import { fetchInstituciones } from '../api/instituciones';

const TIPOS = [
  { key: 'banco', label: 'Bancos' },
  { key: 'financiera', label: 'Financieras' },
  { key: 'desarrolladora', label: 'Desarrolladoras' },
  { key: 'prestamista', label: 'Prestamistas' },
];

export default function Instituciones() {
  const [params, setParams] = useSearchParams();
  const tipoFiltro = params.get('tipo') || '';
  const [insts, setInsts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchInstituciones()
      .then(setInsts)
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, []);

  const visibles = useMemo(
    () => (tipoFiltro ? insts.filter((i) => i.tipo === tipoFiltro) : insts),
    [insts, tipoFiltro]
  );
  const tipoActual = TIPOS.find((t) => t.key === tipoFiltro);

  const setTipo = (tipo) => {
    if (tipo) setParams({ tipo });
    else setParams({});
  };

  return (
    <>
      <Topbar
        title={tipoActual ? tipoActual.label : 'Instituciones'}
        crumbs={tipoActual ? `Todas las ${tipoActual.label.toLowerCase()} registradas` : 'Bancos, financieras, desarrolladoras y prestamistas'}
      />
      <div className="app-content">
        <div className="toolbar">
          <button
            className={'btn btn-sm' + (!tipoFiltro ? ' btn-primary' : '')}
            onClick={() => setTipo('')}
          >Todas</button>
          {TIPOS.map((t) => (
            <button
              key={t.key}
              className={'btn btn-sm' + (tipoFiltro === t.key ? ' btn-primary' : '')}
              onClick={() => setTipo(t.key)}
            >{t.label}</button>
          ))}
          <div className="spacer" />
          <span className="muted" style={{ fontSize: 11 }}>{visibles.length} institución(es)</span>
        </div>

        {error && <div className="alert alert-danger">{error}</div>}

        {loading && <div className="empty">Cargando instituciones</div>}

        {!loading && !tipoFiltro && TIPOS.map((t) => {
          const items = visibles.filter((i) => i.tipo === t.key);
          if (!items.length) return null;
          return (
            <div key={t.key} style={{ marginBottom: 24 }}>
              <div className="card-h">
                <h3>{t.label} <span className="muted" style={{ fontWeight: 400 }}>· {items.length}</span></h3>
              </div>
              <div className="grid-cards">
                {items.map((i) => <InstCard key={i.id} inst={i} />)}
              </div>
            </div>
          );
        })}

        {!loading && tipoFiltro && (
          visibles.length === 0 ? (
            <div className="empty">No hay instituciones de tipo {tipoActual?.label.toLowerCase()}.</div>
          ) : (
            <div className="grid-cards">
              {visibles.map((i) => <InstCard key={i.id} inst={i} />)}
            </div>
          )
        )}

        {!loading && insts.length === 0 && (
          <div className="empty">No hay instituciones registradas.</div>
        )}
      </div>
    </>
  );
}
