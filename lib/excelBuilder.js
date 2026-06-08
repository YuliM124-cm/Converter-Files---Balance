const ExcelJS = require('exceljs');

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' } };
const HEADER_FONT = { color: { argb: 'FFFFFFFF' }, bold: true };
const CURRENCY_FORMAT = '#,##0.00;[Red]-#,##0.00';

/**
 * Membangun workbook Excel rapi dari daftar transaksi rekening koran.
 * Kolom: Tanggal | Deskripsi (utuh) | Debit | Kredit | Saldo
 * + sheet ringkasan total debit/kredit & jumlah transaksi.
 * (Identik dengan versi backend/Render — logika ini independen dari platform hosting.)
 */
async function buildBankStatementWorkbook(transactions, meta = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Akuntan Converter';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Transaksi', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = [
    { header: 'Tanggal', key: 'tanggal', width: 16 },
    { header: 'Deskripsi', key: 'deskripsi', width: 70 },
    { header: 'Debit', key: 'debit', width: 18, style: { numFmt: CURRENCY_FORMAT } },
    { header: 'Kredit', key: 'kredit', width: 18, style: { numFmt: CURRENCY_FORMAT } },
    { header: 'Saldo', key: 'saldo', width: 18, style: { numFmt: CURRENCY_FORMAT } },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  headerRow.height = 22;

  let totalDebit = 0;
  let totalKredit = 0;

  transactions.forEach((t, idx) => {
    const row = sheet.addRow({
      tanggal: t.tanggal,
      deskripsi: t.deskripsi, // deskripsi utuh, tidak dipotong
      debit: t.debit,
      kredit: t.kredit,
      saldo: t.saldo,
    });

    if (typeof t.debit === 'number') totalDebit += t.debit;
    if (typeof t.kredit === 'number') totalKredit += t.kredit;

    row.getCell('deskripsi').alignment = { wrapText: true, vertical: 'top' };
    if (idx % 2 === 1) {
      ['tanggal', 'deskripsi', 'debit', 'kredit', 'saldo'].forEach((key) => {
        row.getCell(key).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      });
    }
  });

  sheet.autoFilter = { from: 'A1', to: 'E1' };

  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      };
    });
  });

  const summary = workbook.addWorksheet('Ringkasan');
  summary.columns = [
    { header: 'Item', key: 'item', width: 28 },
    { header: 'Nilai', key: 'value', width: 28 },
  ];
  summary.getRow(1).eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
  });

  const lastSaldo = [...transactions].reverse().find((t) => typeof t.saldo === 'number');

  summary.addRow({ item: 'Nama file sumber', value: meta.sourceName || '-' });
  summary.addRow({ item: 'Diproses pada', value: new Date().toLocaleString('id-ID') });
  summary.addRow({ item: 'Jumlah transaksi', value: transactions.length });
  summary.addRow({ item: 'Total Debit', value: totalDebit });
  summary.addRow({ item: 'Total Kredit', value: totalKredit });
  summary.addRow({ item: 'Saldo akhir (jika terbaca)', value: lastSaldo ? lastSaldo.saldo : '-' });

  // Baris: 1=header, 2=Nama file, 3=Diproses pada, 4=Jumlah transaksi,
  //        5=Total Debit, 6=Total Kredit, 7=Saldo akhir
  summary.getCell('B5').numFmt = CURRENCY_FORMAT;
  summary.getCell('B6').numFmt = CURRENCY_FORMAT;
  if (typeof (lastSaldo && lastSaldo.saldo) === 'number') {
    summary.getCell('B7').numFmt = CURRENCY_FORMAT;
  }

  return workbook;
}

/**
 * Konversi tabel generik (rows: array-of-array) menjadi workbook Excel rapi.
 */
async function buildGenericTableWorkbook(rows, sheetName = 'Data') {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });

  rows.forEach((row, idx) => {
    const r = sheet.addRow(row);
    if (idx === 0) {
      r.eachCell((cell) => {
        cell.fill = HEADER_FILL;
        cell.font = HEADER_FONT;
      });
    }
  });

  sheet.columns.forEach((col) => {
    col.width = 22;
  });

  return workbook;
}

module.exports = { buildBankStatementWorkbook, buildGenericTableWorkbook };
