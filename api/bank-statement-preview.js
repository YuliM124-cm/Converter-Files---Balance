const { requireUser } = require('../lib/requireUser');
const { parseSingleFileUpload } = require('../lib/parseUpload');
const { extractFromBuffer } = require('../lib/textExtractor');
const { parseBankStatement } = require('../lib/bankStatementParser');

module.exports.config = { api: { bodyParser: false } };

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metode tidak didukung.' });
    return;
  }

  try {
    await requireUser(req);

    const { buffer, mimetype, originalname } = await parseSingleFileUpload(req);
    const extracted = await extractFromBuffer(buffer, mimetype, originalname);
    const transactions = parseBankStatement(extracted);

    res.status(200).json({
      sourceName: originalname,
      sourceKind: extracted.sourceKind,
      totalTransactions: transactions.length,
      preview: transactions.slice(0, 25),
    });
  } catch (err) {
    const status = err.status || 500;
    console.error('[bank-statement-preview]', err.message);
    res.status(status).json({ error: status === 500 ? 'Terjadi kesalahan pada server.' : err.message });
  }
};
