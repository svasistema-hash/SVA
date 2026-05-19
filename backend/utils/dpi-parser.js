// Parser de DPI guatemalteco desde texto crudo de OCR.
//
// Formato DPI: 13 dígitos agrupados como "XXXX XXXXX XXXX".
//   - Primeros 4: correlativo dentro del municipio.
//   - Siguientes 5: número de orden.
//   - Últimos 4: código de municipio (los dos primeros = departamento 01..22).
// Validación: el departamento (posiciones 9-10 contando desde 0) debe estar 01..22.

const DEPARTAMENTOS_VALIDOS = new Set([
  '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11',
  '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22',
]);

// Acepta espacios, guiones, puntos como separadores. Permite que el OCR
// confunda algún separador. Regex captura 4 + 5 + 4 dígitos con separador opcional.
const DPI_REGEX = /\b(\d{4})\s*[-.\s]?\s*(\d{5})\s*[-.\s]?\s*(\d{4})\b/g;

// Limpia errores típicos de OCR en zonas de dígitos:
//   O→0, o→0, I→1, l→1, |→1, S→5, B→8, Z→2, Q→0
function corregirOCRDigitos(s) {
  return String(s || '')
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[Bb]/g, '8')
    .replace(/[Zz]/g, '2')
    .replace(/[Qq]/g, '0');
}

// Extrae el primer DPI válido del texto. Devuelve { dpi: "XXXX XXXXX XXXX", departamento: NN } o null.
function extractDPI(rawText) {
  if (!rawText) return null;
  // Probamos primero sin corrección, después con corrección agresiva si falla.
  const candidates = [rawText, corregirOCRDigitos(rawText)];
  for (const text of candidates) {
    DPI_REGEX.lastIndex = 0;
    let m;
    while ((m = DPI_REGEX.exec(text)) !== null) {
      const [, a, b, c] = m;
      const depto = c.slice(0, 2);
      if (DEPARTAMENTOS_VALIDOS.has(depto)) {
        return {
          dpi: `${a} ${b} ${c}`,
          departamento: depto,
        };
      }
    }
  }
  return null;
}

// Extrae nombre completo. El DPI guatemalteco tiene "APELLIDOS Y NOMBRES" en una línea.
// Heurística: línea con 3+ palabras en MAYÚSCULAS, sin dígitos, sin palabras frecuentes
// de etiquetas ("REPUBLICA", "GUATEMALA", "DOCUMENTO", "PERSONAL", "IDENTIFICACION", etc.).
const STOPWORDS_NOMBRE = new Set([
  'REPUBLICA', 'REPÚBLICA', 'GUATEMALA', 'DOCUMENTO', 'PERSONAL', 'PERSONA',
  'IDENTIFICACION', 'IDENTIFICACIÓN', 'CUI', 'DPI', 'TREP', 'RENAP',
  'APELLIDOS', 'NOMBRES', 'NOMBRE', 'NACIMIENTO', 'FECHA', 'LUGAR',
  'SEXO', 'GENERO', 'GÉNERO', 'NACIONALIDAD', 'VECINDAD', 'ESTADO',
  'CIVIL', 'FIRMA', 'EXPEDICION', 'EXPEDICIÓN', 'VENCIMIENTO',
]);

function extractNombre(rawText) {
  if (!rawText) return null;
  const lineas = String(rawText).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const linea of lineas) {
    // Línea sin dígitos.
    if (/\d/.test(linea)) continue;
    // Solo letras (incluye acentos y ñ) y espacios.
    if (!/^[A-ZÁÉÍÓÚÑÜ ]+$/.test(linea)) continue;
    const palabras = linea.split(/\s+/).filter(Boolean);
    if (palabras.length < 2) continue;
    // Filtra líneas que son solo stopwords.
    const utiles = palabras.filter((p) => !STOPWORDS_NOMBRE.has(p));
    if (utiles.length < 2) continue;
    return utiles.join(' ');
  }
  return null;
}

