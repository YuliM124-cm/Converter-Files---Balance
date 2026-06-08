const pdfParse = require('pdf-parse');
const Tesseract = require('tesseract.js');
const XLSX = require('xlsx');
const { parse: parseCsv } = require('csv-parse/sync');

/**
 * Mengekstrak teks/baris mentah dari berbagai jenis file.
 * Mengembalikan { type: 'text'|'rows', data }.
 *
 * CATATAN KHUSUS DEPLOY DI VERCEL (serverless functions):
 * OCR gambar (Tesseract) memuat data bahasa berukuran besar dan bisa memakan
 * waktu lebih lama dari batas eksekusi function di paket gratis (~10 detik).
 * Jika sering timeout pada gambar, pertimbangkan: (a) upgrade ke paket Vercel
 * yang punya batas waktu lebih panjang, atau (b) gunakan layanan OCR eksternal
 * (mis. Google Cloud Vision / AWS Textract) dan panggil dari function ini.
 */
async function extractFromBuffer(buffer, mimetype, originalName = '') {
  const lower = (originalName || '').toLowerCase();

  if (mimetype === 'application/pdf' || lower.endsWith('.pdf')) {
    const result = await pdfParse(buffer);
    return { type: 'text', data: result.text, sourceKind: 'pdf' };
  }

  if (mimetype.startsWith('image/')) {
    try {
      const { data } = await Tesseract.recognize(buffer, 'ind+eng');
      return { type: 'text', data: data.text, sourceKind: 'image-ocr' };
    } catch (e) {
      const err = new Error(
        'Gagal memproses OCR gambar (kemungkinan melebihi batas waktu function di Vercel). ' +
        'Coba file PDF/Excel sebagai gantinya, atau hubungi admin untuk mengaktifkan OCR eksternal.'
      );
      err.status = 422;
      throw err;
    }
  }

  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimetype === 'application/vnd.ms-excel' ||
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls')
  ) {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });
    return { type: 'rows', data: rows, sourceKind: 'excel' };
  }

  if (mimetype === 'text/csv' || mimetype === 'application/csv' || lower.endsWith('.csv')) {
    const text = buffer.toString('utf8');
    const records = parseCsv(text, { skip_empty_lines: true, relax_column_count: true });
    return { type: 'rows', data: records, sourceKind: 'csv' };
  }

  if (mimetype === 'text/plain' || lower.endsWith('.txt')) {
    return { type: 'text', data: buffer.toString('utf8'), sourceKind: 'text' };
  }

  const err = new Error(`Format file belum didukung untuk ekstraksi: ${mimetype}`);
  err.status = 400;
  throw err;
}

module.exports = { extractFromBuffer };
