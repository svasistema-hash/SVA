import { useMemo } from 'react';
import { CLAUSULAS_TEMPLATE, buildVars } from '../constants/clausulasTemplate';

function renderText(template, vars) {
  const parts = [];
  const re = /\{\{(\w+)\}\}/g;
  let last = 0;
  let m;
  while ((m = re.exec(template)) !== null) {
    if (m.index > last) parts.push({ type: 'text', value: template.slice(last, m.index) });
    const key = m[1];
    const val = vars[key];
    parts.push({ type: val ? 'filled' : 'empty', key, value: val });
    last = re.lastIndex;
  }
  if (last < template.length) parts.push({ type: 'text', value: template.slice(last) });
  return parts;
}

function renderInlineSpans(parts) {
  return parts.map((p, i) => {
    if (p.type === 'text') return <span key={i}>{p.value}</span>;
    if (p.type === 'filled') return <span key={i} className="blank-filled">{String(p.value)}</span>;
    return <span key={i} className="blank-empty">[{p.key.toUpperCase()}]</span>;
  });
}

export default function Preview({ contrato, institucion, codigos }) {
  const vars = useMemo(() => buildVars(contrato, institucion), [contrato, institucion]);
  const items = (codigos && codigos.length ? codigos : Object.keys(CLAUSULAS_TEMPLATE))
    .map((code) => ({ code, ...CLAUSULAS_TEMPLATE[code] }))
    .filter((x) => x.titulo);

  const totalVars = items.reduce((acc, c) => acc + ((c.texto.match(/\{\{(\w+)\}\}/g) || []).length), 0);
  const filled = items.reduce((acc, c) => {
    const re = /\{\{(\w+)\}\}/g;
    let m, n = 0;
    while ((m = re.exec(c.texto)) !== null) if (vars[m[1]]) n++;
    return acc + n;
  }, 0);

  const correlativo = contrato?.datos_firmas?.correlativo || '';
  const fiadores = (contrato?.datos_garantia?.fiadores || []).filter((f) => f && (f.nombre || f.dpi));

  return (
    <div className="preview-wrap">
      <div className="preview-toolbar">
        <span>Preview · {filled}/{totalVars} variables</span>
        <div className="legend">
          <span><span className="dot g" /> Llenado</span>
          <span><span className="dot r" /> Pendiente</span>
        </div>
      </div>
      <div className="preview">
        <div className="paper">
          <header>
            <div className="banco">{institucion?.nombre || ''}</div>
            {correlativo && <div className="correlativo">CONTRATO No. {correlativo}</div>}
          </header>

          <div className="contrato-body">
            {items.map((c) => {
              const parts = renderText(c.texto, vars);
              if (c.code === 'comparecencia') {
                return (
                  <p key={c.code} className="comparecencia"><em>{renderInlineSpans(parts)}</em></p>
                );
              }
              const titulo = c.titulo.toUpperCase().replace(/^CLÁUSULA\s+/i, 'CLÁUSULA ');
              return (
                <p key={c.code}>
                  <span className="cl-titulo">{titulo}.</span>{' '}
                  {renderInlineSpans(parts)}
                </p>
              );
            })}
          </div>

          <div className="firmas-bloque firmas-principales">
            <div className="firma">
              <div className="espacio-firma" />
              <div className="linea-firma" />
              <div className="firma-nombre">{vars.rep_nombre || '—'}</div>
              <div className="firma-cargo">{vars.rep_cargo || 'Representante legal'}</div>
              {vars.rep_dpi && <div className="firma-dpi">DPI {vars.rep_dpi}</div>}
            </div>
            <div className="firma">
              <div className="espacio-firma" />
              <div className="linea-firma" />
              <div className="firma-nombre">{vars.cl_nombre || '—'}</div>
              <div className="firma-cargo">El Deudor</div>
              {vars.cl_dpi && <div className="firma-dpi">DPI {vars.cl_dpi}</div>}
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
              En la ciudad de {vars.ciudad || '________'}, el {vars.fecha || '________'},
              como Notario doy fe que las firmas que anteceden son auténticas, por haber sido puestas
              en mi presencia hoy por los señores {vars.rep_nombre || '________'} y {vars.cl_nombre || '________'},
              personas de mi conocimiento, quienes firmaron junto conmigo.
            </p>
            <div className="sello">
              <div className="sello-caja">Sello del Notario</div>
              <div className="firma-notario">
                <div className="espacio-firma" />
                <div className="linea-firma" />
                <div className="firma-nombre">{contrato?.datos_firmas?.notario || '________'}</div>
                <div className="firma-colegiado">Colegiado No. {contrato?.datos_firmas?.colegiado || '____'}</div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
