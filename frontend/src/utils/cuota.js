export function calcularCuota({ monto, tasa_ordinaria, plazo_meses, sistema_amort }) {
  const M = parseFloat(monto);
  const T = parseFloat(tasa_ordinaria);
  const N = parseInt(plazo_meses, 10);
  if (!isFinite(M) || M <= 0 || !isFinite(T) || T < 0 || !isFinite(N) || N <= 0) return 0;

  const i = T / 100 / 12;

  if (sistema_amort === 'Bullet') {
    return M * i;
  }

  if (i === 0) return M / N;
  const pow = Math.pow(1 + i, N);
  return (M * (i * pow)) / (pow - 1);
}

export function formatMoney(n, moneda = 'GTQ') {
  const num = Number(n) || 0;
  const sym = moneda === 'USD' ? '$' : 'Q';
  return `${sym}${num.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
