// Placeholder de facturación. Cobro desde día 1 — la lógica de billing
// real se implementa en un sprint específico (integración con Stripe/Recurly
// o factura local con SAT GT). Por ahora, este panel muestra:
//   - Plan actual (placeholder).
//   - Uso del período actual (sociedades inscritas, en proceso).
//   - Próxima factura estimada (placeholder).

import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import { fetchConteoEstadosSociedades } from '../../api/legal';

const PRECIOS_PLACEHOLDER = {
  base_mensual: 500,
  por_sociedad_inscrita: 250,
  moneda: 'GTQ',
};

export default function Facturacion() {
  const { esMaster } = useOutletContext() || {};
  const [conteo, setConteo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchConteoEstadosSociedades().then(setConteo).finally(() => setLoading(false));
  }, []);

  const inscritas = conteo?.inscrito_RM || 0;
  const subtotal = PRECIOS_PLACEHOLDER.base_mensual + (inscritas * PRECIOS_PLACEHOLDER.por_sociedad_inscrita);

  return (
    <>
      <Topbar title="Facturación" crumbs="Período actual" />
      <div className="app-content">
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="alert alert-info" style={{ fontSize: 12.5 }}>
            <strong>Vista preliminar.</strong> Los detalles de facturación y el método de pago se configuran
            en una sección posterior del sistema. Esta vista muestra una estimación de cargos del período.
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-h"><h3>Plan</h3></div>
          <table className="table-light" style={{ width: '100%', fontSize: 13 }}>
            <tbody>
              <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                <td style={{ padding: '8px 0', color: 'var(--text-dim)' }}>Suscripción base mensual</td>
                <td style={{ textAlign: 'right' }}>{PRECIOS_PLACEHOLDER.moneda} {PRECIOS_PLACEHOLDER.base_mensual.toLocaleString('es', { minimumFractionDigits: 2 })}</td>
              </tr>
              <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                <td style={{ padding: '8px 0', color: 'var(--text-dim)' }}>Cargo por sociedad inscrita en RM</td>
                <td style={{ textAlign: 'right' }}>{PRECIOS_PLACEHOLDER.moneda} {PRECIOS_PLACEHOLDER.por_sociedad_inscrita.toLocaleString('es', { minimumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-h"><h3>Uso del período actual</h3></div>
          {loading ? <div className="empty"><span className="spinner" /></div> : (
            <table className="table-light" style={{ width: '100%', fontSize: 13 }}>
              <tbody>
                <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td style={{ padding: '8px 0' }}>Suscripción base</td>
                  <td style={{ textAlign: 'right' }}>{PRECIOS_PLACEHOLDER.moneda} {PRECIOS_PLACEHOLDER.base_mensual.toLocaleString('es', { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <td style={{ padding: '8px 0' }}>
                    Sociedades inscritas: {inscritas} × {PRECIOS_PLACEHOLDER.moneda} {PRECIOS_PLACEHOLDER.por_sociedad_inscrita}
                  </td>
                  <td style={{ textAlign: 'right' }}>{PRECIOS_PLACEHOLDER.moneda} {(inscritas * PRECIOS_PLACEHOLDER.por_sociedad_inscrita).toLocaleString('es', { minimumFractionDigits: 2 })}</td>
                </tr>
                <tr>
                  <td style={{ padding: '12px 0', fontWeight: 500, fontSize: 14 }}>Subtotal estimado del período</td>
                  <td style={{ textAlign: 'right', fontWeight: 500, fontSize: 14, color: 'var(--gold)' }}>{PRECIOS_PLACEHOLDER.moneda} {subtotal.toLocaleString('es', { minimumFractionDigits: 2 })}</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
