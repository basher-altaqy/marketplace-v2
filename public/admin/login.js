(function () {
  const TOKEN_KEY = 'adminToken';
  const ADMIN_KEY = 'adminUser';

  const form = document.getElementById('adminLoginForm');
  const identifierInput = document.getElementById('adminIdentifier');
  const passwordInput = document.getElementById('adminPassword');
  const submitButton = document.getElementById('adminLoginSubmit') || form?.querySelector('button[type="submit"]');
  const messageEl = document.getElementById('adminLoginError');

  function setMessage(message, type) {
    if (!messageEl) return;
    messageEl.textContent = message || '';
    messageEl.classList.toggle('is-success', type === 'success');
  }

  function setLoading(isLoading) {
    if (!submitButton) return;
    submitButton.disabled = isLoading;
    submitButton.textContent = isLoading ? 'جارٍ التحقق...' : 'الدخول إلى اللوحة';
  }

  async function login(identifier, password) {
    const response = await fetch('/api/admin/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ identifier, password })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || 'تعذر تسجيل الدخول.');
    }

    return data;
  }

  async function validateExistingSession(token) {
    const response = await fetch('/api/admin/auth/me', {
      headers: {
        Authorization: 'Bearer ' + token
      }
    });

    if (!response.ok) {
      throw new Error('Invalid session');
    }

    return response.json().catch(() => ({}));
  }

  async function bootstrap() {
    const existingToken = localStorage.getItem(TOKEN_KEY);
    if (!existingToken) {
      return;
    }

    try {
      setLoading(true);
      await validateExistingSession(existingToken);
      window.location.replace('/admin');
    } catch (_error) {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ADMIN_KEY);
    } finally {
      setLoading(false);
    }
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    setMessage('', '');

    const identifier = identifierInput.value.trim();
    const password = passwordInput.value;

    if (!identifier || !password) {
      setMessage('يرجى تعبئة المعرف وكلمة المرور.');
      return;
    }

    try {
      setLoading(true);
      const data = await login(identifier, password);

      if (!data.token) {
        throw new Error('لم يتم استلام رمز جلسة صالح من الخادم.');
      }

      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(ADMIN_KEY, JSON.stringify(data.admin || null));
      setMessage('تم تسجيل الدخول بنجاح. جارٍ فتح اللوحة...', 'success');
      window.location.replace('/admin');
    } catch (error) {
      setMessage(error.message || 'تعذر تسجيل الدخول.');
    } finally {
      setLoading(false);
    }
  });

  bootstrap();
})();
