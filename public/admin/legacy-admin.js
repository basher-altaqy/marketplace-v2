
const state = {
  token: localStorage.getItem("token") || "",
  user: JSON.parse(localStorage.getItem("user") || "null"),
  stats: null,
  users: [],
  products: [],
  reports: [],
  conversations: [],
  logs: [],
  activeView: "overviewView"
};

const pageTitle = document.getElementById("pageTitle");
const pageSubtitle = document.getElementById("pageSubtitle");
const statsGrid = document.getElementById("statsGrid");
const latestUsers = document.getElementById("latestUsers");
const latestProducts = document.getElementById("latestProducts");
const usersTableWrap = document.getElementById("usersTableWrap");
const productsTableWrap = document.getElementById("productsTableWrap");
const reportsTableWrap = document.getElementById("reportsTableWrap");
const conversationsTableWrap = document.getElementById("conversationsTableWrap");
const auditTableWrap = document.getElementById("auditTableWrap");
const topCategories = document.getElementById("topCategories");
const systemHealth = document.getElementById("systemHealth");
const adminIdentity = document.getElementById("adminIdentity");
const adminRoleBadge = document.getElementById("adminRoleBadge");
const lastRefreshText = document.getElementById("lastRefreshText");
const usersMeta = document.getElementById("usersMeta");
const productsMeta = document.getElementById("productsMeta");
const conversationsMeta = document.getElementById("conversationsMeta");
const reportsMeta = document.getElementById("reportsMeta");
const auditMeta = document.getElementById("auditMeta");
const detailsModal = document.getElementById("detailsModal");
const detailsModalBody = document.getElementById("detailsModalBody");

function showToast(message) { alert(message); }

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPrice(price, currency) {
  return `${new Intl.NumberFormat("en-US").format(Number(price || 0))} ${currency || ""}`.trim();
}

function api(path, options = {}) {
  const headers = options.headers || {};
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  return fetch(path, { ...options, headers }).then(async (res) => {
    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await res.json()
      : await res.text();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  });
}

async function guardAdmin() {
  if (!state.token) {
    window.location.href = "/";
    return false;
  }

  try {
    const me = await api("/api/me");
    state.user = me.user || null;
    localStorage.setItem("user", JSON.stringify(state.user));

    if (!state.user || state.user.role !== "admin") {
      showToast("هذه الصفحة مخصصة لحساب الأدمن فقط");
      window.location.href = "/";
      return false;
    }

    adminIdentity.textContent = state.user.storeName || state.user.fullName || "Admin";
    adminRoleBadge.textContent = "Admin";
    return true;
  } catch (_error) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
    return false;
  }
}

function switchView(viewId, title) {
  document.querySelectorAll(".view").forEach((el) => el.classList.add("hidden"));
  document.getElementById(viewId)?.classList.remove("hidden");
  document.querySelectorAll(".nav-link").forEach((btn) => btn.classList.remove("active"));
  document.querySelector(`.nav-link[data-view="${viewId}"]`)?.classList.add("active");
  pageTitle.textContent = title;
  pageSubtitle.textContent = `إدارة ${title} مع حماية وصلاحيات أدمن حقيقية`;
  state.activeView = viewId;
}

function statusBadge(text, type) {
  return `<span class="status-badge status-${type}">${escapeHtml(text)}</span>`;
}

function openModal() { detailsModal.classList.add("open"); }
function closeModal() { detailsModal.classList.remove("open"); }
document.getElementById("closeDetailsModal").addEventListener("click", closeModal);
detailsModal.addEventListener("click", (e) => { if (e.target === detailsModal) closeModal(); });

