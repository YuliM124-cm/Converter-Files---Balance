const { requireUser } = require('../lib/requireUser');
const { parseSingleFileUpload } = require('../lib/parseUpload');
const { extractFromBuffer } = require('../lib/textExtractor');
const { parseBankStatement } = require('../lib/bankStatementParser');
const { buildBankStatementWorkbook } = require('../lib/excelBuilder');

// Penting: matikan body parser bawaan Vercel agar formidable bisa membaca
// stream multipart/form-data secara langsung.
module.exports.config = { api: { bodyParser: false } };

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metode tidak didukung.' });
    return;
  }

  try {
    await requireUser(req); // lempar 401 jika belum login

    const { buffer, mimetype, originalname } = await parseSingleFileUpload(req);
    const extracted = await extractFromBuffer(buffer, mimetype, originalname);
    const transactions = parseBankStatement(extracted);

    if (transactions.length === 0) {
      res.status(422).json({
        error:
          'Tidak ada transaksi yang berhasil terbaca. Pastikan file adalah rekening koran ' +
          'dengan kolom tanggal, keterangan, dan nominal yang jelas.',
      });
      return;
    }

    const workbook = await buildBankStatementWorkbook(transactions, { sourceName: originalname });
    const outBuffer = await workbook.xlsx.writeBuffer();

    const safeName = (originalname || 'rekening-koran').replace(/\.[^.]+$/, '');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}-rapi.xlsx"`);
    res.setHeader('X-Transactions-Count', String(transactions.length));
    res.status(200).send(Buffer.from(outBuffer));
  } catch (err) {
    const status = err.status || 500;
    console.error('[bank-statement-tidy]', err.message);
    res.status(status).json({ error: status === 500 ? 'Terjadi kesalahan pada server.' : err.message });
  }
};