// Fecha de nacimiento: busca patrones DD/MM/YYYY, DD-MM-YYYY, DD MMM YYYY, etc.
const MESES = {
  'ENE': '01', 'ENERO': '01', 'FEB': '02', 'FEBRERO': '02',
  'MAR': '03', 'MARZO': '03', 'ABR': '04', 'ABRIL': '04',
  'MAY': '05', 'MAYO': '05', 'JUN': '06', 'JUNIO': '06',
  'JUL': '07', 'JULIO': '07', 'AGO': '08', 'AGOSTO': '08',
  'SEP': '09', 'SEPT': '09', 'SEPTIEMBRE': '09',
  'OCT': '10', 'OCTUBRE': '10', 'NOV': '11', 'NOVIEMBRE': '11',
  'DIC': '12', 'DICIEMBRE': '12',
};

function extractFechaNacimiento(rawText) {
  if (!rawText) return null;
  const upper = rawText.toUpperCase();

  // Patrón 1: DD/MM/YYYY o DD-MM-YYYY o DD.MM.YYYY.
  const m1 = upper.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})\b/);
  if (m1) {
    const [, d, mo, y] = m1;
    const año = parseInt(y, 10);
    if (año >= 1900 && año <= new Date().getFullYear()) {
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  // Patrón 2: DD MMM YYYY (e.g. 12 JUN 1985).
  const m2 = upper.match(/\b(\d{1,2})\s+([A-Z]+)\s+(\d{4})\b/);
  if (m2) {
    const [, d, mes, y] = m2;
    const mo = MESES[mes];
    if (mo) {
      const año = parseInt(y, 10);
      if (año >= 1900 && año <= new Date().getFullYear()) {
        return `${y}-${mo}-${d.padStart(2, '0')}`;
      }
    }
  }

  return null;
}

// Lugar de nacimiento: heurística — línea después de "LUGAR DE NACIMIENTO" o
// línea con formato "Ciudad, Departamento" donde el departamento es uno de los 22 GT.
const DEPARTAMENTOS_GT = [
  'GUATEMALA', 'EL PROGRESO', 'SACATEPEQUEZ', 'SACATEPÉQUEZ', 'CHIMALTENANGO',
  'ESCUINTLA', 'SANTA ROSA', 'SOLOLA', 'SOLOLÁ', 'TOTONICAPAN', 'TOTONICAPÁN',
  'QUETZALTENANGO', 'SUCHITEPEQUEZ', 'SUCHITEPÉQUEZ', 'RETALHULEU',
  'SAN MARCOS', 'HUEHUETENANGO', 'QUICHE', 'QUICHÉ', 'BAJA VERAPAZ',
  'ALTA VERAPAZ', 'PETEN', 'PETÉN', 'IZABAL', 'ZACAPA', 'CHIQUIMULA',
  'JALAPA', 'JUTIAPA',
];

function extractLugarNacimiento(rawText) {
  if (!rawText) return null;
  const upper = rawText.toUpperCase();
  // Busca línea "LUGAR DE NACIMIENTO" + lo que sigue.
  const idx = upper.search(/LUGAR\s+DE\s+NACIMIENTO/);
  if (idx >= 0) {
    const slice = rawText.substring(idx).split(/\r?\n/).slice(1).join('\n');
    const linea = slice.split(/\r?\n/).find((l) => l.trim().length > 0);
    if (linea) return linea.trim();
  }
  // Fallback: busca línea con uno de los departamentos.
  for (const linea of rawText.split(/\r?\n/)) {
    const l = linea.toUpperCase();
    if (DEPARTAMENTOS_GT.some((d) => l.includes(d)) && !/REPUBLICA|REPÚBLICA/.test(l)) {
      return linea.trim();
    }
  }
  return null;
}

function parseDPI(rawText) {
  const dpiData = extractDPI(rawText);
  return {
    dpi: dpiData ? dpiData.dpi : null,
    departamento: dpiData ? dpiData.departamento : null,
    nombre: extractNombre(rawText),
    fecha_nac: extractFechaNacimiento(rawText),
    lugar_nac: extractLugarNacimiento(rawText),
  };
}

module.exports = {
  parseDPI,
  extractDPI,
  extractNombre,
  extractFechaNacimiento,
  extractLugarNacimiento,
  DEPARTAMENTOS_VALIDOS,
};
