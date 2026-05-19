// Concordancia gramatical M/F para frases jurídicas.

const GENTILICIOS = {
  guatemala:  { M: 'guatemalteco',  F: 'guatemalteca' },
  mexico:     { M: 'mexicano',      F: 'mexicana' },
  salvador:   { M: 'salvadoreño',   F: 'salvadoreña' },
  honduras:   { M: 'hondureño',     F: 'hondureña' },
  nicaragua:  { M: 'nicaragüense',  F: 'nicaragüense' },
  costarrica: { M: 'costarricense', F: 'costarricense' },
  panama:     { M: 'panameño',      F: 'panameña' },
};

const ESTADOS_CIVILES = {
  soltero:           { M: 'soltero',          F: 'soltera' },
  soltera:           { M: 'soltero',          F: 'soltera' },
  casado:            { M: 'casado',           F: 'casada' },
  casada:            { M: 'casado',           F: 'casada' },
  divorciado:        { M: 'divorciado',       F: 'divorciada' },
  divorciada:        { M: 'divorciado',       F: 'divorciada' },
  viudo:             { M: 'viudo',            F: 'viuda' },
  viuda:             { M: 'viudo',            F: 'viuda' },
  'unido de hecho':  { M: 'unido de hecho',   F: 'unida de hecho' },
  'unida de hecho':  { M: 'unido de hecho',   F: 'unida de hecho' },
  'union de hecho':  { M: 'unido de hecho',   F: 'unida de hecho' },
  'unión de hecho':  { M: 'unido de hecho',   F: 'unida de hecho' },
};

// Roles que tipicamente aparecen como "EL X" / "LA X" en contratos.
const ROLES = {
  deudor:        { M: 'DEUDOR',        F: 'DEUDORA' },
  acreedor:      { M: 'ACREEDOR',      F: 'ACREEDORA' },
  vendedor:      { M: 'VENDEDOR',      F: 'VENDEDORA' },
  comprador:     { M: 'COMPRADOR',     F: 'COMPRADORA' },
  fiador:        { M: 'FIADOR',        F: 'FIADORA' },
  arrendante:    { M: 'ARRENDANTE',    F: 'ARRENDANTE' },     // invariable
  arrendatario:  { M: 'ARRENDATARIO',  F: 'ARRENDATARIA' },
  mutuante:      { M: 'MUTUANTE',      F: 'MUTUANTE' },       // invariable
  mutuario:      { M: 'MUTUARIO',      F: 'MUTUARIA' },
  adquirente:    { M: 'ADQUIRENTE',    F: 'ADQUIRENTE' },     // invariable
  afiliado:      { M: 'AFILIADO',      F: 'AFILIADA' },
};

function normGenero(g) {
  if (g == null) return 'M';
  const s = String(g).trim().toLowerCase();
  if (s === 'f' || s === 'femenino' || s === 'femenina' || s === 'mujer') return 'F';
  return 'M';
}

function gentilicio(pais, genero) {
  const g = normGenero(genero);
  const key = String(pais || 'guatemala').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const entry = GENTILICIOS[key];
  return entry ? entry[g] : (pais || '');
}

function estadoCivil(estado, genero) {
  if (!estado) return '';
  const g = normGenero(genero);
  const key = String(estado).trim().toLowerCase();
  const entry = ESTADOS_CIVILES[key];
  return entry ? entry[g] : estado;
}

function articuloPersona(genero) {
  return normGenero(genero) === 'F' ? 'LA' : 'EL';
}

function rolPersona(rol, genero) {
  const g = normGenero(genero);
  const key = String(rol || '').trim().toLowerCase();
  const entry = ROLES[key];
  return entry ? entry[g] : (rol || '').toString().toUpperCase();
}

// "su" es invariable. Función presente por simetría con la API documentada.
function pronombrePosesivo(/* genero */) { return 'su'; }

module.exports = {
  normGenero,
  gentilicio,
  estadoCivil,
  articuloPersona,
  rolPersona,
  pronombrePosesivo,
  // tablas exportadas por si otros módulos quieren ampliarlas
  GENTILICIOS, ESTADOS_CIVILES, ROLES,
};