function renderOverview() {
  const s = state.stats || {
    totalUsers: 0,
    totalSellers: 0,
    totalBuyers: 0,
    totalProducts: 0,
    openReports: 0,
    openConversations: 0,
    topCategories: []
  };

  statsGrid.innerHTML = `
    <div class="stat-card"><div class="label">إجمالي المستخدمين</div><div class="value">${s.totalUsers}</div></div>
    <div class="stat-card"><div class="label">البائعون</div><div class="value">${s.totalSellers}</div></div>
    <div class="stat-card"><div class="label">المشترون</div><div class="value">${s.totalBuyers}</div></div>
    <div class="stat-card"><div class="label">المنتجات</div><div class="value">${s.totalProducts}</div></div>
    <div class="stat-card"><div class="label">بلاغات مفتوحة</div><div class="value">${s.openReports}</div></div>
    <div class="stat-card"><div class="label">محادثات مفتوحة</div><div class="value">${s.openConversations}</div></div>
  `;

  topCategories.innerHTML = (s.topCategories || []).length
    ? s.topCategories.map((item) => `
        <div class="list-item">
          <strong>${escapeHtml(item.category)}</strong>
          <div class="muted">${item.count} منتج</div>
        </div>
      `).join("")
    : `<div class="list-item muted">لا توجد بيانات بعد.</div>`;

  systemHealth.innerHTML = `
    <div class="list-item"><strong>التحقق من الجلسة</strong><div class="muted">تم التحقق من الصلاحية عبر /api/me</div></div>
    <div class="list-item"><strong>الحماية</strong><div class="muted">جميع إجراءات الإدارة تمر عبر /api/admin/* مع role=admin</div></div>
    <div class="list-item"><strong>آخر تحديث</strong><div class="muted">${new Date().toLocaleString("ar")}</div></div>
  `;

  latestUsers.innerHTML = state.users.slice(0, 6).map((user) => `
    <div class="list-item">
      <strong>${escapeHtml(user.fullName || "")}</strong>
      <div class="muted">${escapeHtml(user.role || "")} - ${escapeHtml(user.phone || user.email || "")}</div>
    </div>
  `).join("") || `<div class="list-item muted">لا يوجد مستخدمون.</div>`;

  latestProducts.innerHTML = state.products.slice(0, 6).map((product) => `
    <div class="list-item">
      <strong>${escapeHtml(product.name || "")}</strong>
      <div class="muted">${escapeHtml(product.category || "")} - ${formatPrice(product.price, product.currency)}</div>
    </div>
  `).join("") || `<div class="list-item muted">لا توجد منتجات.</div>`;
}

function renderUsersTable(users = state.users) {
  usersMeta.textContent = `عدد النتائج: ${users.length} من أصل ${state.users.length}`;

  usersTableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>الاسم</th>
          <th>الدور</th>
          <th>الهاتف / البريد</th>
          <th>المنطقة</th>
          <th>الحالة</th>
          <th>المتجر / الأداء</th>
          <th>إجراءات</th>
        </tr>
      </thead>
      <tbody>
        ${users.map((user) => `
          <tr>
            <td>
              <div class="inline-meta">
                <strong>${escapeHtml(user.fullName || "")}</strong>
                <div class="muted">${escapeHtml(user.storeName || "")}</div>
              </div>
            </td>
            <td>${escapeHtml(user.role || "")}</td>
            <td>
              <div class="inline-meta">
                <div>${escapeHtml(user.phone || "")}</div>
                <div class="muted">${escapeHtml(user.email || "")}</div>
              </div>
            </td>
            <td>${escapeHtml(user.region || "")}</td>
            <td>${user.isActive ? statusBadge("نشط", "active") : statusBadge("معطل", "inactive")}</td>
            <td>
              <div class="inline-meta">
                <div class="muted">منتجات: ${Number(user.totalProducts || 0)}</div>
                <div class="muted">تقييم: ${Number(user.averageRating || 0).toFixed(1)} (${Number(user.ratingsCount || 0)})</div>
              </div>
            </td>
            <td>
              <div class="actions">
                <button class="btn btn-light" data-user-detail="${user.id}">تفاصيل</button>
                <button class="btn btn-outline" data-toggle-user="${user.id}" data-next="${user.isActive ? "0" : "1"}">
                  ${user.isActive ? "تعطيل" : "تفعيل"}
                </button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  usersTableWrap.querySelectorAll("[data-toggle-user]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api(`/api/admin/users/${Number(btn.dataset.toggleUser)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: btn.dataset.next === "1" })
        });
        await refreshAll();
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  usersTableWrap.querySelectorAll("[data-user-detail]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await showUserDetails(Number(btn.dataset.userDetail));
    });
  });
}

