import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Topbar from '../components/Topbar';
import Preview from '../components/Preview';
import { fetchContrato, generatePdf, openPdf, updateContrato } from '../api/contratos';
import { fetchInstitucion } from '../api/instituciones';
import { CLAUSULAS_TEMPLATE, computeMissingByClausula } from '../constants/clausulasTemplate';

export default function Contrato() {
  const { id, slug } = useParams();
  const nav = useNavigate();
  const [contrato, setContrato] = useState(null);
  const [institucion, setInstitucion] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [missingModal, setMissingModal] = useState(null);

  const reload = async () => {
    setLoading(true);
    try {
      const c = await fetchContrato(id);
      setContrato(c);
      const targetSlug = slug || c.institucion_slug;
      if (targetSlug) {
        const inst = await fetchInstitucion(targetSlug);
        setInstitucion(inst);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload();   }, [id]);

  const previewContrato = useMemo(() => ({
    datos_cliente: contrato?.datos_cliente,
    datos_credito: contrato?.datos_credito,
    datos_garantia: contrato?.datos_garantia,
    datos_firmas: contrato?.datos_firmas,
  }), [contrato]);

  const modeloCodigos = useMemo(() => {
    if (!institucion || !contrato) return [];
    const m = institucion.modelos?.find((m) => m.id === contrato.modelo_id);
    return m?.clausulas || Object.keys(CLAUSULAS_TEMPLATE);
  }, [institucion, contrato]);

  const missing = useMemo(
    () => computeMissingByClausula(previewContrato, institucion, modeloCodigos),
    [previewContrato, institucion, modeloCodigos]
  );

  const totalMissing = missing.reduce((sum, m) => sum + m.missing.length, 0);
  const allComplete = totalMissing === 0;

  const onGenerate = async () => {
    if (!allComplete) {
      setMissingModal(missing);
      return;
    }
    setGenerating(true);
    try {
      await generatePdf(id);
      await reload();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setGenerating(false);
    }
  };

  const cambiarEstado = async (estado) => {
    const updated = await updateContrato(id, { estado });
    setContrato({ ...contrato, ...updated });
  };

  if (loading) return (<><Topbar title="Cargando…" /><div className="app-content"><div className="empty"><span className="spinner" /></div></div></>);
  if (error || !contrato) return (<><Topbar title="Contrato" /><div className="app-content"><div className="empty">{error || 'No encontrado'}</div></div></>);

  const editPath = slug
    ? `/instituciones/${slug}/contratos/${id}/editar`
    : `/instituciones/${contrato.institucion_slug}/contratos/${id}/editar`;

  return (
    <>
      <Topbar
        title={`Contrato ${contrato.no_contrato}`}
        crumbs={`${contrato.institucion_nombre} · ${contrato.modelo_nombre} · ${totalMissing === 0 ? 'Completo' : `${totalMissing} pendientes`}`}
        actions={
          <>
            <span className={'badge badge-' + contrato.estado}>{contrato.estado}</span>
            <button className="btn" onClick={() => nav(editPath)}>Editar contrato</button>
            {contrato.estado === 'borrador' && (
              <button className="btn" onClick={() => cambiarEstado('revision')}>Pasar a revisión</button>
            )}
            {contrato.estado === 'revision' && (
              <button className="btn" onClick={() => cambiarEstado('firmado')}>Marcar firmado</button>
            )}
            <button
              className={'btn ' + (allComplete ? 'btn-gold' : '')}
              onClick={onGenerate}
              disabled={generating}
              title={allComplete ? 'Generar PDF' : `${totalMissing} campo(s) pendientes`}
            >
              {generating ? <span className="spinner" /> : (allComplete ? 'Generar PDF' : `Generar PDF · ${totalMissing}`)}
            </button>
            {contrato.pdf_path && <button className="btn btn-primary" onClick={() => openPdf(id)}>Abrir PDF</button>}
          </>
        }
      />
      <div className="app-content">
        <div className="wizard">
          <div className="wizard-form">
            {totalMissing > 0 && (
              <div className="alert alert-warn">
                <strong>{totalMissing} campo(s) pendientes para poder generar PDF oficial</strong>
                <ul style={{ marginTop: 6, marginBottom: 0, paddingLeft: 20 }}>
                  {missing.map((m) => (
                    <li key={m.codigo}>
                      <strong>{m.titulo}:</strong> {m.missing.join(', ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="card">
              <div className="card-h"><h3>Cliente</h3></div>
              <div className="row-2">
                <div className="field"><label>Nombre</label><div className="input" style={{ background: '#faf9f4' }}>{contrato.datos_cliente?.nombre || '—'}</div></div>
                <div className="field"><label>DPI</label><div className="input" style={{ background: '#faf9f4' }}>{contrato.datos_cliente?.dpi || '—'}</div></div>
              </div>
              <div className="row-2">
                <div className="field"><label>NIT</label><div className="input" style={{ background: '#faf9f4' }}>{contrato.datos_cliente?.nit || '—'}</div></div>
                <div className="field"><label>Profesión</label><div className="input" style={{ background: '#faf9f4' }}>{contrato.datos_cliente?.profesion || '—'}</div></div>
              </div>
            </div>

            <div className="card">
              <div className="card-h"><h3>Crédito</h3></div>
              <div className="row-3">
                <div className="field"><label>Monto</label><div className="input" style={{ background: '#faf9f4' }}>{contrato.datos_credito?.moneda || ''} {contrato.datos_credito?.monto || '—'}</div></div>
                <div className="field"><label>Plazo</label><div className="input" style={{ background: '#faf9f4' }}>{contrato.datos_credito?.plazo_meses || '—'} meses</div></div>
                <div className="field"><label>Tasa ord.</label><div className="input" style={{ background: '#faf9f4' }}>{contrato.datos_credito?.tasa_ordinaria || '—'}%</div></div>
              </div>
              <div className="row-3">
                <div className="field"><label>Destino</label><div className="input" style={{ background: '#faf9f4' }}>{contrato.datos_credito?.destino || '—'}</div></div>
                <div className="field"><label>Cuota mensual</label><div className="input" style={{ background: '#faf9f4' }}>{contrato.datos_credito?.cuota_mensual || '—'}</div></div>
                <div className="field"><label>Tipo de pago</label><div className="input" style={{ background: '#faf9f4' }}>{contrato.datos_credito?.tipo_pago || '—'}</div></div>
              </div>
            </div>

            <div className="card">
              <div className="card-h"><h3>Garantías</h3></div>
              <div className="field">
                <label>Tipos seleccionados</label>
                <div className="input" style={{ background: '#faf9f4' }}>{(contrato.datos_garantia?.tipos || []).join(', ') || '—'}</div>
              </div>
              {contrato.datos_garantia?.fiadores?.length > 0 && (
                <div className="field">
                  <label>Fiadores</label>
                  <div className="input" style={{ background: '#faf9f4', height: 'auto', minHeight: 32 }}>
                    {contrato.datos_garantia.fiadores.map((f) => `${f.nombre} (${f.dpi})`).join(', ')}
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-h"><h3>Notario</h3></div>
              <div className="row-2">
                <div className="field"><label>Notario</label><div className="input" style={{ background: '#faf9f4' }}>{contrato.datos_firmas?.notario || '—'}</div></div>
                <div className="field"><label>Colegiado</label><div className="input" style={{ background: '#faf9f4' }}>{contrato.datos_firmas?.colegiado || '—'}</div></div>
              </div>
            </div>
          </div>

          <Preview contrato={previewContrato} institucion={institucion} codigos={modeloCodigos} />
        </div>

        {missingModal && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(19,20,26,0.55)', display: 'grid', placeItems: 'center', zIndex: 1000 }} onClick={() => setMissingModal(null)}>
            <div className="card" style={{ width: 480, maxWidth: '90vw' }} onClick={(e) => e.stopPropagation()}>
              <div className="card-h">
                <h3>Faltan campos para generar el PDF</h3>
                <button className="btn-ghost btn" onClick={() => setMissingModal(null)}>Cerrar</button>
              </div>
              <p className="muted" style={{ marginTop: 0, fontSize: 12.5 }}>
                Complete estos campos en el wizard de edición antes de generar el contrato oficial:
              </p>
              <ul style={{ paddingLeft: 20 }}>
                {missingModal.map((m) => (
                  <li key={m.codigo} style={{ marginBottom: 6 }}>
                    <strong>{m.titulo}:</strong>{' '}
                    {m.missing.map((v) => <span key={v} className="var-chip" style={{ marginLeft: 0 }}>{v}</span>)}
                  </li>
                ))}
              </ul>
              <div style={{ textAlign: 'right', marginTop: 12 }}>
                <button className="btn" onClick={() => setMissingModal(null)}>Cerrar</button>
                <button className="btn btn-gold" style={{ marginLeft: 8 }} onClick={() => nav(editPath)}>Ir a editar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
