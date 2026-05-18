import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useParams } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import Breadcrumb from '../../components/Breadcrumb';
import { tenantBreadcrumb } from '../../utils/breadcrumb';
import {
  fetchModelo,
  updateModelo,
  fetchClausulasDeModelo,
  agregarClausulasAlModelo,
  quitarClausulaDelModelo,
  reordenarClausulasDelModelo,
  fetchBibliotecaClausulas,
  updateClausulaById,
} from '../../api/instituciones';

const ROMANOS = ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX'];

function toRomano(n) {
  return ROMANOS[n - 1] || String(n);
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40) || 'clausula';
}

function detectVars(text) {
  return Array.from(new Set((text.match(/\{\{(\w+)\}\}/g) || []).map((m) => m.slice(2, -2))));
}

function highlightVars(text) {
  const parts = text.split(/(\{\{\w+\}\})/g);
  return parts.map((p, i) =>
    /\{\{\w+\}\}/.test(p) ? <span key={i} className="var-chip">{p}</span> : <span key={i}>{p}</span>
  );
}

export default function TenantModeloEdit() {
  const { inst } = useOutletContext() || {};
  const { id } = useParams();
  const nav = useNavigate();
  const [modelo, setModelo] = useState(null);
  const [clausulas, setClausulas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState({ titulo: '', texto_base: '' });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState(null);
  const [showBiblio, setShowBiblio] = useState(false);

  const load = () => {
    if (!inst) return;
    setLoading(true);
    Promise.all([fetchModelo(inst.slug, id), fetchClausulasDeModelo(id)])
      .then(([m, cs]) => {
        setModelo(m);
        setClausulas(cs);
        if (cs.length) {
          const stillExists = selected && cs.find((c) => c.id === selected);
          const target = stillExists || cs[0];
          setSelected(target.id);
          setDraft({ titulo: target.titulo, texto_base: target.texto_base });
        } else {
          setSelected(null);
          setDraft({ titulo: '', texto_base: '' });
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [inst?.slug, id]);

  const selectClausula = (c) => {
    setSelected(c.id);
    setDraft({ titulo: c.titulo, texto_base: c.texto_base });
    setSavedMsg(null);
  };

  const guardar = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateClausulaById(selected, draft);
      setSavedMsg('Guardado');
      setTimeout(() => setSavedMsg(null), 2500);
      load();
    } finally {
      setSaving(false);
    }
  };

  const move = async (idx, dir) => {
    const cs = [...clausulas];
    const j = idx + dir;
    if (j < 0 || j >= cs.length) return;
    [cs[idx], cs[j]] = [cs[j], cs[idx]];
    await reordenarClausulasDelModelo(modelo.id, cs.map((c) => ({ id: c.id })));
    load();
  };

  const quitar = async (c) => {
    if (!confirm(`¿Quitar "${c.titulo}" de este modelo?`)) return;
    await quitarClausulaDelModelo(modelo.id, c.id);
    if (selected === c.id) setSelected(null);
    load();
  };

  const variables = useMemo(() => detectVars(draft.texto_base), [draft.texto_base]);

  if (!inst || loading)
    return (<><Topbar title="Cargando modelo…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>);
  if (!modelo)
    return (<><Topbar title="Modelo" /><div className="app-content"><div className="empty">Modelo no encontrado.</div></div></>);

  const clausulaActiva = clausulas.find((c) => c.id === selected);

  return (
    <>
      <Topbar
        title={modelo.nombre}
        crumbs={<Breadcrumb segments={[...tenantBreadcrumb(inst), { label: 'Modelos', to: `/instituciones/${inst.slug}/modelos` }, { label: modelo.nombre }]} />}
        actions={
          <>
            <button className="btn btn-gold" onClick={() => setShowBiblio(true)}>+ Agregar cláusulas desde biblioteca</button>
            <button className="btn" onClick={() => nav('..')}>← Volver a modelos</button>
          </>
        }
      />
      <div className="app-content">
        {clausulas.length === 0 && (
          <div className="card" style={{ background: 'var(--gold-soft)', border: '1px dashed var(--gold)', marginBottom: 14, textAlign: 'center', padding: 28 }}>
            <h3 style={{ marginTop: 0 }}>Este modelo no tiene cláusulas asignadas</h3>
            <p className="muted" style={{ fontSize: 12.5 }}>Agregue una o varias desde la biblioteca compartida (cláusulas estándar guatemaltecas).</p>
            <button className="btn btn-gold" onClick={() => setShowBiblio(true)}>+ Agregar cláusulas desde biblioteca</button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 18 }}>
          <div>
            <div className="card-h"><h3>Cláusulas · {clausulas.length}</h3></div>
            <p className="muted" style={{ fontSize: 11.5, marginTop: 0 }}>Flechas ↑↓ reordena · × quita del modelo</p>
            {clausulas.map((c, i) => (
              <div key={c.id} className={'clausula-row' + (selected === c.id ? ' active' : '')} onClick={() => selectClausula(c)}>
                <div className="orden">{toRomano(i + 1)}</div>
                <div className="body">
                  <div className="codigo">
                    {c.codigo}
                    {c.obligatoria ? <span style={{ marginLeft: 6, color: 'var(--gold)', fontWeight: 600 }}>· obligatoria</span> : <span style={{ marginLeft: 6, color: 'var(--text-tertiary)' }}>· opcional</span>}
                  </div>
                  <div className="titulo">{c.titulo}</div>
                </div>
                <div className="arrows" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                  <button onClick={() => move(i, +1)} disabled={i === clausulas.length - 1}>↓</button>
                </div>
                <button
                  className="btn btn-sm btn-danger"
                  onClick={(e) => { e.stopPropagation(); quitar(c); }}
                  title="Quitar del modelo"
                >Quitar</button>
              </div>
            ))}
            <button
              className="btn"
              style={{ width: '100%', marginTop: 8, justifyContent: 'center' }}
              onClick={() => setShowBiblio(true)}
            >Agregar cláusula</button>
            {clausulas.length === 0 && (
              <div className="empty" style={{ padding: 18, fontSize: 12 }}>
                Aún no hay cláusulas.
              </div>
            )}
          </div>

          <div>
            <div className="card">
              <div className="card-h">
                <h3>Editar cláusula</h3>
                {savedMsg && <span style={{ color: 'var(--success)', fontSize: 12 }}>{savedMsg}</span>}
              </div>
              {clausulaActiva ? (
                <>
                  <div className="field">
                    <label>Código</label>
                    <input className="input" value={clausulaActiva.codigo} readOnly style={{ background: '#faf9f4' }} />
                  </div>
                  <div className="field">
                    <label>Título</label>
                    <input className="input" value={draft.titulo} onChange={(e) => setDraft({ ...draft, titulo: e.target.value })} />
                  </div>
                  <div className="field">
                    <label>Texto base (use {`{{variable}}`} para campos dinámicos)</label>
                    <textarea
                      className="texto-editor"
                      rows={10}
                      value={draft.texto_base}
                      onChange={(e) => setDraft({ ...draft, texto_base: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>Variables detectadas · {variables.length}</label>
                    <div>{variables.length === 0 ? <span className="muted">Ninguna</span> : variables.map((v) => <span key={v} className="var-chip">{`{{${v}}}`}</span>)}</div>
                  </div>
                  <div className="field">
                    <label>Vista previa</label>
                    <div style={{ padding: 14, border: '1px solid var(--border)', borderRadius: 4, fontFamily: 'Cormorant Garamond, serif', fontSize: '13pt', lineHeight: 1.7, background: '#fffdf9' }}>
                      {highlightVars(draft.texto_base)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <button className="btn btn-gold" onClick={guardar} disabled={saving}>
                      {saving ? <span className="spinner" /> : 'Guardar cambios'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="empty">
                  {clausulas.length === 0
                    ? 'Agregue cláusulas desde la biblioteca para empezar.'
                    : 'Seleccione una cláusula a la izquierda.'}
                </div>
              )}
            </div>
          </div>
        </div>

        {showBiblio && (
          <BibliotecaModal
            slug={inst.slug}
            modeloId={modelo.id}
            yaIncluidos={new Set(clausulas.map((c) => c.codigo))}
            onClose={() => setShowBiblio(false)}
            onDone={() => { setShowBiblio(false); load(); }}
          />
        )}
      </div>
    </>
  );
}

function BibliotecaModal({ slug, modeloId, yaIncluidos, onClose, onDone }) {
  const [tab, setTab] = useState('biblioteca');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [seleccionados, setSeleccionados] = useState(new Set());
  const [nueva, setNueva] = useState({ titulo: '', texto_base: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    fetchBibliotecaClausulas(slug).then(setItems).finally(() => setLoading(false));
  }, [slug]);

  const toggle = (codigo) => {
    const s = new Set(seleccionados);
    if (s.has(codigo)) s.delete(codigo); else s.add(codigo);
    setSeleccionados(s);
  };

  const agregarBiblio = async () => {
    if (seleccionados.size === 0) return;
    setSaving(true); setErr(null);
    try {
      const payload = items.filter((i) => seleccionados.has(i.codigo));
      await agregarClausulasAlModelo(modeloId, payload);
      onDone();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const crearNueva = async () => {
    if (!nueva.titulo.trim() || !nueva.texto_base.trim()) {
      setErr('Título y texto son requeridos');
      return;
    }
    setSaving(true); setErr(null);
    try {
      const codigo = slugify(nueva.titulo) + '-' + Date.now().toString().slice(-4);
      const vars = detectVars(nueva.texto_base);
      await agregarClausulasAlModelo(modeloId, [{
        codigo,
        titulo: nueva.titulo,
        texto_base: nueva.texto_base,
        variables: vars,
        obligatoria: 0,
      }]);
      onDone();
    } catch (e) {
      setErr(e.response?.data?.error || e.message);
    } finally {
      setSaving(false);
    }
  };

  const varsNueva = detectVars(nueva.texto_base);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(19,20,26,0.55)', display: 'grid', placeItems: 'center', zIndex: 1000, padding: 20 }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: 720, maxWidth: '95vw', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-h">
          <h3>Agregar cláusula</h3>
          <button className="btn-ghost btn" onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 14, borderBottom: '1px solid var(--border-light)' }}>
          <button
            className="btn-ghost btn"
            style={{
              borderRadius: 0,
              borderBottom: '2px solid ' + (tab === 'biblioteca' ? 'var(--gold)' : 'transparent'),
              color: tab === 'biblioteca' ? 'var(--text-primary)' : 'var(--text-tertiary)',
              padding: '8px 16px',
            }}
            onClick={() => setTab('biblioteca')}
          >Desde biblioteca global</button>
          <button
            className="btn-ghost btn"
            style={{
              borderRadius: 0,
              borderBottom: '2px solid ' + (tab === 'nueva' ? 'var(--gold)' : 'transparent'),
              color: tab === 'nueva' ? 'var(--text-primary)' : 'var(--text-tertiary)',
              padding: '8px 16px',
            }}
            onClick={() => setTab('nueva')}
          >Crear cláusula nueva</button>
        </div>

        {tab === 'biblioteca' && (
          <>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              Seleccione una o varias cláusulas estándar para agregar al modelo.
            </p>
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
              {loading ? (
                <div className="empty"><span className="spinner" /></div>
              ) : items.length === 0 ? (
                <div className="empty">Biblioteca vacía.</div>
              ) : (
                items.map((c) => {
                  const incluida = yaIncluidos.has(c.codigo);
                  const marcada = seleccionados.has(c.codigo);
                  return (
                    <label
                      key={c.codigo}
                      style={{
                        display: 'block', padding: 12, marginBottom: 8,
                        border: '1px solid ' + (marcada ? 'var(--gold)' : 'var(--border-light)'),
                        background: incluida ? 'var(--bg-subtle)' : marcada ? 'var(--gold-pale)' : '#fff',
                        borderRadius: 'var(--radius-md)',
                        opacity: incluida ? 0.55 : 1,
                        cursor: incluida ? 'not-allowed' : 'pointer',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <input
                          type="checkbox"
                          checked={marcada}
                          disabled={incluida}
                          onChange={() => !incluida && toggle(c.codigo)}
                          style={{ marginTop: 4 }}
                        />
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                            <span className="tag">{c.codigo}</span>
                            {incluida && <span className="badge badge-firmado">Incluida</span>}
                          </div>
                          <div style={{ fontFamily: 'Libre Baskerville, serif', fontSize: 14 }}>{c.titulo}</div>
                          <div style={{ fontFamily: 'EB Garamond, serif', fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 6, lineHeight: 1.5 }}>
                            {c.texto_base.slice(0, 200)}{c.texto_base.length > 200 ? '…' : ''}
                          </div>
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            {err && <div className="alert alert-danger" style={{ marginTop: 8 }}>{err}</div>}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
              <span className="muted" style={{ fontSize: 11 }}>{seleccionados.size} seleccionada(s)</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={onClose}>Cancelar</button>
                <button className="btn btn-gold" onClick={agregarBiblio} disabled={seleccionados.size === 0 || saving}>
                  {saving ? <span className="spinner" /> : 'Agregar seleccionadas'}
                </button>
              </div>
            </div>
          </>
        )}

        {tab === 'nueva' && (
          <>
            <p className="muted" style={{ marginTop: 0, fontSize: 12 }}>
              Cree una cláusula propia para este modelo. Use {`{{variable}}`} para campos dinámicos.
            </p>
            <div style={{ overflowY: 'auto', flex: 1, paddingRight: 4 }}>
              <div className="field">
                <label>Título de la cláusula</label>
                <input
                  className="input"
                  value={nueva.titulo}
                  onChange={(e) => setNueva({ ...nueva, titulo: e.target.value })}
                  placeholder="Cláusula adicional — Compromiso de no enajenar"
                />
              </div>
              <div className="field">
                <label>Texto base</label>
                <textarea
                  className="texto-editor"
                  rows={8}
                  value={nueva.texto_base}
                  onChange={(e) => setNueva({ ...nueva, texto_base: e.target.value })}
                  placeholder="El Deudor se obliga a no enajenar el bien {{descripcion_bien}} durante el plazo de {{plazo_meses}} meses sin previa autorización escrita del Banco."
                />
              </div>
              <div className="field">
                <label>Variables detectadas · {varsNueva.length}</label>
                <div>{varsNueva.length === 0 ? <span className="muted">Ninguna</span> : varsNueva.map((v) => <span key={v} className="var-chip">{`{{${v}}}`}</span>)}</div>
              </div>
            </div>
            {err && <div className="alert alert-danger" style={{ marginTop: 8 }}>{err}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-light)' }}>
              <button className="btn" onClick={onClose}>Cancelar</button>
              <button className="btn btn-gold" onClick={crearNueva} disabled={!nueva.titulo.trim() || !nueva.texto_base.trim() || saving}>
                {saving ? <span className="spinner" /> : 'Crear y agregar'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
