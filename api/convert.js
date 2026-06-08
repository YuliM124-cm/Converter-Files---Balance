const { requireUser } = require('../lib/requireUser');
const { parseSingleFileUpload } = require('../lib/parseUpload');
const { extractFromBuffer } = require('../lib/textExtractor');
const { buildGenericTableWorkbook } = require('../lib/excelBuilder');

module.exports.config = { api: { bodyParser: false } };

const SUPPORTED_TARGETS = new Set(['txt', 'xlsx', 'csv']);

function rowsToCsv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? '');
          return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(',')
    )
    .join('\r\n');
}

function textToRows(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((line) => line.split(/\s{2,}|\t/).map((c) => c.trim()).filter((c) => c.length));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metode tidak didukung.' });
    return;
  }

  try {
    await requireUser(req);

    const { buffer, mimetype, originalname, fields } = await parseSingleFileUpload(req);
    const target = String(fields.target || '').toLowerCase();

    if (!SUPPORTED_TARGETS.has(target)) {
      res.status(400).json({
        error: `Target konversi tidak didukung. Pilih salah satu: ${[...SUPPORTED_TARGETS].join(', ')}`,
      });
      return;
    }

    const baseName = (originalname || 'file').replace(/\.[^.]+$/, '');
    const extracted = await extractFromBuffer(buffer, mimetype, originalname);

    let rows;
    let plainText;
    if (extracted.type === 'rows') {
      rows = extracted.data;
      plainText = rowsToCsv(rows);
    } else {
      plainText = extracted.data;
      rows = textToRows(plainText);
    }

    if (target === 'txt') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.txt"`);
      res.status(200).send(plainText);
      return;
    }

    if (target === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.csv"`);
      res.status(200).send(rowsToCsv(rows));
      return;
    }

    if (target === 'xlsx') {
      const workbook = await buildGenericTableWorkbook(rows, baseName.slice(0, 28) || 'Data');
      const outBuffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xlsx"`);
      res.status(200).send(Buffer.from(outBuffer));
      return;
    }
  } catch (err) {
    const status = err.status || 500;
    console.error('[convert]', err.message);
    res.status(status).json({ error: status === 500 ? 'Terjadi kesalahan pada server.' : err.message });
  }
};
