// Normaliza valores monetarios a string con 2 decimales fijos.
// Acepta números, strings ("18500", "18500.0", "Q18,500.00") y devuelve "18500.00".
// Devuelve null para null/undefined/'' o cualquier valor no parseable.
function normalizeMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  if (!isFinite(n)) return null;
  return n.toFixed(2);
}

// Formato de presentación (PDF/UI): "Q18,500.00".
// Acepta los mismos inputs que normalizeMoney; devuelve null si no parsea.
function formatQuetzal(v) {
  const canonical = normalizeMoney(v);
  if (canonical === null) return null;
  const n = parseFloat(canonical);
  return 'Q' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = { normalizeMoney, formatQuetzal };
