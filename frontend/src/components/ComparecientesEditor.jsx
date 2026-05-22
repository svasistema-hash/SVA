// Sprint garantías-desacopladas CP4-B — Editor reusable de comparecientes.
//
// Usado en 3 superficies:
//   1. SolicitudDetalle (banco)   → mode='auth', actor='banco' (inferido del JWT en server)
//   2. PendienteDetalle (bufete)  → mode='auth', actor='bufete' (inferido del JWT)
//   3. SolicitudPublica (cliente) → mode='public', actor='cliente', cap 1
//
// Props:
//   - contratoId: id del contrato vivo (modo auth).
//   - token:      token público del portal C6 (modo public).
//   - mode:       'auth' | 'public'.
//   - readOnly:   true si el contrato está congelado (no permite cambios).
//   - cap:        número máx de comparecientes (default: Infinity en auth, 1 en public).
//   - onChange:   callback opcional cuando se agrega/edita/quita un compareciente.
//
// Solo el cliente público está limitado a 1; banco/bufete sin tope.

import { useEffect, useState } from 'react';
import { Plus, Trash2, AlertCircle } from 'lucide-react';
import {
  ROLES,
  listComparecientesDelContrato, vincularCompareciente, desvincularCompareciente,
  createCompareciente, fetchComparecientes,
  publicListComparecientes, publicCreateCompareciente, publicDeleteCompareciente,
} from '../api/garantias';

