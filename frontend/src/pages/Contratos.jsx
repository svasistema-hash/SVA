import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import { fetchContratos } from '../api/contratos';

export default function Contratos() {
  const nav = useNavigate();
  const [contratos, setContratos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [estado, setEstado] = useState('');

  useEffect(() => {
    setLoading(true);
    fetchContratos({ estado }).then(setContratos).finally(() => setLoading(false));
  }, [estado]);

  return (
    <>
      <Topbar title="Contratos" crumbs="Todos los contratos generados" />
      <div className="app-content">
        <div className="toolbar">
          <select className="select" style={{ width: 200 }} value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option value="">Todos los estados</option>
            <option value="borrador">Borrador</option>
            <option value="revision">En revisión</option>
            <option value="firmado">Firmado</option>
          </select>
          <div className="spacer" />
          <span className="muted">{contratos.length} contratos</span>
        </div>

        {loading ? (
          <div className="empty"><span className="spinner" /></div>
        ) : contratos.length === 0 ? (
          <div className="empty">No hay contratos con esos filtros.</div>
        ) : (
          <table className="tbl">
            <thead>
              <tr>
                <th>No.</th>
                <th>Institución</th>
                <th>Modelo</th>
                <th>Cliente</th>
                <th>Estado</th>
                <th>Actualizado</th>
              </tr>
            </thead>
            <tbody>
              {contratos.map((c) => (
                <tr key={c.id} onClick={() => nav(`/contratos/${c.id}`)}>
                  <td>{c.no_contrato}</td>
                  <td>{c.institucion_nombre}</td>
                  <td>{c.modelo_nombre}</td>
                  <td>{c.datos_cliente?.nombre || <span className="muted">—</span>}</td>
                  <td><span className={'badge badge-' + c.estado}>{c.estado}</span></td>
                  <td className="muted">{c.updated_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
