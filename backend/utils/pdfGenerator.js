const crypto = require('crypto');
const db = require('../db');
const { compilarContrato, generarHTML, generarPDF } = require('../contrato-engine');

async function generatePdf(contratoId) {
  const row = db.prepare('SELECT * FROM contratos WHERE id = ?').get(contratoId);
  if (!row) throw Object.assign(new Error('Contrato no encontrado'), { status: 404 });

  const datos = {
    datos_cliente: row.datos_cliente ? JSON.parse(row.datos_cliente) : {},
    datos_credito: row.datos_credito ? JSON.parse(row.datos_credito) : {},
    datos_garantia: row.datos_garantia ? JSON.parse(row.datos_garantia) : {},
    datos_firmas: row.datos_firmas ? JSON.parse(row.datos_firmas) : {},
    no_contrato: row.no_contrato,
  };

  const compilado = compilarContrato(row.modelo_id, datos);
  if (!compilado.metadata.firmas.correlativo) compilado.metadata.firmas.correlativo = row.no_contrato;

  // Reusar pdf_filename si ya existe (evita PDFs huérfanos en disco al regenerar);
  // en caso contrario, mintar nombre nuevo con sufijo aleatorio no enumerable.
  let pdfFilename = row.pdf_filename;
  if (!pdfFilename) {
    const base = String(row.no_contrato || `contrato-${contratoId}`).replace(/[^A-Za-z0-9._-]/g, '_');
    pdfFilename = `${base}-${crypto.randomBytes(4).toString('hex')}.pdf`;
  }

  const html = generarHTML(compilado);
  const result = await generarPDF(html, pdfFilename);
  return { filename: result.filename };
}

module.exports = { generatePdf };