export default function ComparecientesEditor({
  contratoId, token, institucionId,
  mode = 'auth', readOnly = false,
  cap, onChange,
}) {
  const [comparecientes, setComparecientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const efectivoCap = cap != null ? cap : (mode === 'public' ? 1 : Infinity);

  const recargar = async () => {
    setLoading(true); setError(null);
    try {
      const rows = mode === 'public'
        ? await publicListComparecientes(token)
        : await listComparecientesDelContrato(contratoId);
      setComparecientes(rows);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { recargar(); }, [contratoId, token, mode]);

  const eliminar = async (compId) => {
    if (!confirm('¿Quitar este compareciente del contrato?')) return;
    setError(null);
    try {
      if (mode === 'public') await publicDeleteCompareciente(token, compId);
      else await desvincularCompareciente(contratoId, compId);
      await recargar();
      onChange?.();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const agregar = async (datos) => {
    setError(null);
    try {
      if (mode === 'public') {
        // Endpoint público crea + vincula en una sola llamada.
        await publicCreateCompareciente(token, datos);
      } else {
        // Auth: primero crear/reusar en catálogo, luego vincular.
        let compId;
        try {
          const c = await createCompareciente({ institucion_id: institucionId, ...datos });
          compId = c.id;
        } catch (e) {
          if (e.response?.status === 409 && e.response.data?.existing_id) {
            compId = e.response.data.existing_id;
          } else {
            throw e;
          }
        }
        await vincularCompareciente(contratoId, { compareciente_id: compId, rol: datos.rol });
      }
      setShowForm(false);
      await recargar();
      onChange?.();
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    }
  };

  const capAlcanzado = comparecientes.length >= efectivoCap;

  return (
    <div className="card">
      <div className="card-h">
        <h3>Comparecientes <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>({comparecientes.length}{efectivoCap !== Infinity ? `/${efectivoCap}` : ''})</span></h3>
        {!readOnly && !capAlcanzado && !showForm && (
          <button className="btn btn-sm btn-gold" onClick={() => setShowForm(true)}>
            <Plus size={12} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />
            Agregar
          </button>
        )}
      </div>

      {mode === 'public' && (
        <div className="alert alert-info" style={{ fontSize: 12.5, margin: '8px 0' }}>
          Si tiene un fiador o garante, puede agregarlo aquí. <strong>Máximo 1 desde el portal</strong>;
          el banco puede completar el resto. Es opcional — déjelo vacío si no tiene.
        </div>
      )}

      {error && <div className="alert alert-danger" style={{ fontSize: 12.5 }}><AlertCircle size={14} style={{ verticalAlign: 'text-bottom', marginRight: 4 }} />{error}</div>}

      {loading ? (
        <div className="empty"><span className="spinner" /></div>
      ) : comparecientes.length === 0 && !showForm ? (
        <div className="muted" style={{ fontSize: 12.5, padding: '8px 0' }}>
          No hay comparecientes registrados.
        </div>
      ) : (
        <table className="table-light" style={{ width: '100%', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--text-dim)', fontSize: 11.5 }}>
              <th style={{ paddingBottom: 6 }}>Nombre</th>
              <th>DPI</th>
              <th>Rol</th>
              <th>Agregado por</th>
              {!readOnly && <th />}
            </tr>
          </thead>
          <tbody>
            {comparecientes.map((c) => (
              <tr key={c.compareciente_id || c.id} style={{ borderTop: '0.5px solid var(--border)' }}>
                <td style={{ padding: '6px 0' }}>{c.nombre || '—'}</td>
                <td className="muted">{c.dpi || '—'}</td>
                <td><span className={'badge ' + (c.rol === 'fiador' ? 'badge-firmado' : 'badge-borrador')}>{c.rol === 'fiador' ? 'Fiador' : 'Tercero garante'}</span></td>
                <td className="muted" style={{ fontSize: 11.5 }}>{c.agregado_por_actor || '—'}</td>
                {!readOnly && (
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-sm btn-ghost" onClick={() => eliminar(c.compareciente_id || c.id)} title="Quitar">
                      <Trash2 size={12} />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showForm && !readOnly && !capAlcanzado && (
        <FormCompareciente onSubmit={agregar} onCancel={() => setShowForm(false)} />
      )}
    </div>
  );
}

function FormCompareciente({ onSubmit, onCancel }) {
  const [d, setD] = useState({
    nombre: '', dpi: '', fecha_nac: '', genero: '',
    profesion: '', estado_civil: '', domicilio: '',
    rol: 'fiador',
  });
  const [submitting, setSubmitting] = useState(false);
  // Sprint CP5 — fecha_nac y genero ahora son requeridos: sin esos campos el
  // motor F7 renderiza '[EDAD]' y el contrato queda inválido para firma.
  const valid = d.nombre.trim() && d.dpi.trim() && d.rol && d.fecha_nac && d.genero;

  const submit = async (e) => {
    e?.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    try { await onSubmit(d); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={submit} style={{ marginTop: 12, padding: 12, background: '#faf9f4', borderRadius: 6, border: '0.5px dashed var(--border-mid)' }}>
      <div className="row-2">
        <div className="field"><label>Nombre completo *</label>
          <input className="input" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} autoFocus />
        </div>
        <div className="field"><label>DPI *</label>
          <input className="input" value={d.dpi} onChange={(e) => setD({ ...d, dpi: e.target.value })} placeholder="XXXX XXXXX XXXX" />
        </div>
      </div>
      <div className="row-2">
        <div className="field"><label>Fecha de nacimiento *</label>
          <input className="input" type="date" value={d.fecha_nac} onChange={(e) => setD({ ...d, fecha_nac: e.target.value })} max={new Date().toISOString().slice(0, 10)} />
        </div>
        <div className="field"><label>Género *</label>
          <select className="input" value={d.genero} onChange={(e) => setD({ ...d, genero: e.target.value })}>
            <option value="">—</option>
            <option value="M">Masculino</option>
            <option value="F">Femenino</option>
          </select>
        </div>
      </div>
      <div className="row-2">
        <div className="field"><label>Profesión</label>
          <input className="input" value={d.profesion} onChange={(e) => setD({ ...d, profesion: e.target.value })} />
        </div>
        <div className="field"><label>Estado civil</label>
          <select className="input" value={d.estado_civil} onChange={(e) => setD({ ...d, estado_civil: e.target.value })}>
            <option value="">—</option>
            <option value="soltero">Soltero/a</option>
            <option value="casado">Casado/a</option>
            <option value="divorciado">Divorciado/a</option>
            <option value="viudo">Viudo/a</option>
          </select>
        </div>
      </div>
      <div className="field"><label>Domicilio</label>
        <input className="input" value={d.domicilio} onChange={(e) => setD({ ...d, domicilio: e.target.value })} />
      </div>
      <div className="field"><label>Rol en este contrato *</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {ROLES.map((r) => (
            <label key={r.value}
              style={{
                padding: 10,
                border: '1px solid ' + (d.rol === r.value ? 'var(--gold)' : 'var(--border-mid)'),
                background: d.rol === r.value ? 'var(--gold-pale)' : '#fff',
                borderRadius: 'var(--radius-md)',
                cursor: 'pointer',
              }}
            >
              <input type="radio" checked={d.rol === r.value} onChange={() => setD({ ...d, rol: r.value })} style={{ marginRight: 6 }} />
              <strong style={{ fontSize: 13 }}>{r.label}</strong>
              <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>{r.desc}</div>
            </label>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
        <button type="button" className="btn btn-sm" onClick={onCancel} disabled={submitting}>Cancelar</button>
        <button type="submit" className="btn btn-sm btn-gold" disabled={!valid || submitting}>
          {submitting ? 'Guardando…' : 'Agregar compareciente'}
        </button>
      </div>
    </form>
  );
}
