const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

export function fechaLarga(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) return iso || '';
  const [y, m, d] = String(iso).split('-');
  return `${parseInt(d, 10)} de ${MESES[parseInt(m, 10) - 1]} de ${y}`;
}

export function addMonthsISO(iso, months) {
  const m = parseInt(months, 10);
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso)) || !m) return '';
  const d = new Date(String(iso) + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  const r = new Date(d);
  r.setMonth(r.getMonth() + m);
  const y = r.getFullYear();
  const mo = String(r.getMonth() + 1).padStart(2, '0');
  const day = String(r.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}
