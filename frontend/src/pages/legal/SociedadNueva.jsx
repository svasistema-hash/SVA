// Formulario para iniciar una nueva constitución de Sociedad Anónima.
// Solo datos básicos — el resto los llena el cliente vía el link público.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Topbar from '../../components/Topbar';
import { createSociedad } from '../../api/legal';

export default function SociedadNueva() {
  const nav = useNavigate();
  const [d, setD] = useState({
    denominacion: '',
    objeto_social: '',
    plazo_anios: 99,
    moneda: 'GTQ',
    capital_social: '',
    valor_nominal_accion: '',
    total_acciones: '',
  });
  const [creando, setCreando] = useState(false);
  const [error, setError] = useState(null);
  const [resultado, setResultado] = useState(null);

  const valid =
    d.denominacion.trim().length >= 3 &&
    d.objeto_social.trim().length >= 50 &&
    Number(d.capital_social) >= 5000 &&
    Number(d.valor_nominal_accion) > 0 &&
    Number(d.total_acciones) > 0;

  const calcConsistencia = () => {
    if (!d.valor_nominal_accion || !d.total_acciones) return null;
    return Math.round(Number(d.valor_nominal_accion) * Number(d.total_acciones) * 100) / 100;
  };
  const productoCalculado = calcConsistencia();
  const capitalCoincide = productoCalculado != null && Math.abs(productoCalculado - Number(d.capital_social || 0)) < 0.01;

  const submit = async () => {
    if (!valid) return;
    setCreando(true); setError(null);
    try {
      const r = await createSociedad({
        denominacion: d.denominacion.trim(),
        objeto_social: d.objeto_social.trim(),
        plazo_anios: d.plazo_anios ? Number(d.plazo_anios) : null,
        moneda: d.moneda,
        capital_social: Number(d.capital_social),
        valor_nominal_accion: Number(d.valor_nominal_accion),
        total_acciones: Number(d.total_acciones),
      });
      setResultado(r);
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setCreando(false);
    }
  };

  if (resultado) {
    const linkPublico = `${window.location.origin}/legal/portal/${resultado.token.token}`;
    return (
      <>
        <Topbar title="Sociedad iniciada" crumbs={resultado.correlativo} />
        <div className="app-content">
          <div className="card">
            <div className="alert alert-info" style={{ fontSize: 13 }}>
              <strong>Caso creado correctamente.</strong> El cliente recibirá un enlace único para completar los datos.
              El enlace caduca en 7 días.
            </div>
            <div className="field">
              <label>Enlace para el cliente</label>
              <input className="input" readOnly value={linkPublico} onClick={(e) => e.target.select()} />
            </div>
            <div className="field">
              <label>Correlativo asignado</label>
              <div className="input" style={{ background: '#faf9f4' }}>{resultado.correlativo}</div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
              <button className="btn" onClick={() => {
                navigator.clipboard?.writeText(linkPublico);
                alert('Enlace copiado al portapapeles');
              }}>Copiar enlace</button>
              <button className="btn btn-gold" onClick={() => nav(`/legal/sociedades/${resultado.id}`)}>Ir al detalle</button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar title="Nueva Sociedad Anónima" crumbs="Datos iniciales" />
      <div className="app-content">
        <div className="card" style={{ maxWidth: 720 }}>
          <p className="muted" style={{ fontSize: 12.5, marginTop: 0 }}>
            Ingrese los datos mínimos requeridos por el Código de Comercio. Una vez creado el caso,
            se generará un enlace privado para que el cliente complete los datos restantes (accionistas,
            representantes, direcciones) desde su navegador.
          </p>

          <div className="field">
            <label>Denominación social *</label>
            <input
              className="input"
              value={d.denominacion}
              onChange={(e) => setD({ ...d, denominacion: e.target.value })}
              placeholder="Ejemplo: TECNOLOGÍAS DEL VALLE"
              autoFocus
            />
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Se agregará automáticamente "Sociedad Anónima" al final.
            </div>
          </div>

          <div className="field">
            <label>Objeto social *</label>
            <textarea
              className="input"
              rows={4}
              value={d.objeto_social}
              onChange={(e) => setD({ ...d, objeto_social: e.target.value })}
              placeholder="Describa el giro principal y las actividades que realizará la sociedad. Mínimo 50 caracteres."
              style={{ resize: 'vertical' }}
            />
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              Caracteres: {d.objeto_social.length} / mínimo 50.
            </div>
          </div>

          <div className="row-2">
            <div className="field">
              <label>Plazo de duración (años)</label>
              <input
                className="input"
                type="number"
                value={d.plazo_anios}
                onChange={(e) => setD({ ...d, plazo_anios: e.target.value })}
                min={1}
                max={99}
              />
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Si deja vacío, será indefinido (99 años por convención).</div>
            </div>
            <div className="field">
              <label>Moneda</label>
              <select className="input" value={d.moneda} onChange={(e) => setD({ ...d, moneda: e.target.value })}>
                <option value="GTQ">Quetzales (GTQ)</option>
                <option value="USD">Dólares (USD)</option>
              </select>
            </div>
          </div>

          <div className="row-2">
            <div className="field">
              <label>Capital social *</label>
              <input
                className="input"
                type="number"
                step="0.01"
                value={d.capital_social}
                onChange={(e) => setD({ ...d, capital_social: e.target.value })}
                placeholder="100000.00"
              />
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Mínimo legal: Q5,000.00 (Cód. Comercio art. 86).</div>
            </div>
          </div>

          <div className="row-2">
            <div className="field">
              <label>Total de acciones *</label>
              <input
                className="input"
                type="number"
                value={d.total_acciones}
                onChange={(e) => setD({ ...d, total_acciones: e.target.value })}
                placeholder="1000"
              />
            </div>
            <div className="field">
              <label>Valor nominal por acción *</label>
              <input
                className="input"
                type="number"
                step="0.01"
                value={d.valor_nominal_accion}
                onChange={(e) => setD({ ...d, valor_nominal_accion: e.target.value })}
                placeholder="100.00"
              />
            </div>
          </div>

          {productoCalculado != null && (
            <div className={'alert ' + (capitalCoincide ? 'alert-info' : 'alert-danger')} style={{ fontSize: 12.5 }}>
              {capitalCoincide
                ? `Consistencia confirmada: ${d.total_acciones} acciones × ${d.valor_nominal_accion} = ${productoCalculado}, coincide con el capital social.`
                : `El capital social ingresado (${d.capital_social || 0}) NO coincide con el producto de acciones × valor nominal (${productoCalculado}). Corrija antes de continuar.`}
            </div>
          )}

          {error && <div className="alert alert-danger" style={{ fontSize: 12.5 }}>{error}</div>}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <button className="btn" onClick={() => nav('/legal/sociedades')} disabled={creando}>Cancelar</button>
            <button className="btn btn-gold" onClick={submit} disabled={!valid || !capitalCoincide || creando}>
              {creando ? 'Creando…' : 'Crear caso y generar enlace'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
