const PAGE_WIDTH = 216;
const PAGE_HEIGHT = 330;
const MARGIN_LEFT = 30;
const MARGIN_RIGHT = 25;
const MARGIN_TOP = 22;
const MARGIN_BOTTOM = 22;
// F1 hotfix P3: formato notarial guatemalteco.
// - FONT_BODY: 'Libre Baskerville' como primario (serif clásico, legal-friendly)
//   con fallback robusto a Times New Roman (presente en todos los sistemas).
// - LINE_HEIGHT: 1.5 (notarial estándar, antes 1.95 = demasiado espaciado).
// - FONT_SIZE_BODY: 12pt (antes 12.5pt, ahora ajustado a tamaño notarial típico).
const FONT_BODY = 'Libre Baskerville';
const FONT_UI = 'DM Sans';
const FONT_MONO = 'DM Mono';
const FONT_SIZE_BODY = '12pt';
const LINE_HEIGHT = 1.5;
const COLOR_TEXT = '#111111';

function getCSSOficio() {
  return `
    @page {
      size: ${PAGE_WIDTH}mm ${PAGE_HEIGHT}mm;
      margin: ${MARGIN_TOP}mm ${MARGIN_RIGHT}mm ${MARGIN_BOTTOM}mm ${MARGIN_LEFT}mm;
    }
    * { box-sizing: border-box; }
    body {
      font-family: '${FONT_BODY}', 'Times New Roman', Georgia, serif;
      font-size: ${FONT_SIZE_BODY};
      line-height: ${LINE_HEIGHT};
      color: ${COLOR_TEXT};
      text-align: justify;
      hyphens: auto;
      margin: 0;
    }
    /* P3 hotfix v2: contrato como un solo párrafo continuo (notarial GT real).
       Sin saltos de línea entre cláusulas — los títulos en MAYÚSCULAS inline
       son lo único que las separa visualmente. */
    .contrato-body { text-align: justify; }

    header.doc-head { text-align: center; margin-bottom: 10mm; }
    header.doc-head .banco {
      font-family: '${FONT_UI}', sans-serif;
      font-size: 10pt;
      font-weight: 500;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: ${COLOR_TEXT};
    }
    header.doc-head .correlativo {
      font-family: '${FONT_MONO}', monospace;
      font-size: 9pt;
      color: #555555;
      letter-spacing: 0.12em;
      margin-top: 4px;
    }

    .contrato-body p {
      margin: 0;
      text-indent: 1.2cm;
      text-align: justify;
      color: ${COLOR_TEXT};
    }
    /* Títulos de cláusula inline (CLÁUSULA PRIMERA — TÍTULO.) en mayúsculas,
       sans-serif para distinguir del cuerpo serif, sin romper línea. */
    .cl-titulo {
      font-family: '${FONT_UI}', sans-serif;
      font-size: 10pt;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: ${COLOR_TEXT};
    }

    .firmas-bloque {
      margin-top: 14mm;
      display: flex;
      justify-content: center;
      gap: 30mm;
      page-break-inside: avoid;
    }
    .firmas-principales { justify-content: space-between; }
    .firma { width: 60mm; text-align: center; }
    .firma .espacio-firma { height: 3cm; }
    .firma .linea-firma {
      width: 6cm;
      margin: 0 auto;
      border-bottom: 1px solid ${COLOR_TEXT};
    }
    .firma .firma-nombre {
      font-family: '${FONT_BODY}', serif;
      font-size: 12pt;
      font-weight: 600;
      color: ${COLOR_TEXT};
      margin-top: 6px;
    }
    .firma .firma-cargo {
      font-family: '${FONT_BODY}', serif;
      font-size: 11pt;
      font-style: italic;
      color: #444444;
    }
    .firma .firma-dpi {
      font-family: '${FONT_MONO}', monospace;
      font-size: 9pt;
      color: #888888;
      margin-top: 2px;
    }
    .firma.firma-fiador { width: 80mm; margin: 0 auto; }

    hr.firmas-separador {
      border: none;
      border-top: 1px solid #cccccc;
      margin: 14mm 0 8mm;
    }

    .legalizacion {
      page-break-inside: avoid;
    }
    .legalizacion .title {
      font-family: '${FONT_UI}', sans-serif;
      font-size: 9pt;
      font-weight: 600;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      color: ${COLOR_TEXT};
      text-align: center;
      margin-bottom: 10px;
    }
    .legalizacion p {
      margin: 0;
      text-indent: 1.2cm;
      font-size: 11.5pt;
      color: ${COLOR_TEXT};
    }
    .legalizacion .sello {
      display: flex;
      gap: 24px;
      margin-top: 10mm;
      align-items: flex-start;
    }
    .legalizacion .sello-caja {
      width: 70px;
      height: 70px;
      border: 1px dashed #999;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-family: '${FONT_UI}', sans-serif;
      font-size: 6.5pt;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #888;
      flex-shrink: 0;
      text-align: center;
      padding: 4px;
      line-height: 1.2;
    }
    .legalizacion .firma-notario {
      flex: 1;
    }
    .legalizacion .firma-notario .espacio-firma { height: 2.4cm; }
    .legalizacion .firma-notario .linea-firma {
      border-bottom: 1px solid ${COLOR_TEXT};
      margin: 0 auto;
      width: 6cm;
    }
    .legalizacion .firma-notario .firma-nombre {
      font-family: '${FONT_BODY}', serif;
      font-size: 12pt;
      font-weight: 600;
      text-align: center;
      margin-top: 4px;
    }
    .legalizacion .firma-notario .firma-colegiado {
      font-family: '${FONT_MONO}', monospace;
      font-size: 9pt;
      color: #888;
      text-align: center;
    }
  `;
}

module.exports = {
  PAGE_WIDTH,
  PAGE_HEIGHT,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  MARGIN_TOP,
  MARGIN_BOTTOM,
  FONT_BODY,
  FONT_UI,
  FONT_MONO,
  FONT_SIZE_BODY,
  LINE_HEIGHT,
  getCSSOficio,
};
