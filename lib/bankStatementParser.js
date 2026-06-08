/**
 * Parser rekening koran -> transaksi terstruktur.
 * (Identik dengan versi backend/Render — logika ini independen dari platform hosting.)
 *
 * Tujuan utama: JANGAN PERNAH memotong/menghilangkan deskripsi transaksi.
 * Baris lanjutan (tanpa tanggal di depan) akan digabung ke deskripsi
 * transaksi sebelumnya, bukan dibuang.
 *
 * Output setiap transaksi:
 *   { tanggal, deskripsi, debit, kredit, saldo }
 */

const DATE_PATTERNS = [
  // 31/01/2024, 31-01-2024, 31.01.2024, 31/01/24
  /^(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/,
  // 2024-01-31
  /^(\d{4}-\d{1,2}-\d{1,2})\b/,
  // 31 Jan 2024 / 31 Januari 2024
  /^(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|Mei|May|Jun|Jul|Agu|Aug|Sep|Okt|Oct|Nov|Des|Dec)[a-z]*\s+\d{2,4})\b/i,
];

// Angka format Indonesia: 1.234.567,89 atau 1,234,567.89 atau plain 1234567
const AMOUNT_REGEX = /-?\(?(?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{1,2})?\)?-?/g;

const HEADER_KEYWORDS = {
  tanggal: ['tanggal', 'tgl', 'date', 'posting date', 'transaction date'],
  deskripsi: ['keterangan', 'deskripsi', 'description', 'uraian', 'remark', 'narasi', 'transaction'],
  debit: ['debit', 'debet', 'withdrawal', 'pengeluaran', 'db'],
  kredit: ['kredit', 'credit', 'deposit', 'pemasukan', 'cr'],
  saldo: ['saldo', 'balance', 'closing balance', 'running balance'],
};

function normalizeAmount(raw) {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim();
  if (s === '' || s === '-') return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  }

  // Tentukan pemisah desimal: jika ada koma & titik, yang paling kanan = desimal
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let decimalSep = null;
  if (lastComma > -1 && lastDot > -1) {
    decimalSep = lastComma > lastDot ? ',' : '.';
  } else if (lastComma > -1) {
    const tail = s.length - lastComma - 1;
    decimalSep = tail <= 2 ? ',' : null;
  } else if (lastDot > -1) {
    const tail = s.length - lastDot - 1;
    decimalSep = tail <= 2 ? '.' : null;
  }

  let normalized;
  if (decimalSep) {
    const thousandSep = decimalSep === ',' ? '.' : ',';
    normalized = s.split(thousandSep).join('').replace(decimalSep, '.');
  } else {
    normalized = s.replace(/[.,]/g, '');
  }

  const num = parseFloat(normalized);
  if (Number.isNaN(num)) return null;
  return negative ? -num : num;
}

function findDateMatch(line) {
  for (const pattern of DATE_PATTERNS) {
    const m = line.match(pattern);
    if (m) return m[1];
  }
  return null;
}

/**
 * Parsing dari teks bebas (hasil ekstraksi PDF / OCR gambar).
 */
function parseFromText(text) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const transactions = [];
  let current = null;

  for (const line of lines) {
    const dateMatch = findDateMatch(line);

    if (dateMatch) {
      if (current) transactions.push(finalizeTransaction(current));

      const rest = line.slice(dateMatch.length).trim();
      const amounts = (rest.match(AMOUNT_REGEX) || [])
        .map((a) => a.trim())
        .filter((a) => a.length > 0 && /\d/.test(a));

      let descPart = rest;
      for (const amt of amounts) {
        descPart = descPart.replace(amt, ' ');
      }
      descPart = descPart.replace(/\s{2,}/g, ' ').trim();

      current = {
        tanggal: dateMatch,
        deskripsiParts: [descPart].filter(Boolean),
        amounts,
      };
    } else if (current) {
      const extraAmounts = (line.match(AMOUNT_REGEX) || [])
        .map((a) => a.trim())
        .filter((a) => a.length > 0 && /\d/.test(a) && a.replace(/[.,()-]/g, '').length >= 4);

      if (extraAmounts.length && current.amounts.length < 3) {
        current.amounts.push(...extraAmounts);
        let cleaned = line;
        for (const amt of extraAmounts) cleaned = cleaned.replace(amt, ' ');
        cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
        if (cleaned) current.deskripsiParts.push(cleaned);
      } else {
        current.deskripsiParts.push(line);
      }
    }
  }
  if (current) transactions.push(finalizeTransaction(current));

  return transactions;
}

/**
 * Mengubah amounts mentah (1-3 angka per baris transaksi) menjadi debit/kredit/saldo.
 */
function finalizeTransaction(t) {
  const nums = t.amounts.map(normalizeAmount).filter((n) => n !== null);
  let debit = null;
  let kredit = null;
  let saldo = null;

  if (nums.length === 1) {
    saldo = nums[0];
  } else if (nums.length === 2) {
    const [mutasi, sisa] = nums;
    saldo = sisa;
    if (mutasi < 0) debit = Math.abs(mutasi);
    else kredit = mutasi;
    if (mutasi >= 0 && debit === null && kredit === null) kredit = mutasi;
  } else if (nums.length >= 3) {
    [debit, kredit, saldo] = nums.slice(-3);
    if (debit === 0) debit = null;
    if (kredit === 0) kredit = null;
  }

  return {
    tanggal: t.tanggal,
    deskripsi: t.deskripsiParts.join(' | ').replace(/\s{2,}/g, ' ').trim() || '(tidak ada deskripsi)',
    debit,
    kredit,
    saldo,
  };
}

/**
 * Parsing dari data tabular (Excel/CSV) — mendeteksi header secara fleksibel.
 */
function parseFromRows(rows) {
  if (!rows || rows.length === 0) return [];

  let headerIdx = -1;
  let colMap = null;

  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const row = rows[i].map((c) => String(c || '').toLowerCase().trim());
    const map = {};
    for (const [field, keywords] of Object.entries(HEADER_KEYWORDS)) {
      const idx = row.findIndex((cell) => keywords.some((k) => cell.includes(k)));
      if (idx > -1) map[field] = idx;
    }
    if (map.tanggal !== undefined && (map.deskripsi !== undefined || map.saldo !== undefined)) {
      headerIdx = i;
      colMap = map;
      break;
    }
  }

  if (headerIdx === -1) {
    colMap = { tanggal: 0, deskripsi: 1, debit: 2, kredit: 3, saldo: 4 };
    headerIdx = -1;
  }

  const transactions = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => String(c || '').trim() === '')) continue;

    const get = (field) =>
      colMap[field] !== undefined ? row[colMap[field]] : undefined;

    const tanggalRaw = get('tanggal');
    if (!tanggalRaw || String(tanggalRaw).trim() === '') continue;

    transactions.push({
      tanggal: String(tanggalRaw).trim(),
      deskripsi: String(get('deskripsi') ?? '').trim() || '(tidak ada deskripsi)',
      debit: normalizeAmount(get('debit')),
      kredit: normalizeAmount(get('kredit')),
      saldo: normalizeAmount(get('saldo')),
    });
  }

  return transactions;
}

function parseBankStatement(extracted) {
  if (extracted.type === 'rows') return parseFromRows(extracted.data);
  return parseFromText(extracted.data);
}

module.exports = { parseBankStatement, normalizeAmount };
