// F1 C5 — Lista global de contratos pendientes del bufete (cross-tenant).
// Ruta: /pendientes
//
// Solo accesible para usuarios admin sin institucion_id (rol bufete).

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, X, AlertCircle } from 'lucide-react';
import { fetchPendientes } from '../../api/pendientes';
import { fetchInstituciones } from '../../api/instituciones';

export default function Pendientes() {
  const nav = useNavigate();
  const [items, setItems] = useState([]);
  const [insts, setInsts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtros, setFiltros] = useState({
    institucion_slug: '',
    dpi_fisico: '',
    dias_min: '',
    dias_max: '',
  });

  useEffect(() => {
    fetchInstituciones().then(setInsts).catch(() => setInsts([]));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchPendientes(filtros)
      .then(setItems)
      .catch((e) => setError(e.response?.data?.error || e.message))
      .finally(() => setLoading(false));
  }, [filtros]);

  const upd = (parche) => setFiltros({ ...filtros, ...parche });

  const totalAlerta = useMemo(() => items.filter((i) => i.dias_esperando >= 7).length, [items]);

  return (
    <>
      <header className="topbar">
        <div>
          <h1 style={{ fontWeight: 500, fontSize: 20, margin: 0, letterSpacing: '-0.01em' }}>Pendientes</h1>
          <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
            Contratos listos para escritura · {items.length} en total{totalAlerta > 0 ? ` · ${totalAlerta} con más de 7 días esperando` : ''}
          </div>
        </div>
      </header>

      <div className="app-content">
        {error && <div className="alert alert-danger" style={{ marginBottom: 14 }}>{error}</div>}

        <Filtros filtros={filtros} upd={upd} insts={insts} />

        <div className="card" style={{ padding: 0, marginTop: 14 }}>
          {loading ? (
            <div className="empty"><span className="spinner" /></div>
          ) : items.length === 0 ? (
            <div className="empty" style={{ padding: 48 }}>
              <div style={{ marginBottom: 8 }}>No hay contratos pendientes con los filtros actuales.</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>Los contratos llegan aquí cuando el banco los marca como "listo para escritura".</div>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Banco</th>
                  <th>Cliente</th>
                  <th>Modelo</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th style={{ textAlign: 'center' }}>Días</th>
                  <th style={{ textAlign: 'center' }}>DPI físico</th>
                  <th>Contrato</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} onClick={() => nav(`/pendientes/${it.id}`)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{it.institucion.nombre}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', textTransform: 'capitalize' }}>{it.institucion.tipo}</div>
                    </td>
                    <td>
                      {it.cliente?.nombre || <span className="muted">—</span>}
                      {it.cliente?.tipo_persona === 'juridica' && (
                        <span style={{ marginLeft: 8, fontSize: 10, padding: '2px 6px', background: '#f0e6fd', color: '#5a2e8c', borderRadius: 3 }}>Jurídico</span>
                      )}
                    </td>
                    <td>{it.modelo.nombre}</td>
                    <td style={{ textAlign: 'right' }}>
                      {it.credito?.monto ? `${it.credito.moneda} ${it.credito.monto}` : <span className="muted">—</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        fontWeight: 500,
                        color: it.dias_esperando >= 7 ? 'var(--danger)' : it.dias_esperando >= 3 ? 'var(--alerta, #b67318)' : 'var(--text)',
                      }}>{it.dias_esperando}</span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <BadgeDpiFisico recibido={it.dpi_fisico_recibido} />
                    </td>
                    <td><code style={{ fontSize: 12 }}>{it.no_contrato}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}

function Filtros({ filtros, upd, insts }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <Field label="Banco / Institución" minWidth={220}>
        <select className="select" value={filtros.institucion_slug} onChange={(e) => upd({ institucion_slug: e.target.value })}>
          <option value="">Todas</option>
          {insts.map((i) => (
            <option key={i.id} value={i.slug}>{i.nombre}</option>
          ))}
        </select>
      </Field>
      <Field label="DPI físico" minWidth={140}>
        <select className="select" value={filtros.dpi_fisico} onChange={(e) => upd({ dpi_fisico: e.target.value })}>
          <option value="">Todos</option>
          <option value="si">Recibido</option>
          <option value="no">Pendiente</option>
        </select>
      </Field>
      <Field label="Días mínimo" minWidth={120}>
        <input className="input" type="number" inputMode="numeric" value={filtros.dias_min} onChange={(e) => upd({ dias_min: e.target.value })} placeholder="0" />
      </Field>
      <Field label="Días máximo" minWidth={120}>
        <input className="input" type="number" inputMode="numeric" value={filtros.dias_max} onChange={(e) => upd({ dias_max: e.target.value })} placeholder="—" />
      </Field>
      {(filtros.institucion_slug || filtros.dpi_fisico || filtros.dias_min || filtros.dias_max) && (
        <button className="btn btn-ghost" onClick={() => upd({ institucion_slug: '', dpi_fisico: '', dias_min: '', dias_max: '' })}>Limpiar</button>
      )}
    </div>
  );
}

function Field({ label, minWidth, children }) {
  return (
    <div style={{ minWidth, flex: '0 1 auto' }}>
      <label style={{ display: 'block', fontSize: 11, color: 'var(--text-dim)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
    </div>
  );
}

export function BadgeDpiFisico({ recibido }) {
  if (recibido) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: '#e6f7ed', color: '#2d6a4f', fontSize: 11, fontWeight: 500 }}>
        <Check size={12} /> Recibido
      </span>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 999, background: '#fce8e8', color: '#a52a2a', fontSize: 11, fontWeight: 500 }}>
      <X size={12} /> Pendiente
    </span>
  );
}
