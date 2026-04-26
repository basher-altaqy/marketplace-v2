(function () {
  const TOKEN_KEY = 'adminToken';
  const ADMIN_KEY = 'adminUser';
  const DRAGON_KEY = 'dragonEffectEnabled';
  const DRAGON_EFFECT_TEMPORARILY_DISABLED = true;
  const HOME_AD_SLOT_OPTIONS = [
    { slot: 'top_1', label: 'العلوي 1' },
    { slot: 'top_2', label: 'العلوي 2' },
    { slot: 'bottom', label: 'السفلي' }
  ];
  const SECTION_TITLES = {
    overview: {
      title: 'نظرة عامة',
      subtitle: 'ملخص سريع لحالة المنصة مع أحدث العناصر والنشاطات الأساسية.'
    },
    users: {
      title: 'المستخدمون',
      subtitle: 'عرض الحسابات مع فلاتر محلية وتحديث حالة التفعيل عند الحاجة.'
    },
    products: {
      title: 'المنتجات',
      subtitle: 'إدارة المنتجات ومراقبة حالتها الحالية من خلال عقود الـ backend القائمة.'
    },
    reports: {
      title: 'البلاغات',
      subtitle: 'مراجعة البلاغات وتحديث حالتها مع حفظ الملاحظات الإدارية.'
    },
    conversations: {
      title: 'المحادثات',
      subtitle: 'عرض المحادثات الحالية مع آخر رسالة وعدد الرسائل وحالة المحادثة.'
    },
    content: {
      title: 'المحتوى الثابت',
      subtitle: 'إدارة نصوص الشركة والسياسات ومعلومات التواصل والأسئلة الشائعة.'
    },
    homeAds: {
      title: 'إعلانات الرئيسية',
      subtitle: 'إدارة إعلانين علويين وإعلان سفلي من شاشة واحدة.'
    },
    support: {
      title: 'الدعم الفني',
      subtitle: 'متابعة محادثات الدعم الفني والرد عليها وتحديث حالتها.'
    },
    system: {
      title: 'حالة النظام',
      subtitle: 'مراقبة حالة السيرفر وقاعدة البيانات وآخر الأخطاء وسياسة الملفات.'
    },
    activity: {
      title: 'النشاط',
      subtitle: 'متابعة آخر العمليات الإدارية المسجلة في سجل النظام.'
    }
  };

  const state = {
    currentSection: 'overview',
    admin: JSON.parse(localStorage.getItem(ADMIN_KEY) || 'null'),
    dragonEffectEnabled: DRAGON_EFFECT_TEMPORARILY_DISABLED ? false : localStorage.getItem(DRAGON_KEY) !== 'false',
    overview: null,
    users: [],
    products: [],
    reports: [],
    conversations: [],
    content: [],
    homeAds: { top: [], bottom: null, slots: {} },
    homeAdsSelectedSlot: 'top_1',
    homeAdsUploadedImage: '',
    support: [],
    systemStatus: null,
    activity: []
  };

  const elements = {
    sidebar: document.getElementById('adminSidebar'),
    overlay: document.getElementById('mobileSidebarOverlay'),
    sidebarToggleBtn: document.getElementById('sidebarToggleBtn'),
    logoutBtn: document.getElementById('adminLogoutBtn'),
    refreshBtn: document.getElementById('refreshCurrentBtn'),
    identity: document.getElementById('adminIdentity'),
    identityRole: document.getElementById('adminIdentityRole'),
    pageTitle: document.getElementById('pageTitle'),
    pageSubtitle: document.getElementById('pageSubtitle'),
    timeChip: document.getElementById('adminTimeChip'),
    globalMessage: document.getElementById('globalMessage'),
    overviewStats: document.getElementById('overviewStats'),
    latestUsersList: document.getElementById('latestUsersList'),
    latestProductsList: document.getElementById('latestProductsList'),
    usersSearch: document.getElementById('usersSearch'),
    usersRoleFilter: document.getElementById('usersRoleFilter'),
    usersStatusFilter: document.getElementById('usersStatusFilter'),
    usersMeta: document.getElementById('usersMeta'),
    usersTableWrap: document.getElementById('usersTableWrap'),
    productsSearch: document.getElementById('productsSearch'),
    productsStatusFilter: document.getElementById('productsStatusFilter'),
    productsMeta: document.getElementById('productsMeta'),
    productsTableWrap: document.getElementById('productsTableWrap'),
    reportsSearch: document.getElementById('reportsSearch'),
    reportsStatusFilter: document.getElementById('reportsStatusFilter'),
    reportsMeta: document.getElementById('reportsMeta'),
    reportsTableWrap: document.getElementById('reportsTableWrap'),
    conversationsSearch: document.getElementById('conversationsSearch'),
    conversationsStatusFilter: document.getElementById('conversationsStatusFilter'),
    conversationsMeta: document.getElementById('conversationsMeta'),
    conversationsTableWrap: document.getElementById('conversationsTableWrap'),
    contentTableWrap: document.getElementById('contentTableWrap'),
    homeAdsEditorForm: document.getElementById('homeAdsEditorForm'),
    homeAdsSlotSelect: document.getElementById('homeAdsSlotSelect'),
    homeAdsSlotStatus: document.getElementById('homeAdsSlotStatus'),
    homeAdsTitleInput: document.getElementById('homeAdsTitleInput'),
    homeAdsSubtitleInput: document.getElementById('homeAdsSubtitleInput'),
    homeAdsImageInput: document.getElementById('homeAdsImageInput'),
    homeAdsLinkInput: document.getElementById('homeAdsLinkInput'),
    homeAdsImageUploadInput: document.getElementById('homeAdsImageUploadInput'),
    homeAdsImageUploadBtn: document.getElementById('homeAdsImageUploadBtn'),
    homeAdsUploadHint: document.getElementById('homeAdsUploadHint'),
    homeAdsPreviewGrid: document.getElementById('homeAdsPreviewGrid'),
    supportStatusFilter: document.getElementById('supportStatusFilter'),
    supportMeta: document.getElementById('supportMeta'),
    supportTableWrap: document.getElementById('supportTableWrap'),
    systemStatusGrid: document.getElementById('systemStatusGrid'),
    systemErrorsWrap: document.getElementById('systemErrorsWrap'),
    activityMeta: document.getElementById('activityMeta'),
    activityTableWrap: document.getElementById('activityTableWrap'),
    dragonEffectStatusText: document.getElementById('dragonEffectStatusText'),
    dragonEffectToggleBtn: document.getElementById('dragonEffectToggleBtn'),
    modal: document.getElementById('detailsModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalSubtitle: document.getElementById('modalSubtitle'),
    modalBody: document.getElementById('detailsModalBody'),
    closeModalBtn: document.getElementById('closeDetailsModalBtn')
  };

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || '';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('ar');
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('en-US').format(Number(value || 0));
  }

  function formatPrice(amount, currency) {
    return formatNumber(amount) + ' ' + (currency || '');
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ADMIN_KEY);
  }

  function setDragonEffectEnabled(enabled) {
    if (DRAGON_EFFECT_TEMPORARILY_DISABLED) {
      state.dragonEffectEnabled = false;
      localStorage.setItem(DRAGON_KEY, 'false');
      renderDragonEffectControl();
      showMessage('ميزة التنين موقوفة مؤقتا من الكود.', 'success');
      return;
    }
    state.dragonEffectEnabled = Boolean(enabled);
    localStorage.setItem(DRAGON_KEY, state.dragonEffectEnabled ? 'true' : 'false');
    renderDragonEffectControl();
  }

  function renderDragonEffectControl() {
    if (!elements.dragonEffectStatusText || !elements.dragonEffectToggleBtn) return;
    if (DRAGON_EFFECT_TEMPORARILY_DISABLED) {
      elements.dragonEffectStatusText.textContent = 'الميزة موقوفة مؤقتا على مستوى الموقع.';
      elements.dragonEffectToggleBtn.textContent = 'موقوف مؤقتا';
      elements.dragonEffectToggleBtn.className = 'action-button secondary';
      elements.dragonEffectToggleBtn.disabled = true;
      return;
    }
    elements.dragonEffectStatusText.textContent = state.dragonEffectEnabled
      ? 'الميزة مفعلة حاليًا في الواجهة العامة على هذا المتصفح.'
      : 'الميزة متوقفة حاليًا في الواجهة العامة على هذا المتصفح.';
    elements.dragonEffectToggleBtn.textContent = state.dragonEffectEnabled ? 'إيقاف التنين' : 'تفعيل التنين';
    elements.dragonEffectToggleBtn.className = 'action-button ' + (state.dragonEffectEnabled ? 'warning' : 'primary');
  }

  function redirectToLogin() {
    window.location.replace('/admin/login');
  }

  function showMessage(message, type) {
    if (!message) {
      elements.globalMessage.textContent = '';
      elements.globalMessage.className = 'global-message';
      return;
    }

    elements.globalMessage.textContent = message;
    elements.globalMessage.className = 'global-message is-visible ' + (type === 'success' ? 'is-success' : 'is-error');
  }

  async function adminApi(path, options) {
    const isFormData = options && options.body instanceof FormData;
    const response = await fetch(path, {
      ...(options || {}),
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(options && options.headers ? options.headers : {}),
        Authorization: 'Bearer ' + getToken()
      }
    });

    const data = await response.json().catch(function () {
      return {};
    });

    if (response.status === 401) {
      clearSession();
      redirectToLogin();
      throw new Error('انتهت جلسة الإدارة.');
    }

    if (!response.ok) {
      throw new Error(data.error || 'تعذر تنفيذ الطلب.');
    }

    return data;
  }

  function setLastUpdated() {
    elements.timeChip.textContent = 'آخر تحديث: ' + new Date().toLocaleString('ar');
  }

  function setIdentity(admin) {
    const source = admin || state.admin || {};
    if (elements.identity) {
      elements.identity.textContent = source.fullName || 'مدير النظام';
    }
    if (elements.identityRole) {
      elements.identityRole.textContent = source.role === 'admin' ? 'مدير النظام' : (source.role || 'إدارة المنصة');
    }
  }

  function closeSidebar() {
    elements.sidebar.classList.remove('is-open');
    elements.overlay.classList.remove('visible');
  }

  function openSidebar() {
    elements.sidebar.classList.add('is-open');
    elements.overlay.classList.add('visible');
  }

  function syncSidebarForViewport() {
    if (window.innerWidth > 980) {
      closeSidebar();
    }
  }

  function setSection(section) {
    state.currentSection = section;

    document.querySelectorAll('[data-section]').forEach(function (button) {
      button.classList.toggle('active', button.getAttribute('data-section') === section);
    });

    document.querySelectorAll('[data-panel]').forEach(function (panel) {
      panel.classList.toggle('active', panel.getAttribute('data-panel') === section);
    });

    elements.pageTitle.textContent = SECTION_TITLES[section].title;
    elements.pageSubtitle.textContent = SECTION_TITLES[section].subtitle;
    closeSidebar();
  }

  function createBadge(label, tone) {
    return '<span class="badge ' + tone + '">' + escapeHtml(label) + '</span>';
  }

  function userStatusBadge(isActive) {
    return isActive ? createBadge('نشط', 'success') : createBadge('معطل', 'danger');
  }

  function productStatusBadge(status) {
    const toneMap = { published: 'success', hidden: 'warning', sold: 'info', deleted: 'danger', draft: 'neutral', archived: 'neutral' };
    const labelMap = { published: 'منشور', hidden: 'مخفي', sold: 'مباع', deleted: 'محذوف', draft: 'مسودة', archived: 'مؤرشف' };
    return createBadge(labelMap[status] || status || '-', toneMap[status] || 'neutral');
  }

  function reportStatusBadge(status) {
    const toneMap = { open: 'danger', reviewed: 'warning', closed: 'success' };
    const labelMap = { open: 'مفتوح', reviewed: 'تمت المراجعة', closed: 'مغلق' };
    return createBadge(labelMap[status] || status || '-', toneMap[status] || 'neutral');
  }

  function conversationStatusBadge(status) {
    const toneMap = { open: 'success', closed: 'neutral', cancelled: 'danger' };
    const labelMap = { open: 'مفتوحة', closed: 'مغلقة', cancelled: 'ملغاة' };
    return createBadge(labelMap[status] || status || '-', toneMap[status] || 'neutral');
  }

  function renderEmptyState(message) {
    return '<div class="empty-state">' + escapeHtml(message) + '</div>';
  }

  function renderOverview() {
    const overview = state.overview || {};
    const stats = overview.stats || {};
    const statCards = [
      { label: 'إجمالي المستخدمين', value: stats.total_users, icon: '👥' },
      { label: 'المنتجات المنشورة', value: stats.published_products, icon: '📦' },
      { label: 'المحادثات المفتوحة', value: stats.open_conversations, icon: '💬' },
      { label: 'البلاغات المفتوحة', value: stats.open_reports, icon: '📑' }
    ];

    elements.overviewStats.innerHTML = statCards.map(function (item) {
      return '<article class="stat-card"><div><div class="stat-card-label">' + escapeHtml(item.label) + '</div><div class="stat-card-value">' + formatNumber(item.value) + '</div></div><div class="stat-card-icon">' + item.icon + '</div></article>';
    }).join('');

    const latestUsers = overview.latestUsers || [];
    elements.latestUsersList.innerHTML = latestUsers.length ? latestUsers.map(function (user) {
      return '<div class="list-item"><div class="entity-title">' + escapeHtml(user.full_name || '-') + '</div><div class="entity-subtitle">الدور: ' + escapeHtml(user.role || '-') + '</div><div class="entity-meta">تاريخ الإنشاء: ' + escapeHtml(formatDate(user.created_at)) + '</div></div>';
    }).join('') : renderEmptyState('لا يوجد مستخدمون حديثون.');

    const latestProducts = overview.latestProducts || [];
    elements.latestProductsList.innerHTML = latestProducts.length ? latestProducts.map(function (product) {
      return '<div class="list-item"><div class="entity-title">' + escapeHtml(product.name || '-') + '</div><div class="entity-subtitle">الحالة: ' + productStatusBadge(product.status) + '</div><div class="entity-meta">تاريخ الإنشاء: ' + escapeHtml(formatDate(product.created_at)) + '</div></div>';
    }).join('') : renderEmptyState('لا توجد منتجات حديثة.');
  }

  function getFilteredUsers() {
    const query = elements.usersSearch.value.trim().toLowerCase();
    const role = elements.usersRoleFilter.value;
    const status = elements.usersStatusFilter.value;

    return state.users.filter(function (user) {
      const haystack = [user.fullName, user.phone, user.email, user.storeName].join(' ').toLowerCase();
      const roleOk = role === 'all' || user.role === role;
      const statusOk = status === 'all' || (status === 'active' && user.isActive) || (status === 'inactive' && !user.isActive);
      return haystack.includes(query) && roleOk && statusOk;
    });
  }

  function renderUsers() {
    const rows = getFilteredUsers();
    elements.usersMeta.textContent = 'إجمالي النتائج: ' + rows.length + ' من أصل ' + state.users.length;

    if (!rows.length) {
      elements.usersTableWrap.innerHTML = renderEmptyState('لا توجد نتائج مطابقة لفلترة المستخدمين.');
      return;
    }

    elements.usersTableWrap.innerHTML =
      '<table class="data-table"><thead><tr><th>المستخدم</th><th>الدور</th><th>الهاتف / البريد</th><th>المنطقة</th><th>الحالة</th><th>الأداء</th><th>الإجراءات</th></tr></thead><tbody>' +
      rows.map(function (user) {
        return '<tr><td><div class="entity-title">' + escapeHtml(user.fullName || '-') + '</div><div class="entity-subtitle">' + escapeHtml(user.storeName || '') + '</div></td><td>' + createBadge(user.role || '-', 'info') + '</td><td><div>' + escapeHtml(user.phone || '-') + '</div><div class="inline-muted">' + escapeHtml(user.email || '-') + '</div></td><td>' + escapeHtml(user.region || '-') + '</td><td>' + userStatusBadge(user.isActive) + '</td><td><div class="inline-muted">المنتجات: ' + formatNumber(user.totalProducts) + '</div><div class="inline-muted">التقييم: ' + Number(user.averageRating || 0).toFixed(1) + ' (' + formatNumber(user.ratingsCount) + ')</div></td><td><div class="action-row"><button class="action-button secondary" type="button" data-user-details="' + user.id + '">تفاصيل</button><button class="action-button ' + (user.isActive ? 'danger' : 'primary') + '" type="button" data-user-toggle="' + user.id + '" data-user-next="' + (user.isActive ? 'false' : 'true') + '">' + (user.isActive ? 'تعطيل' : 'تفعيل') + '</button></div></td></tr>';
      }).join('') +
      '</tbody></table>';

    elements.usersTableWrap.querySelectorAll('[data-user-toggle]').forEach(function (button) {
      button.addEventListener('click', async function () {
        const id = Number(button.getAttribute('data-user-toggle'));
        const next = button.getAttribute('data-user-next') === 'true';
        try {
          showMessage('', '');
          await adminApi('/api/admin/users/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ isActive: next }) });
          showMessage('تم تحديث حالة المستخدم بنجاح.', 'success');
          await loadUsers(true);
          if (state.overview) await loadOverview(false);
        } catch (error) {
          showMessage(error.message, 'error');
        }
      });
    });

    elements.usersTableWrap.querySelectorAll('[data-user-details]').forEach(function (button) {
      button.addEventListener('click', function () {
        openUserDetails(Number(button.getAttribute('data-user-details')));
      });
    });
  }

  function getFilteredProducts() {
    const query = elements.productsSearch.value.trim().toLowerCase();
    const status = elements.productsStatusFilter.value;

    return state.products.filter(function (product) {
      const haystack = [product.name, product.category, product.seller && product.seller.storeName, product.seller && product.seller.fullName].join(' ').toLowerCase();
      return haystack.includes(query) && (status === 'all' || product.status === status);
    });
  }

  function renderProducts() {
    const rows = getFilteredProducts();
    elements.productsMeta.textContent = 'إجمالي النتائج: ' + rows.length + ' من أصل ' + state.products.length;

    if (!rows.length) {
      elements.productsTableWrap.innerHTML = renderEmptyState('لا توجد نتائج مطابقة لفلترة المنتجات.');
      return;
    }

    elements.productsTableWrap.innerHTML =
      '<table class="data-table"><thead><tr><th>الصورة</th><th>المنتج</th><th>البائع</th><th>السعر</th><th>التصنيف</th><th>الحالة</th><th>المشاهدات</th><th>الإجراءات</th></tr></thead><tbody>' +
      rows.map(function (product) {
        return '<tr><td>' + (product.image ? '<img class="thumbnail" src="' + escapeHtml(product.image) + '" alt="' + escapeHtml(product.name || '') + '" />' : '<div class="thumbnail"></div>') + '</td><td><div class="entity-title">' + escapeHtml(product.name || '-') + '</div><div class="entity-subtitle">' + escapeHtml(product.region || '-') + '</div></td><td><div>' + escapeHtml((product.seller && (product.seller.storeName || product.seller.fullName)) || '-') + '</div><div class="inline-muted">' + escapeHtml(product.seller && product.seller.phone || '-') + '</div></td><td>' + escapeHtml(formatPrice(product.price, product.currency)) + '</td><td>' + escapeHtml(product.category || '-') + '</td><td>' + productStatusBadge(product.status) + '</td><td>' + formatNumber(product.viewsCount) + '</td><td><div class="action-row"><button class="action-button secondary" type="button" data-product-details="' + product.id + '">تفاصيل</button><button class="action-button primary" type="button" data-product-status="' + product.id + '" data-next-status="published">نشر</button><button class="action-button warning" type="button" data-product-status="' + product.id + '" data-next-status="hidden">إخفاء</button><button class="action-button danger" type="button" data-product-status="' + product.id + '" data-next-status="sold">تم البيع</button></div></td></tr>';
      }).join('') +
      '</tbody></table>';

    elements.productsTableWrap.querySelectorAll('[data-product-status]').forEach(function (button) {
      button.addEventListener('click', async function () {
        const id = Number(button.getAttribute('data-product-status'));
        const status = button.getAttribute('data-next-status');
        try {
          showMessage('', '');
          await adminApi('/api/admin/products/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ status: status }) });
          showMessage('تم تحديث حالة المنتج بنجاح.', 'success');
          await loadProducts(true);
          if (state.overview) await loadOverview(false);
        } catch (error) {
          showMessage(error.message, 'error');
        }
      });
    });

    elements.productsTableWrap.querySelectorAll('[data-product-details]').forEach(function (button) {
      button.addEventListener('click', function () {
        openProductDetails(Number(button.getAttribute('data-product-details')));
      });
    });
  }

  function getFilteredReports() {
    const query = elements.reportsSearch.value.trim().toLowerCase();
    const status = elements.reportsStatusFilter.value;

    return state.reports.filter(function (report) {
      const haystack = [
        report.reason,
        report.reporterName,
        report.reportedUserName,
        report.productName,
        report.details,
        report.conversationId ? String(report.conversationId) : ''
      ].join(' ').toLowerCase();
      return haystack.includes(query) && (status === 'all' || report.status === status);
    });
  }

  function renderReports() {
    const rows = getFilteredReports();
    elements.reportsMeta.textContent = 'إجمالي النتائج: ' + rows.length + ' من أصل ' + state.reports.length;

    if (!rows.length) {
      elements.reportsTableWrap.innerHTML = renderEmptyState('لا توجد نتائج مطابقة لفلترة البلاغات.');
      return;
    }

    elements.reportsTableWrap.innerHTML =
      '<table class="data-table"><thead><tr><th>البلاغ</th><th>المبلغ</th><th>المبلغ ضده</th><th>السياق</th><th>الحالة</th><th>الملاحظة</th><th>الإجراءات</th></tr></thead><tbody>' +
      rows.map(function (report) {
        return '<tr><td><div class="entity-title">#' + report.id + ' - ' + escapeHtml(report.reason || '-') + '</div><div class="entity-meta">' + escapeHtml(formatDate(report.createdAt)) + '</div></td><td>' + escapeHtml(report.reporterName || '-') + '</td><td>' + escapeHtml(report.reportedUserName || '-') + '</td><td><div>' + escapeHtml(report.productName || 'بدون منتج') + '</div><div class="inline-muted">المحادثة: ' + escapeHtml(report.conversationId ? ('#' + report.conversationId) : 'غير مرتبطة') + '</div><div class="inline-muted">' + escapeHtml(report.details || 'لا توجد تفاصيل إضافية') + '</div></td><td>' + reportStatusBadge(report.status) + '</td><td><div class="inline-muted">' + escapeHtml(report.adminNotes || 'لا توجد ملاحظة') + '</div></td><td><div class="action-row"><button class="action-button secondary" type="button" data-report-details="' + report.id + '">مراجعة</button><button class="action-button warning" type="button" data-report-quick="' + report.id + '" data-report-next="reviewed">تمت المراجعة</button><button class="action-button primary" type="button" data-report-quick="' + report.id + '" data-report-next="closed">إغلاق</button></div></td></tr>';
      }).join('') +
      '</tbody></table>';

    elements.reportsTableWrap.querySelectorAll('[data-report-quick]').forEach(function (button) {
      button.addEventListener('click', async function () {
        const id = Number(button.getAttribute('data-report-quick'));
        const status = button.getAttribute('data-report-next');
        try {
          showMessage('', '');
          await adminApi('/api/admin/reports/' + id + '/status', { method: 'PATCH', body: JSON.stringify({ status: status }) });
          showMessage('تم تحديث حالة البلاغ بنجاح.', 'success');
          await loadReports(true);
          if (state.overview) await loadOverview(false);
        } catch (error) {
          showMessage(error.message, 'error');
        }
      });
    });

    elements.reportsTableWrap.querySelectorAll('[data-report-details]').forEach(function (button) {
      button.addEventListener('click', function () {
        openReportDetails(Number(button.getAttribute('data-report-details')));
      });
    });
  }

  function getFilteredConversations() {
    const query = elements.conversationsSearch.value.trim().toLowerCase();
    const status = elements.conversationsStatusFilter.value;

    return state.conversations.filter(function (conversation) {
      const haystack = [conversation.productName, conversation.sellerName, conversation.buyerName, conversation.lastMessagePreview].join(' ').toLowerCase();
      return haystack.includes(query) && (status === 'all' || conversation.status === status);
    });
  }

  function renderConversations() {
    const rows = getFilteredConversations();
    elements.conversationsMeta.textContent = 'إجمالي النتائج: ' + rows.length + ' من أصل ' + state.conversations.length;

    if (!rows.length) {
      elements.conversationsTableWrap.innerHTML = renderEmptyState('لا توجد نتائج مطابقة لفلترة المحادثات.');
      return;
    }

    elements.conversationsTableWrap.innerHTML =
      '<table class="data-table"><thead><tr><th>المحادثة</th><th>البائع</th><th>المشتري</th><th>عدد الرسائل</th><th>آخر رسالة</th><th>آخر نشاط</th><th>الحالة</th></tr></thead><tbody>' +
      rows.map(function (conversation) {
        return '<tr><td><div class="entity-title">#' + conversation.id + ' - ' + escapeHtml(conversation.productName || '-') + '</div><div class="entity-subtitle">أنشئت: ' + escapeHtml(formatDate(conversation.createdAt)) + '</div></td><td>' + escapeHtml(conversation.sellerName || '-') + '</td><td>' + escapeHtml(conversation.buyerName || '-') + '</td><td>' + formatNumber(conversation.messagesCount) + '</td><td><div class="inline-muted">' + escapeHtml(conversation.lastMessagePreview || 'لا توجد رسالة') + '</div></td><td>' + escapeHtml(formatDate(conversation.lastMessageAt)) + '</td><td>' + conversationStatusBadge(conversation.status) + '</td></tr>';
      }).join('') +
      '</tbody></table>';
  }

  function renderContent() {
    const rows = state.content || [];
    if (!rows.length) {
      elements.contentTableWrap.innerHTML = renderEmptyState('لا توجد عناصر محتوى ثابت متاحة حالياً.');
      return;
    }

    elements.contentTableWrap.innerHTML =
      '<table class="data-table"><thead><tr><th>المفتاح</th><th>العنوان</th><th>آخر تحديث</th><th>الإجراء</th></tr></thead><tbody>' +
      rows.map(function (item) {
        return '<tr><td><code>' + escapeHtml(item.key || '-') + '</code></td><td>' + escapeHtml(item.title || '-') + '</td><td>' + escapeHtml(formatDate(item.updatedAt)) + '</td><td><button class="action-button secondary" type="button" data-content-edit="' + escapeHtml(item.key || '') + '">تعديل</button></td></tr>';
      }).join('') +
      '</tbody></table>';

    elements.contentTableWrap.querySelectorAll('[data-content-edit]').forEach(function (button) {
      button.addEventListener('click', function () {
        openContentEditor(button.getAttribute('data-content-edit'));
      });
    });
  }

  function normalizeHomeAdEntry(slot, value) {
    const raw = value && typeof value === 'object' ? value : {};
    const title = String(raw.title || '').trim();
    const subtitle = String(raw.subtitle || '').trim();
    const imageCandidate = String(raw.image || '').trim();
    const linkCandidate = String(raw.link || '').trim();

    const image = (imageCandidate.startsWith('/') || /^https?:\/\//i.test(imageCandidate))
      ? imageCandidate
      : '';

    let link = null;
    const linkLower = linkCandidate.toLowerCase();
    if (linkCandidate && linkLower !== 'none' && linkCandidate !== '#' && (linkCandidate.startsWith('/') || /^https?:\/\//i.test(linkCandidate))) {
      link = linkCandidate;
    }

    return {
      slot: slot,
      title: title,
      subtitle: subtitle,
      image: image,
      link: link,
      isVisible: Boolean(title && image)
    };
  }

  function normalizeHomeAdsPayload(payload) {
    const slots = {};
    HOME_AD_SLOT_OPTIONS.forEach(function (item) {
      slots[item.slot] = normalizeHomeAdEntry(item.slot, null);
    });

    if (payload && payload.slots && typeof payload.slots === 'object') {
      HOME_AD_SLOT_OPTIONS.forEach(function (item) {
        if (payload.slots[item.slot]) {
          slots[item.slot] = normalizeHomeAdEntry(item.slot, payload.slots[item.slot]);
        }
      });
    }

    if (Array.isArray(payload && payload.top)) {
      payload.top.forEach(function (item) {
        if (!item || !item.slot || !slots[item.slot]) return;
        slots[item.slot] = normalizeHomeAdEntry(item.slot, item);
      });
    }

    if (payload && payload.bottom) {
      slots.bottom = normalizeHomeAdEntry('bottom', payload.bottom);
    }

    return {
      top: [slots.top_1, slots.top_2].filter(Boolean),
      bottom: slots.bottom || null,
      slots: slots
    };
  }

  function renderHomeAdsPreviewCard(entry, fallbackTitle) {
    if (!entry || !entry.isVisible) {
      return '<article class="home-ads-preview-item"><div class="home-ads-preview-head"><strong>' + escapeHtml(fallbackTitle) + '</strong><span class="badge neutral">مخفي</span></div><div class="home-ads-preview-image-placeholder">لا يوجد محتوى جاهز للعرض</div></article>';
    }

    return '<article class="home-ads-preview-item">' +
      '<div class="home-ads-preview-head"><strong>' + escapeHtml(fallbackTitle) + '</strong><span class="badge success">مرئي</span></div>' +
      '<div class="home-ads-preview-media">' +
        '<img class="home-ads-preview-image" src="' + escapeHtml(entry.image) + '" alt="' + escapeHtml(entry.title || fallbackTitle) + '" loading="lazy" />' +
      '</div>' +
      '<div class="home-ads-preview-copy">' +
        '<div class="home-ads-preview-title">' + escapeHtml(entry.title) + '</div>' +
        '<div class="home-ads-preview-subtitle">' + escapeHtml(entry.subtitle || 'بدون عنوان فرعي') + '</div>' +
        '<div class="home-ads-preview-link">' + escapeHtml(entry.link || 'بدون رابط قابل للنقر') + '</div>' +
      '</div>' +
    '</article>';
  }

  function renderHomeAdsEditor() {
    if (!elements.homeAdsSlotSelect || !elements.homeAdsTitleInput || !elements.homeAdsPreviewGrid) {
      return;
    }

    const selectedSlot = elements.homeAdsSlotSelect.value || state.homeAdsSelectedSlot || 'top_1';
    state.homeAdsSelectedSlot = selectedSlot;

    const entry = state.homeAds && state.homeAds.slots
      ? (state.homeAds.slots[selectedSlot] || normalizeHomeAdEntry(selectedSlot, null))
      : normalizeHomeAdEntry(selectedSlot, null);

    elements.homeAdsTitleInput.value = entry.title || '';
    elements.homeAdsSubtitleInput.value = entry.subtitle || '';
    elements.homeAdsImageInput.value = state.homeAdsUploadedImage || entry.image || '';
    elements.homeAdsLinkInput.value = entry.link || '';

    if (elements.homeAdsSlotStatus) {
      elements.homeAdsSlotStatus.textContent = entry.isVisible
        ? 'الحالة الحالية: مرئي في الصفحة الرئيسية.'
        : 'الحالة الحالية: مخفي (يجب وجود عنوان + صورة).';
    }

    if (elements.homeAdsUploadHint && state.homeAdsUploadedImage) {
      elements.homeAdsUploadHint.textContent = 'تم رفع صورة جديدة لهذا الموقع. سيتم اعتمادها عند الحفظ.';
    }

    const top1 = state.homeAds && state.homeAds.slots ? state.homeAds.slots.top_1 : null;
    const top2 = state.homeAds && state.homeAds.slots ? state.homeAds.slots.top_2 : null;
    const bottom = state.homeAds && state.homeAds.slots ? state.homeAds.slots.bottom : null;

    elements.homeAdsPreviewGrid.innerHTML =
      renderHomeAdsPreviewCard(top1, 'الإعلان العلوي 1') +
      renderHomeAdsPreviewCard(top2, 'الإعلان العلوي 2') +
      renderHomeAdsPreviewCard(bottom, 'الإعلان السفلي');
  }

  function bindHomeAdsHandlers() {
    if (!elements.homeAdsEditorForm || !elements.homeAdsSlotSelect || elements.homeAdsEditorForm.dataset.bound === '1') {
      return;
    }
    elements.homeAdsEditorForm.dataset.bound = '1';

    elements.homeAdsSlotSelect.addEventListener('change', function () {
      state.homeAdsUploadedImage = '';
      if (elements.homeAdsUploadHint) {
        elements.homeAdsUploadHint.textContent = 'عند وجود صورة مرفوعة + رابط صورة، يتم اعتماد الصورة المرفوعة.';
      }
      renderHomeAdsEditor();
    });

    if (elements.homeAdsImageUploadBtn) {
      elements.homeAdsImageUploadBtn.addEventListener('click', async function () {
        const file = elements.homeAdsImageUploadInput && elements.homeAdsImageUploadInput.files ? elements.homeAdsImageUploadInput.files[0] : null;
        if (!file) {
          if (elements.homeAdsUploadHint) elements.homeAdsUploadHint.textContent = 'اختر صورة قبل الرفع.';
          return;
        }

        const formData = new FormData();
        formData.append('image', file);
        elements.homeAdsImageUploadBtn.disabled = true;
        elements.homeAdsImageUploadBtn.textContent = 'جارٍ الرفع...';

        try {
          const result = await adminApi('/api/admin/content/upload-image', {
            method: 'POST',
            body: formData
          });
          const imageUrl = String(result && result.url ? result.url : '').trim();
          if (!imageUrl) {
            throw new Error('لم يتم استلام رابط الصورة بعد الرفع.');
          }
          state.homeAdsUploadedImage = imageUrl;
          elements.homeAdsImageInput.value = imageUrl;
          if (elements.homeAdsUploadHint) elements.homeAdsUploadHint.textContent = 'تم رفع الصورة بنجاح. اضغط حفظ لتطبيقها.';
        } catch (error) {
          if (elements.homeAdsUploadHint) elements.homeAdsUploadHint.textContent = error.message || 'تعذر رفع الصورة.';
        } finally {
          elements.homeAdsImageUploadBtn.disabled = false;
          elements.homeAdsImageUploadBtn.textContent = 'رفع الصورة';
        }
      });
    }

    elements.homeAdsEditorForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const slot = elements.homeAdsSlotSelect.value || 'top_1';
      const payload = {
        title: String(elements.homeAdsTitleInput.value || '').trim(),
        subtitle: String(elements.homeAdsSubtitleInput.value || '').trim(),
        image: String(elements.homeAdsImageInput.value || '').trim(),
        link: String(elements.homeAdsLinkInput.value || '').trim()
      };

      if (state.homeAdsUploadedImage) {
        payload.image = state.homeAdsUploadedImage;
      }

      try {
        const result = await adminApi('/api/admin/home-ads/' + encodeURIComponent(slot), {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        state.homeAds = normalizeHomeAdsPayload(result.homeAds || {});
        state.homeAdsUploadedImage = '';
        if (elements.homeAdsUploadHint) {
          elements.homeAdsUploadHint.textContent = 'تم الحفظ بنجاح.';
        }
        showMessage('تم حفظ إعدادات الإعلان بنجاح.', 'success');
        renderHomeAdsEditor();
      } catch (error) {
        showMessage(error.message, 'error');
      }
    });
  }

  function getFilteredSupport() {
    const status = elements.supportStatusFilter ? elements.supportStatusFilter.value : 'all';
    return state.support.filter(function (item) {
      return status === 'all' || item.status === status;
    });
  }

  function renderSupport() {
    const rows = getFilteredSupport();
    if (elements.supportMeta) {
      elements.supportMeta.textContent = 'إجمالي النتائج: ' + rows.length + ' من أصل ' + state.support.length;
    }
    if (!rows.length) {
      elements.supportTableWrap.innerHTML = renderEmptyState('لا توجد محادثات دعم مطابقة للحالة المختارة.');
      return;
    }

    elements.supportTableWrap.innerHTML =
      '<table class="data-table"><thead><tr><th>المستخدم</th><th>التصنيف</th><th>الحالة</th><th>عدد الرسائل</th><th>آخر رسالة</th><th>آخر نشاط</th><th>الإجراء</th></tr></thead><tbody>' +
      rows.map(function (item) {
        return '<tr><td><div class="entity-title">' + escapeHtml(item.requesterName || '-') + '</div><div class="entity-subtitle">' + escapeHtml(item.requesterPhone || '-') + '</div></td><td>' + escapeHtml(item.category || '-') + '</td><td>' + createBadge(item.status || '-', item.status === 'closed' ? 'neutral' : (item.status === 'pending' ? 'warning' : 'success')) + '</td><td>' + formatNumber(item.messagesCount) + '</td><td><div class="inline-muted">' + escapeHtml(item.lastMessagePreview || '-') + '</div></td><td>' + escapeHtml(formatDate(item.lastMessageAt)) + '</td><td><button class="action-button secondary" type="button" data-support-details="' + item.id + '">فتح</button></td></tr>';
      }).join('') +
      '</tbody></table>';

    elements.supportTableWrap.querySelectorAll('[data-support-details]').forEach(function (button) {
      button.addEventListener('click', function () {
        openSupportDetails(Number(button.getAttribute('data-support-details')));
      });
    });
  }

  function renderSystemStatus() {
    const status = state.systemStatus || {};
    const server = status.server || {};
    const database = status.database || {};
    const uploads = status.uploads || {};
    const support = status.support || {};
    const reports = status.reports || {};
    const notifications = status.notifications || {};
    const push = notifications.push || {};
    const pushSuccessRateValue = Number(push.successRate || 0);
    const pushSuccessRate = Number.isFinite(pushSuccessRateValue)
      ? pushSuccessRateValue.toFixed(2) + '%'
      : '0.00%';
    const pushSuccessCount = Number(push.successCount || 0);
    const pushFailureCount = Number(push.failureCount || 0);
    const pushInvalidRemoved = Number(push.invalidRemoved || 0);
    const pushWarnings = [];
    if (pushSuccessRateValue < 90 && Number(push.totalAttempts || 0) > 0) {
      pushWarnings.push('successRate<90%');
    }
    if (pushFailureCount > pushSuccessCount && Number(push.totalAttempts || 0) > 0) {
      pushWarnings.push('failure>success');
    }
    if (pushInvalidRemoved >= 25) {
      pushWarnings.push('invalidRemoved>=25');
    }
    const pushOperationalState = pushWarnings.length
      ? `Warning (${pushWarnings.join(' | ')})`
      : 'Normal';

    elements.systemStatusGrid.innerHTML = [
      ['حالة السيرفر', server.status || '-'],
      ['مدة التشغيل بالثواني', formatNumber(server.uptimeSeconds)],
      ['حالة قاعدة البيانات', database.status || '-'],
      ['وقت قاعدة البيانات', formatDate(database.databaseTime)],
      ['رسائل الدعم المفتوحة', formatNumber(support.openMessages)],
      ['البلاغات المفتوحة', formatNumber(reports.openReports)],
      ['الإشعارات غير المقروءة', formatNumber(notifications.unreadNotifications)],
      ['محاولات Web Push', formatNumber(push.totalAttempts)],
      ['نجاح Web Push', formatNumber(push.successCount)],
      ['فشل Web Push', formatNumber(push.failureCount)],
      ['نسبة النجاح Web Push', pushSuccessRate],
      ['الاشتراكات غير الصالحة المحذوفة', formatNumber(push.invalidRemoved)],
      ['نافذة القياس (بالساعات)', formatNumber(push.windowHours)],
      ['حالة Push التشغيلية', pushOperationalState],
      ['حجم الرفع الأقصى', (uploads.maxFileSizeMb || '-') + ' MB'],
      ['عدد الملفات في الطلب', formatNumber(uploads.maxFilesPerRequest)],
      ['النسخ الاحتياطي', escapeHtml(uploads.backupFrequency || '-')]
    ].map(function (item) {
      return '<article class="content-card"><div class="entity-title">' + escapeHtml(item[0]) + '</div><div class="entity-subtitle">' + escapeHtml(item[1]) + '</div></article>';
    }).join('');

    const errors = status.lastErrors || [];
    elements.systemErrorsWrap.innerHTML = errors.length
      ? '<table class="data-table"><thead><tr><th>الفئة</th><th>الرسالة</th><th>الوقت</th></tr></thead><tbody>' +
        errors.map(function (item) {
          return '<tr><td>' + escapeHtml(item.category || '-') + '</td><td><div class="inline-muted">' + escapeHtml(item.message || '-') + '</div></td><td>' + escapeHtml(formatDate(item.createdAt)) + '</td></tr>';
        }).join('') +
        '</tbody></table>'
      : renderEmptyState('لا توجد أخطاء حديثة مسجلة.');
  }

  function summarizeMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object' || !Object.keys(metadata).length) return 'لا توجد بيانات إضافية';
    return Object.keys(metadata).slice(0, 3).map(function (key) {
      return key + ': ' + String(metadata[key]);
    }).join(' | ');
  }

  function renderActivity() {
    renderDragonEffectControl();
    const rows = state.activity || [];
    elements.activityMeta.textContent = 'عدد العناصر المعروضة: ' + rows.length;

    if (!rows.length) {
      elements.activityTableWrap.innerHTML = renderEmptyState('لا يوجد نشاط إداري متاح حاليًا.');
      return;
    }

    elements.activityTableWrap.innerHTML =
      '<table class="data-table"><thead><tr><th>المسؤول</th><th>الإجراء</th><th>الهدف</th><th>البيانات</th><th>الوقت</th></tr></thead><tbody>' +
      rows.map(function (entry) {
        return '<tr><td>' + escapeHtml(entry.actorName || 'غير معروف') + '</td><td>' + createBadge(entry.actionType || '-', 'info') + '</td><td>' + escapeHtml((entry.targetType || '-') + ' #' + (entry.targetId || '-')) + '</td><td><div class="inline-muted">' + escapeHtml(summarizeMetadata(entry.metadata)) + '</div></td><td>' + escapeHtml(formatDate(entry.createdAt)) + '</td></tr>';
      }).join('') +
      '</tbody></table>';
  }

  function openModal(title, subtitle, bodyHtml) {
    elements.modalTitle.textContent = title;
    elements.modalSubtitle.textContent = subtitle;
    elements.modalBody.innerHTML = bodyHtml;
    elements.modal.classList.add('visible');
    elements.modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal() {
    elements.modal.classList.remove('visible');
    elements.modal.setAttribute('aria-hidden', 'true');
    elements.modalBody.innerHTML = '';
  }

  async function openUserDetails(id) {
    try {
      openModal('تفاصيل المستخدم', 'جارٍ تحميل البيانات التفصيلية من الخادم...', renderEmptyState('جارٍ التحميل...'));
      const data = await adminApi('/api/admin/users/' + id);
      const user = data.user || {};
      const products = data.recentProducts || [];
      const conversations = data.recentConversations || [];
      const ratings = data.ratings || [];

      openModal(
        user.fullName || 'تفاصيل المستخدم',
        'معلومات إضافية من endpoint المستخدم الفردي.',
        '<div class="detail-grid">' +
          '<div class="detail-card"><strong>الاسم الكامل</strong>' + escapeHtml(user.fullName || '-') + '</div>' +
          '<div class="detail-card"><strong>الدور</strong>' + escapeHtml(user.role || '-') + '</div>' +
          '<div class="detail-card"><strong>الهاتف</strong>' + escapeHtml(user.phone || '-') + '</div>' +
          '<div class="detail-card"><strong>البريد</strong>' + escapeHtml(user.email || '-') + '</div>' +
          '<div class="detail-card"><strong>المنطقة</strong>' + escapeHtml(user.region || '-') + '</div>' +
          '<div class="detail-card"><strong>الحالة</strong>' + (user.isActive ? 'نشط' : 'معطل') + '</div>' +
          '<div class="detail-card detail-wide"><strong>أحدث المنتجات</strong>' + (products.length ? products.map(function (item) {
            return '<div class="inline-muted">' + escapeHtml(item.name || '-') + ' - ' + escapeHtml(item.status || '-') + '</div>';
          }).join('') : '<div class="inline-muted">لا توجد منتجات حديثة</div>') + '</div>' +
          '<div class="detail-card detail-wide"><strong>أحدث المحادثات</strong>' + (conversations.length ? conversations.map(function (item) {
            return '<div class="inline-muted">#' + item.id + ' - ' + escapeHtml(item.productName || '-') + ' - ' + escapeHtml(item.status || '-') + '</div>';
          }).join('') : '<div class="inline-muted">لا توجد محادثات حديثة</div>') + '</div>' +
          '<div class="detail-card detail-wide"><strong>آخر التقييمات</strong>' + (ratings.length ? ratings.map(function (item) {
            return '<div class="inline-muted">' + item.score + '/5 - ' + escapeHtml(item.comment || 'بدون تعليق') + '</div>';
          }).join('') : '<div class="inline-muted">لا توجد تقييمات</div>') + '</div>' +
        '</div>'
      );
    } catch (error) {
      showMessage(error.message, 'error');
      closeModal();
    }
  }

  async function openProductDetails(id) {
    try {
      openModal('تفاصيل المنتج', 'جارٍ تحميل البيانات التفصيلية من الخادم...', renderEmptyState('جارٍ التحميل...'));
      const data = await adminApi('/api/admin/products/' + id);
      const product = data.product || {};
      const conversations = data.conversations || [];

      openModal(
        product.name || 'تفاصيل المنتج',
        'بيانات من endpoint المنتج الفردي مع آخر المحادثات المرتبطة به.',
        '<div class="detail-grid">' +
          '<div class="detail-card"><strong>الاسم</strong>' + escapeHtml(product.name || '-') + '</div>' +
          '<div class="detail-card"><strong>الحالة</strong>' + escapeHtml(product.status || '-') + '</div>' +
          '<div class="detail-card"><strong>السعر</strong>' + escapeHtml(formatPrice(product.price, product.currency)) + '</div>' +
          '<div class="detail-card"><strong>التصنيف</strong>' + escapeHtml(product.category || '-') + '</div>' +
          '<div class="detail-card"><strong>البائع</strong>' + escapeHtml(product.seller && (product.seller.storeName || product.seller.fullName) || '-') + '</div>' +
          '<div class="detail-card"><strong>المشاهدات</strong>' + formatNumber(product.viewsCount) + '</div>' +
          '<div class="detail-card detail-wide"><strong>الوصف</strong>' + escapeHtml(product.description || 'لا يوجد وصف') + '</div>' +
          '<div class="detail-card detail-wide"><strong>المحادثات المرتبطة</strong>' + (conversations.length ? conversations.map(function (item) {
            return '<div class="inline-muted">#' + item.id + ' - ' + escapeHtml(item.buyerName || '-') + ' - ' + escapeHtml(item.status || '-') + '</div>';
          }).join('') : '<div class="inline-muted">لا توجد محادثات مرتبطة</div>') + '</div>' +
        '</div>'
      );
    } catch (error) {
      showMessage(error.message, 'error');
      closeModal();
    }
  }

  function openReportDetails(id) {
    const report = state.reports.find(function (item) {
      return item.id === id;
    });
    if (!report) return;

    openModal(
      'مراجعة البلاغ #' + report.id,
      'تحديث حالة البلاغ وحفظ ملاحظة إدارية باستخدام العقد الحالي.',
      '<form id="reportReviewForm" class="detail-grid">' +
        '<div class="detail-card"><strong>المبلغ</strong>' + escapeHtml(report.reporterName || '-') + '</div>' +
        '<div class="detail-card"><strong>المبلغ ضده</strong>' + escapeHtml(report.reportedUserName || '-') + '</div>' +
        '<div class="detail-card detail-wide"><strong>السبب</strong>' + escapeHtml(report.reason || '-') + '</div>' +
        '<div class="detail-card"><strong>المنتج</strong>' + escapeHtml(report.productName || '-') + '</div>' +
        '<div class="detail-card"><strong>المحادثة</strong>' + escapeHtml(report.conversationId ? ('#' + report.conversationId) : 'غير مرتبطة') + '</div>' +
        '<div class="detail-card"><strong>التاريخ</strong>' + escapeHtml(formatDate(report.createdAt)) + '</div>' +
        '<div class="detail-card detail-wide"><strong>التفاصيل</strong>' + escapeHtml(report.details || 'لا توجد تفاصيل إضافية') + '</div>' +
        '<div class="detail-card detail-wide"><strong>الحالة الجديدة</strong><select id="reportStatusSelect" class="field-control"><option value="open"' + (report.status === 'open' ? ' selected' : '') + '>مفتوح</option><option value="reviewed"' + (report.status === 'reviewed' ? ' selected' : '') + '>تمت المراجعة</option><option value="closed"' + (report.status === 'closed' ? ' selected' : '') + '>مغلق</option></select></div>' +
        '<div class="detail-card detail-wide"><strong>ملاحظة إدارية</strong><textarea id="reportAdminNote" class="detail-textarea" placeholder="أضف ملاحظة توضح ما تم اتخاذه...">' + escapeHtml(report.adminNotes || '') + '</textarea></div>' +
        '<div class="detail-card detail-wide"><div class="action-row"><button class="action-button primary" type="submit">حفظ التغييرات</button><button class="action-button secondary" type="button" id="cancelReportReview">إلغاء</button></div></div>' +
      '</form>'
    );

    document.getElementById('cancelReportReview').addEventListener('click', closeModal);
    document.getElementById('reportReviewForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      const status = document.getElementById('reportStatusSelect').value;
      const adminNote = document.getElementById('reportAdminNote').value.trim();

      try {
        await adminApi('/api/admin/reports/' + id + '/status', {
          method: 'PATCH',
          body: JSON.stringify({ status: status, adminNote: adminNote })
        });
        closeModal();
        showMessage('تم حفظ تحديث البلاغ بنجاح.', 'success');
        await loadReports(true);
        if (state.overview) await loadOverview(false);
      } catch (error) {
        showMessage(error.message, 'error');
      }
    });
  }

  function openContentEditor(key) {
    const item = state.content.find(function (entry) {
      return entry.key === key;
    });
    if (!item) return;

    openModal(
      'تعديل المحتوى الثابت',
      'يمكن حفظ التغييرات مباشرة لتنعكس على الواجهة العامة.',
      '<form id="contentEditorForm" class="detail-grid">' +
        '<div class="detail-card"><strong>المفتاح</strong><code>' + escapeHtml(item.key || '-') + '</code></div>' +
        '<div class="detail-card detail-wide"><strong>العنوان</strong><input id="contentEditorTitle" class="field-control" value="' + escapeHtml(item.title || '') + '" /></div>' +
        '<div class="detail-card detail-wide"><strong>النص</strong><textarea id="contentEditorBody" class="detail-textarea" style="min-height:220px;">' + escapeHtml(item.content || '') + '</textarea></div>' +
        '<div class="detail-card detail-wide"><div class="action-row"><button class="action-button primary" type="submit">حفظ</button><button class="action-button secondary" type="button" id="cancelContentEditor">إلغاء</button></div></div>' +
      '</form>'
    );

    document.getElementById('cancelContentEditor').addEventListener('click', closeModal);
    document.getElementById('contentEditorForm').addEventListener('submit', async function (event) {
      event.preventDefault();
      try {
        await adminApi('/api/admin/content/' + encodeURIComponent(item.key), {
          method: 'PUT',
          body: JSON.stringify({
            title: document.getElementById('contentEditorTitle').value.trim(),
            content: document.getElementById('contentEditorBody').value.trim()
          })
        });
        closeModal();
        showMessage('تم حفظ المحتوى بنجاح.', 'success');
        await loadContentSection(true);
      } catch (error) {
        showMessage(error.message, 'error');
      }
    });
  }

  async function openSupportDetails(id) {
    try {
      openModal('محادثة الدعم', 'جارٍ تحميل تفاصيل محادثة الدعم...', renderEmptyState('جارٍ التحميل...'));
      const data = await adminApi('/api/admin/support/' + id);
      const conversation = data.conversation || {};
      const messages = conversation.messages || [];

      openModal(
        'محادثة الدعم #' + conversation.id,
        'إدارة الردود والحالة وتعيين المشرف على المحادثة.',
        '<form id="supportReplyForm" class="detail-grid">' +
          '<div class="detail-card"><strong>المستخدم</strong>' + escapeHtml(conversation.requesterName || '-') + '</div>' +
          '<div class="detail-card"><strong>التصنيف</strong>' + escapeHtml(conversation.category || '-') + '</div>' +
          '<div class="detail-card"><strong>الحالة</strong><select id="supportStatusSelect" class="field-control"><option value="open"' + (conversation.status === 'open' ? ' selected' : '') + '>مفتوحة</option><option value="pending"' + (conversation.status === 'pending' ? ' selected' : '') + '>بانتظار الرد</option><option value="closed"' + (conversation.status === 'closed' ? ' selected' : '') + '>مغلقة</option></select></div>' +
          '<div class="detail-card detail-wide"><strong>الرسائل</strong>' + (messages.length ? messages.map(function (item) {
            return '<div class="list-item"><strong>' + escapeHtml(item.senderName || '-') + '</strong><div class="muted">' + escapeHtml(item.body || '') + '</div><div class="inline-muted">' + escapeHtml(formatDate(item.createdAt)) + '</div></div>';
          }).join('') : '<div class="inline-muted">لا توجد رسائل بعد.</div>') + '</div>' +
          '<div class="detail-card detail-wide"><strong>رد الإدارة</strong><textarea id="supportReplyBody" class="detail-textarea" placeholder="اكتب رد الدعم الفني هنا"></textarea></div>' +
          '<div class="detail-card detail-wide"><div class="action-row"><button class="action-button primary" type="submit">حفظ وإرسال الرد</button><button class="action-button secondary" type="button" id="supportReplyCancel">إلغاء</button></div></div>' +
        '</form>'
      );

      document.getElementById('supportReplyCancel').addEventListener('click', closeModal);
      document.getElementById('supportReplyForm').addEventListener('submit', async function (event) {
        event.preventDefault();
        try {
          await adminApi('/api/admin/support/' + id, {
            method: 'PATCH',
            body: JSON.stringify({ status: document.getElementById('supportStatusSelect').value })
          });

          const replyBody = document.getElementById('supportReplyBody').value.trim();
          if (replyBody) {
            await adminApi('/api/admin/support/' + id + '/messages', {
              method: 'POST',
              body: JSON.stringify({ message: replyBody })
            });
          }

          closeModal();
          showMessage('تم تحديث محادثة الدعم بنجاح.', 'success');
          await loadSupport(true);
        } catch (error) {
          showMessage(error.message, 'error');
        }
      });
    } catch (error) {
      showMessage(error.message, 'error');
      closeModal();
    }
  }

  async function loadMe() {
    const data = await adminApi('/api/admin/auth/me');
    state.admin = data.admin || null;
    localStorage.setItem(ADMIN_KEY, JSON.stringify(state.admin || null));
    setIdentity(state.admin);
  }

  async function loadOverview(updateTime) {
    const data = await adminApi('/api/admin/overview');
    state.overview = data;
    renderOverview();
    if (updateTime !== false) setLastUpdated();
  }

  async function loadUsers(updateTime) {
    const data = await adminApi('/api/admin/users');
    state.users = data.users || [];
    renderUsers();
    if (updateTime !== false) setLastUpdated();
  }

  async function loadProducts(updateTime) {
    const data = await adminApi('/api/admin/products');
    state.products = data.products || [];
    renderProducts();
    if (updateTime !== false) setLastUpdated();
  }

  async function loadReports(updateTime) {
    const data = await adminApi('/api/admin/reports');
    state.reports = data.reports || [];
    renderReports();
    if (updateTime !== false) setLastUpdated();
  }

  async function loadConversations(updateTime) {
    const data = await adminApi('/api/admin/conversations');
    state.conversations = data.conversations || [];
    renderConversations();
    if (updateTime !== false) setLastUpdated();
  }

  async function loadContentSection(updateTime) {
    const data = await adminApi('/api/admin/content');
    state.content = data.content || [];
    renderContent();
    if (updateTime !== false) setLastUpdated();
  }

  async function loadHomeAdsSection(updateTime) {
    renderSectionLoading('homeAds');
    const data = await adminApi('/api/admin/home-ads?t=' + Date.now());
    state.homeAds = normalizeHomeAdsPayload(data.homeAds || {});
    renderHomeAdsEditor();
    if (updateTime !== false) setLastUpdated();
  }

  async function loadSupport(updateTime) {
    const selectedStatus = elements.supportStatusFilter ? elements.supportStatusFilter.value : 'all';
    const data = await adminApi('/api/admin/support?status=' + encodeURIComponent(selectedStatus));
    state.support = data.conversations || [];
    renderSupport();
    if (updateTime !== false) setLastUpdated();
  }

  async function loadSystemStatus(updateTime) {
    const data = await adminApi('/api/admin/system/status');
    state.systemStatus = data.status || null;
    renderSystemStatus();
    if (updateTime !== false) setLastUpdated();
  }

  async function loadActivity(updateTime) {
    const data = await adminApi('/api/admin/activity');
    state.activity = data.activity || [];
    renderActivity();
    if (updateTime !== false) setLastUpdated();
  }

  async function refreshCurrentSection() {
    showMessage('', '');
    if (state.currentSection === 'overview') return loadOverview(true);
    if (state.currentSection === 'users') return loadUsers(true);
    if (state.currentSection === 'products') return loadProducts(true);
    if (state.currentSection === 'reports') return loadReports(true);
    if (state.currentSection === 'conversations') return loadConversations(true);
    if (state.currentSection === 'content') return loadContentSection(true);
    if (state.currentSection === 'homeAds') return loadHomeAdsSection(true);
    if (state.currentSection === 'support') return loadSupport(true);
    if (state.currentSection === 'system') return loadSystemStatus(true);
    if (state.currentSection === 'activity') return loadActivity(true);
  }

  function bindFilters() {
    elements.usersSearch.addEventListener('input', renderUsers);
    elements.usersRoleFilter.addEventListener('change', renderUsers);
    elements.usersStatusFilter.addEventListener('change', renderUsers);
    elements.productsSearch.addEventListener('input', renderProducts);
    elements.productsStatusFilter.addEventListener('change', renderProducts);
    elements.reportsSearch.addEventListener('input', renderReports);
    elements.reportsStatusFilter.addEventListener('change', renderReports);
    elements.conversationsSearch.addEventListener('input', renderConversations);
    elements.conversationsStatusFilter.addEventListener('change', renderConversations);
    elements.supportStatusFilter?.addEventListener('change', function () {
      loadSupport(true).catch(function (error) {
        showMessage(error.message, 'error');
      });
    });
  }

  function bindNavigation() {
    document.querySelectorAll('[data-section]').forEach(function (button) {
      button.addEventListener('click', async function () {
        const section = button.getAttribute('data-section');
        setSection(section);
        await refreshCurrentSection();
      });
    });
  }

  function bindUI() {
    elements.sidebarToggleBtn.addEventListener('click', openSidebar);
    elements.overlay.addEventListener('click', closeSidebar);
    window.addEventListener('resize', syncSidebarForViewport);
    elements.closeModalBtn.addEventListener('click', closeModal);
    bindHomeAdsHandlers();
    renderDragonEffectControl();
    elements.dragonEffectToggleBtn.addEventListener('click', function () {
      setDragonEffectEnabled(!state.dragonEffectEnabled);
      showMessage('تم تحديث حالة تأثير التنين. حدّث الواجهة العامة لتطبيق التغيير.', 'success');
    });
    elements.modal.addEventListener('click', function (event) {
      if (event.target === elements.modal) closeModal();
    });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        closeModal();
        closeSidebar();
      }
    });
    elements.refreshBtn.addEventListener('click', async function () {
      try {
        await refreshCurrentSection();
      } catch (error) {
        showMessage(error.message, 'error');
      }
    });
    elements.logoutBtn.addEventListener('click', async function () {
      try {
        await adminApi('/api/admin/auth/logout', { method: 'POST', body: JSON.stringify({}) });
      } catch (_error) {
      } finally {
        clearSession();
        redirectToLogin();
      }
    });
  }

  function supportStatusTone(status) {
    if (status === 'closed') return 'neutral';
    if (status === 'pending') return 'warning';
    return 'success';
  }

  function renderSupportDetailPanel(conversation) {
    const panel = document.getElementById('supportDetailPanel');
    if (!panel) return;

    if (!conversation) {
      panel.innerHTML = '<div class="support-detail-empty">اختر محادثة دعم لعرض الرسائل والرد عليها.</div>';
      return;
    }

    const messages = conversation.messages || [];
    panel.innerHTML =
      '<div class="support-thread-shell">' +
        '<div class="support-thread-head">' +
          '<div>' +
            '<h4>محادثة #' + escapeHtml(conversation.id) + '</h4>' +
            '<div class="entity-subtitle">' + escapeHtml(conversation.requesterName || '-') + ' - ' + escapeHtml(conversation.requesterPhone || '-') + '</div>' +
          '</div>' +
          '<div class="support-thread-badges">' +
            createBadge(conversation.category || '-', 'info') +
            createBadge(conversation.status || '-', supportStatusTone(conversation.status)) +
          '</div>' +
        '</div>' +
        '<div class="support-thread-meta">' +
          '<span>آخر نشاط: ' + escapeHtml(formatDate(conversation.lastMessageAt)) + '</span>' +
          '<span>الرد الأول: ' + escapeHtml(formatDate(conversation.firstResponseAt)) + '</span>' +
        '</div>' +
        '<div class="support-thread-messages">' +
          (messages.length
            ? messages.map(function (item) {
                return '<div class="support-thread-message ' + (item.senderRole === 'admin' ? 'is-admin' : 'is-user') + '">' +
                  '<div class="support-thread-message-head"><strong>' + escapeHtml(item.senderName || '-') + '</strong><span>' + escapeHtml(formatDate(item.createdAt)) + '</span></div>' +
                  '<div class="support-thread-message-body">' + escapeHtml(item.body || '') + '</div>' +
                '</div>';
              }).join('')
            : '<div class="support-detail-empty">لا توجد رسائل داخل هذه المحادثة حتى الآن.</div>') +
        '</div>' +
        '<form id="supportInlineReplyForm" class="support-inline-form">' +
          '<div class="support-inline-controls">' +
            '<select id="supportInlineStatus" class="field-control">' +
              '<option value="open"' + (conversation.status === 'open' ? ' selected' : '') + '>مفتوحة</option>' +
              '<option value="pending"' + (conversation.status === 'pending' ? ' selected' : '') + '>بانتظار الرد</option>' +
              '<option value="closed"' + (conversation.status === 'closed' ? ' selected' : '') + '>مغلقة</option>' +
            '</select>' +
            '<button class="action-button secondary" type="button" id="supportInlineRefresh">تحديث</button>' +
          '</div>' +
          '<textarea id="supportInlineReplyBody" class="detail-textarea support-reply-textarea" placeholder="اكتب رد الدعم الفني هنا"></textarea>' +
          '<div class="action-row">' +
            '<button class="action-button primary" type="submit">إرسال الرد</button>' +
          '</div>' +
        '</form>' +
      '</div>';

    document.getElementById('supportInlineRefresh')?.addEventListener('click', function () {
      openSupportDetails(conversation.id).catch(function (error) {
        showMessage(error.message, 'error');
      });
    });

    document.getElementById('supportInlineReplyForm')?.addEventListener('submit', async function (event) {
      event.preventDefault();
      const nextStatus = document.getElementById('supportInlineStatus').value;
      const message = document.getElementById('supportInlineReplyBody').value.trim();

      try {
        await adminApi('/api/admin/support/' + conversation.id, {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus })
        });

        if (message) {
          await adminApi('/api/admin/support/' + conversation.id + '/messages', {
            method: 'POST',
            body: JSON.stringify({ message: message })
          });
        }

        showMessage('تم تحديث محادثة الدعم بنجاح.', 'success');
        await loadSupport(true);
        await openSupportDetails(conversation.id);
      } catch (error) {
        showMessage(error.message, 'error');
      }
    });
  }

  async function openSupportDetails(id) {
    const panel = document.getElementById('supportDetailPanel');
    state.activeSupportId = id;
    if (panel) {
      panel.innerHTML = '<div class="support-detail-empty">جارٍ تحميل تفاصيل المحادثة...</div>';
    }

    const data = await adminApi('/api/admin/support/' + id);
    renderSupportDetailPanel(data.conversation || null);
  }

  function renderSupport() {
    const rows = getFilteredSupport();
    if (elements.supportMeta) {
      elements.supportMeta.textContent = 'إجمالي النتائج: ' + rows.length + ' من أصل ' + state.support.length;
    }

    if (!rows.length) {
      elements.supportTableWrap.innerHTML = renderEmptyState('لا توجد محادثات دعم مطابقة للحالة المختارة.');
      renderSupportDetailPanel(null);
      return;
    }

    elements.supportTableWrap.innerHTML = rows.map(function (item) {
      return '<button class="support-inbox-item ' + (state.activeSupportId === item.id ? 'is-active' : '') + '" type="button" data-support-open="' + item.id + '">' +
        '<div class="support-inbox-top">' +
          '<div><div class="entity-title">' + escapeHtml(item.requesterName || '-') + '</div><div class="entity-subtitle">' + escapeHtml(item.requesterPhone || '-') + '</div></div>' +
          createBadge(item.status || '-', supportStatusTone(item.status)) +
        '</div>' +
        '<div class="support-inbox-middle">' +
          '<span class="support-inbox-category">' + escapeHtml(item.category || '-') + '</span>' +
          '<span class="support-inbox-time">' + escapeHtml(formatDate(item.lastMessageAt)) + '</span>' +
        '</div>' +
        '<div class="support-inbox-preview">' + escapeHtml(item.lastMessagePreview || 'لا توجد رسائل بعد.') + '</div>' +
        '<div class="support-inbox-foot">عدد الرسائل: ' + formatNumber(item.messagesCount) + '</div>' +
      '</button>';
    }).join('');

    elements.supportTableWrap.querySelectorAll('[data-support-open]').forEach(function (button) {
      button.addEventListener('click', function () {
        openSupportDetails(Number(button.getAttribute('data-support-open'))).catch(function (error) {
          showMessage(error.message, 'error');
        });
      });
    });
  }

  async function loadSupport(updateTime) {
    const selectedStatus = elements.supportStatusFilter ? elements.supportStatusFilter.value : 'all';
    const data = await adminApi('/api/admin/support?status=' + encodeURIComponent(selectedStatus));
    state.support = data.conversations || [];
    renderSupport();

    if (state.support.length) {
      const targetId = state.support.some(function (item) { return item.id === state.activeSupportId; })
        ? state.activeSupportId
        : state.support[0].id;
      await openSupportDetails(targetId);
    } else {
      state.activeSupportId = null;
      renderSupportDetailPanel(null);
    }

    if (updateTime !== false) setLastUpdated();
  }

  function renderLoadingState(message) {
    return '<div class="empty-state is-loading"><span class="loading-spinner" aria-hidden="true"></span><span>' + escapeHtml(message || 'جاري تحميل البيانات...') + '</span></div>';
  }

  function setRefreshLoading(isLoading) {
    if (!elements.refreshBtn) return;
    elements.refreshBtn.disabled = Boolean(isLoading);
    elements.refreshBtn.classList.toggle('is-loading', Boolean(isLoading));
    elements.refreshBtn.textContent = isLoading ? 'جارٍ التحديث...' : 'تحديث البيانات';
  }

  function renderSectionLoading(section) {
    if (section === 'content' && elements.contentTableWrap) {
      elements.contentTableWrap.innerHTML = renderLoadingState('جاري تحميل المحتوى الثابت...');
    }

    if (section === 'homeAds') {
      if (elements.homeAdsPreviewGrid) {
        elements.homeAdsPreviewGrid.innerHTML = renderLoadingState('جاري تحميل بيانات إعلانات الرئيسية...');
      }
      if (elements.homeAdsSlotStatus) {
        elements.homeAdsSlotStatus.textContent = 'جاري تحميل بيانات الموقع المختار...';
      }
    }

    if (section === 'support') {
      if (elements.supportTableWrap) {
        elements.supportTableWrap.innerHTML = renderLoadingState('جاري تحميل محادثات الدعم...');
      }

      const supportDetailPanel = document.getElementById('supportDetailPanel');
      if (supportDetailPanel) {
        supportDetailPanel.innerHTML = renderLoadingState('جاري تحميل تفاصيل المحادثة...');
      }
    }

    if (section === 'system') {
      if (elements.systemStatusGrid) {
        elements.systemStatusGrid.innerHTML = renderLoadingState('جاري تحميل حالة النظام...');
      }

      if (elements.systemErrorsWrap) {
        elements.systemErrorsWrap.innerHTML = renderLoadingState('جاري تحميل آخر الأخطاء...');
      }
    }
  }

  async function adminApi(path, options) {
    try {
      const isFormData = options && options.body instanceof FormData;
      const response = await fetch(path, {
        ...(options || {}),
        headers: {
          ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
          ...(options && options.headers ? options.headers : {}),
          Authorization: 'Bearer ' + getToken()
        }
      });

      const data = await response.json().catch(function () {
        return {};
      });

      if (response.status === 401) {
        clearSession();
        redirectToLogin();
        throw new Error('انتهت جلسة الإدارة. سجّل الدخول من جديد.');
      }

      if (!response.ok) {
        throw new Error(data.error || 'تعذر تنفيذ الطلب.');
      }

      return data;
    } catch (error) {
      if (error && error.name === 'TypeError') {
        throw new Error('تعذر الاتصال بالخادم. تأكد من تشغيل السيرفر ثم أعد المحاولة.');
      }

      throw error;
    }
  }

  async function loadContentSection(updateTime) {
    renderSectionLoading('content');
    const data = await adminApi('/api/admin/content');
    state.content = data.content || [];
    renderContent();
    if (updateTime !== false) setLastUpdated();
  }

  async function loadHomeAdsSection(updateTime) {
    renderSectionLoading('homeAds');
    const data = await adminApi('/api/admin/home-ads?t=' + Date.now());
    state.homeAds = normalizeHomeAdsPayload(data.homeAds || {});
    renderHomeAdsEditor();
    if (updateTime !== false) setLastUpdated();
  }

  async function loadSupport(updateTime) {
    renderSectionLoading('support');
    const selectedStatus = elements.supportStatusFilter ? elements.supportStatusFilter.value : 'all';
    const data = await adminApi('/api/admin/support?status=' + encodeURIComponent(selectedStatus));
    state.support = data.conversations || [];
    renderSupport();

    if (state.support.length) {
      const targetId = state.support.some(function (item) { return item.id === state.activeSupportId; })
        ? state.activeSupportId
        : state.support[0].id;
      await openSupportDetails(targetId);
    } else {
      state.activeSupportId = null;
      renderSupportDetailPanel(null);
    }

    if (updateTime !== false) setLastUpdated();
  }

  async function loadSystemStatus(updateTime) {
    renderSectionLoading('system');
    const data = await adminApi('/api/admin/system/status');
    state.systemStatus = data.status || null;
    renderSystemStatus();
    if (updateTime !== false) setLastUpdated();
  }

  async function refreshCurrentSection() {
    showMessage('', '');
    setRefreshLoading(true);
    try {
      if (state.currentSection === 'overview') return loadOverview(true);
      if (state.currentSection === 'users') return loadUsers(true);
      if (state.currentSection === 'products') return loadProducts(true);
      if (state.currentSection === 'reports') return loadReports(true);
      if (state.currentSection === 'conversations') return loadConversations(true);
      if (state.currentSection === 'content') return loadContentSection(true);
      if (state.currentSection === 'homeAds') return loadHomeAdsSection(true);
      if (state.currentSection === 'support') return loadSupport(true);
      if (state.currentSection === 'system') return loadSystemStatus(true);
      if (state.currentSection === 'activity') return loadActivity(true);
    } finally {
      setRefreshLoading(false);
    }
  }

  function bindNavigation() {
    document.querySelectorAll('[data-section]').forEach(function (button) {
      button.addEventListener('click', async function () {
        const section = button.getAttribute('data-section');
        setSection(section);
        try {
          await refreshCurrentSection();
        } catch (error) {
          showMessage(error.message, 'error');
        }
      });
    });
  }

  async function bootstrap() {
    if (!getToken()) {
      redirectToLogin();
      return;
    }

    setIdentity(state.admin);
    bindFilters();
    bindNavigation();
    bindUI();
    syncSidebarForViewport();
    setSection('overview');

    try {
      await loadMe();
      await loadOverview(true);
    } catch (error) {
      showMessage(error.message, 'error');
    }
  }

  bootstrap();
})();
