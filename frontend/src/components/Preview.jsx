// Preview del contrato — REESCRITO para usar el motor F7 REAL del backend.
//
// Antes: usaba CLAUSULAS_TEMPLATE hardcoded del frontend (cláusulas viejas
// con {{moneda}} {{monto}} ({{monto_letras}})), lo que producía un preview
// distinto al PDF real. Quedaban placeholders [MONTO_LETRAS], [CUENTA_CLAUSE]
// porque el frontend no resolvía esas variables.
//
// Ahora: llama a POST /api/contratos/:id/compilar que devuelve las cláusulas
// YA compiladas con el motor F7 + variables resueltas. El frontend solo
// renderiza el texto resultante. Lo que ves === lo que el PDF tiene.

import { useEffect, useState } from 'react';
import { compilarContrato } from '../api/contratos';

export default function Preview({ contratoId, contrato, institucion }) {
  const [compilado, setCompilado] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!contratoId) return;
    setLoading(true); setError(null);
    compilarContrato(contratoId)
      .then(setCompilado)
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
    // Refresh on cambio de datos del contrato (cuando updateContrato).
  }, [contratoId, contrato?.updated_at]);

  const correlativo = contrato?.datos_firmas?.correlativo || contrato?.no_contrato || '';
  const fiadores = (contrato?.datos_garantia?.fiadores || []).filter((f) => f && (f.nombre || f.dpi));

  if (loading && !compilado) {
    return (
      <div className="preview-wrap">
        <div className="preview-toolbar"><span>Cargando preview…</span></div>
        <div className="preview"><div className="paper"><div className="empty"><span className="spinner" /></div></div></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="preview-wrap">
        <div className="preview-toolbar"><span style={{ color: 'var(--danger)' }}>Error al compilar preview</span></div>
        <div className="preview"><div className="paper"><div className="alert alert-danger">{error}</div></div></div>
      </div>
    );
  }

  if (!compilado) {
    return (
      <div className="preview-wrap">
        <div className="preview-toolbar"><span>Preview del contrato</span></div>
        <div className="preview"><div className="paper"><div className="empty">Sin datos para previsualizar.</div></div></div>
      </div>
    );
  }

  const { clausulas } = compilado;
  const metaCliente = compilado.metadata?.cliente || {};
  const metaRep = compilado.metadata?.representante || {};

  // Contar variables sin resolver — el backend ya las marca como [VAR] (e.g. [EDAD]).
  const variablesMissing = clausulas.reduce((sum, c) => sum + (c.texto.match(/\[[A-Z_]+\]/g) || []).length, 0);

  return (
    <div className="preview-wrap">
      <div className="preview-toolbar">
        <span>Preview — motor F7 (igual al PDF final)</span>
        {variablesMissing > 0 && (
          <span style={{ color: 'var(--alerta, #b67318)' }}>
            {variablesMissing} variable(s) sin completar
          </span>
        )}
      </div>
      <div className="preview">
        <div className="paper">
          <header>
            <div className="banco">{institucion?.nombre || compilado.metadata?.institucion?.nombre || ''}</div>
            {correlativo && <div className="correlativo">CONTRATO No. {correlativo}</div>}
          </header>

          <div className="contrato-body">
            {/* Todo el contrato como un solo párrafo continuo (notarial GT real),
                igual que el PDF generado por contrato-engine. */}
            <p>
              {clausulas.map((c) => {
                if (c.codigo === 'comparecencia') {
                  return <span key={c.codigo}>{c.texto}</span>;
                }
                const titulo = c.titulo.toUpperCase().replace(/^CLÁUSULA\s+/i, 'CLÁUSULA ');
                return (
                  <span key={c.codigo}>
                    {' '}
                    <span className="cl-titulo">{titulo}.</span> {c.texto}
                  </span>
                );
              })}
            </p>
          </div>

          <div className="firmas-bloque firmas-principales">
            <div className="firma">
              <div className="espacio-firma" />
              <div className="linea-firma" />
              <div className="firma-nombre">{metaRep.nombre || '—'}</div>
              <div className="firma-cargo">{metaRep.cargo || 'Representante legal'}</div>
              {metaRep.dpi && <div className="firma-dpi">DPI {metaRep.dpi}</div>}
            </div>
            <div className="firma">
              <div className="espacio-firma" />
              <div className="linea-firma" />
              <div className="firma-nombre">{metaCliente.nombre || '—'}</div>
              <div className="firma-cargo">El Deudor</div>
              {metaCliente.dpi && <div className="firma-dpi">DPI {metaCliente.dpi}</div>}
            </div>
          </div>

          {fiadores.length > 0 && (
            <div className="firmas-bloque">
              {fiadores.map((f, i) => (
                <div key={i} className="firma firma-fiador">
                  <div className="espacio-firma" />
                  <div className="linea-firma" />
                  <div className="firma-nombre">{f.nombre || '—'}</div>
                  <div className="firma-cargo">Fiador{fiadores.length > 1 ? ' ' + (i + 1) : ''}</div>
                  {f.dpi && <div className="firma-dpi">DPI {f.dpi}</div>}
                </div>
              ))}
            </div>
          )}

          <hr className="firmas-separador" />

          <section className="legalizacion">
            <div className="title">LEGALIZACIÓN DE FIRMAS</div>
            <p>
              En la ciudad de {contrato?.datos_firmas?.ciudad || '________'},
              el {contrato?.datos_firmas?.fecha || '________'},
              como Notario doy fe que las firmas que anteceden son auténticas.
            </p>
            <div className="sello">
              <div className="sello-caja">Sello del Notario</div>
              <div className="firma-notario">
                <div className="espacio-firma" />
                <div className="linea-firma" />
                <div className="firma-nombre">{contrato?.datos_firmas?.notario_nombre || contrato?.datos_firmas?.notario || '________'}</div>
                <div className="firma-colegiado">Colegiado No. {contrato?.datos_firmas?.notario_colegiado || contrato?.datos_firmas?.colegiado || '____'}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
