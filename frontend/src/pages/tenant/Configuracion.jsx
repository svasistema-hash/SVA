import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import { updateInstitucion } from '../../api/instituciones';
import { fetchNotarios, createNotario, updateNotario } from '../../api/notarios';

function monthsBetween(a, b) {
  return Math.round((b - a) / (1000 * 60 * 60 * 24 * 30.44));
}

export default function TenantConfiguracion() {
  const { inst, refetchInst } = useOutletContext() || {};
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (inst) {
      setDraft({
        nombre: inst.nombre,
        nit: inst.nit || '',
        registro_mercantil: inst.registro_mercantil || '',
        autorizacion_sib: inst.autorizacion_sib || '',
        cuenta_cobro: inst.cuenta_cobro || '',
        tipo: inst.tipo,
        activo: inst.activo,
      });
    }
  }, [inst?.id]);

  const guardar = async () => {
    setSaving(true);
    setMsg(null);
    try {
      await updateInstitucion(inst.slug, draft);
      await refetchInst();
      setMsg('Cambios guardados');
      setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      setMsg('Error: ' + (e.response?.data?.error || e.message));
    } finally {
      setSaving(false);
    }
  };

  if (!inst || !draft)
    return (<><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>);

  const rep = inst.representante;
  const monthsToVenc = rep?.vencimiento ? monthsBetween(new Date(), new Date(rep.vencimiento)) : null;
  const repVenceProximo = monthsToVenc !== null && monthsToVenc < 6;

  return (
    <>
      <Topbar title="Configuración" crumbs={<Breadcrumb segments={tenantBreadcrumb(inst, 'Institución')} />} />
      <div className="app-content">
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="card">
            <div className="card-h">
              <h3>Datos de la institución</h3>
              {msg && <span style={{ fontSize: 11, color: msg.startsWith('Error') ? 'var(--danger)' : 'var(--success)' }}>{msg}</span>}
            </div>
            <div className="field"><label>Nombre comercial</label><input className="input" value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} /></div>
            <div className="row-2">
              <div className="field"><label>Tipo</label>
                <select className="select" value={draft.tipo} onChange={(e) => setDraft({ ...draft, tipo: e.target.value })}>
                  <option value="banco">Banco</option>
                  <option value="financiera">Financiera</option>
                  <option value="desarrolladora">Desarrolladora</option>
                  <option value="prestamista">Prestamista</option>
                </select>
              </div>
              <div className="field"><label>Slug (URL)</label><input className="input" value={inst.slug} readOnly style={{ background: '#faf9f4' }} /></div>
            </div>
            <div className="row-2">
              <div className="field"><label>NIT</label><input className="input" value={draft.nit} onChange={(e) => setDraft({ ...draft, nit: e.target.value })} /></div>
              <div className="field"><label>Registro Mercantil</label><input className="input" value={draft.registro_mercantil} onChange={(e) => setDraft({ ...draft, registro_mercantil: e.target.value })} /></div>
            </div>
            <div className="field"><label>Autorización SIB</label><input className="input" value={draft.autorizacion_sib} onChange={(e) => setDraft({ ...draft, autorizacion_sib: e.target.value })} /></div>
            <div className="field">
              <label>Cuenta de cobro predeterminada</label>
              <input
                className="input"
                value={draft.cuenta_cobro}
                onChange={(e) => setDraft({ ...draft, cuenta_cobro: e.target.value })}
                placeholder="01-2345-6789"
                style={{ background: 'var(--gold-soft)', borderColor: 'var(--gold-border)' }}
              />
              <div className="help">Se precarga en cada contrato nuevo cuando el tipo de pago es débito automático o depósito en cuenta.</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <button className="btn btn-gold" onClick={guardar} disabled={saving}>{saving ? <span className="spinner" /> : 'Guardar cambios'}</button>
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Representante legal actual</h3>
              <button className="btn" disabled title="API de representantes pendiente">Actualizar representante</button>
            </div>
            {repVenceProximo && (
              <div className="alert alert-warn">
                Mandato vence en <strong>{monthsToVenc} meses</strong>. Recomendado renovar antes del vencimiento.
              </div>
            )}
            {rep ? (
              <dl className="kv">
                <dt>Nombre</dt><dd>{rep.nombre}</dd>
                <dt>DPI</dt><dd>{rep.dpi}</dd>
                <dt>Cargo</dt><dd>{rep.cargo}</dd>
                <dt>Escritura No.</dt><dd>{rep.escritura_no}</dd>
                <dt>Fecha escritura</dt><dd>{rep.escritura_fecha}</dd>
                <dt>Notario</dt><dd>{rep.notario_escritura}</dd>
                <dt>Vence</dt><dd style={{ color: repVenceProximo ? 'var(--danger)' : 'var(--text)' }}>{rep.vencimiento}</dd>
              </dl>
            ) : (
              <div className="empty">Sin representante asignado.</div>
            )}
          </div>
        </div>

        <NotariosSection slug={inst.slug} />

        <div className="card" style={{ marginTop: 22 }}>
          <div className="card-h"><h3>Historial de representantes</h3></div>
          <div className="empty">Sólo el representante activo está cargado. Historial de representantes anteriores se mostrará al implementarse rotación.</div>
        </div>
      </div>
    </>
  );
}

