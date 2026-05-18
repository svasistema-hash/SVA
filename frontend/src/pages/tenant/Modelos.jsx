import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import { fetchModelos, updateModelo, createModelo } from '../../api/instituciones';

const TIPOS = [
  { v: 'personal', l: 'Personal / Fiduciaria', clausulas: 9 },
  { v: 'hipotecaria', l: 'Hipotecaria', clausulas: 11 },
  { v: 'prendaria', l: 'Prendaria', clausulas: 10 },
  { v: 'mixta', l: 'Mixta', clausulas: 12 },
];

export default function TenantModelos() {
  const { inst } = useOutletContext() || {};
  const nav = useNavigate();
  const [modelos, setModelos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);

  const reload = () => {
    if (!inst) return;
    setLoading(true);
    fetchModelos(inst.slug).then(setModelos).finally(() => setLoading(false));
  };

  useEffect(reload, [inst?.slug]);

  const toggle = async (m) => {
    try {
      await updateModelo(inst.slug, m.id, { activo: m.activo ? 0 : 1 });
      reload();
    } catch (e) {
      alert('Error al actualizar: ' + (e.response?.data?.error || e.message));
    }
  };

  if (!inst) return (<><Topbar title="Cargando..." crumbs="Modelos" /><div className="app-content"><div className="empty">Cargando</div></div></>);

  return (
    <>
      <Topbar
        title="Modelos de contrato"
        crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Modelos')} />}
        actions={<button className="btn btn-gold" onClick={() => setShowNew(true)}>Crear modelo</button>}
      />
      <div className="app-content">
        {showNew && (
          <NuevoModeloModal
            slug={inst.slug}
            onClose={() => setShowNew(false)}
            onCreated={(m) => { setShowNew(false); nav(`${m.id}`); }}
          />
        )}

        {loading ? (
          <div className="empty">Cargando modelos</div>
        ) : modelos.length === 0 ? (
          <div className="empty">Aún no hay modelos definidos. Use Crear modelo para empezar.</div>
        ) : (
          <div className="grid-cards">
            {modelos.map((m) => (
              <div key={m.id} className="model-card">
                <div className="row">
                  <div>
                    <h4>{m.nombre}</h4>
                    <span className="tipo">{m.tipo_garantia}</span>
                  </div>
                  <span className={'badge ' + (m.activo ? 'badge-firmado' : 'badge-borrador')}>
                    {m.activo ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="clausulas">{(m.clausulas || []).length} cláusulas</div>
                <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="btn btn-gold btn-sm" onClick={() => nav(`/instituciones/${inst.slug}/modelos/${m.id}`)}>Editar</button>
                  <button className="btn btn-sm" onClick={() => toggle(m)}>
                    {m.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function NuevoModeloModal({ slug, onClose, onCreated }) {
  const [d, setD] = useState({ nombre: '', tipo_garantia: 'personal' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    if (!d.nombre.trim()) { setErr('Nombre requerido'); return; }
    setSaving(true); setErr(null);
    try {
      const m = await createModelo(slug, d);
      onCreated(m);
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const seleccionado = TIPOS.find((t) => t.v === d.tipo_garantia);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(19,20,26,0.55)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20 }} onClick={onClose}>
      <div className="card" style={{ width: 560, maxWidth: '95vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="card-h">
          <h3>Crear modelo de contrato</h3>
          <button className="btn-ghost btn" onClick={onClose}>Cerrar</button>
        </div>

        <div className="field">
          <label>Nombre del modelo</label>
          <input
            className="input"
            value={d.nombre}
            onChange={(e) => setD({ ...d, nombre: e.target.value })}
            placeholder="Crédito Hipotecario 2026"
            autoFocus
          />
        </div>

        <div className="field">
          <label>Tipo de garantía</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {TIPOS.map((t) => (
              <label
                key={t.v}
                style={{
                  padding: 12,
                  border: '1px solid ' + (d.tipo_garantia === t.v ? 'var(--gold)' : 'var(--border-mid)'),
                  background: d.tipo_garantia === t.v ? 'var(--gold-pale)' : '#fff',
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <input
                  type="radio"
                  checked={d.tipo_garantia === t.v}
                  onChange={() => setD({ ...d, tipo_garantia: t.v })}
                />
                <div>
                  <div style={{ fontWeight: 500, fontSize: 13 }}>{t.l}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{t.clausulas} cláusulas base</div>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="alert alert-info">
          Al crear el modelo se pre-cargarán automáticamente {seleccionado?.clausulas} cláusulas estándar para el tipo seleccionado.
          Luego puede modificarlas, reordenarlas o quitarlas según sea necesario.
        </div>

        {err && <div className="alert alert-danger">{err}</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn btn-gold" onClick={submit} disabled={!d.nombre.trim() || saving}>
            {saving ? 'Creando...' : 'Crear modelo'}
          </button>
        </div>
      </div>
    </div>
  );
}
