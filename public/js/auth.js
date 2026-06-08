/**
 * Mengelola login/logout tim lewat Supabase Auth (email + password).
 *
 * Mengekspos:
 *   window.akuntanAuth.getAccessToken()  -> Promise<string|null>
 *   window.akuntanAuth.getUserEmail()    -> string|null (setelah sesi dimuat)
 *
 * Catatan: Supabase SDK menyimpan sesi login di browser (localStorage milik
 * domain Supabase Anda) — ini bagian normal dari cara kerja Supabase Auth,
 * bukan penyimpanan data transaksi keuangan.
 */
(function () {
  const client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  const loginScreen = document.getElementById('login-screen');
  const appRoot = document.getElementById('app-root');
  const loginForm = document.getElementById('login-form');
  const loginEmail = document.getElementById('login-email');
  const loginPassword = document.getElementById('login-password');
  const loginStatus = document.getElementById('login-status');
  const loginSubmitBtn = document.getElementById('login-submit-btn');
  const userEmailEl = document.getElementById('user-email');
  const logoutBtn = document.getElementById('logout-btn');

  let currentSession = null;

  function showApp(session) {
    currentSession = session;
    loginScreen.hidden = true;
    appRoot.hidden = false;
    if (userEmailEl) userEmailEl.textContent = session.user.email;
  }

  function showLogin() {
    currentSession = null;
    appRoot.hidden = true;
    loginScreen.hidden = false;
  }

  // Cek sesi yang sudah ada saat halaman dimuat (mis. setelah refresh)
  client.auth.getSession().then(({ data }) => {
    if (data.session) showApp(data.session);
    else showLogin();
  });

  // Pantau perubahan status login (login/logout/refresh token)
  client.auth.onAuthStateChange((_event, session) => {
    if (session) showApp(session);
    else showLogin();
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginSubmitBtn.disabled = true;
    loginStatus.textContent = 'Memeriksa kredensial…';
    loginStatus.className = 'status status--info';

    const { data, error } = await client.auth.signInWithPassword({
      email: loginEmail.value.trim(),
      password: loginPassword.value,
    });

    if (error) {
      loginStatus.textContent = 'Email atau password salah, atau akun belum diaktifkan.';
      loginStatus.className = 'status status--error';
      loginSubmitBtn.disabled = false;
      return;
    }

    loginStatus.textContent = '';
    loginPassword.value = '';
    showApp(data.session);
    loginSubmitBtn.disabled = false;
  });

  logoutBtn.addEventListener('click', async () => {
    await client.auth.signOut();
    showLogin();
  });

  window.akuntanAuth = {
    async getAccessToken() {
      const { data } = await client.auth.getSession();
      return data.session ? data.session.access_token : null;
    },
    getUserEmail() {
      return currentSession ? currentSession.user.email : null;
    },
  };
})();