function NotariosSection({ slug }) {
  const [notarios, setNotarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);

  const reload = () => {
    setLoading(true);
    fetchNotarios(slug, { soloActivos: false }).then(setNotarios).finally(() => setLoading(false));
  };

  useEffect(reload, [slug]);

  const toggle = async (n) => {
    await updateNotario(slug, n.id, { activo: n.activo ? 0 : 1 });
    reload();
  };

  return (
    <div className="card" style={{ marginTop: 22 }}>
      <div className="card-h">
        <h3>Notarios autorizados · {notarios.filter((n) => n.activo).length} activos / {notarios.length} totales</h3>
        <button className="btn btn-gold" onClick={() => setShowAdd(true)}>+ Agregar notario</button>
      </div>

      {showAdd && (
        <NotarioForm
          slug={slug}
          onClose={() => setShowAdd(false)}
          onCreated={() => { setShowAdd(false); reload(); }}
        />
      )}

      {loading ? (
        <div className="empty"><span className="spinner" /></div>
      ) : notarios.length === 0 ? (
        <div className="empty">Aún no hay notarios registrados. Agregue el primero para que aparezca en el wizard de contratos.</div>
      ) : (
        <table className="tbl">
          <thead><tr><th>Nombre</th><th>Colegiado</th><th>Teléfono</th><th>Email</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {notarios.map((n) => (
              <tr key={n.id}>
                <td><strong>{n.nombre}</strong></td>
                <td><code>{n.colegiado || '—'}</code></td>
                <td>{n.telefono || '—'}</td>
                <td>{n.email || '—'}</td>
                <td><span className={'badge ' + (n.activo ? 'badge-firmado' : 'badge-borrador')}>{n.activo ? 'activo' : 'inactivo'}</span></td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn btn-ghost" onClick={() => toggle(n)}>
                    {n.activo ? 'Desactivar' : 'Activar'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function NotarioForm({ slug, onClose, onCreated }) {
  const [d, setD] = useState({ nombre: '', colegiado: '', telefono: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const upd = (p) => setD((s) => ({ ...s, ...p }));

  const submit = async () => {
    setSaving(true);
    setErr(null);
    try {
      await createNotario(slug, d);
      onCreated();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ marginBottom: 14, padding: 14, background: 'var(--gold-soft)', border: '1px solid var(--gold-border)', borderRadius: 4 }}>
      <div className="card-h"><h3 style={{ fontSize: 13 }}>Nuevo notario</h3><button className="btn-ghost btn" onClick={onClose}>Cancelar</button></div>
      <div className="row-2">
        <div className="field"><label>Nombre completo *</label><input className="input" value={d.nombre} onChange={(e) => upd({ nombre: e.target.value })} placeholder="Lic. Pedro Hernández García" /></div>
        <div className="field"><label>No. colegiado</label><input className="input" value={d.colegiado} onChange={(e) => upd({ colegiado: e.target.value })} /></div>
      </div>
      <div className="row-2">
        <div className="field"><label>Teléfono</label><input className="input" value={d.telefono} onChange={(e) => upd({ telefono: e.target.value })} /></div>
        <div className="field"><label>Email</label><input className="input" value={d.email} onChange={(e) => upd({ email: e.target.value })} type="email" /></div>
      </div>
      {err && <div className="field-error">{err}</div>}
      <div style={{ textAlign: 'right' }}>
        <button className="btn btn-gold" onClick={submit} disabled={!d.nombre || saving}>{saving ? <span className="spinner" /> : 'Guardar'}</button>
      </div>
    </div>
  );
}
