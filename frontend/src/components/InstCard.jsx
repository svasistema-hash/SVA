import { useNavigate } from 'react-router-dom';

const TIPO_LABEL = {
  banco: 'Banco',
  financiera: 'Financiera',
  desarrolladora: 'Desarrolladora',
  prestamista: 'Prestamista',
};

export default function InstCard({ inst }) {
  const nav = useNavigate();
  return (
    <div className="inst-card" onClick={() => nav(`/instituciones/${inst.slug}`)}>
      <div className="tipo">{TIPO_LABEL[inst.tipo] || inst.tipo}</div>
      <div className="nombre">{inst.nombre}</div>
      <div className="meta">{inst.nit ? `NIT ${inst.nit}` : 'Sin NIT'}</div>
      <div className="footer">
        Rep. legal:{' '}
        {inst.representante?.nombre ? inst.representante.nombre : <span className="muted">Sin asignar</span>}
      </div>
    </div>
  );
}