function renderProductsTable(products = state.products) {
  productsMeta.textContent = `عدد النتائج: ${products.length} من أصل ${state.products.length}`;

  productsTableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>الصورة</th>
          <th>المنتج</th>
          <th>التصنيف</th>
          <th>السعر</th>
          <th>المنطقة</th>
          <th>الحالة</th>
          <th>المشاهدات</th>
          <th>إجراءات</th>
        </tr>
      </thead>
      <tbody>
        ${products.map((product) => `
          <tr>
            <td>${product.image ? `<img class="thumb" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" />` : `<div class="thumb"></div>`}</td>
            <td>
              <div class="inline-meta">
                <strong>${escapeHtml(product.name)}</strong>
                <div class="muted">${escapeHtml(product.seller?.storeName || product.seller?.fullName || "")}</div>
              </div>
            </td>
            <td>${escapeHtml(product.category || "")}</td>
            <td>${formatPrice(product.price, product.currency)}</td>
            <td>${escapeHtml(product.region || "")}</td>
            <td>
              ${
                product.status === "draft"
                  ? statusBadge("مسودة", "reviewed")
                  : product.status === "published"
                  ? statusBadge("منشور", "published")
                  : product.status === "hidden"
                  ? statusBadge("مخفي", "hidden")
                  : product.status === "sold"
                  ? statusBadge("مباع", "sold")
                  : product.status === "archived"
                  ? statusBadge("مؤرشف", "closed")
                  : statusBadge("محذوف", "deleted")
              }
            </td>
            <td>${Number(product.viewsCount || 0)}</td>
            <td>
              <div class="actions">
                <button class="btn btn-light" data-product-detail="${product.id}">تفاصيل</button>
                <button class="btn btn-outline" data-product-status="${product.id}" data-next="${product.status === "hidden" ? "published" : "hidden"}">
                  ${product.status === "hidden" ? "إظهار" : "إخفاء"}
                </button>
                <button class="btn btn-light" data-product-status="${product.id}" data-next="sold">مباع</button>
                <button class="btn btn-danger" data-product-status="${product.id}" data-next="deleted">حذف منطقي</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  productsTableWrap.querySelectorAll("[data-product-status]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api(`/api/admin/products/${Number(btn.dataset.productStatus)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: btn.dataset.next })
        });
        await refreshAll();
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  productsTableWrap.querySelectorAll("[data-product-detail]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await showProductDetails(Number(btn.dataset.productDetail));
    });
  });
}

