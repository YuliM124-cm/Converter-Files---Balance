const { IncomingForm } = require('formidable');
const fs = require('fs');

/**
 * Vercel Node serverless functions menerima request mentah (bukan lewat Express+multer),
 * jadi kita pakai `formidable` untuk membaca form-data, lalu langsung membaca file
 * tersebut ke BUFFER DI MEMORI dan menghapus berkas sementara — supaya tetap konsisten
 * dengan prinsip "tidak ada file yang tertinggal di server" pada versi Render.
 *
 * Mengembalikan: { buffer, mimetype, originalname, fields }
 */
async function parseSingleFileUpload(req) {
  const form = new IncomingForm({ multiples: false, keepExtensions: true });

  const { fields, files } = await new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });

  const fileEntry = files.file;
  const file = Array.isArray(fileEntry) ? fileEntry[0] : fileEntry;

  if (!file) {
    const err = new Error('File wajib diunggah (field "file").');
    err.status = 400;
    throw err;
  }

  const filepath = file.filepath || file.path;
  const buffer = await fs.promises.readFile(filepath);

  // Hapus file sementara segera — tidak dibiarkan tersimpan di server
  fs.promises.unlink(filepath).catch(() => {});

  const getField = (key) => {
    const v = fields[key];
    return Array.isArray(v) ? v[0] : v;
  };

  return {
    buffer,
    mimetype: file.mimetype || file.type || 'application/octet-stream',
    originalname: file.originalFilename || file.originalname || file.newFilename || 'file',
    fields: { target: getField('target') },
  };
}

module.exports = { parseSingleFileUpload };
