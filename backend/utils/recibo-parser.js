// Parser de recibos de servicios (EEGSA, Energuate, Tigo, Claro, agua, etc.)
// para extraer dirección de domicilio. Más flexible que DPI: confidence típica más baja.

// Compañías que sirven como señal de "esto es un recibo".
const COMPAÑIAS = [
  'EEGSA', 'ENERGUATE', 'DEORSA', 'DEOCSA', 'EMPRESA ELECTRICA',
  'EMPRESA ELÉCTRICA', 'TIGO', 'CLARO', 'CLARO HOGAR', 'TIGO HOGAR',
  'EMPAGUA', 'AGUA MARIANO', 'TURBOCABLE',
];

// Departamentos GT (reusado de dpi-parser conceptualmente, pero copia local
// para no acoplar parsers).
const DEPARTAMENTOS_GT = [
  'GUATEMALA', 'EL PROGRESO', 'SACATEPEQUEZ', 'SACATEPÉQUEZ', 'CHIMALTENANGO',
  'ESCUINTLA', 'SANTA ROSA', 'SOLOLA', 'SOLOLÁ', 'TOTONICAPAN', 'TOTONICAPÁN',
  'QUETZALTENANGO', 'SUCHITEPEQUEZ', 'SUCHITEPÉQUEZ', 'RETALHULEU',
  'SAN MARCOS', 'HUEHUETENANGO', 'QUICHE', 'QUICHÉ', 'BAJA VERAPAZ',
  'ALTA VERAPAZ', 'PETEN', 'PETÉN', 'IZABAL', 'ZACAPA', 'CHIQUIMULA',
  'JALAPA', 'JUTIAPA',
];

const PALABRAS_DIRECCION = [
  'CALLE', 'AVENIDA', 'AV.', 'AV', 'ZONA', 'COLONIA', 'COL.', 'COL',
  'LOTE', 'MANZANA', 'MZ', 'CONDOMINIO', 'RESIDENCIAL', 'BARRIO',
  'ALDEA', 'CASERIO', 'CASERÍO', 'KM', 'KILOMETRO', 'KILÓMETRO',
  'CARRETERA', 'BOULEVARD', 'BLVD', 'DIAGONAL', 'RUTA',
];

function detectCompañia(rawText) {
  if (!rawText) return null;
  const upper = rawText.toUpperCase();
  for (const c of COMPAÑIAS) {
    if (upper.includes(c)) return c;
  }
  return null;
}

// Heurística para dirección: línea que contenga palabras típicas (CALLE, ZONA, etc.)
// y/o un departamento GT. Devuelve la línea más probable o concatena varias.
function extractDireccion(rawText) {
  if (!rawText) return null;
  const lineas = String(rawText)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 5);

  const candidatas = [];
  for (const linea of lineas) {
    const upper = linea.toUpperCase();
    const tienePalabraDir = PALABRAS_DIRECCION.some((p) => {
      // Match como palabra (rodeada de espacio/inicio/fin/puntuación)
      const re = new RegExp(`(^|[\\s.,])${p}(\\s|[.,]|$)`, 'i');
      return re.test(upper);
    });
    const tieneDepto = DEPARTAMENTOS_GT.some((d) => upper.includes(d));
    if (tienePalabraDir || tieneDepto) {
      candidatas.push({ linea, score: (tienePalabraDir ? 2 : 0) + (tieneDepto ? 1 : 0) });
    }
  }
  if (candidatas.length === 0) return null;
  // Toma la mejor candidata; si hay empate, concatena las dos primeras.
  candidatas.sort((a, b) => b.score - a.score);
  if (candidatas[0].score >= 3) return candidatas[0].linea;
  if (candidatas.length >= 2) return candidatas.slice(0, 2).map((c) => c.linea).join(', ');
  return candidatas[0].linea;
}

function parseRecibo(rawText) {
  return {
    direccion: extractDireccion(rawText),
    comprobante: detectCompañia(rawText),
  };
}

module.exports = { parseRecibo, extractDireccion, detectCompañia };
