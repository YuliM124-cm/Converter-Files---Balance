/**
 * Frontend Akuntan Converter (varian Vercel + Supabase Auth).
 * API dipanggil di origin yang sama (/api/...) — Vercel menyajikan frontend & functions
 * dari satu domain. Setiap permintaan menyertakan token sesi Supabase di header
 * Authorization supaya function bisa memverifikasi bahwa pengguna sudah login.
 */

function setStatus(el, message, type) {
  el.textContent = message;
  el.className = 'status' + (type ? ` status--${type}` : '');
}

function formatNumber(n) {
  if (n === null || n === undefined || n === '') return '';
  const num = Number(n);
  if (Number.isNaN(num)) return String(n);
  return num.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function authedFetch(url, options = {}) {
  const token = await window.akuntanAuth.getAccessToken();
  if (!token) {
    throw new Error('Sesi login sudah berakhir. Silakan login kembali.');
  }
  const headers = Object.assign({}, options.headers, { Authorization: `Bearer ${token}` });
  return fetch(url, Object.assign({}, options, { headers }));
}

async function downloadFromResponse(response, fallbackName) {
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match ? match[1] : fallbackName;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function readErrorMessage(response) {
  try {
    const data = await response.json();
    return data.error || `Permintaan gagal (status ${response.status}).`;
  } catch {
    return `Permintaan gagal (status ${response.status}).`;
  }
}

/* ---------- Tabs ---------- */
const tabs = document.querySelectorAll('.tab');
tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((t) => {
      t.classList.remove('tab--active');
      t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('tab--active');
    tab.setAttribute('aria-selected', 'true');

    document.querySelectorAll('.panel').forEach((panel) => {
      panel.classList.toggle('panel--hidden', panel.dataset.panel !== tab.dataset.tab);
    });
  });
});

/* ---------- Dropzone helper ---------- */
function wireDropzone(dropzoneEl, inputEl, filenameEl, onFileChosen) {
  dropzoneEl.addEventListener('click', () => inputEl.click());
  inputEl.addEventListener('change', () => {
    if (inputEl.files[0]) {
      filenameEl.textContent = `📄 ${inputEl.files[0].name}`;
      onFileChosen(inputEl.files[0]);
    }
  });

  ['dragenter', 'dragover'].forEach((evt) =>
    dropzoneEl.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzoneEl.classList.add('dragover');
    })
  );
  ['dragleave', 'drop'].forEach((evt) =>
    dropzoneEl.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzoneEl.classList.remove('dragover');
    })
  );
  dropzoneEl.addEventListener('drop', (e) => {
    const file = e.dataTransfer.files[0];
    if (file) {
      inputEl.files = e.dataTransfer.files;
      filenameEl.textContent = `📄 ${file.name}`;
      onFileChosen(file);
    }
  });
}

/* ===================== TAB: RAPIKAN REKENING KORAN ===================== */
const tidyDropzone = document.getElementById('tidy-dropzone');
const tidyInput = document.getElementById('tidy-file');
const tidyFilename = document.getElementById('tidy-filename');
const tidyPreviewBtn = document.getElementById('tidy-preview-btn');
const tidyDownloadBtn = document.getElementById('tidy-download-btn');
const tidyStatus = document.getElementById('tidy-status');
const tidyPreview = document.getElementById('tidy-preview');
const tidyPreviewBody = document.getElementById('tidy-preview-body');
const tidyPreviewSummary = document.getElementById('tidy-preview-summary');

let tidyFile = null;

wireDropzone(tidyDropzone, tidyInput, tidyFilename, (file) => {
  tidyFile = file;
  tidyPreviewBtn.disabled = false;
  tidyDownloadBtn.disabled = false;
  tidyPreview.hidden = true;
  setStatus(tidyStatus, '', '');
});

tidyPreviewBtn.addEventListener('click', async () => {
  if (!tidyFile) return;
  setStatus(tidyStatus, 'Membaca & menganalisis transaksi…', 'info');
  tidyPreviewBtn.disabled = true;

  try {
    const form = new FormData();
    form.append('file', tidyFile);
    const res = await authedFetch('/api/bank-statement-preview', { method: 'POST', body: form });
    if (!res.ok) throw new Error(await readErrorMessage(res));

    const data = await res.json();
    tidyPreviewBody.innerHTML = '';
    data.preview.forEach((t) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${t.tanggal ?? ''}</td>
        <td>${(t.deskripsi ?? '').replace(/</g, '&lt;')}</td>
        <td>${formatNumber(t.debit)}</td>
        <td>${formatNumber(t.kredit)}</td>
        <td>${formatNumber(t.saldo)}</td>`;
      tidyPreviewBody.appendChild(tr);
    });
    tidyPreviewSummary.textContent =
      `Total transaksi terbaca: ${data.totalTransactions} • Sumber: ${data.sourceKind}`;
    tidyPreview.hidden = false;
    setStatus(tidyStatus, 'Pratinjau siap. Klik "Rapikan & Unduh Excel" untuk mengunduh hasil lengkap.', 'success');
  } catch (err) {
    setStatus(tidyStatus, err.message, 'error');
  } finally {
    tidyPreviewBtn.disabled = false;
  }
});

tidyDownloadBtn.addEventListener('click', async () => {
  if (!tidyFile) return;
  setStatus(tidyStatus, 'Merapikan data & menyusun file Excel…', 'info');
  tidyDownloadBtn.disabled = true;

  try {
    const form = new FormData();
    form.append('file', tidyFile);
    const res = await authedFetch('/api/bank-statement-tidy', { method: 'POST', body: form });
    if (!res.ok) throw new Error(await readErrorMessage(res));

    await downloadFromResponse(res, 'rekening-koran-rapi.xlsx');
    const count = res.headers.get('X-Transactions-Count');
    setStatus(
      tidyStatus,
      `Selesai! File Excel berisi ${count || ''} transaksi telah diunduh — deskripsi bank tetap utuh.`,
      'success'
    );
  } catch (err) {
    setStatus(tidyStatus, err.message, 'error');
  } finally {
    tidyDownloadBtn.disabled = false;
  }
});

/* ===================== TAB: KONVERSI UMUM ===================== */
const convertDropzone = document.getElementById('convert-dropzone');
const convertInput = document.getElementById('convert-file');
const convertFilename = document.getElementById('convert-filename');
const convertTarget = document.getElementById('convert-target');
const convertBtn = document.getElementById('convert-btn');
const convertStatus = document.getElementById('convert-status');

let convertFile = null;

wireDropzone(convertDropzone, convertInput, convertFilename, (file) => {
  convertFile = file;
  convertBtn.disabled = false;
  setStatus(convertStatus, '', '');
});

convertBtn.addEventListener('click', async () => {
  if (!convertFile) return;
  setStatus(convertStatus, 'Mengonversi file Anda…', 'info');
  convertBtn.disabled = true;

  try {
    const form = new FormData();
    form.append('file', convertFile);
    form.append('target', convertTarget.value);
    const res = await authedFetch('/api/convert', { method: 'POST', body: form });
    if (!res.ok) throw new Error(await readErrorMessage(res));

    await downloadFromResponse(res, `hasil-konversi.${convertTarget.value}`);
    setStatus(convertStatus, 'Selesai! File hasil konversi telah diunduh.', 'success');
  } catch (err) {
    setStatus(convertStatus, err.message, 'error');
  } finally {
    convertBtn.disabled = false;
  }
});
