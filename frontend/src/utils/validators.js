// Validadores reutilizables para forms del banco/bufete/cliente.
// Cada función retorna:
//   null  → válido
//   string → mensaje de error a mostrar al usuario
//
// Diseño: todos aceptan el valor del input. Algunos son curry para
// permitir parametrización (e.g. validarRequerido('Nombre')).

import { isValidDpiFormat } from './dpi-format';

export const validarRequerido = (label = 'Campo') => (v) => {
  if (v === null || v === undefined || String(v).trim() === '') return `${label} es requerido`;
  return null;
};

export const validarDPI = (v) => {
  if (!v) return null; // optional por default; combinar con validarRequerido si es obligatorio
  return isValidDpiFormat(v) ? null : 'DPI debe tener 13 dígitos';
};

export const validarDPIRequerido = (v) => {
  if (!v) return 'DPI es requerido';
  return isValidDpiFormat(v) ? null : 'DPI debe tener 13 dígitos';
};

export const validarEmail = (v) => {
  if (!v) return null; // optional
  // Regex pragmático (no RFC-completo, suficiente para forms).
  const re = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
  return re.test(v) ? null : 'Correo electrónico inválido';
};

export const validarTelefono = (v) => {
  if (!v) return null;
  const digitos = String(v).replace(/\D/g, '');
  if (digitos.length < 8) return 'Teléfono debe tener al menos 8 dígitos';
  if (digitos.length > 15) return 'Teléfono muy largo';
  return null;
};

export const validarNIT = (v) => {
  if (!v) return null;
  // NIT GT: 7-9 dígitos + opcional dígito verificador (puede ser letra K).
  const limpio = String(v).replace(/[\s-]/g, '');
  if (!/^[0-9]{6,9}[0-9K]?$/i.test(limpio)) return 'NIT inválido (formato: 1234567 o 1234567-8)';
  return null;
};

export const validarNumero = (label = 'Valor', min, max) => (v) => {
  if (!v && v !== 0) return null;
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return `${label} debe ser un número`;
  if (min != null && n < min) return `${label} debe ser ≥ ${min}`;
  if (max != null && n > max) return `${label} debe ser ≤ ${max}`;
  return null;
};

export const validarFecha = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return 'Fecha inválida';
  return null;
};

export const validarFechaNoFutura = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return 'Fecha inválida';
  if (d > new Date()) return 'La fecha no puede ser en el futuro';
  return null;
};
