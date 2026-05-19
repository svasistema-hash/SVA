// Formato de nombres propios.
// - Mayúsculas conservando tildes (toLocaleUpperCase('es')).
// - Quita espacios duplicados y trim.
// - nombrePropio: capitaliza cada palabra; preposiciones cortas en minúscula
//   cuando NO son la primera palabra ("Juan de la Cruz", no "Juan De La Cruz").

const PREPS_EN_MINUSCULA = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);

function clean(name) {
  if (name == null) return '';
  return String(name).replace(/\s+/g, ' ').trim();
}

function nombreEnMayusculas(nombre) {
  return clean(nombre).toLocaleUpperCase('es');
}

function nombrePropio(nombre) {
  const cleaned = clean(nombre);
  if (!cleaned) return '';
  return cleaned.split(' ').map((w, i) => {
    const lw = w.toLocaleLowerCase('es');
    if (i > 0 && PREPS_EN_MINUSCULA.has(lw)) return lw;
    return lw.charAt(0).toLocaleUpperCase('es') + lw.slice(1);
  }).join(' ');
}

module.exports = { nombreEnMayusculas, nombrePropio };
