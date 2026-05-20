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
        // Identificación básica
        nombre: inst.nombre || '',
        razon_social: inst.razon_social || '',
        tipo: inst.tipo,
        tipo_sociedad: inst.tipo_sociedad || '',
        nit: inst.nit || '',
        cuenta_cobro: inst.cuenta_cobro || '',
        autorizacion_sib: inst.autorizacion_sib || '',
        registro_mercantil: inst.registro_mercantil || '',
        objeto_social: inst.objeto_social || '',
        direccion_fiscal: inst.direccion_fiscal || '',
        // Escritura de constitución
        escritura_numero: inst.escritura_numero || '',
        escritura_fecha: inst.escritura_fecha || '',
        escritura_notario: inst.escritura_notario || '',
        // Registro mercantil estructurado
        rm_numero: inst.rm_numero || '',
        rm_folio: inst.rm_folio || '',
        rm_libro: inst.rm_libro || '',
        rm_fecha: inst.rm_fecha || '',
        // Patentes
        patente_sociedad_numero: inst.patente_sociedad_numero || '',
        patente_sociedad_fecha: inst.patente_sociedad_fecha || '',
        patente_empresa_numero: inst.patente_empresa_numero || '',
        patente_empresa_fecha: inst.patente_empresa_fecha || '',
        // Capital social
        capital_autorizado: inst.capital_autorizado || '',
        capital_suscrito: inst.capital_suscrito || '',
        capital_pagado: inst.capital_pagado || '',
        // Operación
        regimen_tributario: inst.regimen_tributario || '',
        actividad_economica: inst.actividad_economica || '',
        fecha_inicio_actividades: inst.fecha_inicio_actividades || '',
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

            <Seccion titulo="Identificación">
              <div className="field"><label>Nombre comercial *</label><input className="input" value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} /></div>
              <div className="field"><label>Razón social</label><input className="input" value={draft.razon_social} onChange={(e) => setDraft({ ...draft, razon_social: e.target.value })} placeholder="Banco RSG, Sociedad Anónima" /></div>
              <div className="row-2">
                <div className="field"><label>Tipo</label>
                  <select className="select" value={draft.tipo} onChange={(e) => setDraft({ ...draft, tipo: e.target.value })}>
                    <option value="banco">Banco</option>
                    <option value="financiera">Financiera</option>
                    <option value="desarrolladora">Desarrolladora</option>
                    <option value="prestamista">Prestamista</option>
                  </select>
                </div>
                <div className="field"><label>Tipo de sociedad</label>
                  <select className="select" value={draft.tipo_sociedad} onChange={(e) => setDraft({ ...draft, tipo_sociedad: e.target.value })}>
                    <option value="">—</option>
                    <option value="S.A.">S.A. — Sociedad Anónima</option>
                    <option value="S.R.L.">S.R.L. — Sociedad de Responsabilidad Limitada</option>
                    <option value="Sociedad Civil">Sociedad Civil</option>
                    <option value="E.M.I.">E.M.I. — Empresa Mercantil Individual</option>
                    <option value="Cooperativa">Cooperativa</option>
                    <option value="Asociación/Fundación">Asociación / Fundación</option>
                    <option value="Otra">Otra</option>
                  </select>
                </div>
              </div>
              <div className="row-2">
                <div className="field"><label>NIT</label><input className="input" value={draft.nit} onChange={(e) => setDraft({ ...draft, nit: e.target.value })} /></div>
                <div className="field"><label>Slug (URL)</label><input className="input" value={inst.slug} readOnly style={{ background: '#faf9f4' }} /></div>
              </div>
              <div className="field"><label>Objeto social</label><textarea className="input" value={draft.objeto_social} onChange={(e) => setDraft({ ...draft, objeto_social: e.target.value })} rows={2} placeholder="Operaciones bancarias y financieras conforme a la Ley de Bancos y Grupos Financieros..." style={{ resize: 'vertical' }} /></div>
              <div className="field"><label>Dirección fiscal</label><input className="input" value={draft.direccion_fiscal} onChange={(e) => setDraft({ ...draft, direccion_fiscal: e.target.value })} placeholder="5a avenida 10-25 zona 9, Ciudad de Guatemala" /></div>
            </Seccion>

            <Seccion titulo="Escritura de constitución">
              <div className="row-3">
                <div className="field"><label>Escritura No.</label><input className="input" value={draft.escritura_numero} onChange={(e) => setDraft({ ...draft, escritura_numero: e.target.value })} /></div>
                <div className="field"><label>Fecha</label><input className="input" type="date" value={draft.escritura_fecha} onChange={(e) => setDraft({ ...draft, escritura_fecha: e.target.value })} /></div>
                <div className="field"><label>Notario autorizante</label><input className="input" value={draft.escritura_notario} onChange={(e) => setDraft({ ...draft, escritura_notario: e.target.value })} /></div>
              </div>
            </Seccion>

            <Seccion titulo="Inscripción en Registro Mercantil">
              <div className="row-3">
                <div className="field"><label>Número</label><input className="input" value={draft.rm_numero} onChange={(e) => setDraft({ ...draft, rm_numero: e.target.value })} /></div>
                <div className="field"><label>Folio</label><input className="input" value={draft.rm_folio} onChange={(e) => setDraft({ ...draft, rm_folio: e.target.value })} /></div>
                <div className="field"><label>Libro</label><input className="input" value={draft.rm_libro} onChange={(e) => setDraft({ ...draft, rm_libro: e.target.value })} /></div>
              </div>
              <div className="row-2">
                <div className="field"><label>Fecha inscripción</label><input className="input" type="date" value={draft.rm_fecha} onChange={(e) => setDraft({ ...draft, rm_fecha: e.target.value })} /></div>
                <div className="field"><label>Registro mercantil (texto libre, opcional)</label><input className="input" value={draft.registro_mercantil} onChange={(e) => setDraft({ ...draft, registro_mercantil: e.target.value })} placeholder="Folio 22, Libro 5 (display alternativo)" /></div>
              </div>
            </Seccion>

            <Seccion titulo="Patentes">
              <div className="row-2">
                <div className="field"><label>Patente de sociedad No.</label><input className="input" value={draft.patente_sociedad_numero} onChange={(e) => setDraft({ ...draft, patente_sociedad_numero: e.target.value })} /></div>
                <div className="field"><label>Fecha patente sociedad</label><input className="input" type="date" value={draft.patente_sociedad_fecha} onChange={(e) => setDraft({ ...draft, patente_sociedad_fecha: e.target.value })} /></div>
              </div>
              <div className="row-2">
                <div className="field"><label>Patente de empresa No.</label><input className="input" value={draft.patente_empresa_numero} onChange={(e) => setDraft({ ...draft, patente_empresa_numero: e.target.value })} /></div>
                <div className="field"><label>Fecha patente empresa</label><input className="input" type="date" value={draft.patente_empresa_fecha} onChange={(e) => setDraft({ ...draft, patente_empresa_fecha: e.target.value })} /></div>
              </div>
            </Seccion>

            <Seccion titulo="Capital social (encriptado)">
              <div className="row-3">
                <div className="field"><label>Capital autorizado (Q)</label><input className="input" type="number" step="0.01" value={draft.capital_autorizado} onChange={(e) => setDraft({ ...draft, capital_autorizado: e.target.value })} /></div>
                <div className="field"><label>Capital suscrito (Q)</label><input className="input" type="number" step="0.01" value={draft.capital_suscrito} onChange={(e) => setDraft({ ...draft, capital_suscrito: e.target.value })} /></div>
                <div className="field"><label>Capital pagado (Q)</label><input className="input" type="number" step="0.01" value={draft.capital_pagado} onChange={(e) => setDraft({ ...draft, capital_pagado: e.target.value })} /></div>
              </div>
            </Seccion>

            <Seccion titulo="Operación y régimen">
              <div className="row-2">
                <div className="field"><label>Régimen tributario</label>
                  <select className="select" value={draft.regimen_tributario} onChange={(e) => setDraft({ ...draft, regimen_tributario: e.target.value })}>
                    <option value="">—</option>
                    <option value="general">Régimen General</option>
                    <option value="pequeno_contribuyente">Pequeño Contribuyente</option>
                    <option value="opcional_simplificado">Opcional Simplificado sobre Ingresos</option>
                    <option value="utilidades">Régimen sobre Utilidades</option>
                  </select>
                </div>
                <div className="field"><label>Fecha inicio de actividades</label><input className="input" type="date" value={draft.fecha_inicio_actividades} onChange={(e) => setDraft({ ...draft, fecha_inicio_actividades: e.target.value })} /></div>
              </div>
              <div className="field"><label>Actividad económica</label><input className="input" value={draft.actividad_economica} onChange={(e) => setDraft({ ...draft, actividad_economica: e.target.value })} placeholder="Intermediación financiera, banca múltiple..." /></div>
              <div className="field"><label>Autorización SIB</label><input className="input" value={draft.autorizacion_sib} onChange={(e) => setDraft({ ...draft, autorizacion_sib: e.target.value })} placeholder="Resolución SIB-2024-XXX" /></div>
            </Seccion>

            <Seccion titulo="Operación financiera">
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
            </Seccion>

            <div style={{ textAlign: 'right', paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
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

// Sección colapsable visual para agrupar campos del formulario de institución.
function Seccion({ titulo, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{
        fontSize: 11, color: 'var(--text-dim)', textTransform: 'uppercase',
        letterSpacing: '0.08em', fontWeight: 500,
        paddingBottom: 6, marginBottom: 12,
        borderBottom: '0.5px solid var(--border)',
      }}>{titulo}</div>
      {children}
    </div>
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