function renderConversationsTable(conversations = state.conversations) {
  conversationsMeta.textContent = `عدد النتائج: ${conversations.length} من أصل ${state.conversations.length}`;

  conversationsTableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>المنتج</th>
          <th>البائع</th>
          <th>المشتري</th>
          <th>آخر رسالة</th>
          <th>عدد الرسائل</th>
          <th>الحالة</th>
          <th>آخر تحديث</th>
        </tr>
      </thead>
      <tbody>
        ${conversations.map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.productName || "")}</strong></td>
            <td>${escapeHtml(item.sellerName || "")}</td>
            <td>${escapeHtml(item.buyerName || "")}</td>
            <td>${escapeHtml(item.lastMessagePreview || "لا توجد رسائل")}</td>
            <td>${Number(item.messagesCount || 0)}</td>
            <td>
              ${
                item.status === "open"
                  ? statusBadge("مفتوحة", "open")
                  : item.status === "closed"
                  ? statusBadge("مغلقة", "closed")
                  : statusBadge("ملغاة", "cancelled")
              }
            </td>
            <td>${item.lastMessageAt ? new Date(item.lastMessageAt).toLocaleString("ar") : "-"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderReportsTable(reports = state.reports) {
  reportsMeta.textContent = `عدد النتائج: ${reports.length} من أصل ${state.reports.length}`;

  reportsTableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>السبب</th>
          <th>المنتج</th>
          <th>المبلّغ</th>
          <th>المبلّغ عنه</th>
          <th>الحالة</th>
          <th>ملاحظات الإدارة</th>
          <th>التاريخ</th>
          <th>إجراءات</th>
        </tr>
      </thead>
      <tbody>
        ${reports.map((report) => `
          <tr>
            <td>${escapeHtml(report.reason || "")}</td>
            <td>${escapeHtml(report.productName || "")}</td>
            <td>${escapeHtml(report.reporterName || "")}</td>
            <td>${escapeHtml(report.reportedUserName || "")}</td>
            <td>
              ${
                report.status === "open"
                  ? statusBadge("مفتوح", "open")
                  : report.status === "reviewed"
                  ? statusBadge("تمت المراجعة", "reviewed")
                  : statusBadge("مغلق", "closed")
              }
            </td>
            <td>${escapeHtml((report.adminNotes || report.admin_notes) || "—")}</td>
            <td>${report.createdAt ? new Date(report.createdAt).toLocaleString("ar") : ""}</td>
            <td>
              <div class="actions">
                <button class="btn btn-light" data-report-detail="${report.id}">معالجة</button>
              </div>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  reportsTableWrap.querySelectorAll("[data-report-detail]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await showReportDetails(Number(btn.dataset.reportDetail));
    });
  });
}

function renderAuditTable(logs = state.logs) {
  auditMeta.textContent = `عدد السجلات المعروضة: ${logs.length}`;

  auditTableWrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>العملية</th>
          <th>نوع الهدف</th>
          <th>المعرّف</th>
          <th>المنفّذ</th>
          <th>التاريخ</th>
          <th>البيانات</th>
        </tr>
      </thead>
      <tbody>
        ${logs.map((log) => `
          <tr>
            <td>${escapeHtml(log.actionType || "")}</td>
            <td>${escapeHtml(log.targetType || "")}</td>
            <td>${escapeHtml(log.targetId || "")}</td>
            <td>${escapeHtml(log.actorName || "النظام")} ${log.actorRole ? `<span class="muted">(${escapeHtml(log.actorRole)})</span>` : ""}</td>
            <td>${log.createdAt ? new Date(log.createdAt).toLocaleString("ar") : ""}</td>
            <td><code>${escapeHtml(JSON.stringify(log.metadata || {}))}</code></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

async function loadStats() {
  const data = await api("/api/admin/stats");
  state.stats = data.stats || null;
}
async function loadUsers() {
  const data = await api("/api/admin/users");
  state.users = data.users || [];
}
async function loadProducts() {
  const data = await api("/api/admin/products");
  state.products = data.products || [];
}
async function loadReports() {
  const data = await api("/api/admin/reports");
  state.reports = data.reports || [];
}
async function loadConversations() {
  const data = await api("/api/admin/conversations");
  state.conversations = data.conversations || [];
}
async function loadLogs() {
  const data = await api("/api/admin/audit-logs?limit=120");
  state.logs = data.logs || [];
}

async function refreshAll() {
  await Promise.all([loadStats(), loadUsers(), loadProducts(), loadReports(), loadConversations(), loadLogs()]);
  renderOverview();
  renderUsersTable();
  renderProductsTable();
  renderConversationsTable();
  renderReportsTable();
  renderAuditTable();
  lastRefreshText.textContent = `آخر تحديث: ${new Date().toLocaleString("ar")}`;
}

function applyUserFilters() {
  const q = document.getElementById("usersSearch").value.trim().toLowerCase();
  const role = document.getElementById("usersRoleFilter").value;
  const status = document.getElementById("usersStatusFilter").value;

  const filtered = state.users.filter((user) => {
    const hay = `${user.fullName || ""} ${user.phone || ""} ${user.email || ""}`.toLowerCase();
    const roleOk = role === "all" || user.role === role;
    const statusOk = status === "all" || (status === "active" ? user.isActive : !user.isActive);
    return hay.includes(q) && roleOk && statusOk;
  });

  renderUsersTable(filtered);
}

function applyProductFilters() {
  const q = document.getElementById("productsSearch").value.trim().toLowerCase();
  const status = document.getElementById("productsStatusFilter").value;

  const filtered = state.products.filter((product) => {
    const hay = `${product.name || ""} ${product.category || ""} ${product.seller?.storeName || ""}`.toLowerCase();
    const statusOk = status === "all" || product.status === status;
    return hay.includes(q) && statusOk;
  });

  renderProductsTable(filtered);
}

function applyConversationFilters() {
  const q = document.getElementById("conversationSearch").value.trim().toLowerCase();
  const status = document.getElementById("conversationStatusFilter").value;

  const filtered = state.conversations.filter((item) => {
    const hay = `${item.productName || ""} ${item.sellerName || ""} ${item.buyerName || ""}`.toLowerCase();
    const statusOk = status === "all" || item.status === status;
    return hay.includes(q) && statusOk;
  });

  renderConversationsTable(filtered);
}

function applyReportFilters() {
  const status = document.getElementById("reportsStatusFilter").value;
  const filtered = state.reports.filter((item) => status === "all" || item.status === status);
  renderReportsTable(filtered);
}

async function showUserDetails(userId) {
  try {
    const data = await api(`/api/admin/users/${userId}`);
    const user = data.user;
    const recentProducts = data.recentProducts || [];
    const recentConversations = data.recentConversations || [];
    const ratings = data.ratings || [];

    detailsModalBody.innerHTML = `
      <div class="details-grid">
        <div class="details-block">
          <h3>بيانات المستخدم</h3>
          <div class="list-stack">
            <div class="list-item"><strong>${escapeHtml(user.fullName || "")}</strong></div>
            <div class="list-item">الدور: ${escapeHtml(user.role || "")}</div>
            <div class="list-item">الهاتف: ${escapeHtml(user.phone || "")}</div>
            <div class="list-item">البريد: ${escapeHtml(user.email || "")}</div>
            <div class="list-item">المنطقة: ${escapeHtml(user.region || "")}</div>
            <div class="list-item">الحالة: ${user.isActive ? "نشط" : "معطل"}</div>
            <div class="list-item">عدد المنتجات: ${Number(user.totalProducts || 0)}</div>
            <div class="list-item">التقييم: ${Number(user.averageRating || 0).toFixed(1)} (${Number(user.ratingsCount || 0)})</div>
          </div>
        </div>

        <div class="details-block">
          <h3>أحدث المنتجات</h3>
          <div class="list-stack">
            ${recentProducts.length ? recentProducts.map((product) => `
              <div class="list-item">
                <strong>${escapeHtml(product.name || "")}</strong>
                <div class="muted">${escapeHtml(product.category || "")} - ${formatPrice(product.price, product.currency)}</div>
              </div>
            `).join("") : `<div class="list-item muted">لا توجد منتجات.</div>`}
          </div>
        </div>

        <div class="details-block">
          <h3>أحدث المحادثات</h3>
          <div class="list-stack">
            ${recentConversations.length ? recentConversations.map((item) => `
              <div class="list-item">
                <strong>${escapeHtml(item.productName || "")}</strong>
                <div class="muted">${escapeHtml(item.status || "")}</div>
              </div>
            `).join("") : `<div class="list-item muted">لا توجد محادثات.</div>`}
          </div>
        </div>

        <div class="details-block">
          <h3>أحدث التقييمات</h3>
          <div class="list-stack">
            ${ratings.length ? ratings.map((item) => `
              <div class="list-item">
                <strong>${Number(item.score || 0)} / 5</strong>
                <div class="muted">${escapeHtml(item.comment || "")}</div>
                <div class="muted">${escapeHtml(item.buyerName || "")}</div>
              </div>
            `).join("") : `<div class="list-item muted">لا توجد تقييمات.</div>`}
          </div>
        </div>
      </div>
    `;
    openModal();
  } catch (error) {
    showToast(error.message);
  }
}

async function showProductDetails(productId) {
  try {
    const data = await api(`/api/admin/products/${productId}`);
    const product = data.product;
    const conversations = data.conversations || [];

    detailsModalBody.innerHTML = `
      <div class="details-grid">
        <div class="details-block">
          <h3>تفاصيل المنتج</h3>
          <div class="list-stack">
            <div class="list-item"><strong>${escapeHtml(product.name || "")}</strong></div>
            <div class="list-item">التصنيف: ${escapeHtml(product.category || "")}</div>
            <div class="list-item">السعر: ${formatPrice(product.price, product.currency)}</div>
            <div class="list-item">المنطقة: ${escapeHtml(product.region || "")}</div>
            <div class="list-item">الحالة: ${escapeHtml(product.status || "")}</div>
            <div class="list-item">المشاهدات: ${Number(product.viewsCount || 0)}</div>
            <div class="list-item">التاجر: ${escapeHtml(product.seller?.storeName || product.seller?.fullName || "")}</div>
          </div>
        </div>

        <div class="details-block">
          <h3>الصور</h3>
          <div class="list-stack">
            ${(product.images || []).length ? product.images.map((src) => `
              <img class="thumb" style="width:100%;height:180px;" src="${escapeHtml(src)}" alt="${escapeHtml(product.name || "")}" />
            `).join("") : `<div class="list-item muted">لا توجد صور.</div>`}
          </div>
        </div>

        <div class="details-block" style="grid-column:1 / -1;">
          <h3>الوصف</h3>
          <div class="list-item">${escapeHtml(product.description || "")}</div>
        </div>

        <div class="details-block" style="grid-column:1 / -1;">
          <h3>محادثات مرتبطة بالمنتج</h3>
          <div class="list-stack">
            ${conversations.length ? conversations.map((item) => `
              <div class="list-item">
                <strong>${escapeHtml(item.buyerName || "")}</strong>
                <div class="muted">${escapeHtml(item.status || "")}</div>
              </div>
            `).join("") : `<div class="list-item muted">لا توجد محادثات مرتبطة.</div>`}
          </div>
        </div>
      </div>
    `;
    openModal();
  } catch (error) {
    showToast(error.message);
  }
}

async function showReportDetails(reportId) {
  const report = state.reports.find((item) => Number(item.id) === Number(reportId));
  if (!report) return;

  detailsModalBody.innerHTML = `
    <div class="details-grid">
      <div class="details-block">
        <h3>تفاصيل البلاغ</h3>
        <div class="list-stack">
          <div class="list-item"><strong>السبب</strong><div class="muted">${escapeHtml(report.reason || "")}</div></div>
          <div class="list-item"><strong>المنتج</strong><div class="muted">${escapeHtml(report.productName || "")}</div></div>
          <div class="list-item"><strong>المبلّغ</strong><div class="muted">${escapeHtml(report.reporterName || "")}</div></div>
          <div class="list-item"><strong>المبلّغ عنه</strong><div class="muted">${escapeHtml(report.reportedUserName || "")}</div></div>
          <div class="list-item"><strong>الحالة الحالية</strong><div class="muted">${escapeHtml(report.status || "")}</div></div>
        </div>
      </div>

      <div class="details-block">
        <h3>معالجة البلاغ</h3>
        <div class="list-stack">
          <select id="reportStatusSelect" class="field">
            <option value="open" ${report.status === "open" ? "selected" : ""}>مفتوح</option>
            <option value="reviewed" ${report.status === "reviewed" ? "selected" : ""}>تمت المراجعة</option>
            <option value="closed" ${report.status === "closed" ? "selected" : ""}>مغلق</option>
          </select>
          <textarea id="reportAdminNote" class="note-box" placeholder="اكتب ملاحظات الإدارة هنا">${escapeHtml((report.adminNotes || report.admin_notes) || "")}</textarea>
          <button id="saveReportReviewBtn" class="btn btn-secondary" type="button">حفظ التحديث</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("saveReportReviewBtn").addEventListener("click", async () => {
    try {
      await api(`/api/admin/reports/${reportId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: document.getElementById("reportStatusSelect").value,
          adminNote: document.getElementById("reportAdminNote").value.trim()
        })
      });
      closeModal();
      await refreshAll();
      showToast("تم تحديث البلاغ");
    } catch (error) {
      showToast(error.message);
    }
  });

  openModal();
}

