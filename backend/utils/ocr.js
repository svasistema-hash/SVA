// Wrapper de Tesseract.js para LexDocs.
// - Mantiene un worker singleton inicializado con español ('spa').
// - Pre-descarga el modelo al boot para evitar latencia en la primera llamada.
// - sharp pre-procesa la imagen (grayscale + normalize + resize si es muy grande)
//   para mejorar confidence.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { createWorker } = require('tesseract.js');

let workerPromise = null;
let workerReady = false;

async function getWorker() {
  if (workerPromise) return workerPromise;
  workerPromise = (async () => {
    const w = await createWorker('spa', 1, {
      // Silenciar logs verbose. Si se quiere ver progreso, descomentar:
      // logger: (m) => console.log('[tesseract]', m),
    });
    workerReady = true;
    return w;
  })();
  return workerPromise;
}

// Pre-carga el modelo al boot. Llamar desde server.js. No bloquea el listen().
async function warmUp() {
  try {
    await getWorker();
    console.log('[ocr] tesseract worker listo (spa)');
  } catch (e) {
    console.error('[ocr] error inicializando tesseract:', e.message);
  }
}

// Pre-procesa imagen para mejorar OCR: grayscale, normalizar contraste,
// redimensionar si excede 2000px de ancho. Sobreescribe el archivo? No —
// escribe a un .tmp y devuelve la nueva ruta. El original queda intacto.
async function preprocesar(rutaImagen) {
  try {
    const dir = path.dirname(rutaImagen);
    const base = path.basename(rutaImagen, path.extname(rutaImagen));
    const tmpPath = path.join(dir, `${base}.ocr.png`);
    await sharp(rutaImagen)
      .grayscale()
      .normalize()
      .resize({ width: 2000, withoutEnlargement: true })
      .png()
      .toFile(tmpPath);
    return tmpPath;
  } catch (e) {
    // Si sharp falla (formato raro), devolvemos la original.
    console.warn('[ocr] preprocesar falló, usando original:', e.message);
    return rutaImagen;
  }
}

// recognize: corre tesseract sobre una imagen y devuelve { text, confidence }.
async function recognize(rutaImagen) {
  const worker = await getWorker();
  const procesada = await preprocesar(rutaImagen);
  let result;
  try {
    result = await worker.recognize(procesada);
  } finally {
    // Limpiar tmp solo si es distinto al original.
    if (procesada !== rutaImagen) {
      fs.promises.unlink(procesada).catch(() => {});
    }
  }
  const { text, confidence } = result.data;
  return {
    text: text || '',
    confidence: Math.round(confidence || 0),
  };
}

async function terminate() {
  if (!workerPromise) return;
  try {
    const w = await workerPromise;
    await w.terminate();
  } finally {
    workerPromise = null;
    workerReady = false;
  }
}

module.exports = { recognize, warmUp, terminate, isReady: () => workerReady };
