import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import { fetchCliente } from '../../api/clientes';
import { fetchContratos } from '../../api/contratos';
import { useStore } from '../../store/useStore';
import client from '../../api/client';

export default function TenantCliente() {
  const { inst } = useOutletContext() || {};
  const { id } = useParams();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const verificar = params.get('verificar') === '1';
  const [cliente, setCliente] = useState(null);
  const [contratos, setContratos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(verificar);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const iniciarContrato = useStore((s) => s.iniciarContrato);
  const cargarCliente = useStore((s) => s.cargarCliente);

  const load = () => {
    if (!inst) return;
    setLoading(true);
    Promise.all([fetchCliente(id), fetchContratos({ institucion: inst.slug })])
      .then(([c, allCt]) => {
        setCliente(c);
        setDraft({ ...c });
        setContratos(allCt.filter((ct) => ct.datos_cliente?.dpi === c.dpi));
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [id, inst?.id, inst?.slug]);

  const guardarYActivar = async () => {
    setSaving(true);
    try {
      const upd = { ...draft, estado: 'activo' };
      await client.put(`/clientes/${id}`, upd);
      setEditing(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const guardarSinActivar = async () => {
    setSaving(true);
    try {
      await client.put(`/clientes/${id}`, draft);
      setEditing(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  if (!inst || loading) return (<><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>);
  if (!cliente) return (<><Topbar title="Cliente" /><div className="app-content"><div className="empty">Cliente no encontrado.</div></div></>);

  const onNuevoContrato = () => {
    const modelo = inst.modelos?.[0];
    if (!modelo) return;
    iniciarContrato({
      institucion_id: inst.id,
      institucion_slug: inst.slug,
      modelo_id: modelo.id,
      modelo_codigos: modelo.clausulas || [],
    });
    cargarCliente(cliente);
    nav('../contratos/nuevo');
  };

  const isPendiente = cliente.estado === 'pendiente';

  const fld = (label, key, type = 'text') => editing ? (
    <div className="field"><label>{label}</label><input className="input" type={type} value={draft[key] || ''} onChange={(e) => setDraft({ ...draft, [key]: e.target.value })} /></div>
  ) : (<><dt>{label}</dt><dd>{cliente[key] || '—'}</dd></>);

  return (
    <>
      <Topbar
        title={cliente.nombre}
        crumbs={<Breadcrumb segments={[...tenantBreadcrumb(inst), { label: 'Clientes', to: `/instituciones/${inst.slug}/clientes` }, { label: cliente.nombre }]} />}
        actions={
          <>
            <span className={'badge ' + (isPendiente ? 'badge-revision' : 'badge-firmado')}>{cliente.estado || 'activo'}</span>
            {!editing && <button className="btn" onClick={() => setEditing(true)}>Editar</button>}
            {editing && (
              <>
                <button className="btn" onClick={() => { setDraft({ ...cliente }); setEditing(false); }}>Cancelar</button>
                {isPendiente ? (
                  <button className="btn btn-gold" onClick={guardarYActivar} disabled={saving}>
                    {saving ? <span className="spinner" /> : 'Guardar y activar cliente'}
                  </button>
                ) : (
                  <button className="btn btn-gold" onClick={guardarSinActivar} disabled={saving}>
                    {saving ? <span className="spinner" /> : 'Guardar cambios'}
                  </button>
                )}
              </>
            )}
            <button className="btn" onClick={() => nav('..')}>← Volver</button>
            {!isPendiente && (
              <button className="btn btn-gold" onClick={onNuevoContrato}>+ Nuevo contrato</button>
            )}
          </>
        }
      />
      <div className="app-content">
        {isPendiente && (
          <div className="alert alert-warn" style={{ display: 'block' }}>
            <strong>Solicitud pendiente de verificación</strong><br />
            Este cliente llenó el formulario público. Revise los datos, corrija lo necesario y active el cliente para que esté disponible en los wizards de contratos.
          </div>
        )}
        <div className="grid-2" style={{ alignItems: 'start', marginBottom: 22 }}>
          <div className="card">
            <div className="card-h"><h3>Datos personales</h3></div>
            {editing ? (
              <>
                {fld('Nombre completo', 'nombre')}
                <div className="row-2">
                  {fld('DPI / CUI', 'dpi')}
                  {fld('NIT', 'nit')}
                </div>
                <div className="row-2">
                  {fld('Estado civil', 'estado_civil')}
                  {fld('Profesión', 'profesion')}
                </div>
                <div className="row-2">
                  {fld('Fecha de nacimiento', 'fecha_nac', 'date')}
                  {fld('Lugar de nacimiento', 'lugar_nac')}
                </div>
                {fld('Domicilio', 'domicilio')}
                <div className="row-2">
                  {fld('Teléfono', 'telefono')}
                  {fld('Email', 'email', 'email')}
                </div>
                <div className="row-2">
                  {fld('Ingresos mensuales (Q)', 'ingresos', 'number')}
                  {fld('Empleo', 'empleo')}
                </div>
              </>
            ) : (
              <dl className="kv">
                <dt>DPI / CUI</dt><dd>{cliente.dpi || '—'}</dd>
                <dt>NIT</dt><dd>{cliente.nit || '—'}</dd>
                <dt>Estado civil</dt><dd>{cliente.estado_civil || '—'}</dd>
                <dt>Profesión</dt><dd>{cliente.profesion || '—'}</dd>
                <dt>Fecha de nacimiento</dt><dd>{cliente.fecha_nac || '—'}</dd>
                <dt>Lugar de nacimiento</dt><dd>{cliente.lugar_nac || '—'}</dd>
                <dt>Domicilio</dt><dd>{cliente.domicilio || '—'}</dd>
                <dt>Teléfono</dt><dd>{cliente.telefono || '—'}</dd>
                <dt>Email</dt><dd>{cliente.email || '—'}</dd>
                <dt>Ingresos</dt><dd>{cliente.ingresos ? `Q${Number(cliente.ingresos).toLocaleString('es-GT')}` : '—'}</dd>
                <dt>Empleo</dt><dd>{cliente.empleo || '—'}</dd>
              </dl>
            )}
          </div>

          <div className="card">
            <div className="card-h"><h3>Documentos</h3></div>
            <dl className="kv">
              <dt>DPI escaneado</dt><dd>{cliente.dpi_scan_path ? <code>{cliente.dpi_scan_path}</code> : <span className="muted">No cargado</span>}</dd>
              <dt>Recibo servicio</dt><dd>{cliente.recibo_path ? <code>{cliente.recibo_path}</code> : <span className="muted">No cargado</span>}</dd>
            </dl>
            <div style={{ marginTop: 14, fontSize: 11.5, color: 'var(--text-dim)' }}>
              Los archivos sólo son accesibles vía <code>GET /api/files/:filename</code> con JWT válido.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Historial de contratos · {contratos.length}</h3>
          </div>
          {contratos.length === 0 ? (
            <div className="empty">Este cliente aún no tiene contratos.</div>
          ) : (
            <table className="tbl">
              <thead><tr><th>No.</th><th>Modelo</th><th>Monto</th><th>Estado</th><th>Fecha</th></tr></thead>
              <tbody>
                {contratos.map((c) => (
                  <tr key={c.id} onClick={() => nav(`../contratos/${c.id}`)}>
                    <td><code>{c.no_contrato}</code></td>
                    <td>{c.modelo_nombre}</td>
                    <td>{c.datos_credito?.moneda || 'Q'} {c.datos_credito?.monto || '—'}</td>
                    <td><span className={'badge badge-' + c.estado}>{c.estado}</span></td>
                    <td className="muted">{c.created_at}</td>
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