function bindEvents() {
  document.querySelectorAll(".nav-link").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view, btn.dataset.title));
  });

  document.getElementById("refreshAllBtn").addEventListener("click", refreshAll);
  document.getElementById("refreshLogsBtn").addEventListener("click", async () => {
    await loadLogs();
    renderAuditTable();
  });

  document.getElementById("filterUsersBtn").addEventListener("click", applyUserFilters);
  document.getElementById("filterProductsBtn").addEventListener("click", applyProductFilters);
  document.getElementById("filterConversationsBtn").addEventListener("click", applyConversationFilters);
  document.getElementById("filterReportsBtn").addEventListener("click", applyReportFilters);

  document.getElementById("usersSearch").addEventListener("input", applyUserFilters);
  document.getElementById("productsSearch").addEventListener("input", applyProductFilters);
  document.getElementById("conversationSearch").addEventListener("input", applyConversationFilters);
  document.getElementById("usersRoleFilter").addEventListener("change", applyUserFilters);
  document.getElementById("usersStatusFilter").addEventListener("change", applyUserFilters);
  document.getElementById("productsStatusFilter").addEventListener("change", applyProductFilters);
  document.getElementById("conversationStatusFilter").addEventListener("change", applyConversationFilters);
  document.getElementById("reportsStatusFilter").addEventListener("change", applyReportFilters);

  document.getElementById("logoutBtn").addEventListener("click", () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
  });
}

async function bootstrap() {
  const ok = await guardAdmin();
  if (!ok) return;
  bindEvents();
  await refreshAll();
}

bootstrap().catch((error) => {
  console.error(error);
  showToast("تعذر تحميل لوحة الإدارة");
});
