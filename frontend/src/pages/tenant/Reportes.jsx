import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import { fetchContratos } from '../../api/contratos';

export default function TenantReportes() {
  const { inst } = useOutletContext() || {};
  const [contratos, setContratos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!inst) return;
    setLoading(true);
    fetchContratos({ institucion: inst.slug }).then(setContratos).finally(() => setLoading(false));
  }, [inst?.slug]);

  const reportes = useMemo(() => {
    const porEstado = {};
    const porModelo = {};
    const porMes = {};
    let monto = 0;
    for (const c of contratos) {
      porEstado[c.estado] = (porEstado[c.estado] || 0) + 1;
      porModelo[c.modelo_nombre] = (porModelo[c.modelo_nombre] || 0) + 1;
      const ym = (c.created_at || '').slice(0, 7);
      if (ym) porMes[ym] = (porMes[ym] || 0) + 1;
      monto += Number(c.datos_credito?.monto) || 0;
    }
    return { porEstado, porModelo, porMes, monto };
  }, [contratos]);

  if (!inst) return (<><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>);

  const meses = Object.entries(reportes.porMes).sort((a, b) => a[0].localeCompare(b[0]));
  const maxMes = meses.reduce((m, [, v]) => Math.max(m, v), 1);

  return (
    <>
      <Topbar title="Reportes y estadísticas" crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Reportes')} />} />
      <div className="app-content">
        {loading ? (
          <div className="empty"><span className="spinner" /></div>
        ) : (
          <>
            <div className="grid-stats">
              <div className="stat"><div className="label">Total contratos</div><div className="value">{contratos.length}</div></div>
              <div className="stat"><div className="label">Monto total</div><div className="value">Q{reportes.monto.toLocaleString('es-GT', { minimumFractionDigits: 2 })}</div></div>
              <div className="stat"><div className="label">Modelos en uso</div><div className="value">{Object.keys(reportes.porModelo).length}</div></div>
              <div className="stat"><div className="label">Meses con actividad</div><div className="value">{meses.length}</div></div>
            </div>

            <div className="grid-2" style={{ alignItems: 'start' }}>
              <div className="card">
                <div className="card-h"><h3>Distribución por estado</h3></div>
                {Object.entries(reportes.porEstado).map(([est, n]) => (
                  <div key={est} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span className={'badge badge-' + est} style={{ width: 90 }}>{est}</span>
                    <div style={{ flex: 1, height: 10, background: 'var(--bg)', borderRadius: 4 }}>
                      <div style={{ width: `${(n / contratos.length) * 100}%`, height: '100%', background: 'var(--gold)', borderRadius: 4 }} />
                    </div>
                    <span style={{ width: 30, textAlign: 'right', fontWeight: 600 }}>{n}</span>
                  </div>
                ))}
              </div>

              <div className="card">
                <div className="card-h"><h3>Distribución por modelo</h3></div>
                {Object.entries(reportes.porModelo).map(([mod, n]) => (
                  <div key={mod} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ width: 160, fontSize: 12.5 }}>{mod}</span>
                    <div style={{ flex: 1, height: 10, background: 'var(--bg)', borderRadius: 4 }}>
                      <div style={{ width: `${(n / contratos.length) * 100}%`, height: '100%', background: 'var(--gold)', borderRadius: 4 }} />
                    </div>
                    <span style={{ width: 30, textAlign: 'right', fontWeight: 600 }}>{n}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="card" style={{ marginTop: 14 }}>
              <div className="card-h"><h3>Contratos por mes</h3></div>
              {meses.length === 0 ? (
                <div className="empty">Sin datos suficientes.</div>
              ) : (
                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 140, padding: 14 }}>
                  {meses.map(([ym, n]) => (
                    <div key={ym} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{n}</span>
                      <div style={{ width: '60%', background: 'var(--gold)', borderRadius: 4, height: `${(n / maxMes) * 100}%`, minHeight: 4 }} />
                      <span style={{ fontSize: 10.5, color: 'var(--text-dim)' }}>{ym}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
