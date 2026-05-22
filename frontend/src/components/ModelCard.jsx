// @deprecated DESDE Sprint pendientes-4-7 Parte 4 (2026-05-21).
// Este componente solo navegaba al Wizard legacy (/contratos/nuevo) que ya
// fue retirado. Sin imports activos en el código (verificado con grep). Se
// conserva por si algún sprint en curso lo referencia. Eliminar después.
//
// Reemplazo: el módulo Financiera permite crear contratos directamente desde
// /tenant/financiera/nueva con selector de modelo en el form.

import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/useStore';

export default function ModelCard({ modelo, institucionId, institucionSlug }) {
  const nav = useNavigate();
  const params = useParams();
  const slug = institucionSlug || params.slug;
  const iniciarContrato = useStore((s) => s.iniciarContrato);

  const start = () => {
    iniciarContrato({
      institucion_id: institucionId,
      institucion_slug: slug,
      modelo_id: modelo.id,
      modelo_codigos: modelo.clausulas || [],
    });
    nav(`/instituciones/${slug}/contratos/nuevo`);
  };

  return (
    <div className="model-card">
      <div className="row">
        <div>
          <h4>{modelo.nombre}</h4>
          <span className="tipo">{modelo.tipo_garantia}</span>
        </div>
        <span className={'badge ' + (modelo.activo ? 'badge-firmado' : 'badge-borrador')}>
          {modelo.activo ? 'Activo' : 'Borrador'}
        </span>
      </div>
      <div className="clausulas">{(modelo.clausulas || []).length} cláusulas</div>
      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button className="btn btn-gold" onClick={start}>Usar este modelo</button>
      </div>
    </div>
  );
}
