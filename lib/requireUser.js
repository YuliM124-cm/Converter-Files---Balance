const { createClient } = require('@supabase/supabase-js');

/**
 * Memverifikasi token login Supabase yang dikirim frontend lewat header
 * "Authorization: Bearer <access_token>".
 *
 * Kenapa begini? Supabase Auth menangani pendaftaran/login akun tim
 * (dengan email & password masing-masing anggota). Setiap kali frontend
 * memanggil API konversi, ia menyertakan token sesi Supabase. Function ini
 * memverifikasi token tersebut langsung ke Supabase — sehingga hanya
 * pengguna yang sudah login sah yang bisa memproses file.
 *
 * Variabel lingkungan WAJIB di Vercel:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   <-- rahasia! jangan pernah dikirim ke frontend
 */
let adminClient = null;
function getAdminClient() {
  if (!adminClient) {
    const url = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) {
      throw new Error(
        'Konfigurasi Supabase belum lengkap (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).'
      );
    }
    adminClient = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return adminClient;
}

/**
 * Mengembalikan { user } jika token valid, atau melempar error berstatus 401.
 */
async function requireUser(req) {
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    const err = new Error('Anda harus login untuk menggunakan fitur ini.');
    err.status = 401;
    throw err;
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data || !data.user) {
    const err = new Error('Sesi login tidak valid atau sudah berakhir. Silakan login kembali.');
    err.status = 401;
    throw err;
  }

  return { user: data.user };
}

module.exports = { requireUser };
