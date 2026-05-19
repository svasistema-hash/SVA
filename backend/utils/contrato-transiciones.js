// Máquina de estados de contratos (F1).
//
// Las claves son los estados ACTUALES; los valores son los estados a los que
// puede transitar legítimamente.

const TRANSICIONES = {
  'en_curso':              ['revision_tenant', 'abandonada_sin_inicio', 'abandonada_incompleta', 'anulada'],
  'revision_tenant':       ['revision_abogados', 'en_curso', 'anulada'],
  'revision_abogados':     ['completado', 'revision_tenant', 'anulada'],
  'completado':            [],                              // terminal
  'abandonada_sin_inicio': ['en_curso', 'anulada'],         // reenviar link
  'abandonada_incompleta': ['en_curso', 'anulada'],
  'anulada':               [],                              // terminal
};

// Forward natural (botón "avanzar"): primer estado positivo del array, NO
// abandonadas/anulada.
const FORWARD_NEXT = {
  'en_curso':          'revision_tenant',
  'revision_tenant':   'revision_abogados',
  'revision_abogados': 'completado',
};

// Reverso natural (botón "regresar"): para que el banco pida más al cliente,
// o que el bufete devuelva al banco.
const BACKWARD_NEXT = {
  'revision_tenant':   'en_curso',
  'revision_abogados': 'revision_tenant',
};

function estadosPosibles(actual) {
  return TRANSICIONES[actual] || [];
}

function puedeTransitar(actual, nuevo) {
  return estadosPosibles(actual).includes(nuevo);
}

function siguienteForward(actual) {
  return FORWARD_NEXT[actual] || null;
}

function siguienteBackward(actual) {
  return BACKWARD_NEXT[actual] || null;
}

module.exports = {
  TRANSICIONES, FORWARD_NEXT, BACKWARD_NEXT,
  estadosPosibles, puedeTransitar,
  siguienteForward, siguienteBackward,
};
