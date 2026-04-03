
const state = {
  token: localStorage.getItem("token") || "",
  user: JSON.parse(localStorage.getItem("user") || "null"),
  products: [],
  filteredProducts: [],
  categories: [],
  regions: [],
  selectedCategory: "all",
  selectedRegion: "all",
  search: "",
  sort: "newest",
  currentCatalogTitle: "كل المنتجات",
  currentCatalogProducts: [],
  currentSellerId: null,
  currentSellerProducts: [],
  conversations: [],
  selectedConversationId: null,
  activeConversation: null,
  activeConversationDeals: [],
  favorites: [],
  favoriteProductIds: [],
  cart: null,
  currentProduct: null,
  orders: [],
  activeOrder: null,
  notifications: [],
  siteAppearance: {
    backgroundImage: "",
    heroImage: ""
  },
  supportConversation: null,
  siteContentCache: {},
  reportDraft: null,
  dashboardSummary: null,
  metaLoaded: false,
  mobileConversationsOpen: false
};

const V1_FLAGS = {
  admin: false,
  notifications: false,
  support: false,
  reports: false,
  conversationDeals: false,
  ratingsSubmission: false,
  legacyPurchaseModal: false
};

const V1_ALLOWED_ORDER_TRANSITIONS = new Set(["seller_confirmed", "cancelled"]);

state.submissionState = state.submissionState || {};

function isV1FeatureEnabled(feature) {
  return Boolean(V1_FLAGS[feature]);
}

function getSafeViewName(viewName) {
  if (viewName === "notifications" && !isV1FeatureEnabled("notifications")) return "home";
  if (viewName === "admin" && !isV1FeatureEnabled("admin")) return "home";
  return viewName;
}

function beginSubmission(key) {
  if (!key) return true;
  if (state.submissionState[key]) return false;
  state.submissionState[key] = true;
  return true;
}

function endSubmission(key) {
  if (!key) return;
  delete state.submissionState[key];
}

function getFormSubmitButton(event, form) {
  const submitter = event?.submitter;
  if (submitter instanceof HTMLElement) return submitter;
  if (!(form instanceof HTMLElement)) return null;
  return form.querySelector('button[type="submit"], input[type="submit"]');
}

function setSubmittingUi(target, {
  loadingText = "",
  disabled = true,
  loadingClass = "is-submitting"
} = {}) {
  if (!target) return () => {};

  const isButtonLike = target instanceof HTMLButtonElement || (target instanceof HTMLInputElement && /submit|button/i.test(target.type || ""));
  const original = {
    disabled: Boolean(target.disabled),
    text: isButtonLike
      ? (target.tagName === "INPUT" ? target.value : target.textContent)
      : "",
    ariaBusy: target.getAttribute("aria-busy")
  };

  if (disabled) target.disabled = true;
  target.classList?.add(loadingClass);
  target.setAttribute("aria-busy", "true");

  if (loadingText && isButtonLike) {
    if (target.tagName === "INPUT") target.value = loadingText;
    else target.textContent = loadingText;
  }

  return () => {
    target.disabled = original.disabled;
    target.classList?.remove(loadingClass);
    if (original.ariaBusy == null) target.removeAttribute("aria-busy");
    else target.setAttribute("aria-busy", original.ariaBusy);
    if (isButtonLike) {
      if (target.tagName === "INPUT") target.value = original.text;
      else target.textContent = original.text;
    }
  };
}

function setCartItemSubmittingUi(itemId, isSubmitting) {
  if (!cartItemsList || !itemId) return () => {};
  const controls = [
    cartItemsList.querySelector(`[data-cart-qty="${itemId}"]`),
    ...cartItemsList.querySelectorAll(`[data-cart-item="${itemId}"]`)
  ].filter(Boolean);

  const previousStates = controls.map((control) => ({
    control,
    disabled: Boolean(control.disabled)
  }));

  previousStates.forEach(({ control }) => {
    control.disabled = isSubmitting;
    control.classList?.toggle("is-submitting", isSubmitting);
    if (isSubmitting) control.setAttribute("aria-busy", "true");
    else control.removeAttribute("aria-busy");
  });

  return () => {
    previousStates.forEach(({ control, disabled: wasDisabled }) => {
      control.disabled = wasDisabled;
      control.classList?.remove("is-submitting");
      control.removeAttribute("aria-busy");
    });
  };
}

function renderDashboardStats(summary = {}) {
  if (!statsGrid) return;
  statsGrid.innerHTML = `
    <div class="stat-card"><div class="label">المنتجات</div><div class="value">${Number(summary.totalProducts || 0)}</div></div>
    <div class="stat-card"><div class="label">المسودات</div><div class="value">${Number(summary.draftProducts || 0)}</div></div>
    <div class="stat-card"><div class="label">المنشورة</div><div class="value">${Number(summary.publishedProducts || 0)}</div></div>
    <div class="stat-card"><div class="label">المخفية</div><div class="value">${Number(summary.hiddenProducts || 0)}</div></div>
    <div class="stat-card"><div class="label">المباعة</div><div class="value">${Number(summary.soldProducts || 0)}</div></div>
    <div class="stat-card"><div class="label">المؤرشفة</div><div class="value">${Number(summary.archivedProducts || 0)}</div></div>
    <div class="stat-card"><div class="label">المشاهدات</div><div class="value">${Number(summary.totalViews || 0)}</div></div>
    <div class="stat-card"><div class="label">التقييم</div><div class="value">${Number(summary.averageRating || 0).toFixed(1)}</div></div>
  `;
}

function bindManagedProductCard(scope) {
  scope?.querySelectorAll("[data-my-product-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      updateMyProductStatus(Number(btn.dataset.myProductStatus), btn.dataset.next);
    });
  });
  if (scope) bindProductActions(scope);
}

function prependManagedProduct(product) {
  if (!myProductsGrid || !product) return false;

  const firstChild = myProductsGrid.firstElementChild;
  if (!firstChild || firstChild.classList.contains("muted")) {
    myProductsGrid.innerHTML = "";
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = managedProductCardHtml(product).trim();
  const card = wrapper.firstElementChild;
  if (!card) return false;

  myProductsGrid.prepend(card);
  bindManagedProductCard(card);
  return true;
}

function updateDashboardSummaryAfterCreate(product) {
  if (!state.dashboardSummary || !product) return false;

  const nextSummary = {
    ...state.dashboardSummary,
    totalProducts: Number(state.dashboardSummary.totalProducts || 0) + 1
  };

  if (product.status === "published") {
    nextSummary.publishedProducts = Number(nextSummary.publishedProducts || 0) + 1;
  } else if (product.status === "draft") {
    nextSummary.draftProducts = Number(nextSummary.draftProducts || 0) + 1;
  }

  state.dashboardSummary = nextSummary;
  renderDashboardStats(nextSummary);
  return true;
}

function appendMessageToThread(message) {
  const thread = document.getElementById("activeChatThread");
  if (!thread || !message) return false;

  const markup = renderConversationMessages([message]).trim();
  if (!markup) return false;

  if (thread.querySelector(".muted")) {
    thread.innerHTML = "";
  }

  const template = document.createElement("template");
  template.innerHTML = markup;
  const nodes = Array.from(template.content.childNodes).filter((node) => {
    return node.nodeType !== Node.TEXT_NODE || node.textContent.trim();
  });

  if (!nodes.length) return false;
  nodes.forEach((node) => thread.appendChild(node));
  thread.scrollTop = thread.scrollHeight;
  return true;
}

function updateConversationPreview(conversationId, messageText, createdAt) {
  if (!conversationId) return false;
  const index = (state.conversations || []).findIndex((conversation) => conversation.id === Number(conversationId));
  if (index === -1) return false;

  const conversation = state.conversations[index];
  const updatedConversation = {
    ...conversation,
    lastMessage: messageText,
    lastMessageAt: createdAt
  };

  state.conversations.splice(index, 1);
  state.conversations.unshift(updatedConversation);
  renderConversationsList(state.conversations, Number(conversationId));
  return true;
}

const homeView = document.getElementById("homeView");
const catalogView = document.getElementById("catalogView");
const productView = document.getElementById("productView");
const authView = document.getElementById("authView");
const profileView = document.getElementById("profileView");
const favoritesView = document.getElementById("favoritesView");
const cartView = document.getElementById("cartView");
const checkoutView = document.getElementById("checkoutView");
const ordersView = document.getElementById("ordersView");
const dashboardView = document.getElementById("dashboardView");
const sellerView = document.getElementById("sellerView");
const messagesView = document.getElementById("messagesView");
const notificationsView = document.getElementById("notificationsView");
const adminView = document.getElementById("adminView");

const homeCategorySections = document.getElementById("homeCategorySections");
const catalogGrid = document.getElementById("catalogGrid");
const catalogTitle = document.getElementById("catalogTitle");
const catalogCount = document.getElementById("catalogCount");
const productViewTitle = document.getElementById("productViewTitle");
const productViewContent = document.getElementById("productViewContent");
const relatedProductsGrid = document.getElementById("relatedProductsGrid");
const resultsCount = document.getElementById("resultsCount");
const categoryChips = document.getElementById("categoryChips");

const filterKeyword = document.getElementById("filterKeyword");
const filterCategory = document.getElementById("filterCategory");
const filterRegion = document.getElementById("filterRegion");
const sortBy = document.getElementById("sortBy");

const globalSearchForm = document.getElementById("globalSearchForm");
const globalSearchInput = document.getElementById("globalSearchInput");
const siteBrandTitle = document.getElementById("siteBrandTitle");
const siteBrandTagline = document.getElementById("siteBrandTagline");
const heroKicker = document.getElementById("heroKicker");
const heroTitle = document.getElementById("heroTitle");
const heroDescription = document.getElementById("heroDescription");
const heroPosterMedia = document.getElementById("heroPosterMedia");

const navLoginBtn = document.getElementById("navLoginBtn");
const navAddProductBtn = document.getElementById("navAddProductBtn");
const navProfileBtn = document.getElementById("navProfileBtn");
const navMessagesBtn = document.getElementById("navMessagesBtn");
const navNotificationsBtn = document.getElementById("navNotificationsBtn");
const navFavoritesBtn = document.getElementById("navFavoritesBtn");
const navMessagesBadge = document.getElementById("navMessagesBadge");
const navNotificationsBadge = document.getElementById("navNotificationsBadge");
const navFavoritesBadge = document.getElementById("navFavoritesBadge");
const navCartBtn = document.getElementById("navCartBtn");
const navCartBadge = document.getElementById("navCartBadge");
const navOrdersBtn = document.getElementById("navOrdersBtn");
const navOrdersBadge = document.getElementById("navOrdersBadge");
const navAdminBtn = document.getElementById("navAdminBtn");
const navDashboardBtn = document.getElementById("navDashboardBtn");
const navLogoutBtn = document.getElementById("navLogoutBtn");

const catalogBackBtn = document.getElementById("catalogBackBtn");
const productBackBtn = document.getElementById("productBackBtn");
const checkoutBackBtn = document.getElementById("checkoutBackBtn");

const productModal = document.getElementById("productModal");
const productModalContent = document.getElementById("productModalContent");
const closeProductModal = document.getElementById("closeProductModal");

const productFormModal = document.getElementById("productFormModal");
const closeProductFormModal = document.getElementById("closeProductFormModal");
const reportModal = document.getElementById("reportModal");
const closeReportModal = document.getElementById("closeReportModal");
const deliveryInfoModal = document.getElementById("deliveryInfoModal");
const closeDeliveryInfoModal = document.getElementById("closeDeliveryInfoModal");
const confirmModal = document.getElementById("confirmModal");
const closeConfirmModal = document.getElementById("closeConfirmModal");
const contentModal = document.getElementById("contentModal");
const closeContentModal = document.getElementById("closeContentModal");

const loginForm = document.getElementById("loginForm");
const registerForm = document.getElementById("registerForm");
const profileForm = document.getElementById("profileForm");
const avatarForm = document.getElementById("avatarForm");
const addProductForm = document.getElementById("addProductForm");
const reportForm = document.getElementById("reportForm");

let homeCategoryMarqueeControllers = [];
let rtlScrollTypeCache = null;

const dashboardUserInfo = document.getElementById("dashboardUserInfo");
const statsGrid = document.getElementById("statsGrid");
const myProductsGrid = document.getElementById("myProductsGrid");
const favoritesGrid = document.getElementById("favoritesGrid");
const cartItemsList = document.getElementById("cartItemsList");
const cartSummaryPanel = document.getElementById("cartSummaryPanel");
const checkoutItemsList = document.getElementById("checkoutItemsList");
const checkoutSummaryPanel = document.getElementById("checkoutSummaryPanel");
const checkoutProfileInfo = document.getElementById("checkoutProfileInfo");
const checkoutNotes = document.getElementById("checkoutNotes");
const confirmCheckoutBtn = document.getElementById("confirmCheckoutBtn");
const ordersList = document.getElementById("ordersList");
const orderDetailsPanel = document.getElementById("orderDetailsPanel");

const sellerSummary = document.getElementById("sellerSummary");
const sellerProductsGrid = document.getElementById("sellerProductsGrid");
const sellerRatingsList = document.getElementById("sellerRatingsList");

const conversationsList = document.getElementById("conversationsList");
const conversationDetails = document.getElementById("conversationDetails");
const mobileConversationPicker = document.getElementById("mobileConversationPicker");
const mobileConversationToggle = document.getElementById("mobileConversationToggle");
const mobileConversationCurrent = document.getElementById("mobileConversationCurrent");
const mobileConversationsMenu = document.getElementById("mobileConversationsMenu");
const notificationsList = document.getElementById("notificationsList");

const adminUsersList = document.getElementById("adminUsersList");
const adminProductsList = document.getElementById("adminProductsList");
const toastContainer = document.getElementById("toastContainer");
const deliveryInfoTitle = document.getElementById("deliveryInfoTitle");
const deliveryInfoMessage = document.getElementById("deliveryInfoMessage");
const confirmModalTitle = document.getElementById("confirmModalTitle");
const confirmModalMessage = document.getElementById("confirmModalMessage");
const confirmModalCancelBtn = document.getElementById("confirmModalCancelBtn");
const confirmModalApproveBtn = document.getElementById("confirmModalApproveBtn");
const contentModalTitle = document.getElementById("contentModalTitle");
const contentModalBody = document.getElementById("contentModalBody");
const supportFloatingBtn = document.getElementById("supportFloatingBtn");
const supportWidget = document.getElementById("supportWidget");
const closeSupportWidgetBtn = document.getElementById("closeSupportWidgetBtn");
const supportMessagesList = document.getElementById("supportMessagesList");
const supportMessageInput = document.getElementById("supportMessageInput");
const sendSupportMessageBtn = document.getElementById("sendSupportMessageBtn");

let activeConfirmResolver = null;

function showToast(message, type = "info", title = "") {
  if (!toastContainer || !message) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    ${title ? `<div class="toast-title">${escapeHtml(title)}</div>` : ""}
    <div class="toast-message">${escapeHtml(message)}</div>
  `;

  toastContainer.appendChild(toast);

  window.setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
    window.setTimeout(() => toast.remove(), 180);
  }, 3200);
}

function resolveConfirm(result) {
  if (activeConfirmResolver) {
    activeConfirmResolver(result);
    activeConfirmResolver = null;
  }
  closeModal(confirmModal);
}

function askConfirm({ title = "تأكيد الإجراء", message = "هل تريد المتابعة؟", approveLabel = "تأكيد" } = {}) {
  if (!confirmModal) return Promise.resolve(false);

  confirmModalTitle.textContent = title;
  confirmModalMessage.textContent = message;
  confirmModalApproveBtn.textContent = approveLabel;
  openModal(confirmModal);

  return new Promise((resolve) => {
    activeConfirmResolver = resolve;
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatPrice(price, currency) {
  const number = Number(price || 0);
  return `${new Intl.NumberFormat("en-US").format(number)} ${currency || ""}`.trim();
}


function formatDetailRows(items = []) {
  return items.filter((item) => item && item.value !== undefined && item.value !== null && item.value !== "").map((item) => `
    <div class="detail-row">
      <span class="detail-label">${escapeHtml(item.label)}:</span>
      <span class="detail-value">${escapeHtml(item.value)}</span>
    </div>
  `).join("");
}

function getConversationCounterparty(item) {
  if (!state.user) return item.seller?.storeName || item.buyer?.fullName || "";
  if (state.user.role === "seller" || state.user.id === item.sellerId) {
    return item.buyer?.fullName || "مشتري";
  }
  return item.seller?.storeName || item.seller?.fullName || "متجر";
}

function openModal(modal) {
  modal?.classList.add("open");
}

function closeModal(modal) {
  modal?.classList.remove("open");
}

function scrollViewportToTop() {
  try {
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (_error) {
    window.scrollTo(0, 0);
  }
}

function getRtlScrollType() {
  if (rtlScrollTypeCache) return rtlScrollTypeCache;

  const testHost = document.createElement("div");
  const testChild = document.createElement("div");
  testHost.dir = "rtl";
  testHost.style.width = "4px";
  testHost.style.height = "1px";
  testHost.style.position = "absolute";
  testHost.style.top = "-9999px";
  testHost.style.overflow = "scroll";
  testChild.style.width = "8px";
  testChild.style.height = "1px";
  testHost.appendChild(testChild);
  document.body.appendChild(testHost);

  if (testHost.scrollLeft > 0) {
    rtlScrollTypeCache = "default";
  } else {
    testHost.scrollLeft = 1;
    rtlScrollTypeCache = testHost.scrollLeft === 0 ? "negative" : "reverse";
  }

  document.body.removeChild(testHost);
  return rtlScrollTypeCache;
}

function getStripTravelLimit(strip) {
  return Math.max(0, strip.scrollWidth - strip.clientWidth);
}

function getStripVisualOffset(strip) {
  const max = getStripTravelLimit(strip);
  if (max <= 0) return 0;

  if (getComputedStyle(strip).direction !== "rtl") {
    return Math.max(0, Math.min(max, strip.scrollLeft));
  }

  const rtlType = getRtlScrollType();
  if (rtlType === "negative") return Math.max(0, Math.min(max, -strip.scrollLeft));
  if (rtlType === "reverse") return Math.max(0, Math.min(max, strip.scrollLeft));
  return Math.max(0, Math.min(max, max - strip.scrollLeft));
}

function setStripVisualOffset(strip, offset, behavior = "auto") {
  const max = getStripTravelLimit(strip);
  const safeOffset = Math.max(0, Math.min(max, Number(offset) || 0));
  let nextLeft = safeOffset;

  if (getComputedStyle(strip).direction === "rtl") {
    const rtlType = getRtlScrollType();
    if (rtlType === "negative") nextLeft = -safeOffset;
    else if (rtlType === "reverse") nextLeft = safeOffset;
    else nextLeft = max - safeOffset;
  }

  if (typeof strip.scrollTo === "function") {
    strip.scrollTo({ left: nextLeft, behavior });
    return;
  }

  strip.scrollLeft = nextLeft;
}

function destroyHomeCategoryMarquees() {
  homeCategoryMarqueeControllers.forEach((controller) => controller.destroy());
  homeCategoryMarqueeControllers = [];
}

function updateHomeCategoryMarqueeActivity() {
  const shouldRun = !document.hidden && homeView && !homeView.classList.contains("hidden");
  homeCategoryMarqueeControllers.forEach((controller) => {
    if (shouldRun) controller.start();
    else controller.stop();
  });
}

function createHomeCategoryMarquee(strip) {
  const intervalMs = 2400;
  let intervalId = null;
  let isPaused = false;

  const stepSize = () => Math.max(160, Math.min(220, Math.round(strip.clientWidth * 0.72)));

  const tick = () => {
    if (isPaused || document.hidden || homeView?.classList.contains("hidden")) return;
    const max = getStripTravelLimit(strip);
    if (max <= 24) return;

    const current = getStripVisualOffset(strip);
    const next = current + stepSize();
    if (next >= max - 12) {
      setStripVisualOffset(strip, 0, "auto");
      return;
    }

    setStripVisualOffset(strip, next, "smooth");
  };

  const pause = () => {
    isPaused = true;
  };

  const resume = () => {
    isPaused = false;
  };

  const start = () => {
    if (intervalId || getStripTravelLimit(strip) <= 24) return;
    intervalId = window.setInterval(tick, intervalMs);
  };

  const stop = () => {
    if (!intervalId) return;
    window.clearInterval(intervalId);
    intervalId = null;
  };

  const onMouseEnter = () => pause();
  const onMouseLeave = () => resume();
  const onFocusIn = () => pause();
  const onFocusOut = () => {
    if (!strip.contains(document.activeElement)) resume();
  };

  strip.addEventListener("mouseenter", onMouseEnter);
  strip.addEventListener("mouseleave", onMouseLeave);
  strip.addEventListener("focusin", onFocusIn);
  strip.addEventListener("focusout", onFocusOut);

  window.requestAnimationFrame(() => {
    setStripVisualOffset(strip, 0, "auto");
    updateHomeCategoryMarqueeActivity();
  });

  return {
    start,
    stop,
    destroy() {
      stop();
      strip.removeEventListener("mouseenter", onMouseEnter);
      strip.removeEventListener("mouseleave", onMouseLeave);
      strip.removeEventListener("focusin", onFocusIn);
      strip.removeEventListener("focusout", onFocusOut);
    }
  };
}

function setupHomeCategoryMarquees() {
  destroyHomeCategoryMarquees();
}

function syncTopbarScrollState() {
  const topbar = document.querySelector(".topbar");
  if (!topbar) return;
  topbar.classList.toggle("topbar-scrolled", window.scrollY > 10);
}

function openDeliveryInfoModal(isAvailable) {
  if (!deliveryInfoModal || !deliveryInfoTitle || !deliveryInfoMessage) return;
  deliveryInfoTitle.textContent = "حالة التوصيل";
  deliveryInfoMessage.textContent = isAvailable
    ? "هذا المنتج يدعم خدمة التوصيل أو النقل من البائع. يمكنك متابعة التفاصيل مع المتجر داخل المحادثة أو عند إتمام الطلب."
    : "هذا المنتج لا يدعم خدمة التوصيل حاليًا، وقد تحتاج إلى الاستلام المباشر أو التنسيق يدويًا مع المتجر.";
  openModal(deliveryInfoModal);
}

function api(path, options = {}) {
  const headers = options.headers || {};

  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = headers["Content-Type"] || "application/json";
  }

  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  return fetch(path, { ...options, headers }).then(async (res) => {
    const contentType = res.headers.get("content-type") || "";
    const data = contentType.includes("application/json")
      ? await res.json()
      : await res.text();

    if (!res.ok) {
      const fallbackMessageByStatus = {
        400: "تعذر تنفيذ الطلب. تحقق من البيانات وأعد المحاولة.",
        401: "يجب تسجيل الدخول أولاً للمتابعة.",
        403: "ليست لديك صلاحية لتنفيذ هذا الإجراء.",
        404: "الخدمة المطلوبة غير متاحة حالياً.",
        500: "حدث خطأ داخلي في الخادم. حاول مرة أخرى بعد قليل."
      };
      const plainText = typeof data === "string"
        ? data.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
        : "";
      const message =
        (data && typeof data === "object" && data.error) ||
        (plainText && plainText !== "[object Object]" ? plainText : "") ||
        fallbackMessageByStatus[res.status] ||
        `Request failed (${res.status})`;
      throw new Error(message);
    }

    return data;
  });
}

function setAuth(authData) {
  const previousUserId = state.user?.id || null;
  const previousRole = state.user?.role || null;
  state.token = authData?.token || "";
  state.user = authData?.user || null;
  const nextUserId = state.user?.id || null;
  const nextRole = state.user?.role || null;

  if (previousUserId !== nextUserId || previousRole !== nextRole) {
    state.conversations = [];
    state.selectedConversationId = null;
    state.activeConversation = null;
    state.activeConversationDeals = [];
    clearBuyerExperienceState();
    state.orders = [];
    state.activeOrder = null;
    state.notifications = [];
    state.supportConversation = null;
    state.reportDraft = null;
  }

  if (state.token) localStorage.setItem("token", state.token);
  else localStorage.removeItem("token");

  if (state.user) localStorage.setItem("user", JSON.stringify(state.user));
  else localStorage.removeItem("user");

  syncRoleSpecificFields();
  refreshNav();
}

async function restoreSession() {
  if (!state.token) return;
  try {
    const data = await api("/api/me");
    state.user = data.user || null;
    if (state.user) localStorage.setItem("user", JSON.stringify(state.user));
    refreshNav();
  } catch (_error) {
    setAuth(null);
  }
}

function refreshNav() {
  const hasUser = !!state.user;
  const isBuyer = hasUser && isBuyerUser();
  const isSeller = hasUser && isSellerUser();
  const isAdmin = hasUser && isAdminUser();

  navLoginBtn?.classList.toggle("hidden", hasUser);
  navLogoutBtn?.classList.toggle("hidden", !hasUser);
  navProfileBtn?.classList.toggle("hidden", !hasUser);
  navMessagesBtn?.classList.toggle("hidden", !hasUser);
  navNotificationsBtn?.classList.toggle("hidden", !hasUser || !isV1FeatureEnabled("notifications"));
  navFavoritesBtn?.classList.toggle("hidden", !isBuyer);
  navCartBtn?.classList.toggle("hidden", !isBuyer);
  navOrdersBtn?.classList.toggle("hidden", !hasUser);
  navDashboardBtn?.classList.toggle("hidden", !isSeller);
  navAddProductBtn?.classList.toggle("hidden", !isSeller);
  navAdminBtn?.classList.toggle("hidden", !isAdmin || !isV1FeatureEnabled("admin"));
  refreshNavBadges();
}

function setNavBadge(element, count) {
  if (!element) return;
  const safeCount = Math.max(0, Number(count || 0));
  element.textContent = String(safeCount);
  element.classList.toggle("hidden", safeCount <= 0 || !state.user);
}

function refreshNavBadges() {
  const cartCount = isBuyerUser() ? Number(state.cart?.totals?.quantity || 0) : 0;
  const favoritesCount = isBuyerUser() ? Number(state.favorites?.length || 0) : 0;
  const conversationsCount = Number(state.conversations?.length || 0);
  const ordersCount = Number(state.orders?.length || 0);
  const unreadNotifications = (state.notifications || []).filter((item) => !item.isRead).length;

  setNavBadge(navCartBadge, cartCount);
  setNavBadge(navFavoritesBadge, favoritesCount);
  setNavBadge(navMessagesBadge, conversationsCount);
  setNavBadge(navNotificationsBadge, unreadNotifications);
  setNavBadge(navOrdersBadge, ordersCount);
}

function normalizeSiteAssetUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("/")) return raw;
  return "/" + raw.replace(/^\/+/, "");
}

function applySiteAppearance() {
  const root = document.documentElement;
  const backgroundImage = normalizeSiteAssetUrl(state.siteAppearance?.backgroundImage || "/assets/site/black-gold-marble-reference.jpg");
  const heroImage = normalizeSiteAssetUrl(state.siteAppearance?.heroImage || backgroundImage);

  root.style.setProperty("--site-marble-image", `url("${backgroundImage}")`);
  root.style.setProperty("--site-hero-image", `url("${heroImage}")`);

  if (heroPosterMedia) {
    heroPosterMedia.style.backgroundImage = `linear-gradient(180deg, rgba(12, 10, 8, 0.08), rgba(12, 10, 8, 0.22)), url("${heroImage}")`;
  }

  if (siteBrandTitle && !siteBrandTitle.textContent.trim()) siteBrandTitle.textContent = "بضاعة بلدي";
  if (siteBrandTagline && !siteBrandTagline.textContent.trim()) siteBrandTagline.textContent = "سوق محلي بتجربة عرض أهدأ وأكثر احترافية";
  if (heroKicker && !heroKicker.textContent.trim()) heroKicker.textContent = "منصة محلية متجددة";
  if (heroTitle && !heroTitle.textContent.trim()) heroTitle.textContent = "بضاعة بلدي";
  if (heroDescription && !heroDescription.textContent.trim()) {
    heroDescription.textContent = "مساحة عرض أوسع للتجار والمزارعين والحرفيين، مع تصنيفات واضحة، بطاقات أوضح، ومحادثات أبسط للوصول إلى المنتج المناسب بسرعة.";
  }
}

async function loadSiteAppearance() {
  try {
    const [backgroundContent, heroContent] = await Promise.all([
      api("/api/content/site_background_image"),
      api("/api/content/home_hero_image")
    ]);

    const backgroundImage = String(backgroundContent?.content?.content || "").trim();
    const heroImage = String(heroContent?.content?.content || "").trim();

    if (backgroundContent?.content) state.siteContentCache.site_background_image = backgroundContent.content;
    if (heroContent?.content) state.siteContentCache.home_hero_image = heroContent.content;

    state.siteAppearance = {
      backgroundImage,
      heroImage
    };
  } catch (_error) {
    state.siteAppearance = {
      backgroundImage: "/assets/site/black-gold-marble-reference.jpg",
      heroImage: "/assets/site/black-gold-marble-reference.jpg"
    };
  }

  applySiteAppearance();
}

function hideAllViews() {
  [homeView, catalogView, productView, authView, profileView, favoritesView, cartView, checkoutView, ordersView, dashboardView, sellerView, messagesView, notificationsView, adminView]
    .forEach((view) => view?.classList.add("hidden"));
}

function showView(viewName) {
  const safeViewName = getSafeViewName(viewName);
  hideAllViews();
  if (safeViewName === "home") homeView?.classList.remove("hidden");
  if (safeViewName === "catalog") catalogView?.classList.remove("hidden");
  if (safeViewName === "product") productView?.classList.remove("hidden");
  if (safeViewName === "auth") authView?.classList.remove("hidden");
  if (safeViewName === "profile") profileView?.classList.remove("hidden");
  if (safeViewName === "favorites") favoritesView?.classList.remove("hidden");
  if (safeViewName === "cart") cartView?.classList.remove("hidden");
  if (safeViewName === "checkout") checkoutView?.classList.remove("hidden");
  if (safeViewName === "orders") ordersView?.classList.remove("hidden");
  if (safeViewName === "dashboard") dashboardView?.classList.remove("hidden");
  if (safeViewName === "seller") sellerView?.classList.remove("hidden");
  if (safeViewName === "messages") {
    messagesView?.classList.remove("hidden");
    loadConversationsView();
  }
  if (safeViewName === "notifications") notificationsView?.classList.remove("hidden");
  if (safeViewName === "admin") adminView?.classList.remove("hidden");

  window.dispatchEvent(new CustomEvent("marketplace:viewchange", {
    detail: { view: safeViewName }
  }));
}

function normalizeProducts(products) {
  return (products || []).map((product) => ({
    id: product.id,
    name: product.name || "",
    description: product.description || "",
    price: Number(product.price || 0),
    currency: product.currency || "ل.س",
    category: product.category || "غير مصنف",
    subcategory: product.subcategory || "",
    region: product.region || "",
    condition: product.condition || "",
    quantity: Number(product.quantity || 0),
    hasDeliveryService: Boolean(product.hasDeliveryService || product.has_delivery_service),
    viewsCount: Number(product.viewsCount || product.views || 0),
    image: product.image || (Array.isArray(product.images) ? product.images[0] : ""),
    images: Array.isArray(product.images) ? product.images : [],
    status: product.status || "published",
    createdAt: product.createdAt || product.created_at || new Date().toISOString(),
    seller: {
      id: product.seller?.id,
      fullName: product.seller?.fullName || product.seller?.name || "",
      storeName: product.seller?.storeName || product.seller?.fullName || product.seller?.name || "",
      phone: product.seller?.phone || "",
      whatsapp: product.seller?.whatsapp || "",
      whatsappLink: product.seller?.whatsappLink || "",
      region: product.seller?.region || "",
      avatarUrl: product.seller?.avatarUrl || "",
      averageRating: Number(product.seller?.averageRating || 0),
      ratingsCount: Number(product.seller?.ratingsCount || 0),
      totalProducts: Number(product.seller?.totalProducts || 0)
    }
  }));
}

function ensureAuthenticated() {
  if (!state.user) {
    showToast("يجب تسجيل الدخول أولاً");
    showView("auth");
    return false;
  }
  return true;
}

function isBuyerUser(user = state.user) {
  return user?.role === "buyer";
}

function isSellerUser(user = state.user) {
  return user?.role === "seller";
}

function isAdminUser(user = state.user) {
  return user?.role === "admin";
}

function clearBuyerExperienceState() {
  state.favorites = [];
  state.favoriteProductIds = [];
  state.cart = null;
}

function ensureBuyerAccess() {
  if (!ensureAuthenticated()) return false;
  if (isBuyerUser()) return true;

  showToast("هذه الميزة مخصصة لحساب المشتري");
  if (typeof window.navigateTo === "function") {
    window.navigateTo(isSellerUser() ? "/dashboard" : "/profile", { replace: true });
  } else {
    showView(isSellerUser() ? "dashboard" : "profile");
  }
  return false;
}

function syncRoleSpecificFields() {
  const registerRole = document.getElementById("registerRole");
  const registerStoreName = document.getElementById("registerStoreName");
  const profileStoreName = document.getElementById("profileStoreName");

  if (registerStoreName) {
    const showRegisterStore = (registerRole?.value || "buyer") === "seller";
    registerStoreName.classList.toggle("hidden", !showRegisterStore);
    registerStoreName.disabled = !showRegisterStore;
    if (!showRegisterStore) registerStoreName.value = "";
  }

  if (profileStoreName) {
    const showProfileStore = isSellerUser();
    profileStoreName.classList.toggle("hidden", !showProfileStore);
    profileStoreName.disabled = !showProfileStore;
    if (!showProfileStore) profileStoreName.value = "";
  }
}

function setLoading(container, message = "جارٍ التحميل...") {
  if (container) {
    container.innerHTML = `<div class="loading-box">${escapeHtml(message)}</div>`;
  }
}

function setSoftEmpty(container, message) {
  if (container) {
    container.innerHTML = `<div class="soft-empty">${escapeHtml(message)}</div>`;
  }
}

function isFavoriteProduct(productId) {
  return state.favoriteProductIds.includes(Number(productId));
}

function askQuantity(defaultValue = 1) {
  const rawValue = window.prompt("أدخل الكمية المطلوبة", String(defaultValue || 1));
  if (rawValue === null) return null;
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed) || parsed < 1) {
    showToast("أدخل كمية صحيحة أكبر من أو تساوي 1");
    return null;
  }
  return Math.floor(parsed);
}

async function loadFavorites() {
  if (!state.user) return;
  if (!isBuyerUser()) {
    clearBuyerExperienceState();
    refreshNavBadges();
    return;
  }
  const data = await api("/api/favorites");
  state.favorites = normalizeProducts(data.favorites || []);
  state.favoriteProductIds = state.favorites.map((item) => Number(item.id));
  refreshNavBadges();
  renderFavorites();
}

async function toggleFavorite(productId) {
  if (!ensureBuyerAccess()) return;

  try {
    if (isFavoriteProduct(productId)) {
      await api(`/api/favorites/${Number(productId)}`, { method: "DELETE" });
      state.favoriteProductIds = state.favoriteProductIds.filter((id) => id !== Number(productId));
      state.favorites = state.favorites.filter((item) => item.id !== Number(productId));
      showToast("تمت إزالة المنتج من المفضلة");
    } else {
      await api("/api/favorites", {
        method: "POST",
        body: JSON.stringify({ productId: Number(productId) })
      });
      showToast("تمت إضافة المنتج إلى المفضلة");
    }

    await loadFavorites();
    renderHomeSections();
    renderCatalogProducts(state.currentCatalogProducts.length ? state.currentCatalogProducts : state.filteredProducts);
    if (state.currentSellerProducts.length && sellerProductsGrid) {
      sellerProductsGrid.innerHTML = state.currentSellerProducts.map(productCardHtml).join("");
      bindProductActions(sellerProductsGrid);
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function loadCart() {
  if (!state.user) return;
  if (!isBuyerUser()) {
    clearBuyerExperienceState();
    refreshNavBadges();
    return;
  }
  const data = await api("/api/cart");
  state.cart = data.cart || null;
  refreshNavBadges();
  renderCart();
  renderCheckout();
}

async function addProductToCart(productId, quantity = 1, note = "") {
  const submissionKey = `addToCart:${Number(productId)}`;
  if (!ensureBuyerAccess()) return;

  try {
    await api("/api/cart/items", {
      method: "POST",
      body: JSON.stringify({ productId: Number(productId), quantity: Number(quantity || 1), note })
    });
    await loadCart();
    showToast("تمت إضافة المنتج إلى السلة", "success", "السلة");
  } catch (error) {
    showToast(error.message, "error", "تعذر الإضافة");
  } finally {
    endSubmission(submissionKey);
  }
}

async function updateCartItem(itemId, quantity, note) {
  const submissionKey = `cartItemUpdate:${Number(itemId)}`;
  if (!ensureBuyerAccess()) return;
  if (!Number.isInteger(Number(itemId)) || Number(itemId) <= 0) {
    showToast("تعذر تحديد عنصر السلة المطلوب تحديثه", "error", "السلة");
    return;
  }

  if (!Number.isFinite(Number(quantity)) || Number(quantity) < 1) {
    showToast("أدخل كمية صحيحة أكبر من أو تساوي 1", "info", "السلة");
    return;
  }

  if (!beginSubmission(submissionKey)) return;
  const restoreUi = setCartItemSubmittingUi(Number(itemId), true);

  try {
    await api(`/api/cart/items/${Number(itemId)}`, {
      method: "PUT",
      body: JSON.stringify({ quantity: Number(quantity), note })
    });
    await loadCart();
    showToast("تم تحديث كمية العنصر بنجاح", "success", "السلة");
  } catch (error) {
    showToast(error.message, "error", "تعذر التحديث");
  } finally {
    restoreUi();
    endSubmission(submissionKey);
  }
}

async function removeCartItem(itemId) {
  if (!ensureBuyerAccess()) return;
  if (!Number.isInteger(Number(itemId)) || Number(itemId) <= 0) {
    showToast("تعذر تحديد عنصر السلة المطلوب حذفه", "error", "السلة");
    return;
  }

  const approved = await askConfirm({
    title: "حذف عنصر من السلة",
    message: "هل تريد حذف هذا العنصر من السلة؟",
    approveLabel: "حذف"
  });
  if (!approved) return;

  try {
    await api(`/api/cart/items/${Number(itemId)}`, { method: "DELETE" });
    await loadCart();
    showToast("تم حذف العنصر من السلة", "success", "السلة");
  } catch (error) {
    showToast(error.message, "error", "تعذر الحذف");
  }
}

async function clearCart() {
  if (!ensureBuyerAccess()) return;
  const approved = await askConfirm({
    title: "تفريغ السلة",
    message: "سيتم حذف جميع العناصر من السلة الحالية. هل تريد المتابعة؟",
    approveLabel: "تفريغ السلة"
  });
  if (!approved) return;

  try {
    await api("/api/cart", { method: "DELETE" });
    await loadCart();
    showToast("تم تفريغ السلة بالكامل", "success", "السلة");
  } catch (error) {
    showToast(error.message, "error", "تعذر التفريغ");
  }
}

async function loadOrders() {
  if (!state.user) return;
  const data = await api("/api/orders");
  state.orders = data.orders || [];
  refreshNavBadges();
  renderOrders();
}

async function loadOrderDetails(orderId) {
  const data = await api(`/api/orders/${Number(orderId)}`);
  state.activeOrder = data.order || null;
  renderOrderDetails();
}

async function goToConversation(conversationId) {
  if (!conversationId) {
    showToast("لا توجد محادثة مرتبطة بهذا الطلب بعد");
    return;
  }
  if (typeof window.navigateTo === "function") {
    await window.navigateTo(`/conversation/${Number(conversationId)}`);
    return;
  }
  showView("messages");
  await loadMessages();
  await openConversation(Number(conversationId));
}

async function goToOrderConversation(order) {
  if (!order) return;

  if (!order.conversationId) {
    await loadOrderDetails(order.id);
    order = state.activeOrder || order;
  }

  if (!order.conversationId) {
    showToast("تم إنشاء الطلب لكن تعذر ربط محادثته حاليًا", "error", "المحادثة");
    return;
  }

  await goToConversation(order.conversationId);
}

async function updateOrderStatusLegacy(orderId, status) {
  try {
    await api(`/api/orders/${Number(orderId)}/status`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });
    await loadOrders();
    await loadOrderDetails(orderId);
    await loadMessages();
    showToast("تم تحديث حالة الطلب");
  } catch (error) {
    showToast(error.message);
  }
}

async function updateOrderStatus(orderId, status) {
  if (!V1_ALLOWED_ORDER_TRANSITIONS.has(String(status || "").trim())) {
    showToast("إجراءات الطلب المتاحة في هذه النسخة هي قبول الطلب أو رفضه فقط.", "error", "إجراء غير متاح");
    return;
  }

  try {
    await api(`/api/orders/${Number(orderId)}/status`, {
      method: "PUT",
      body: JSON.stringify({ status })
    });
    await loadOrders();
    await loadOrderDetails(orderId);
    await loadMessages();
    showToast(getOrderStatusExplanation({ status }), "success", formatOrderStatus(status));
  } catch (error) {
    showToast(error.message, "error", "تعذر تحديث الطلب");
  }
}

async function submitOrderFromCart(notes = "") {
  const submissionKey = "orderFromCart";
  if (!ensureBuyerAccess()) return;
  if (!state.cart?.id) {
    showToast("السلة فارغة");
    return;
  }

  if (!beginSubmission(submissionKey)) return;
  const restoreUi = setSubmittingUi(confirmCheckoutBtn, { loadingText: "جارٍ إنشاء الطلب..." });

  try {
    const data = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        sourceType: "cart",
        sourceRefId: state.cart.id,
        paymentMethod: "manual",
        notes: String(notes || "").trim() || undefined
      })
    });
    await loadCart();
    await loadOrders();
    await loadMessages();
    if (checkoutNotes) checkoutNotes.value = "";
    const firstOrder = data.order || data.orders?.[0] || null;
    if (firstOrder?.conversationId) {
      await goToConversation(firstOrder.conversationId);
    } else {
      showView("orders");
      if (firstOrder?.id) {
        await loadOrderDetails(firstOrder.id);
      }
    }
    showToast("تم إنشاء الطلب وفتح المحادثة");
  } catch (error) {
    showToast(error.message);
  }
}

async function loadConversationDeals(conversationId) {
  if (!isV1FeatureEnabled("conversationDeals")) {
    state.activeConversationDeals = [];
    return [];
  }
  if (!conversationId) return;
  const data = await api(`/api/conversations/${Number(conversationId)}/deals`);
  state.activeConversationDeals = data.deals || [];
  return state.activeConversationDeals;
}

async function createConversationDeal(conversationId, payload) {
  if (!isV1FeatureEnabled("conversationDeals")) return null;
  const data = await api(`/api/conversations/${Number(conversationId)}/deals`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  await loadConversationDeals(conversationId);
  return data.deal;
}

async function updateConversationDeal(dealId, payload, conversationId) {
  if (!isV1FeatureEnabled("conversationDeals")) return;
  await api(`/api/conversations/deals/${Number(dealId)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  await loadConversationDeals(conversationId);
}

async function deleteConversationDeal(dealId, conversationId) {
  if (!isV1FeatureEnabled("conversationDeals")) return;
  await api(`/api/conversations/deals/${Number(dealId)}`, { method: "DELETE" });
  await loadConversationDeals(conversationId);
}

async function submitOrderFromDeal(dealId) {
  if (!isV1FeatureEnabled("conversationDeals")) return;
  try {
    const data = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        sourceType: "conversation",
        sourceRefId: Number(dealId),
        paymentMethod: "manual"
      })
    });
    await loadOrders();
    await loadMessages();
    showView("orders");
    if (data.order?.id) {
      await loadOrderDetails(data.order.id);
    }
    showToast("تم إنشاء الطلب من الاتفاق");
  } catch (error) {
    showToast(error.message);
  }
}

async function openReportModal(context) {
  if (!isV1FeatureEnabled("reports")) return;
  if (!ensureAuthenticated()) return;

  state.reportDraft = context;
  const contextLines = [];
  if (context.productName) contextLines.push(`المنتج: ${context.productName}`);
  if (context.sellerName) contextLines.push(`التاجر: ${context.sellerName}`);
  if (context.conversationId) contextLines.push(`المحادثة: #${context.conversationId}`);
  if (context.reportedUserName) contextLines.push(`المستخدم المبلغ عنه: ${context.reportedUserName}`);

  document.getElementById("reportContextBox").innerHTML = contextLines.length
    ? contextLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")
    : "سيتم إرسال البلاغ إلى الإدارة مع السياق الحالي.";

  reportForm?.reset();
  openModal(reportModal);
}

function formatOrderStatusLegacy(status) {
  const labels = {
    submitted: "مُرسل",
    seller_confirmed: "أكد البائع",
    buyer_confirmed: "أكد المشتري",
    cancelled: "ملغي",
    completed: "مكتمل"
  };
  return labels[status] || status || "-";
}


function formatOrderStatusLegacyV2(status) {
  const labels = {
    submitted: "بانتظار تأكيد المشتري",
    buyer_confirmed: "أكد المشتري",
    in_preparation: "قيد التحضير",
    in_transport: "قيد النقل",
    cancelled: "ملغي",
    completed: "مكتمل"
  };
  return labels[status] || status || "-";
}

function getOrderStatusToneLegacy(status) {
  const tones = {
    submitted: "status-info",
    buyer_confirmed: "status-accent",
    in_preparation: "status-progress",
    in_transport: "status-progress",
    cancelled: "status-danger",
    completed: "status-success"
  };
  return tones[status] || "status-info";
}

function getOrderStatusExplanationLegacy(order) {
  const messages = {
    submitted: "ينتظر هذا الطلب تأكيد المشتري قبل أن يبدأ البائع بالتحضير.",
    buyer_confirmed: "تم تأكيد الاتفاق من المشتري، ويمكن للبائع الآن بدء التحضير.",
    in_preparation: "بدأ البائع تحضير هذا الطلب، ولم يعد من المناسب إنهاؤه أو إلغاؤه من طرف المشتري.",
    in_transport: "الطلب في مرحلة النقل الآن، ويمكن للمشتري إكماله بعد الاستلام.",
    cancelled: "تم إلغاء هذا الطلب ولن تظهر له إجراءات إضافية.",
    completed: "تم إكمال هذا الطلب بنجاح."
  };
  return messages[order?.status] || "لا توجد تفاصيل إضافية لهذه الحالة حالياً.";
}

function getOrderActionLabelLegacy(status) {
  const labels = {
    buyer_confirmed: "تأكيد الاتفاق",
    in_preparation: "تأكيد الاتفاق وبدء التحضير",
    in_transport: "بدء النقل",
    completed: "إكمال الطلب",
    cancelled: "إلغاء الطلب"
  };
  return labels[status] || status;
}

function getAllowedOrderActionsLegacy(order) {
  const actions = [];
  const isBuyer = state.user?.id === order.buyerId;
  const isSeller = state.user?.id === order.sellerId;

  if (order.status === "submitted" && isBuyer) {
    actions.push({ key: "buyer_confirmed", label: getOrderActionLabel("buyer_confirmed"), tone: "btn-primary" });
    actions.push({ key: "cancelled", label: getOrderActionLabel("cancelled"), tone: "btn-outline" });
  }

  if (order.status === "buyer_confirmed" && isSeller) {
    actions.push({ key: "in_preparation", label: getOrderActionLabel("in_preparation"), tone: "btn-primary" });
  }

  if (order.status === "buyer_confirmed" && isBuyer) {
    actions.push({ key: "cancelled", label: getOrderActionLabel("cancelled"), tone: "btn-outline" });
  }

  if (order.status === "in_preparation" && isSeller) {
    actions.push({ key: "in_transport", label: getOrderActionLabel("in_transport"), tone: "btn-primary" });
    actions.push({ key: "cancelled", label: getOrderActionLabel("cancelled"), tone: "btn-outline" });
  }

  if (order.status === "in_transport" && isBuyer) {
    actions.push({ key: "completed", label: getOrderActionLabel("completed"), tone: "btn-primary" });
  }

  if (order.status === "in_transport" && isSeller) {
    actions.push({ key: "cancelled", label: getOrderActionLabel("cancelled"), tone: "btn-outline" });
  }

  return actions;
}

function getOrderProgressStepsLegacy(status) {
  const steps = [
    { key: "submitted", label: "إرسال الطلب" },
    { key: "buyer_confirmed", label: "تأكيد المشتري" },
    { key: "in_preparation", label: "التحضير" },
    { key: "in_transport", label: "النقل" },
    { key: "completed", label: "الإكمال" }
  ];
  const currentIndex = steps.findIndex((step) => step.key === status);
  return steps.map((step, index) => ({
    ...step,
    state: status === "cancelled"
      ? "cancelled"
      : index < currentIndex
        ? "done"
        : index === currentIndex
          ? "current"
          : "upcoming"
  }));
}

function deliveryIndicatorHtml(product, extraClass = "") {
  const enabled = Boolean(product?.hasDeliveryService);
  const text = enabled ? "خدمة التوصيل متاحة" : "التوصيل غير متاح";
  return `
    <div class="delivery-pill ${enabled ? "is-available" : "is-unavailable"} ${extraClass}" title="${escapeHtml(text)}">
      <span aria-hidden="true">🚚</span>
      <span>${text}</span>
    </div>
  `;
}

async function loadMeta() {
  try {
    const data = await api('/api/meta');
    state.categories = Array.isArray(data.categories) ? [...data.categories].sort((a, b) => a.localeCompare(b, "ar")) : [];
    state.regions = Array.isArray(data.regions) ? [...data.regions].sort((a, b) => a.localeCompare(b, "ar")) : [];
    state.metaLoaded = true;
  } catch (error) {
    console.error(error);
  }
}

async function loadProducts() {
  const params = new URLSearchParams();
  if (state.search) params.set("keyword", state.search);
  if (state.selectedCategory !== "all") params.set("category", state.selectedCategory);
  if (state.selectedRegion !== "all") params.set("region", state.selectedRegion);
  if (state.sort) params.set("sort", state.sort);

  const data = await api(`/api/products?${params.toString()}`);
  state.products = normalizeProducts(data.products || []);
  state.filteredProducts = [...state.products];

  if (!state.metaLoaded) {
    buildMetaFromProducts();
  }
  renderFilters();
  renderHomeSections();
}

function buildMetaFromProducts() {
  const categories = [...new Set(state.products.map((p) => p.category).filter(Boolean))];
  const regions = [...new Set(state.products.map((p) => p.region).filter(Boolean))];
  state.categories = categories.sort((a, b) => a.localeCompare(b, "ar"));
  state.regions = regions.sort((a, b) => a.localeCompare(b, "ar"));
}

function renderFilters() {
  if (!filterCategory || !filterRegion || !filterKeyword || !sortBy || !categoryChips) return;

  filterCategory.innerHTML =
    `<option value="all">كل التصنيفات</option>` +
    state.categories.map((category) => {
      const selected = state.selectedCategory === category ? "selected" : "";
      return `<option value="${escapeHtml(category)}" ${selected}>${escapeHtml(category)}</option>`;
    }).join("");

  filterRegion.innerHTML =
    `<option value="all">كل المناطق</option>` +
    state.regions.map((region) => {
      const selected = state.selectedRegion === region ? "selected" : "";
      return `<option value="${escapeHtml(region)}" ${selected}>${escapeHtml(region)}</option>`;
    }).join("");

  filterKeyword.value = state.search;
  sortBy.value = state.sort;

  categoryChips.innerHTML = `
    <button class="chip ${state.selectedCategory === "all" ? "active" : ""}" data-chip-category="all">كل التصنيفات</button>
    ${state.categories.map((category) => `
      <button class="chip ${state.selectedCategory === category ? "active" : ""}" data-chip-category="${escapeHtml(category)}">${escapeHtml(category)}</button>
    `).join("")}
  `;

  categoryChips.querySelectorAll("[data-chip-category]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.selectedCategory = btn.dataset.chipCategory;
      await loadProducts();
    });
  });
}


function productCardHtml(product) {
  const sellerName = escapeHtml(product.seller.storeName || product.seller.fullName || "");
  const favoriteActive = isFavoriteProduct(product.id);
  const productImage = product.image
    ? `<div class="product-image product-image-wrap"><button class="favorite-fab ${favoriteActive ? "is-active-favorite" : ""}" data-toggle-favorite="${product.id}" type="button" aria-label="${favoriteActive ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}">${favoriteActive ? "♥" : "♡"}</button><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" /></div>`
    : `<div class="product-image product-image-placeholder product-image-wrap"><button class="favorite-fab ${favoriteActive ? "is-active-favorite" : ""}" data-toggle-favorite="${product.id}" type="button" aria-label="${favoriteActive ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}">${favoriteActive ? "♥" : "♡"}</button></div>`;

  let conditionClass = "";
  if (product.condition === "جديد") conditionClass = "condition-new";
  else if (product.condition === "مستعمل كالجديد") conditionClass = "condition-like-new";
  else if (product.condition === "مستعمل بحالة جيدة") conditionClass = "condition-used-good";

  const canMessage = state.user && state.user.role !== "seller";

  return `
    <article class="product-card auction-card product-card-refined">
      ${product.condition ? `<div class="condition-ribbon ${conditionClass}">${escapeHtml(product.condition)}</div>` : ""}
      ${productImage}
      <div class="product-body product-body-pro">
        <div class="product-title">${escapeHtml(product.name)}</div>
        <div class="product-price product-price-centered product-price-hero">${formatPrice(product.price, product.currency)}</div>
        <div class="product-meta-grid pro-meta-grid">
          <span class="product-region-badge region-pill">
            <span class="region-icon" aria-hidden="true">📍</span>
            ${escapeHtml(product.region)}
          </span>
          <span class="views-badge compact-pill">
            <span class="views-icon" aria-hidden="true">👁</span>
            <span>${product.viewsCount}</span>
          </span>
        </div>

        <div class="product-store-block product-store-block-pro">
          <button class="store-link store-link-pro" type="button" data-open-seller="${product.seller.id}">${sellerName}</button>
          <div class="store-rating store-rating-pro">
            <span class="star-icon" aria-hidden="true">★</span>
            ${product.seller.averageRating.toFixed(1)}
            <span class="rating-count">(${product.seller.ratingsCount})</span>
          </div>
        </div>

        ${deliveryIndicatorHtml(product, "product-delivery-pill")}

        <div class="product-actions product-actions-pro">
          <button class="btn btn-outline" data-open-product="${product.id}" type="button">عرض التفاصيل</button>
        </div>
        <div class="product-quick-actions">
          <button class="icon-action-button" data-add-cart="${product.id}" type="button" aria-label="أضف إلى السلة" title="أضف إلى السلة">
            <span aria-hidden="true">🛒</span>
          </button>
          <button class="icon-action-button" data-report-product="${product.id}" type="button" aria-label="إرسال بلاغ" title="إرسال بلاغ">
            <span aria-hidden="true">⚑</span>
          </button>
        </div>
      </div>
    </article>
  `;
}

function formatOrderStatus(status) {
  const labels = {
    submitted: "بانتظار رد التاجر",
    seller_confirmed: "مقبول من التاجر",
    buyer_confirmed: "مقبول",
    in_preparation: "قيد التنفيذ",
    in_transport: "قيد التنفيذ",
    cancelled: "مرفوض",
    completed: "مكتمل"
  };
  return labels[status] || status || "-";
}

function formatOrderSource(sourceType) {
  const labels = {
    product: "شراء مباشر",
    cart: "السلة",
    conversation: "اتفاق قديم"
  };
  return labels[sourceType] || sourceType || "-";
}

function getOrderStatusTone(status) {
  const tones = {
    submitted: "status-info",
    seller_confirmed: "status-success",
    buyer_confirmed: "status-success",
    in_preparation: "status-success",
    in_transport: "status-success",
    cancelled: "status-danger",
    completed: "status-success"
  };
  return tones[status] || "status-info";
}

function getOrderStatusExplanation(order) {
  const messages = {
    submitted: "تم إرسال طلب الشراء.",
    seller_confirmed: "وافق التاجر على طلب الشراء. تابع التفاصيل من داخل المحادثة.",
    buyer_confirmed: "هذا الطلب يتبع مسارًا قديمًا وتم قبوله بالفعل.",
    in_preparation: "هذا الطلب يتبع مسارًا قديمًا وانتقل إلى مرحلة تنفيذ لاحقة.",
    in_transport: "هذا الطلب يتبع مسارًا قديمًا وانتقل إلى مرحلة تنفيذ لاحقة.",
    cancelled: "رفض التاجر هذا الطلب أو تم إلغاؤه.",
    completed: "تم إكمال هذا الطلب بنجاح."
  };
  return messages[order?.status] || "لا توجد تفاصيل إضافية لهذه الحالة حاليًا.";
}

function getOrderActionLabel(status) {
  const labels = {
    seller_confirmed: "قبول الطلب",
    buyer_confirmed: "تأكيد المتابعة",
    in_preparation: "بدء التحضير",
    in_transport: "بدء النقل",
    completed: "إكمال الطلب",
    cancelled: "إلغاء الطلب"
  };
  return labels[status] || status;
}

function getAllowedOrderActions(order) {
  const actions = [];
  const isSeller = state.user?.id === order.sellerId;

  if (order.status === "submitted" && isSeller) {
    actions.push({ key: "seller_confirmed", label: "قبول الطلب", tone: "btn-primary" });
    actions.push({ key: "cancelled", label: "رفض الطلب", tone: "btn-outline" });
  }

  return actions;
}

function getOrderProgressSteps(status) {
  const normalizedStatus = ["seller_confirmed", "buyer_confirmed", "in_preparation", "in_transport", "completed"].includes(status)
    ? "seller_confirmed"
    : status;
  const steps = [
    { key: "submitted", label: "إرسال الطلب" },
    { key: "seller_confirmed", label: "رد التاجر" }
  ];
  const currentIndex = steps.findIndex((step) => step.key === normalizedStatus);
  return steps.map((step, index) => ({
    ...step,
    state: status === "cancelled"
      ? "cancelled"
      : index < currentIndex
        ? "done"
        : index === currentIndex
          ? "current"
          : "upcoming"
  }));
}

function bindProductActions(scope = document) {
  scope.querySelectorAll("[data-open-product]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      if (typeof window.navigateTo === "function") {
        event.preventDefault();
        await window.navigateTo(`/product/${Number(btn.dataset.openProduct)}`);
        return;
      }
      openProductPage(Number(btn.dataset.openProduct));
    });
  });

  scope.querySelectorAll('a[href^="/product/"]').forEach((link) => {
    link.addEventListener("click", async (event) => {
      const match = String(link.getAttribute("href") || "").match(/\/product\/(\d+)/);
      if (!match) return;
      event.preventDefault();
      if (typeof window.navigateTo === "function") {
        await window.navigateTo(`/product/${Number(match[1])}`);
        return;
      }
      await openProductPage(Number(match[1]));
    });
  });

  scope.querySelectorAll("[data-open-seller]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      if (btn.tagName === "A" && typeof window.navigateTo === "function") {
        event.preventDefault();
        await window.navigateTo(`/seller/${Number(btn.dataset.openSeller)}`);
        return;
      }
      await openSellerPage(Number(btn.dataset.openSeller));
    });
  });

  scope.querySelectorAll("[data-start-conversation]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await startConversation(Number(btn.dataset.startConversation));
    });
  });

  scope.querySelectorAll("[data-toggle-favorite]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await toggleFavorite(Number(btn.dataset.toggleFavorite));
    });
  });

  scope.querySelectorAll("[data-add-cart]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const quantity = askQuantity(1);
      if (quantity == null) return;
      await addProductToCart(Number(btn.dataset.addCart), quantity);
    });
  });

  scope.querySelectorAll("[data-report-product]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const product = state.products.find((item) => item.id === Number(btn.dataset.reportProduct))
        || state.currentCatalogProducts.find((item) => item.id === Number(btn.dataset.reportProduct))
        || state.favorites.find((item) => item.id === Number(btn.dataset.reportProduct));
      if (!product) return;
      await openReportModal({
        productId: product.id,
        productName: product.name,
        reportedUserId: product.seller.id,
        reportedUserName: product.seller.storeName || product.seller.fullName,
        sellerName: product.seller.storeName || product.seller.fullName
      });
    });
  });

  scope.querySelectorAll("[data-delivery-info]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openDeliveryInfoModal(btn.dataset.deliveryInfo === "available");
    });
  });

  scope.querySelectorAll("[data-show-category]").forEach((btn) => {
    btn.addEventListener("click", () => {
      openCatalogByCategory(btn.dataset.showCategory);
    });
  });
}

function renderHomeSections() {
  if (!resultsCount || !homeCategorySections) return;
  resultsCount.textContent = `${state.filteredProducts.length} منتج`;

  if (!state.filteredProducts.length) {
    destroyHomeCategoryMarquees();
    homeCategorySections.innerHTML = `<div class="card" style="padding:20px;"><p class="muted">لا توجد منتجات مطابقة.</p></div>`;
    return;
  }

  const grouped = {};
  state.filteredProducts.forEach((product) => {
    if (!grouped[product.category]) grouped[product.category] = [];
    grouped[product.category].push(product);
  });

  const categoryOrder = Object.keys(grouped).sort((a, b) => a.localeCompare(b, "ar"));

  homeCategorySections.innerHTML = categoryOrder.map((category) => {
    const products = grouped[category];
    return `
      <div class="category-block">
        <div class="category-header">
          <div class="category-title">${escapeHtml(category)} (${products.length})</div>
          <button class="btn btn-light" data-show-category="${escapeHtml(category)}" type="button">مشاهدة الكل</button>
        </div>
        <div class="cards-strip" data-home-marquee="true">
          ${products.map(productCardHtml).join("")}
        </div>
      </div>
    `;
  }).join("");

  bindProductActions(homeCategorySections);
  setupHomeCategoryMarquees();
}

function openCatalog(title, products) {
  state.currentCatalogTitle = title;
  state.currentCatalogProducts = [...products];

  if (catalogTitle) catalogTitle.textContent = title;

  const sortSelect = document.getElementById("sortSelect");
  const sortValue = sortSelect?.value || "latest";
  const sorted = sortProducts(state.currentCatalogProducts, sortValue);

  renderCatalogProducts(sorted);
  showView("catalog");
}

function openCatalogByCategory(category) {
  const products = state.filteredProducts.filter((product) => product.category === category);
  openCatalog(`كل منتجات ${category}`, products);
}

function renderCheckout() {
  if (!checkoutItemsList || !checkoutSummaryPanel || !checkoutProfileInfo) return;

  const cart = state.cart;
  const items = cart?.items || [];

  if (!items.length) {
    checkoutItemsList.innerHTML = `<div class="soft-empty">السلة فارغة حاليًا. أضف منتجات أولًا قبل إتمام الشراء.</div>`;
    checkoutSummaryPanel.innerHTML = `<div class="soft-empty">لا يمكن إنشاء طلب بدون عناصر داخل السلة.</div>`;
    checkoutProfileInfo.innerHTML = `<div class="muted">سجّل بياناتك أولًا لإتمام الطلب.</div>`;
    return;
  }

  checkoutItemsList.innerHTML = items.map((item) => `
    <div class="list-item checkout-item-card">
      <div class="checkout-item-main">
        ${item.product?.image ? `<img class="cart-item-image" src="${escapeHtml(item.product.image)}" alt="${escapeHtml(item.product.name || "")}">` : `<div class="cart-item-image placeholder"></div>`}
        <div class="checkout-item-copy">
          <strong>${escapeHtml(item.product?.name || "")}</strong>
          <div class="muted">البائع: ${escapeHtml(item.seller?.storeName || item.seller?.fullName || "")}</div>
          <div class="muted">${item.quantity} × ${formatPrice(item.snapshotPrice, item.product?.currency || "ل.س")}</div>
        </div>
      </div>
      <strong>${formatPrice(item.lineTotal || 0, item.product?.currency || "ل.س")}</strong>
    </div>
  `).join("");

  checkoutSummaryPanel.innerHTML = `
    <div class="summary-box checkout-summary-box">
      <div class="summary-line"><span>عدد الوحدات</span><strong>${cart.totals?.quantity || 0}</strong></div>
      <div class="summary-line"><span>عدد المنتجات</span><strong>${cart.totals?.itemsCount || 0}</strong></div>
      <div class="summary-line"><span>الإجمالي النهائي</span><strong>${formatPrice(cart.totals?.amount || 0, "ل.س")}</strong></div>
      <div class="summary-line"><span>طريقة الدفع</span><strong>يدوي</strong></div>
    </div>
  `;

  checkoutProfileInfo.innerHTML = formatDetailRows([
    { label: "الاسم", value: state.user?.fullName || "-" },
    { label: "الهاتف", value: state.user?.phone || "-" },
    { label: "المنطقة", value: state.user?.region || "-" },
    { label: "العنوان", value: state.user?.address || "-" }
  ]);
}

async function openCheckoutView() {
  if (!ensureBuyerAccess()) return;
  await loadCart();
  renderCheckout();
  showView("checkout");
}

function renderRelatedProducts(product) {
  if (!relatedProductsGrid) return;
  const related = (state.products || [])
    .filter((item) => item.id !== product.id && (item.category === product.category || item.seller?.id === product.seller?.id))
    .slice(0, 8);

  if (!related.length) {
    relatedProductsGrid.innerHTML = `<div class="soft-empty">لا توجد منتجات ذات صلة متاحة حاليًا.</div>`;
    return;
  }

  relatedProductsGrid.innerHTML = related.map(productCardHtml).join("");
  bindProductActions(relatedProductsGrid);
}

function renderProductView(product) {
  if (!productViewContent) return;

  const stockQuantity = Number(product.quantity || 0);
  const hasStockLimit = Number.isFinite(stockQuantity) && stockQuantity > 0;
  const canStartInquiry = state.user?.role === "buyer" && state.user.id !== product.seller.id;
  const productInfo = formatDetailRows([
    { label: "التصنيف", value: product.category },
    { label: "الموقع", value: product.region },
    { label: "الحالة", value: product.condition },
    { label: "الكمية", value: hasStockLimit ? stockQuantity : "حسب الطلب" },
    { label: "المشاهدات", value: `${product.viewsCount || 0}` }
  ]);
  const sellerInfo = formatDetailRows([
    { label: "اسم المتجر", value: product.seller.storeName || product.seller.fullName },
    { label: "المنطقة", value: product.seller.region || "-" },
    { label: "التقييم", value: `${product.seller.averageRating.toFixed(1)} (${product.seller.ratingsCount})` },
    { label: "الهاتف", value: product.seller.phone || "-" }
  ]);

  if (productViewTitle) {
    productViewTitle.textContent = product.name || "تفاصيل المنتج";
  }

  productViewContent.innerHTML = `
    <div class="card store-product-view-shell">
      <div class="modal-product-layout store-product-layout">
        <div class="modal-gallery store-product-gallery">
          ${product.images?.length
            ? product.images.map((src) => `<img src="${escapeHtml(src)}" alt="${escapeHtml(product.name)}" class="modal-product-image" />`).join("")
            : `<div class="product-image modal-placeholder"></div>`
          }
        </div>
        <div class="modal-product-copy store-product-copy">
          <div class="modal-title-row store-title-row">
            <div>
              <div class="product-page-kicker">${escapeHtml(product.category || "منتج")}</div>
              <h2>${escapeHtml(product.name)}</h2>
            </div>
            <div class="product-price modal-price store-product-price">${formatPrice(product.price, product.currency)}</div>
          </div>

          ${deliveryIndicatorHtml(product, "detail-delivery-pill")}

          <div class="detail-card-block">
            <div class="detail-card-title">وصف المنتج</div>
            <div class="store-product-description">${escapeHtml(product.description || "لا يوجد وصف إضافي لهذا المنتج حاليًا.")}</div>
          </div>

          <div class="detail-card-block">
            <div class="detail-card-title">تفاصيل المنتج</div>
            <div class="detail-rows">${productInfo}</div>
          </div>

          <div class="modal-purchase-box store-purchase-box">
            <div class="modal-purchase-head">
              <div>
                <div class="detail-card-title">أضف إلى السلة</div>
                <div class="muted">اختر الكمية المطلوبة ثم أضف المنتج إلى سلتك للانتقال إلى إتمام الشراء.</div>
              </div>
              <div class="modal-cart-stock">${hasStockLimit ? `المتوفر: ${stockQuantity}` : "الكمية حسب الطلب"}</div>
            </div>
            <div class="modal-cart-inline">
              <div class="modal-qty-stepper" aria-label="تحديد الكمية">
                <button class="modal-qty-btn" data-product-qty-change="-1" type="button" aria-label="تقليل الكمية">-</button>
                <input id="productViewQuantity" class="modal-qty-input" type="number" min="1" value="1" inputmode="numeric" />
                <button class="modal-qty-btn" data-product-qty-change="1" type="button" aria-label="زيادة الكمية">+</button>
              </div>
              <button class="btn btn-success store-buy-btn" id="productViewAddToCartBtn" type="button">أضف إلى السلة</button>
            </div>
          </div>

          <div class="detail-card-block">
            <div class="detail-card-head">
              <div>
                <div class="detail-card-title">استفسار عن المنتج</div>
                <div class="muted">هذا الاستفسار يفتح محادثة مستقلة عن الطلبات، ولا يتحول لاحقًا إلى محادثة طلب.</div>
              </div>
            </div>
            ${canStartInquiry
              ? `<button class="btn btn-secondary" id="productViewInquiryBtn" type="button">بدء استفسار</button>`
              : `<div class="muted">${state.user ? "يمكن للمشتري فقط بدء محادثة استفسار من صفحة المنتج." : "سجّل الدخول كمشتري لبدء استفسار."}</div>`
            }
          </div>

          <div class="detail-card-block seller-card-block">
            <div class="detail-card-head">
              <div>
                <div class="detail-card-title">معلومات التاجر</div>
                <div class="seller-inline-rating">★ ${product.seller.averageRating.toFixed(1)} <span>(${product.seller.ratingsCount})</span></div>
              </div>
              <button class="btn btn-light" id="productViewSellerBtn" type="button">عرض التاجر</button>
            </div>
            <div class="detail-rows">${sellerInfo}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  const quantityInput = document.getElementById("productViewQuantity");
  const normalizeProductViewQuantity = (nextValue) => {
    if (!quantityInput) return 1;
    let safeValue = Number(nextValue ?? quantityInput.value ?? 1);
    if (!Number.isFinite(safeValue)) safeValue = 1;
    safeValue = Math.max(1, Math.round(safeValue));
    quantityInput.value = String(safeValue);
    return safeValue;
  };

  productViewContent.querySelectorAll("[data-product-qty-change]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const delta = Number(btn.dataset.productQtyChange || 0);
      normalizeProductViewQuantity((Number(quantityInput?.value || 1) || 1) + delta);
    });
  });

  quantityInput?.addEventListener("input", () => {
    normalizeProductViewQuantity(quantityInput.value);
  });

  document.getElementById("productViewAddToCartBtn")?.addEventListener("click", async () => {
    const quantity = normalizeProductViewQuantity();
    await addProductToCart(product.id, quantity);
  });

  document.getElementById("productViewInquiryBtn")?.addEventListener("click", async () => {
    await startConversation(product.id);
  });

  document.getElementById("productViewSellerBtn")?.addEventListener("click", async () => {
    await openSellerPage(product.seller.id);
  });

  renderRelatedProducts(product);
}

async function openProductPage(productId) {
  try {
    if (!state.products?.length) {
      await loadProducts();
    }
    const data = await api(`/api/products/${Number(productId)}`);
    const product = normalizeProducts([data.product])[0];
    state.currentProduct = product;
    renderProductView(product);
    showView("product");
    scrollViewportToTop();
  } catch (error) {
    showToast(error.message || "تعذر تحميل تفاصيل المنتج");
  }
}

async function openProductModal(productId) {
  try {
    const data = await api(`/api/products/${productId}`);
    const product = normalizeProducts([data.product])[0];
    if (!productModalContent) return;
    const stockQuantity = Number(product.quantity || 0);
    const hasStockLimit = Number.isFinite(stockQuantity) && stockQuantity > 0;
    const canPurchaseProduct = !state.user || state.user.id !== product.seller.id;

    const productInfo = formatDetailRows([
      { label: "التصنيف", value: product.category },
      { label: "الموقع", value: product.region },
      { label: "الحالة", value: product.condition },
      { label: "الكمية", value: product.quantity },
      { label: "المشاهدات", value: `${product.viewsCount}` }
    ]);

    const sellerInfo = formatDetailRows([
      { label: "اسم المتجر", value: product.seller.storeName || product.seller.fullName },
      { label: "المنطقة", value: product.seller.region },
      { label: "التقييم", value: `${product.seller.averageRating.toFixed(1)} (${product.seller.ratingsCount})` },
      { label: "الهاتف", value: product.seller.phone }
    ]);

    productModalContent.innerHTML = `
      <div class="modal-product-layout">
        <div class="modal-gallery">
          ${product.images?.length
            ? product.images.map((src) => `
              <img src="${escapeHtml(src)}" alt="${escapeHtml(product.name)}" class="modal-product-image" />
            `).join("")
            : `<div class="product-image modal-placeholder"></div>`
          }
        </div>
        <div class="modal-product-copy">
          <div class="modal-title-row">
            <h2>${escapeHtml(product.name)}</h2>
            <div class="product-price modal-price">${formatPrice(product.price, product.currency)}</div>
          </div>

          ${deliveryIndicatorHtml(product, "detail-delivery-pill")}

          <div class="detail-card-block">
            <div class="detail-card-title">بيانات المنتج</div>
            <div class="detail-rows">${productInfo}</div>
          </div>

          <div class="modal-purchase-box">
            <div class="modal-purchase-head">
              <div>
                <div class="detail-card-title">شراء المنتج</div>
                <div class="muted">عند الشراء سيتم فتح محادثة مباشرة مع التاجر لمتابعة الطلب.</div>
              </div>
              <div class="modal-cart-stock">${hasStockLimit ? `المتوفر: ${stockQuantity}` : "الكمية متاحة حسب الطلب"}</div>
            </div>
            <div class="modal-cart-inline">
              <div class="modal-qty-stepper" aria-label="تحديد الكمية">
                <button class="modal-qty-btn" data-modal-qty-change="-1" type="button" aria-label="تقليل الكمية">-</button>
                <input id="modalCartQuantity" class="modal-qty-input" type="number" min="1" value="1" inputmode="numeric" />
                <button class="modal-qty-btn" data-modal-qty-change="1" type="button" aria-label="زيادة الكمية">+</button>
              </div>
              ${canPurchaseProduct
                ? `<button class="btn btn-primary modal-cart-submit" id="modalBuyNowBtn" type="button">شراء وفتح محادثة</button>`
                : `<div class="muted">لا يمكنك شراء منتجك المنشور.</div>`
              }
            </div>
          </div>

          <div class="detail-card-block seller-card-block">
            <div class="detail-card-head">
              <div>
                <div class="detail-card-title">بيانات التاجر</div>
                <div class="seller-inline-rating">⭐ ${product.seller.averageRating.toFixed(1)} <span>(${product.seller.ratingsCount})</span></div>
              </div>
              <button class="btn btn-outline" id="modalSellerBtn" type="button">عرض التاجر</button>
            </div>
            <div class="detail-rows">${sellerInfo}</div>
            <div class="modal-contact-actions">
              ${product.seller.phone ? `<a class="btn btn-light" href="tel:${escapeHtml(product.seller.phone)}">اتصال</a>` : ""}
              ${product.seller.whatsappLink ? `<a class="btn btn-primary" href="https://wa.me/${escapeHtml(product.seller.whatsappLink)}" target="_blank" rel="noopener">واتساب</a>` : ""}
              <button class="btn btn-light ${isFavoriteProduct(product.id) ? "is-active-favorite" : ""}" id="modalFavoriteBtn" type="button">${isFavoriteProduct(product.id) ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}</button>
              <button class="btn btn-outline" id="modalReportBtn" type="button">إرسال بلاغ</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById("modalSellerBtn")?.addEventListener("click", async () => {
      closeModal(productModal);
      await openSellerPage(product.seller.id);
    });

    document.getElementById("modalFavoriteBtn")?.addEventListener("click", async () => {
      await toggleFavorite(product.id);
      closeModal(productModal);
      await openProductModal(product.id);
    });

    const quantityInput = document.getElementById("modalCartQuantity");
    const normalizeModalCartQuantity = (nextValue) => {
      if (!quantityInput) return 1;
      let safeValue = Number(nextValue ?? quantityInput.value ?? 1);
      if (!Number.isFinite(safeValue)) safeValue = 1;
      safeValue = Math.max(1, Math.round(safeValue));
      quantityInput.value = String(safeValue);
      return safeValue;
    };

    productModalContent.querySelectorAll("[data-modal-qty-change]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const delta = Number(btn.dataset.modalQtyChange || 0);
        normalizeModalCartQuantity((Number(quantityInput?.value || 1) || 1) + delta);
      });
    });

    quantityInput?.addEventListener("input", () => {
      normalizeModalCartQuantity(quantityInput.value);
    });

    document.getElementById("modalBuyNowBtn")?.addEventListener("click", async () => {
      const quantity = normalizeModalCartQuantity();
      await purchaseProduct(product.id, quantity);
    });

    document.getElementById("modalReportBtn")?.addEventListener("click", async () => {
      await openReportModal({
        productId: product.id,
        productName: product.name,
        reportedUserId: product.seller.id,
        reportedUserName: product.seller.storeName || product.seller.fullName,
        sellerName: product.seller.storeName || product.seller.fullName
      });
    });

    openModal(productModal);
    scrollViewportToTop();
  } catch (error) {
    showToast(error.message);
  }
}

async function startConversation(productId) {
  const submissionKey = `conversationStart:${Number(productId)}`;
  if (!state.user) {
    showToast("يجب تسجيل الدخول أولاً");
    showView("auth");
    return;
  }

  if (state.user.role !== "buyer") {
    showToast("الاستفسار متاح من حساب المشتري فقط");
    return;
  }

  if (!beginSubmission(submissionKey)) return;

  try {
    const data = await api("/api/conversations", {
      method: "POST",
      body: JSON.stringify({
        productId,
        message: "مرحبا، أريد الاستفسار عن هذا المنتج."
      })
    });

    closeModal(productModal);
    await loadMessages();
    state.selectedConversationId = data.conversation?.id || null;
    if (typeof window.navigateTo === "function" && state.selectedConversationId) {
      await window.navigateTo(`/conversation/${state.selectedConversationId}`);
    } else {
      showView("messages");
      await openConversation(state.selectedConversationId);
    }
    showToast("تم إنشاء المحادثة");
  } catch (error) {
    showToast(error.message);
  } finally {
    endSubmission(submissionKey);
  }
}

async function purchaseProduct(productId, quantity = 1) {
  const submissionKey = `orderFromProduct:${Number(productId)}`;
  if (!ensureBuyerAccess()) return;
  if (!beginSubmission(submissionKey)) return;

  try {
    const data = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        sourceType: "product",
        sourceRefId: Number(productId),
        quantity: Number(quantity || 1),
        paymentMethod: "manual",
        message: "مرحبًا، أرسلت طلب شراء لهذا المنتج."
      })
    });

    closeModal(productModal);
    await loadOrders();
    await loadMessages();

    if (data.order?.conversationId) {
      await goToConversation(data.order.conversationId);
    } else {
      showView("orders");
      if (data.order?.id) {
        await loadOrderDetails(data.order.id);
      }
    }

    showToast("تم إرسال طلب الشراء وفتح المحادثة");
  } catch (error) {
    showToast(error.message);
  }
}


async function openSellerPage(sellerId) {
  try {
    const data = await api(`/api/sellers/${sellerId}/public`);
    const seller = data.seller;
    const products = normalizeProducts(data.products || []);
    const ratings = data.ratings || [];
    state.currentSellerId = Number(sellerId);
    state.currentSellerProducts = products;

    if (sellerSummary) {
      sellerSummary.innerHTML = `
        <div class="seller-hero seller-hero-centered seller-hero-pro">
          <div class="seller-title-block">
            <div class="seller-name-frame seller-name-frame-centered seller-name-frame-pro">
              <div class="seller-frame-topline">واجهة المتجر</div>
              <h2>${escapeHtml(seller.storeName || seller.fullName)}</h2>
              <div class="seller-rate-chip seller-rate-chip-pro">⭐ ${Number(seller.averageRating || 0).toFixed(1)} (${Number(seller.ratingsCount || 0)})</div>
            </div>
          </div>

          <div class="seller-subline seller-subline-centered seller-subline-pro">
            <span class="seller-location-chip">${escapeHtml(seller.region || "")}</span>
            <span class="seller-products-chip">${Number(seller.totalProducts || products.length)} منتج</span>
          </div>

          <p class="seller-description seller-description-centered seller-description-pro">${escapeHtml(seller.profileDescription || seller.bio || "لا يوجد وصف بعد.")}</p>
          <div class="account-actions-row">
            ${state.user && state.user.role !== "seller" ? `<button class="btn btn-secondary seller-contact-btn" id="sellerHeaderMessageBtn" type="button">محادثة مع المتجر</button>` : ""}
            <button class="btn btn-outline" id="sellerHeaderReportBtn" type="button">إبلاغ الإدارة</button>
          </div>
        </div>
      `;
    }

    document.getElementById("sellerHeaderMessageBtn")?.addEventListener("click", async () => {
      const firstProduct = products[0];
      if (!firstProduct) {
        showToast("لا توجد منتجات منشورة لبدء محادثة من خلالها");
        return;
      }
      await startConversation(firstProduct.id);
    });

    document.getElementById("sellerHeaderReportBtn")?.addEventListener("click", async () => {
      await openReportModal({
        reportedUserId: seller.id,
        reportedUserName: seller.storeName || seller.fullName,
        sellerName: seller.storeName || seller.fullName
      });
    });

    if (sellerProductsGrid) {
      sellerProductsGrid.innerHTML = products.length
        ? products.map(productCardHtml).join("")
        : `<p class="muted">لا توجد منتجات منشورة.</p>`;
      bindProductActions(sellerProductsGrid);
    }

    if (sellerRatingsList) {
      sellerRatingsList.innerHTML = ratings.length
        ? ratings.map((rating) => `
            <div class="rating-card rating-card-compact rating-card-pro">
              <div class="rating-head">
                <strong>${escapeHtml(rating.buyerName || "مستخدم")}</strong>
                <span class="rating-stars">${"★".repeat(Number(rating.score || 0))}</span>
              </div>
              <p class="muted">${escapeHtml(rating.comment || "")}</p>
            </div>
          `).join("")
        : `<p class="muted">لا توجد تقييمات بعد.</p>`;
    }

    showView("seller");
  } catch (error) {
    showToast(error.message);
  }
}

function renderProfileSummary() {
  const profileSummary = document.getElementById("profileSummary");
  if (!profileSummary) return;

  if (!state.user) {
    profileSummary.innerHTML = `<p class="muted">يجب تسجيل الدخول أولاً.</p>`;
    return;
  }

  profileSummary.innerHTML = `
    <div class="list-stack">
      <div class="list-item"><strong>${escapeHtml(state.user.storeName || state.user.fullName || "")}</strong></div>
      <div class="list-item">الاسم: ${escapeHtml(state.user.fullName || "")}</div>
      <div class="list-item">الدور: ${escapeHtml(formatUserRole(state.user.role || ""))}</div>
      <div class="list-item">الهاتف: ${escapeHtml(state.user.phone || "")}</div>
      <div class="list-item">البريد: ${escapeHtml(state.user.email || "")}</div>
      <div class="list-item">المنطقة: ${escapeHtml(state.user.region || "")}</div>
      <div class="list-item">واتساب: ${escapeHtml(state.user.whatsapp || "")}</div>
    </div>
  `;
}

function renderFavorites() {
  if (!favoritesGrid) return;
  favoritesGrid.classList.add("favorites-grid-shell");
  if (!state.favorites.length) {
    setSoftEmpty(favoritesGrid, "لا توجد منتجات محفوظة في المفضلة بعد.");
    return;
  }

  favoritesGrid.innerHTML = state.favorites.map((product) => `
    <div class="favorite-card-wrap">
      ${productCardHtml(product)}
      <button class="favorite-remove-btn" data-toggle-favorite="${product.id}" type="button">إزالة من المفضلة</button>
    </div>
  `).join("");
  bindProductActions(favoritesGrid);
}

function renderCart() {
  if (!cartItemsList || !cartSummaryPanel) return;

  const cart = state.cart;
  const items = cart?.items || [];

  if (!items.length) {
    setSoftEmpty(cartItemsList, "السلة فارغة حاليًا.");
    cartSummaryPanel.innerHTML = `<div class="soft-empty">أضف منتجات من البطاقات أو من صفحة التفاصيل لبدء الطلب.</div>`;
    return;
  }

  cartItemsList.innerHTML = items.map((item) => `
    <div class="list-item cart-item-card">
      <div class="cart-item-head">
        <div class="cart-item-main">
          ${item.product?.image ? `<img class="cart-item-image" src="${escapeHtml(item.product.image)}" alt="${escapeHtml(item.product.name || "")}">` : `<div class="cart-item-image placeholder"></div>`}
          <div class="cart-item-copy">
            <strong>${escapeHtml(item.product?.name || "")}</strong>
            <div class="muted">البائع: ${escapeHtml(item.seller?.storeName || item.seller?.fullName || "")}</div>
            <div class="muted">سعر الوحدة: ${formatPrice(item.snapshotPrice, item.product?.currency || "ل.س")}</div>
            <div class="muted">الإجمالي الفرعي: ${formatPrice(item.lineTotal || 0, item.product?.currency || "ل.س")}</div>
          </div>
        </div>
        <div class="cart-item-side">
          <div class="summary-line compact">
            <span>الكمية الحالية</span>
            <strong>${item.quantity}</strong>
          </div>
        </div>
      </div>
      <div class="cart-item-actions">
        <input class="field" data-cart-qty="${item.cartItemId || item.id}" type="number" min="1" value="${item.quantity}" style="max-width:110px;">
        <button class="btn btn-light" data-cart-update="${item.cartItemId || item.id}" type="button">تحديث الكمية</button>
        <button class="btn btn-outline" data-cart-remove="${item.cartItemId || item.id}" type="button">حذف العنصر</button>
      </div>
    </div>
  `).join("");

  cartSummaryPanel.innerHTML = `
    <div class="summary-box">
      <div class="summary-line"><span>إجمالي العناصر</span><strong>${cart.totals?.quantity || 0}</strong></div>
      <div class="summary-line"><span>عدد المنتجات</span><strong>${cart.totals?.itemsCount || 0}</strong></div>
      <div class="summary-line"><span>الإجمالي</span><strong>${formatPrice(cart.totals?.amount || 0, "ل.س")}</strong></div>
      <div class="summary-line"><span>حالة السلة</span><strong>${escapeHtml(cart.status || "active")}</strong></div>
    </div>
  `;

  cartItemsList.querySelectorAll("[data-cart-update]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const qtyInput = cartItemsList.querySelector(`[data-cart-qty="${btn.dataset.cartUpdate}"]`);
      await updateCartItem(Number(btn.dataset.cartUpdate), Number(qtyInput?.value || 1));
    });
  });

  cartItemsList.querySelectorAll("[data-cart-remove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await removeCartItem(Number(btn.dataset.cartRemove));
    });
  });
}

function renderOrdersLegacy() {
  if (!ordersList) return;
  if (!state.orders.length) {
    setSoftEmpty(ordersList, "لا توجد طلبات بعد.");
    if (orderDetailsPanel) orderDetailsPanel.innerHTML = `اختر طلبًا لعرض تفاصيله`;
    return;
  }

  ordersList.innerHTML = state.orders.map((order) => `
    <button class="list-item order-item-card" data-open-order="${order.id}" type="button">
      <div class="order-row-head">
        <strong>طلب #${order.id}</strong>
        <span class="deal-status ${order.status === "completed" ? "agreed" : order.status === "cancelled" ? "cancelled" : "pending"}">${escapeHtml(formatOrderStatus(order.status))}</span>
      </div>
      <div class="muted">المصدر: ${escapeHtml(order.sourceType)} - ${formatPrice(order.totalAmount, "ل.س")}</div>
      <div class="muted">البائع: ${escapeHtml(order.sellerName || "")}</div>
      <div class="muted">عدد العناصر: ${order.itemsCount || 0}</div>
      <div class="muted">${order.createdAt ? new Date(order.createdAt).toLocaleString("ar") : ""}</div>
    </button>
  `).join("");

  ordersList.querySelectorAll("[data-open-order]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await loadOrderDetails(Number(btn.dataset.openOrder));
    });
  });
}

function renderOrderDetailsLegacy() {
  if (!orderDetailsPanel) return;
  const order = state.activeOrder;
  if (!order) {
    orderDetailsPanel.innerHTML = `اختر طلبًا لعرض تفاصيله`;
    return;
  }

  const actions = [];
  if (order.status === "submitted" && state.user?.id === order.sellerId) actions.push({ key: "seller_confirmed", label: "تأكيد البائع" });
  if (order.status === "seller_confirmed" && state.user?.id === order.buyerId) actions.push({ key: "buyer_confirmed", label: "تأكيد المشتري" });
  if (order.status === "buyer_confirmed") actions.push({ key: "completed", label: "إكمال الطلب" });
  if (order.status !== "completed" && order.status !== "cancelled") actions.push({ key: "cancelled", label: "إلغاء الطلب" });

  orderDetailsPanel.innerHTML = `
    <div class="summary-box">
      <div class="summary-line"><span>المشتري</span><strong>${escapeHtml(order.buyerName || "")}</strong></div>
      <div class="summary-line"><span>البائع</span><strong>${escapeHtml(order.sellerName || "")}</strong></div>
      <div class="summary-line"><span>الحالة</span><strong>${escapeHtml(formatOrderStatus(order.status))}</strong></div>
      <div class="summary-line"><span>الإجمالي</span><strong>${formatPrice(order.totalAmount, "ل.س")}</strong></div>
      <div class="summary-line"><span>المحادثة المرتبطة</span><strong>${order.conversationId ? ("#" + order.conversationId) : "غير متوفرة"}</strong></div>
    </div>
    <div class="list-stack" style="margin-top:14px;">
      ${(order.items || []).map((item) => `
        <div class="list-item order-line-card">
          <strong>${escapeHtml(item.product?.name || "")}</strong>
          <div class="muted">${item.quantity} × ${formatPrice(item.price, item.product?.currency || "ل.س")}</div>
          <div class="muted">الإجمالي الفرعي: ${formatPrice(item.lineTotal || 0, item.product?.currency || "ل.س")}</div>
        </div>
      `).join("")}
    </div>
    <div class="order-item-actions" style="margin-top:14px;">
      <button class="btn btn-secondary" data-order-conversation="${order.id}" type="button">مراسلة البائع</button>
    </div>
    <div class="order-status-row">
      ${actions.map((action) => `<button class="btn btn-light" data-order-status="${action.key}" type="button">${action.label}</button>`).join("")}
    </div>
  `;

  orderDetailsPanel.querySelector('[data-order-conversation]')?.addEventListener("click", async () => {
    await goToOrderConversation(order);
  });

  orderDetailsPanel.querySelectorAll("[data-order-status]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await updateOrderStatus(order.id, btn.dataset.orderStatus);
    });
  });
}

function renderCart() {
  if (!cartItemsList || !cartSummaryPanel) return;

  const cart = state.cart;
  const items = cart?.items || [];

  if (!items.length) {
    setSoftEmpty(cartItemsList, "السلة فارغة حالياً.");
    cartSummaryPanel.innerHTML = `<div class="soft-empty">أضف منتجات من البطاقات أو من صفحة التفاصيل لبدء الطلب.</div>`;
    return;
  }

  cartItemsList.innerHTML = items.map((item) => `
    <div class="list-item cart-item-card">
      <div class="cart-item-head">
        <div class="cart-item-main">
          ${item.product?.image ? `<img class="cart-item-image" src="${escapeHtml(item.product.image)}" alt="${escapeHtml(item.product.name || "")}">` : `<div class="cart-item-image placeholder"></div>`}
          <div class="cart-item-copy">
            <strong>${escapeHtml(item.product?.name || "")}</strong>
            <div class="muted">البائع: ${escapeHtml(item.seller?.storeName || item.seller?.fullName || "")}</div>
            ${deliveryIndicatorHtml(item.product, "cart-delivery-pill")}
            <div class="cart-meta-row">
              <span class="muted">سعر الوحدة: ${formatPrice(item.snapshotPrice, item.product?.currency || "ل.س")}</span>
              <span class="muted">الإجمالي الفرعي: ${formatPrice(item.lineTotal || 0, item.product?.currency || "ل.س")}</span>
            </div>
          </div>
        </div>
        <div class="cart-item-side">
          <div class="summary-line compact">
            <span>الكمية الحالية</span>
            <strong>${item.quantity}</strong>
          </div>
        </div>
      </div>
      <div class="cart-item-actions">
        <div class="cart-qty-stepper" aria-label="تحديد كمية المنتج">
          <button class="cart-qty-btn" data-cart-qty-step="-1" data-cart-item="${item.cartItemId}" type="button" aria-label="تقليل الكمية">-</button>
          <input class="field cart-qty-input" data-cart-qty="${item.cartItemId}" type="number" min="1" value="${item.quantity}">
          <button class="cart-qty-btn" data-cart-qty-step="1" data-cart-item="${item.cartItemId}" type="button" aria-label="زيادة الكمية">+</button>
        </div>
        <button class="btn btn-outline" data-cart-remove="${item.cartItemId}" type="button">حذف العنصر</button>
      </div>
    </div>
  `).join("");

  cartSummaryPanel.innerHTML = `
    <div class="summary-box cart-summary-box">
      <div class="summary-line"><span>إجمالي العناصر</span><strong>${cart.totals?.quantity || 0}</strong></div>
      <div class="summary-line"><span>عدد المنتجات</span><strong>${cart.totals?.itemsCount || 0}</strong></div>
      <div class="summary-line"><span>الإجمالي</span><strong>${formatPrice(cart.totals?.amount || 0, "ل.س")}</strong></div>
      <div class="summary-line"><span>حالة السلة</span><strong>${escapeHtml(cart.status || "active")}</strong></div>
    </div>
  `;

  const normalizeCartQuantity = (itemId, nextValue) => {
    const qtyInput = cartItemsList.querySelector(`[data-cart-qty="${itemId}"]`);
    if (!qtyInput) return 1;
    let safeValue = Number(nextValue ?? qtyInput.value ?? 1);
    if (!Number.isFinite(safeValue)) safeValue = 1;
    safeValue = Math.max(1, Math.round(safeValue));
    qtyInput.value = String(safeValue);
    return safeValue;
  };

  cartItemsList.querySelectorAll("[data-cart-qty-step]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const itemId = Number(btn.dataset.cartItem);
      const delta = Number(btn.dataset.cartQtyStep || 0);
      const currentValue = normalizeCartQuantity(itemId);
      const nextQuantity = normalizeCartQuantity(itemId, currentValue + delta);
      await updateCartItem(itemId, nextQuantity);
    });
  });

  cartItemsList.querySelectorAll("[data-cart-qty]").forEach((input) => {
    input.addEventListener("change", async () => {
      const itemId = Number(input.dataset.cartQty);
      const nextQuantity = normalizeCartQuantity(itemId, input.value);
      await updateCartItem(itemId, nextQuantity);
    });
  });

  cartItemsList.querySelectorAll("[data-cart-remove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await removeCartItem(Number(btn.dataset.cartRemove));
    });
  });

}

function renderOrders() {
  if (!ordersList) return;
  const isSellerView = isSellerUser();
  const counterpartLabel = isSellerView ? "المشتري" : "البائع";
  if (!state.orders.length) {
    setSoftEmpty(ordersList, isSellerView ? "لا توجد طلبات واردة بعد." : "لا توجد طلبات بعد.");
    if (orderDetailsPanel) orderDetailsPanel.innerHTML = `اختر طلبًا لعرض تفاصيله`;
    return;
  }

  ordersList.innerHTML = state.orders.map((order) => `
    <a class="list-item order-item-card marketplace-order-card" href="/order/${order.id}" data-route="/order/${order.id}" data-open-order="${order.id}">
      <div class="order-row-head">
        <strong>طلب #${order.id}</strong>
        <span class="deal-status ${getOrderStatusTone(order.status)}">${escapeHtml(formatOrderStatus(order.status))}</span>
      </div>
      <div class="order-inline-meta">
        <span class="muted">المصدر: ${escapeHtml(formatOrderSource(order.sourceType))}</span>
        <span class="muted">الإجمالي: ${formatPrice(order.totalAmount, "ل.س")}</span>
      </div>
      <div class="muted">${counterpartLabel}: ${escapeHtml(isSellerView ? (order.buyerName || "") : (order.sellerName || ""))}</div>
      <div class="muted">عدد العناصر: ${order.itemsCount || 0}</div>
      <div class="order-state-copy">${escapeHtml(getOrderStatusExplanation(order))}</div>
      <div class="muted">${order.createdAt ? new Date(order.createdAt).toLocaleString("ar") : ""}</div>
    </a>
  `).join("");

  ordersList.querySelectorAll("[data-open-order]").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      if (typeof window.navigateTo === "function") {
        event.preventDefault();
        await window.navigateTo(`/order/${Number(btn.dataset.openOrder)}`);
        return;
      }
      await loadOrderDetails(Number(btn.dataset.openOrder));
    });
  });
}

function renderOrderDetails() {
  if (!orderDetailsPanel) return;
  const order = state.activeOrder;
  if (!order) {
    orderDetailsPanel.innerHTML = `اختر طلبًا لعرض تفاصيله`;
    return;
  }

  const actions = getAllowedOrderActions(order);
  const progressSteps = getOrderProgressSteps(order.status);
  const isSellerView = isSellerUser();
  const counterpartLabel = isSellerView ? "المشتري" : "البائع";
  const counterpartName = isSellerView ? order.buyerName : order.sellerName;

  orderDetailsPanel.innerHTML = `
    <div class="summary-box order-details-box">
      <div class="summary-line"><span>رقم الطلب</span><strong>#${order.id}</strong></div>
      <div class="summary-line"><span>${counterpartLabel}</span><strong>${escapeHtml(counterpartName || "")}</strong></div>
      <div class="summary-line"><span>الحالة</span><strong><span class="deal-status ${getOrderStatusTone(order.status)}">${escapeHtml(formatOrderStatus(order.status))}</span></strong></div>
      <div class="summary-line"><span>الإجمالي</span><strong>${formatPrice(order.totalAmount, "ل.س")}</strong></div>
      <div class="summary-line"><span>المحادثة المرتبطة</span><strong>${order.conversationId ? ("#" + order.conversationId) : "غير متوفرة"}</strong></div>
    </div>

    <div class="order-progress-strip ${order.status === "cancelled" ? "is-cancelled" : ""}">
      ${progressSteps.map((step) => `
        <div class="order-progress-step ${step.state}">
          <span class="order-progress-dot"></span>
          <span>${escapeHtml(step.label)}</span>
        </div>
      `).join("")}
    </div>

    <div class="order-state-copy detail-state-copy">${escapeHtml(getOrderStatusExplanation(order))}</div>

    <div class="list-stack order-lines-stack" style="margin-top:14px;">
      ${(order.items || []).map((item) => `
        <div class="list-item order-line-card marketplace-order-line">
          <div class="order-line-main">
            ${item.product?.image ? `<img class="cart-item-image" src="${escapeHtml(item.product.image)}" alt="${escapeHtml(item.product.name || "")}">` : `<div class="cart-item-image placeholder"></div>`}
            <div class="order-line-copy">
              <strong>${escapeHtml(item.product?.name || "")}</strong>
              ${deliveryIndicatorHtml(item.product, "order-delivery-pill")}
              <div class="muted">${item.quantity} × ${formatPrice(item.price, item.product?.currency || "ل.س")}</div>
              <div class="muted">الإجمالي الفرعي: ${formatPrice(item.lineTotal || 0, item.product?.currency || "ل.س")}</div>
            </div>
          </div>
        </div>
      `).join("")}
    </div>

    <div class="order-item-actions" style="margin-top:14px;">
      <button class="btn btn-secondary" data-order-conversation="${order.id}" type="button">${order.conversationId ? "الذهاب إلى المحادثة" : "مراسلة البائع"}</button>
    </div>

    ${actions.length ? `
      <div class="order-status-row">
        ${actions.map((action) => `<button class="btn ${action.tone}" data-order-status="${action.key}" type="button">${escapeHtml(action.label)}</button>`).join("")}
      </div>
    ` : `<div class="soft-empty order-actions-empty">لا توجد إجراءات متاحة لهذا الطلب حالياً.</div>`}
  `;

  orderDetailsPanel.querySelector('[data-order-conversation]')?.addEventListener("click", async () => {
    await goToOrderConversation(order);
  });

  orderDetailsPanel.querySelectorAll("[data-order-status]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await updateOrderStatus(order.id, btn.dataset.orderStatus);
    });
  });
}

function fillProfileFormFromUser() {
  if (!state.user) return;
  const fullName = document.getElementById("profileFullName");
  const storeName = document.getElementById("profileStoreName");
  const region = document.getElementById("profileRegion");
  const address = document.getElementById("profileAddress");
  const whatsapp = document.getElementById("profileWhatsapp");
  const description = document.getElementById("profileDescription");

  if (fullName) fullName.value = state.user.fullName || "";
  if (storeName) storeName.value = state.user.storeName || "";
  if (region) region.value = state.user.region || "";
  if (address) address.value = state.user.address || "";
  if (whatsapp) whatsapp.value = state.user.whatsapp || "";
  if (description) description.value = state.user.profileDescription || "";

  syncRoleSpecificFields();
  renderProfileSummary();
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  if (!state.user) {
    showToast("يجب تسجيل الدخول أولاً");
    return;
  }

  try {
    const payload = {
      fullName: document.getElementById("profileFullName")?.value?.trim() || undefined,
      storeName: document.getElementById("profileStoreName")?.value?.trim() || undefined,
      region: document.getElementById("profileRegion")?.value?.trim() || undefined,
      address: document.getElementById("profileAddress")?.value?.trim() || undefined,
      whatsapp: document.getElementById("profileWhatsapp")?.value?.trim() || undefined,
      profileDescription: document.getElementById("profileDescription")?.value?.trim() || undefined
    };

    const data = await api("/api/users/profile", {
      method: "PATCH",
      body: JSON.stringify(payload)
    });

    setAuth({ token: state.token, user: data.user });
    fillProfileFormFromUser();
    showToast("تم تحديث الملف الشخصي");
  } catch (error) {
    showToast(error.message);
  }
}

async function handleAvatarSubmit(event) {
  event.preventDefault();
  if (!state.user) {
    showToast("يجب تسجيل الدخول أولاً");
    return;
  }

  const fileInput = document.getElementById("avatarFile");
  const file = fileInput?.files?.[0];
  if (!file) {
    showToast("اختر صورة أولاً");
    return;
  }

  try {
    const formData = new FormData();
    formData.append("avatar", file);

    const data = await api("/api/users/avatar", {
      method: "PATCH",
      body: formData
    });

    setAuth({ token: state.token, user: data.user });
    fillProfileFormFromUser();
    showToast("تم رفع الصورة");
    avatarForm?.reset();
  } catch (error) {
    showToast(error.message);
  }
}

async function loadDashboard() {
  if (!state.user || state.user.role !== "seller") return;

  try {
    const [summaryData, productsData] = await Promise.all([
      api("/api/dashboard/summary"),
      api("/api/my/products")
    ]);

    const summary = summaryData.summary || {};
    const products = normalizeProducts(productsData.products || []);
    state.dashboardSummary = summary;

    if (dashboardUserInfo) {
      dashboardUserInfo.textContent = `${state.user.storeName || state.user.fullName || ""} - ${state.user.region || ""}`;
    }

    renderDashboardStats(summary);

    if (myProductsGrid) {
      myProductsGrid.innerHTML = products.length
        ? products.map(managedProductCardHtml).join("")
        : `<p class="muted">لا توجد منتجات بعد.</p>`;

      bindManagedProductCard(myProductsGrid);
    }
  } catch (error) {
    console.error(error);
  }
}

async function handleAddProductSubmit(event) {
  event.preventDefault();
  const submissionKey = "productCreate";
  const submitButton = getFormSubmitButton(event, addProductForm);

  if (!state.user || (state.user.role !== "seller" && state.user.role !== "admin")) {
    showToast("هذه الميزة للبائع أو الأدمن فقط");
    return;
  }

  if (!beginSubmission(submissionKey)) return;
  const restoreUi = setSubmittingUi(submitButton, { loadingText: "جارٍ إنشاء المنتج..." });

  try {
    const formData = new FormData();
    formData.append("name", document.getElementById("pName")?.value?.trim() || "");
    formData.append("description", document.getElementById("pDescription")?.value?.trim() || "");
    formData.append("price", document.getElementById("pPrice")?.value || "0");
    formData.append("currency", document.getElementById("pCurrency")?.value || "ل.س");
    formData.append("category", document.getElementById("pCategory")?.value?.trim() || "");
    formData.append("region", document.getElementById("pRegion")?.value?.trim() || "");
    formData.append("condition", document.getElementById("pCondition")?.value || "جديد");
    formData.append("quantity", document.getElementById("pQuantity")?.value || "1");
    formData.append("has_delivery_service", document.getElementById("pHasDeliveryService")?.checked ? "true" : "false");
    formData.append("tags", document.getElementById("pTags")?.value?.trim() || "");
    formData.append("status", document.getElementById("pStatus")?.value || "published");

    const files = document.getElementById("pImages")?.files || [];
    Array.from(files).slice(0, 5).forEach((file) => formData.append("images", file));

    const data = await api("/api/products", {
      method: "POST",
      body: formData
    });

    const newProduct = data?.product ? normalizeProducts([data.product])[0] : null;
    showToast("تمت إضافة المنتج");
    addProductForm?.reset();
    closeModal(productFormModal);

    const dashboardUpdated = newProduct ? prependManagedProduct(newProduct) : false;
    const summaryUpdated = newProduct ? updateDashboardSummaryAfterCreate(newProduct) : false;

    if (newProduct && newProduct.status === "published") {
      state.products = [newProduct, ...(state.products || [])];
      state.currentCatalogProducts = [newProduct, ...(state.currentCatalogProducts || [])];
      state.filteredProducts = [newProduct, ...(state.filteredProducts || [])];
    }

    if (!dashboardUpdated || !summaryUpdated) {
      await loadDashboard();
      if (newProduct?.status === "published") {
        await loadProducts();
      }
    }

    showView("dashboard");
  } catch (error) {
    showToast(error.message);
  } finally {
    restoreUi();
    endSubmission(submissionKey);
  }
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const submissionKey = "login";
  const submitButton = getFormSubmitButton(event, loginForm);

  const identifier = document.getElementById("loginIdentifier")?.value?.trim() || "";
  const password = document.getElementById("loginPassword")?.value || "";

  if (!identifier || !password) {
    showToast("أدخل الهاتف أو البريد وكلمة المرور");
    return;
  }

  if (!beginSubmission(submissionKey)) return;
  const restoreUi = setSubmittingUi(submitButton, { loadingText: "جارٍ تسجيل الدخول..." });

  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password })
    });

    setAuth(data);
    await afterAuthLoad();

    if (state.user?.role === "seller") {
      showView("dashboard");
    } else {
      showView("home");
    }

    showToast("تم تسجيل الدخول بنجاح");
  } catch (error) {
    showToast(error.message || "فشل تسجيل الدخول");
  } finally {
    restoreUi();
    endSubmission(submissionKey);
  }
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  const submissionKey = "register";
  const submitButton = getFormSubmitButton(event, registerForm);

  const payload = {
    role: document.getElementById("registerRole")?.value || "buyer",
    fullName: document.getElementById("registerFullName")?.value?.trim() || "",
    storeName: document.getElementById("registerStoreName")?.value?.trim() || "",
    phone: document.getElementById("registerPhone")?.value?.trim() || "",
    email: document.getElementById("registerEmail")?.value?.trim() || "",
    region: document.getElementById("registerRegion")?.value?.trim() || "",
    password: document.getElementById("registerPassword")?.value || "",
    profileDescription: document.getElementById("registerDescription")?.value?.trim() || ""
  };

  if (!payload.fullName || !payload.phone || !payload.password || !payload.region) {
    showToast("يرجى تعبئة الحقول المطلوبة");
    return;
  }

  if (!beginSubmission(submissionKey)) return;
  const restoreUi = setSubmittingUi(submitButton, { loadingText: "جارٍ إنشاء الحساب..." });

  try {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    setAuth(data);
    await afterAuthLoad();
    showToast("تم إنشاء الحساب بنجاح");
    showView("home");
  } catch (error) {
    showToast(error.message || "تعذر إنشاء الحساب");
  } finally {
    restoreUi();
    endSubmission(submissionKey);
  }
}

async function afterAuthLoad() {
  refreshNav();
  await loadProducts();
  if (state.user?.role === "seller") {
    await loadDashboard();
  } else {
    clearBuyerExperienceState();
  }
  if (state.user) {
    await loadMessages();
    if (isBuyerUser()) {
      await loadFavorites();
      await loadCart();
    }
    await loadOrders();
    fillProfileFormFromUser();
  }
}


function getConversationStatusClass(status) {
  if (status === "open") return "status-open";
  if (status === "closed") return "status-closed";
  return "status-cancelled";
}

function formatConversationStatus(status) {
  if (status === "open") return "مفتوحة";
  if (status === "closed") return "مغلقة";
  return "ملغاة";
}

function formatConversationType(type) {
  if (type === "order") return "محادثة طلب";
  if (type === "support") return "محادثة دعم";
  return "محادثة استفسار";
}

function formatUserRole(role) {
  if (role === "seller") return "بائع";
  if (role === "buyer") return "مشتري";
  if (role === "admin") return "مدير";
  return role || "-";
}

function formatSupportStatus(status) {
  if (status === "pending") return "بانتظار الرد";
  if (status === "closed") return "مغلقة";
  return "مفتوحة";
}

function getSupportStatusClass(status) {
  if (status === "pending") return "is-pending";
  if (status === "closed") return "is-closed";
  return "is-open";
}

function renderConversationsList(conversations, activeConversationId = null) {
  const conversationsList = document.getElementById("conversationsList");
  if (!conversationsList) return;
  const searchValue = String(document.getElementById("conversationQuickSearch")?.value || "").trim().toLowerCase();
  const filteredConversations = searchValue
    ? (conversations || []).filter((conversation) => {
        const haystack = [
          conversation.product?.name,
          conversation.lastMessage,
          conversation.seller?.storeName,
          conversation.seller?.fullName,
          conversation.buyer?.fullName
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(searchValue);
      })
    : (conversations || []);

  if (!filteredConversations.length) {
    conversationsList.innerHTML = `
      <div class="empty-state" style="padding:28px 16px;">
        <div class="conversation-empty-title" style="font-size:16px;">لا توجد محادثات بعد</div>
        <div class="conversation-empty-text">ستظهر هنا الرسائل عند بدء التفاعل على المنتجات</div>
      </div>
    `;
    return;
  }

  conversationsList.innerHTML = filteredConversations.map((conversation) => `
    <button class="conversation-entry conversation-card ${activeConversationId === conversation.id ? "is-active active" : ""}" data-open-conversation="${conversation.id}" type="button">
      <div class="conversation-avatar conversation-avatar-pro">
        ${escapeHtml(
          (
            state.user?.role === "seller"
              ? (conversation.buyer?.fullName || "مستخدم")
              : (conversation.seller?.storeName || conversation.seller?.fullName || "متجر")
          ).slice(0, 1)
        )}
      </div>
      <div class="conversation-card-body">
        <div class="conversation-row-top">
          <div class="conversation-row-name">
            ${escapeHtml(
              state.user?.role === "seller"
                ? (conversation.buyer?.fullName || "مستخدم")
                : (conversation.seller?.storeName || conversation.seller?.fullName || "متجر")
            )}
          </div>
          <div class="conversation-row-time">
            ${conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleDateString("ar") : ""}
          </div>
        </div>
        <div class="conversation-row-product">
          <span class="conversation-product-chip">المنتج</span>
          <strong>${escapeHtml(conversation.product?.name || "بدون منتج")}</strong>
        </div>
        <div class="conversation-row-last">
          ${escapeHtml(conversation.lastMessage || "لا توجد رسائل بعد")}
        </div>
        <div class="conversation-card-footer">
          <div class="conversation-row-status ${getConversationStatusClass(conversation.status)}">
            ${formatConversationStatus(conversation.status)}
          </div>
          <div class="conversation-meta-note">
            ${conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }) : "بدون تحديث"}
          </div>
        </div>
      </div>
    </button>
  `).join("");

  conversationsList.querySelectorAll("[data-open-conversation]").forEach((item) => {
    item.addEventListener("click", async (event) => {
      if (typeof window.navigateTo === "function") {
        event.preventDefault();
        await window.navigateTo(`/conversation/${Number(item.dataset.openConversation)}`);
        return;
      }
      openConversation(Number(item.dataset.openConversation));
    });
  });
}

function renderConversationDetails(conversation) {
  const container = document.getElementById("conversationDetails");
  if (!container) return;

  const otherPartyName =
    state.user?.role === "seller"
      ? (conversation.buyer?.fullName || "مستخدم")
      : (conversation.seller?.storeName || conversation.seller?.fullName || "متجر");

  container.innerHTML = `
    <div class="conversation-header">
      <div>
        <div class="conversation-header-title">${escapeHtml(otherPartyName)}</div>
        <div class="conversation-header-subtitle">
          حالة المحادثة: ${escapeHtml(formatConversationStatus(conversation.status))}
        </div>
      </div>

      <div class="conversation-product-badge">
        ${escapeHtml(conversation.product?.name || "")}
      </div>
    </div>

    <div class="conversation-messages" id="conversationMessagesBox">
      ${(conversation.messages || []).map((message) => `
        <div class="message-bubble ${message.senderId === state.user?.id ? "mine" : "other"}">
          <div>${escapeHtml(message.body || "")}</div>
          <div class="message-meta">
            ${escapeHtml(message.senderName || "")} - ${message.createdAt ? new Date(message.createdAt).toLocaleString("ar") : ""}
          </div>
        </div>
      `).join("")}
    </div>

    ${
      conversation.status === "open"
        ? `
          <div class="conversation-composer">
            <textarea id="conversationReplyInput" class="conversation-input" placeholder="اكتب رسالتك هنا"></textarea>
            <button id="sendConversationReplyBtn" class="send-message-btn" type="button">إرسال</button>
          </div>
        `
        : `
          <div class="conversation-composer" style="grid-template-columns:1fr;">
            <div class="conversation-product-badge" style="justify-content:center;">
              هذه المحادثة ${escapeHtml(formatConversationStatus(conversation.status))}
            </div>
          </div>
        `
    }
  `;

  const messagesBox = document.getElementById("conversationMessagesBox");
  if (messagesBox) {
    messagesBox.scrollTop = messagesBox.scrollHeight;
  }

  const sendBtn = document.getElementById("sendConversationReplyBtn");
  const input = document.getElementById("conversationReplyInput");

  if (sendBtn && input) {
    sendBtn.addEventListener("click", async () => {
      const body = input.value.trim();
      if (!body) return;
      await sendConversationReply(conversation.id, body);
    });

    input.addEventListener("keydown", async (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        const body = input.value.trim();
        if (!body) return;
        await sendConversationReply(conversation.id, body);
      }
    });
  }
}

async function sendConversationReply(conversationId, body) {
  try {
    await api(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ message: body })
    });

    await openConversation(conversationId);
  } catch (error) {
    showToast(error.message);
  }
}

async function openConversation(conversationId) {
  try {
    const data = await api(`/api/conversations/${conversationId}`);
    state.activeConversationId = conversationId;
    state.activeConversation = data.conversation;

    renderConversationsList(state.conversations || [], conversationId);
    renderConversationDetails(data.conversation);
  } catch (error) {
    showToast(error.message);
  }
}

async function loadConversationsView() {
  try {
    const data = await api("/api/conversations");
    state.conversations = data.conversations || [];

    renderConversationsList(state.conversations, state.activeConversationId || null);

    if (state.activeConversationId) {
      const stillExists = state.conversations.find(c => c.id === state.activeConversationId);
      if (stillExists) {
        await openConversation(state.activeConversationId);
      }
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    restoreUi();
    endSubmission(submissionKey);
  }
}

function formatChatDayKey(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function formatChatDayLabel(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("ar", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });
}

function formatChatTime(value) {
  const date = new Date(value || "");
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("ar", {
    hour: "numeric",
    minute: "2-digit"
  });
}

function renderConversationMessages(messages = []) {
  const items = Array.isArray(messages) ? messages : [];
  if (!items.length) return '<p class="muted">لا توجد رسائل.</p>';

  let lastDayKey = "";
  return items.map((message) => {
    const dayKey = formatChatDayKey(message.createdAt);
    const daySeparator = dayKey && dayKey !== lastDayKey
      ? `<div class="chat-day-separator"><span>${escapeHtml(formatChatDayLabel(message.createdAt))}</span></div>`
      : "";
    lastDayKey = dayKey || lastDayKey;

    return `
      ${daySeparator}
      <div class="chat-bubble ${message.senderId === state.user?.id ? "is-me is-own" : "is-other"}">
        <div class="chat-body">${escapeHtml(message.body || "")}</div>
      </div>
    `;
  }).join("");
}

function renderConversationDetails(conversation) {
  if (!conversationDetails) return;

  if (!conversation) {
    conversationDetails.innerHTML = `<div class="conversation-empty-panel whatsapp-empty-panel"><h3>اختر محادثة</h3><p class="muted">ستظهر الرسائل هنا بشكل أوضح وبمساحة أكبر للمحادثة الأساسية.</p></div>`;
    return;
  }

  const canReply = conversation.status === "open";
  const counterparty = state.user?.id === conversation.sellerId
    ? (conversation.buyer?.fullName || "مشتري")
    : (conversation.seller?.storeName || conversation.seller?.fullName || "متجر");
  const linkedOrders = Array.isArray(conversation.linkedOrders) ? conversation.linkedOrders : [];

  conversationDetails.innerHTML = `
    <div class="chat-layout whatsapp-chat-layout">
      <div class="chat-header whatsapp-chat-header">
        <div class="chat-person-block">
          <div class="chat-person-avatar">${escapeHtml((counterparty || "م")[0] || "م")}</div>
          <div>
            <h3>${escapeHtml(counterparty)}</h3>
            <div class="muted">المنتج: ${escapeHtml(conversation.product?.name || "")}</div>
          </div>
        </div>
        <div class="chat-header-meta">
          <span class="chat-chip">${escapeHtml(formatConversationType(conversation.conversationType))}</span>
          <span class="chat-chip">الحالة: ${escapeHtml(formatConversationStatus(conversation.status || ""))}</span>
          <span class="chat-chip light">${escapeHtml(conversation.seller?.storeName || conversation.seller?.fullName || "")}</span>
          <button class="btn btn-light" id="conversationReportBtn" type="button">بلاغ</button>
        </div>
      </div>

      ${linkedOrders.length ? `
        <div class="deal-strip">
          ${linkedOrders.map((order) => {
            return `
              <div class="compact-card linked-orders-card">
                <div class="deal-head">
                  <div>
                    <strong>طلب شراء #${order.id}</strong>
                    <div class="muted">عدد العناصر: ${order.itemsCount || 0} - الإجمالي: ${formatPrice(order.totalAmount || 0, conversation.product?.currency || "ل.س")}</div>
                  </div>
                  <span class="deal-status ${getOrderStatusTone(order.status)}">${escapeHtml(formatOrderStatus(order.status))}</span>
                </div>
                <div class="muted">${escapeHtml(getOrderStatusExplanation(order))}</div>
                <div class="deal-actions">
                  <button class="btn btn-light" data-open-linked-order="${order.id}" type="button">عرض الطلب</button>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      ` : ""}

      <div class="chat-thread whatsapp-thread">
        ${(conversation.messages || []).map((message) => `
          <div class="chat-bubble ${message.senderId === state.user?.id ? "is-me" : "is-other"}">
            <div class="chat-sender">${escapeHtml(message.senderName || "")}</div>
            <div class="chat-body">${escapeHtml(message.body || "")}</div>
            <div class="chat-time">${message.createdAt ? new Date(message.createdAt).toLocaleString("ar") : ""}</div>
          </div>
        `).join("") || '<p class="muted">لا توجد رسائل.</p>'}
      </div>

      ${canReply ? `
        <div class="chat-composer whatsapp-composer">
          <textarea class="field chat-textarea whatsapp-textarea" id="conversationMessageInput" placeholder="اكتب رسالتك"></textarea>
          <div class="chat-composer-actions whatsapp-composer-actions">
            <button class="btn btn-secondary" id="sendConversationMessageBtn" type="button">إرسال</button>
          </div>
        </div>
      ` : ""}
    </div>
  `;

  document.getElementById("sendConversationMessageBtn")?.addEventListener("click", async () => {
    const input = document.getElementById("conversationMessageInput");
    const message = input?.value?.trim() || "";
    if (!message) {
      showToast("اكتب رسالة أولاً");
      return;
    }

    try {
      await api(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message })
      });
      input.value = "";
      await openConversation(conversation.id);
      await loadMessages();
    } catch (error) {
      showToast(error.message);
    }
  });

  document.getElementById("conversationReportBtn")?.addEventListener("click", async () => {
    await openReportModal({
      conversationId: conversation.id,
      productId: conversation.product?.id,
      productName: conversation.product?.name,
      reportedUserId: conversation.sellerId,
      reportedUserName: conversation.seller?.storeName || conversation.seller?.fullName
    });
  });

  conversationDetails.querySelectorAll("[data-open-linked-order]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (typeof window.navigateTo === "function") {
        await window.navigateTo(`/order/${Number(btn.dataset.openLinkedOrder)}`);
        return;
      }
      showView("orders");
      await loadOrders();
      await loadOrderDetails(Number(btn.dataset.openLinkedOrder));
    });
  });
}

function renderConversationDetails(conversation) {
  if (!conversationDetails) return;

  if (!conversation) {
    conversationDetails.innerHTML = `<div class="conversation-empty-panel whatsapp-empty-panel"><h3>اختر محادثة</h3><p class="muted">ستظهر الرسائل هنا بشكل أوضح وبمساحة أكبر للمحادثة الأساسية.</p></div>`;
    return;
  }

  const canReply = conversation.status === "open";
  const submissionKey = `conversationMessage:${Number(conversation.id)}`;
  const counterparty = state.user?.id === conversation.sellerId
    ? (conversation.buyer?.fullName || "مشتري")
    : (conversation.seller?.storeName || conversation.seller?.fullName || "متجر");
  const linkedOrders = Array.isArray(conversation.linkedOrders) ? conversation.linkedOrders : [];

  conversationDetails.innerHTML = `
    <div class="chat-layout whatsapp-chat-layout">
      <div class="chat-header whatsapp-chat-header">
        <div class="chat-person-block">
          <div class="chat-person-avatar">${escapeHtml((counterparty || "م")[0] || "م")}</div>
          <div>
            <h3>${escapeHtml(counterparty)}</h3>
          </div>
        </div>
        <div class="chat-header-meta">
          <span class="chat-chip">${escapeHtml(formatConversationType(conversation.conversationType))}</span>
          <span class="chat-chip">الحالة: ${escapeHtml(formatConversationStatus(conversation.status || ""))}</span>
          <span class="chat-chip light">${escapeHtml(conversation.seller?.storeName || conversation.seller?.fullName || "")}</span>
          <button class="btn btn-light" id="conversationReportBtn" type="button">بلاغ</button>
        </div>
      </div>

      ${linkedOrders.length ? `
        <div class="deal-strip">
          ${linkedOrders.map((order) => {
            return `
              <div class="compact-card linked-orders-card">
                <div class="deal-head">
                  <div>
                    <strong>طلب شراء #${order.id}</strong>
                    <div class="muted">عدد العناصر: ${order.itemsCount || 0} - الإجمالي: ${formatPrice(order.totalAmount || 0, conversation.product?.currency || "ل.س")}</div>
                  </div>
                  <span class="deal-status ${getOrderStatusTone(order.status)}">${escapeHtml(formatOrderStatus(order.status))}</span>
                </div>
                <div class="muted">${escapeHtml(getOrderStatusExplanation(order))}</div>
                <div class="deal-actions">
                  <button class="btn btn-light" data-open-linked-order="${order.id}" type="button">عرض الطلب</button>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      ` : ""}

      <div class="chat-thread whatsapp-thread">
        ${renderConversationMessages(conversation.messages || [])}
      </div>

      ${canReply ? `
        <div class="chat-composer whatsapp-composer">
          <div class="chat-input-shell whatsapp-input-shell">
            <button class="chat-send-icon-btn" id="sendConversationMessageBtn" type="button" aria-label="إرسال الرسالة" title="إرسال">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M21 3 10 14"></path>
                <path d="m21 3-7 18-4-7-7-4 18-7Z"></path>
              </svg>
            </button>
            <input class="field chat-textarea whatsapp-textarea chat-singleline-input" id="conversationMessageInput" type="text" placeholder="اكتب رسالتك" />
          </div>
        </div>
      ` : ""}
    </div>
  `;

  const sendConversationMessage = async () => {
    const input = document.getElementById("conversationMessageInput");
    const sendButton = document.getElementById("sendConversationMessageBtn");
    const message = input?.value?.trim() || "";
    if (!message) {
      showToast("اكتب رسالة أولًا");
      return;
    }

    if (!beginSubmission(submissionKey)) return;
    const restoreUi = setSubmittingUi(sendButton, { loadingText: "جارٍ الإرسال..." });

    try {
      await api(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message })
      });
      input.value = "";
      await openConversation(conversation.id);
      await loadMessages();
    } catch (error) {
      showToast(error.message);
    }
  };

  document.getElementById("sendConversationMessageBtn")?.addEventListener("click", sendConversationMessage);
  document.getElementById("conversationMessageInput")?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    await sendConversationMessage();
  });

  document.getElementById("conversationReportBtn")?.addEventListener("click", async () => {
    await openReportModal({
      conversationId: conversation.id,
      productId: conversation.product?.id,
      productName: conversation.product?.name,
      reportedUserId: conversation.sellerId,
      reportedUserName: conversation.seller?.storeName || conversation.seller?.fullName
    });
  });

  conversationDetails.querySelectorAll("[data-open-linked-order]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (typeof window.navigateTo === "function") {
        await window.navigateTo(`/order/${Number(btn.dataset.openLinkedOrder)}`);
        return;
      }
      showView("orders");
      await loadOrders();
      await loadOrderDetails(Number(btn.dataset.openLinkedOrder));
    });
  });
}

async function loadMessages() {
  if (!state.user) return;
  try {
    const data = await api("/api/conversations");
    state.conversations = data.conversations || [];
    refreshNavBadges();
    renderConversationsList(state.conversations, state.activeConversationId);
    if (state.selectedConversationId) {
      await openConversation(state.selectedConversationId);
    } else {
      renderConversationDetails(null);
    }
  } catch (error) {
    console.error(error);
  }
}

async function openConversation(conversationId) {
  if (!conversationId) return;
  try {
    state.selectedConversationId = conversationId;
    const data = await api(`/api/conversations/${conversationId}`);
    state.activeConversation = data.conversation || null;
    renderConversationsList(state.conversations, conversationId);
    renderConversationDetails(state.activeConversation);
  } catch (error) {
    showToast(error.message);
  }
}

async function loadNotifications() {
  if (!state.user) return;
  try {
    const data = await api("/api/notifications");
    state.notifications = data.notifications || [];
    refreshNavBadges();
    renderNotifications();
  } catch (error) {
    console.error(error);
  }
}

function renderNotifications() {
  if (!notificationsList) return;
  notificationsList.innerHTML = state.notifications.length
    ? state.notifications.map((item) => `
        <div class="notification-item ${item.isRead ? "" : "is-unread"}">
          <div class="notification-item-head">
            <strong>${escapeHtml(item.title || "")}</strong>
            <span class="muted">${item.createdAt ? new Date(item.createdAt).toLocaleString("ar") : ""}</span>
          </div>
          <div class="muted">${escapeHtml(item.body || "")}</div>
          <div class="notification-item-actions">
            ${item.linkUrl ? `<a class="btn btn-light" href="${escapeHtml(item.linkUrl)}" data-route="${escapeHtml(item.linkUrl)}">فتح</a>` : ""}
            ${item.isRead ? "" : `<button class="btn btn-outline" type="button" data-read-notification="${item.id}">تمت القراءة</button>`}
          </div>
        </div>
      `).join("")
    : `<div class="soft-empty">لا توجد إشعارات حالياً.</div>`;

  notificationsList.querySelectorAll("[data-read-notification]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api(`/api/notifications/${Number(btn.dataset.readNotification)}/read`, { method: "PATCH" });
        await loadNotifications();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

function getFilteredConversations(conversations) {
  const searchValue = String(document.getElementById("conversationQuickSearch")?.value || "").trim().toLowerCase();
  const source = Array.isArray(conversations) ? conversations : [];
  const filtered = searchValue
    ? source.filter((conversation) => {
        const haystack = [
          conversation.product?.name,
          conversation.lastMessage,
          conversation.seller?.storeName,
          conversation.seller?.fullName,
          conversation.buyer?.fullName
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(searchValue);
      })
    : source;

  return { filtered, searchValue };
}

function getConversationDisplayName(conversation) {
  return state.user?.role === "seller"
    ? (conversation.buyer?.fullName || "مستخدم")
    : (conversation.seller?.storeName || conversation.seller?.fullName || "متجر");
}

function createConversationCardMarkup(conversation, activeConversationId = null) {
  const otherPartyName = getConversationDisplayName(conversation);
  const initial = String(otherPartyName || "م").slice(0, 1);
  return `
    <button class="conversation-entry conversation-card ${activeConversationId === conversation.id ? "is-active active" : ""}" data-open-conversation="${conversation.id}" type="button">
      <div class="conversation-avatar conversation-avatar-pro">${escapeHtml(initial)}</div>
      <div class="conversation-card-body">
        <div class="conversation-row-top">
          <div class="conversation-row-name">${escapeHtml(otherPartyName)}</div>
          <div class="conversation-row-time">${conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleDateString("ar") : ""}</div>
        </div>
        <div class="conversation-row-product">
          <span class="conversation-product-chip">${escapeHtml(formatConversationType(conversation.conversationType))}</span>
          <strong>${escapeHtml(conversation.product?.name || "بدون منتج")}</strong>
        </div>
        <div class="conversation-row-last">${escapeHtml(conversation.lastMessage || "لا توجد رسائل بعد")}</div>
        <div class="conversation-card-footer">
          <div class="conversation-row-status ${getConversationStatusClass(conversation.status)}">${formatConversationStatus(conversation.status)}</div>
          <div class="conversation-meta-note">${conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }) : "بدون تحديث"}</div>
        </div>
      </div>
    </button>
  `;
}

function setMobileConversationPickerOpen(nextOpen) {
  state.mobileConversationsOpen = Boolean(nextOpen);
  mobileConversationPicker?.classList.toggle("is-open", state.mobileConversationsOpen);
  mobileConversationsMenu?.classList.toggle("hidden", !state.mobileConversationsOpen);
  mobileConversationToggle?.setAttribute("aria-expanded", state.mobileConversationsOpen ? "true" : "false");
}

function renderConversationDetails(conversation) {
  if (!conversationDetails) return;

  if (!conversation) {
    conversationDetails.innerHTML = `<div class="conversation-empty-panel whatsapp-empty-panel"><h3>اختر محادثة</h3><p class="muted">ستظهر الرسائل هنا داخل إطار واضح مع تمرير مستقل للرسائل.</p></div>`;
    return;
  }

  const canReply = conversation.status === "open";
  const counterparty = state.user?.id === conversation.sellerId
    ? (conversation.buyer?.fullName || "مشتري")
    : (conversation.seller?.storeName || conversation.seller?.fullName || "متجر");
  const linkedOrders = Array.isArray(conversation.linkedOrders) ? conversation.linkedOrders : [];

  conversationDetails.innerHTML = `
    <div class="chat-layout whatsapp-chat-layout">
      <div class="chat-header whatsapp-chat-header">
        <div class="chat-person-block">
          <div class="chat-person-avatar">${escapeHtml((counterparty || "م")[0] || "م")}</div>
          <div>
            <h3>${escapeHtml(counterparty)}</h3>
          </div>
        </div>
        <div class="chat-header-meta">
          <span class="chat-chip">${escapeHtml(formatConversationType(conversation.conversationType))}</span>
          <span class="chat-chip">الحالة: ${escapeHtml(formatConversationStatus(conversation.status || ""))}</span>
          <span class="chat-chip light">${escapeHtml(conversation.seller?.storeName || conversation.seller?.fullName || "")}</span>
          <button class="btn btn-light" id="conversationReportBtn" type="button">بلاغ</button>
        </div>
      </div>

      ${linkedOrders.length ? `
        <div class="deal-strip">
          ${linkedOrders.map((order) => `
            <div class="compact-card linked-orders-card chat-linked-order">
              <div class="deal-head">
                <div class="linked-order-summary">
                  <strong>طلب شراء #${order.id}</strong>
                  <div class="muted">عدد العناصر: ${order.itemsCount || 0} - الإجمالي: ${formatPrice(order.totalAmount || 0, conversation.product?.currency || "ل.س")}</div>
                </div>
                <span class="deal-status ${getOrderStatusTone(order.status)}">${escapeHtml(formatOrderStatus(order.status))}</span>
              </div>
              <div class="deal-actions">
                <button class="btn btn-light" data-open-linked-order="${order.id}" type="button">عرض الطلب</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}

      <div class="chat-thread whatsapp-thread" id="activeChatThread">
        ${renderConversationMessages(conversation.messages || [])}
      </div>

      ${canReply ? `
        <div class="chat-composer whatsapp-composer">
          <div class="chat-input-shell whatsapp-input-shell">
            <button class="chat-send-icon-btn" id="sendConversationMessageBtn" type="button" aria-label="إرسال الرسالة" title="إرسال">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M21 3 10 14"></path>
                <path d="m21 3-7 18-4-7-7-4 18-7Z"></path>
              </svg>
            </button>
            <input class="field chat-textarea whatsapp-textarea chat-singleline-input" id="conversationMessageInput" type="text" placeholder="اكتب رسالتك" />
          </div>
        </div>
      ` : ""}
    </div>
  `;

  const sendConversationMessage = async () => {
    const input = document.getElementById("conversationMessageInput");
    const sendButton = document.getElementById("sendConversationMessageBtn");
    const message = input?.value?.trim() || "";
    if (!message) {
      showToast("اكتب رسالة أولًا");
      return;
    }

    try {
      await api(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message })
      });
      input.value = "";
      await openConversation(conversation.id);
      await loadMessages();
    } catch (error) {
      showToast(error.message || "تعذر إرسال الرسالة");
    }
  };

  document.getElementById("sendConversationMessageBtn")?.addEventListener("click", sendConversationMessage);
  document.getElementById("conversationMessageInput")?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    await sendConversationMessage();
  });

  document.getElementById("conversationReportBtn")?.addEventListener("click", async () => {
    await openReportModal({
      conversationId: conversation.id,
      productId: conversation.product?.id,
      productName: conversation.product?.name,
      reportedUserId: conversation.sellerId,
      reportedUserName: conversation.seller?.storeName || conversation.seller?.fullName
    });
  });

  conversationDetails.querySelectorAll("[data-open-linked-order]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (typeof window.navigateTo === "function") {
        await window.navigateTo(`/order/${Number(btn.dataset.openLinkedOrder)}`);
        return;
      }
      showView("orders");
      await loadOrders();
      await loadOrderDetails(Number(btn.dataset.openLinkedOrder));
    });
  });

  const thread = document.getElementById("activeChatThread");
  if (thread) {
    thread.scrollTop = thread.scrollHeight;
  }
}

const __finalCreateLocalConversationMessage = (messageText) => ({
  id: Date.now(),
  body: String(messageText || ""),
  senderId: state.user?.id,
  senderName: state.user?.storeName || state.user?.fullName || "",
  createdAt: new Date().toISOString()
});

renderConversationMessages = function renderConversationMessagesReallyFinal(messages = []) {
  const items = Array.isArray(messages) ? messages : [];
  if (!items.length) return '<p class="muted">لا توجد رسائل.</p>';

  let lastDayKey = "";
  return items.map((message) => {
    const dayKey = formatChatDayKey(message.createdAt);
    const daySeparator = dayKey && dayKey !== lastDayKey
      ? `<div class="chat-day-separator"><span>${escapeHtml(formatChatDayLabel(message.createdAt))}</span></div>`
      : "";
    lastDayKey = dayKey || lastDayKey;

    return `
      ${daySeparator}
      <div class="chat-bubble ${message.senderId === state.user?.id ? "is-me is-own" : "is-other"}">
        <div class="chat-body">${escapeHtml(message.body || "")}</div>
      </div>
    `;
  }).join("");
};

renderConversationsList = function renderConversationsListReallyFinal(conversations, activeConversationId = null) {
  const listEl = document.getElementById("conversationsList");
  if (!listEl) return;

  const { filtered, searchValue } = getFilteredConversations(conversations);

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="conversation-list-empty">
        <div class="conversation-list-empty-icon">+</div>
        <div class="conversation-empty-title">${searchValue ? "لا توجد نتائج مطابقة" : "لا توجد محادثات بعد"}</div>
        <div class="conversation-empty-text">${searchValue ? "جرّب كلمة مختلفة أو امسح البحث لعرض كل المحادثات." : "ستظهر هنا الرسائل المرتبطة بمنتجاتك وطلباتك بشكل أوضح."}</div>
      </div>
    `;
    if (mobileConversationCurrent) mobileConversationCurrent.textContent = searchValue ? "لا توجد نتائج" : "لا توجد محادثات";
    if (mobileConversationsMenu) mobileConversationsMenu.innerHTML = "";
    setMobileConversationPickerOpen(false);
    return;
  }

  listEl.innerHTML = filtered.map((conversation) => createConversationCardMarkup(conversation, activeConversationId)).join("");

  const activeConversation = filtered.find((conversation) => conversation.id === activeConversationId) || null;
  if (mobileConversationCurrent) {
    mobileConversationCurrent.textContent = activeConversation ? getConversationDisplayName(activeConversation) : "اختر محادثة";
  }

  if (mobileConversationsMenu) {
    mobileConversationsMenu.innerHTML = filtered.map((conversation) => `
      <button class="mobile-conversation-option ${activeConversationId === conversation.id ? "is-active" : ""}" data-open-conversation="${conversation.id}" type="button">
        <strong>${escapeHtml(getConversationDisplayName(conversation))}</strong>
        <span>${escapeHtml(conversation.product?.name || "بدون منتج")}</span>
      </button>
    `).join("");
  }

  const bindOpenConversation = (scope) => {
    scope?.querySelectorAll("[data-open-conversation]").forEach((item) => {
      item.addEventListener("click", async (event) => {
        const conversationId = Number(item.dataset.openConversation);
        setMobileConversationPickerOpen(false);
        if (typeof window.navigateTo === "function") {
          event.preventDefault();
          await window.navigateTo(`/conversation/${conversationId}`);
          return;
        }
        await openConversation(conversationId);
      });
    });
  };

  bindOpenConversation(listEl);
  bindOpenConversation(mobileConversationsMenu);
};

if (window.marketplaceApp?.openConversation) {
  openConversation = window.marketplaceApp.openConversation;
}
if (window.marketplaceApp?.loadMessages) {
  loadMessages = window.marketplaceApp.loadMessages;
}

loadConversationsView = async function loadConversationsViewReallyFinal() {
  await loadMessages();
};

sendConversationReply = async function sendConversationReplyReallyFinal(conversationId, body) {
  const messageText = String(body || "").trim();
  if (!messageText) return;

  try {
    await api(`/api/conversations/${Number(conversationId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ message: messageText })
    });

    const nextMessage = __finalCreateLocalConversationMessage(messageText);
    if (state.activeConversation?.id === Number(conversationId)) {
      const currentMessages = Array.isArray(state.activeConversation.messages) ? state.activeConversation.messages : [];
      state.activeConversation = {
        ...state.activeConversation,
        messages: [...currentMessages, nextMessage]
      };
    }

    const appended = appendMessageToThread(nextMessage);
    const previewUpdated = updateConversationPreview(Number(conversationId), messageText, nextMessage.createdAt);
    if (!appended || !previewUpdated || state.activeConversation?.id !== Number(conversationId)) {
      await openConversation(Number(conversationId));
    }
  } catch (error) {
    showToast(error.message || "تعذر إرسال الرسالة");
  }
};

renderConversationDetails = function renderConversationDetailsReallyFinal(conversation) {
  if (!conversationDetails) return;

  if (!conversation) {
    conversationDetails.innerHTML = `<div class="conversation-empty-panel whatsapp-empty-panel"><h3>اختر محادثة</h3><p class="muted">ستظهر الرسائل هنا داخل إطار واضح مع تمرير مستقل للرسائل.</p></div>`;
    return;
  }

  const canReply = conversation.status === "open";
  const counterparty = state.user?.id === conversation.sellerId
    ? (conversation.buyer?.fullName || "مشتري")
    : (conversation.seller?.storeName || conversation.seller?.fullName || "متجر");
  const linkedOrders = Array.isArray(conversation.linkedOrders) ? conversation.linkedOrders : [];

  conversationDetails.innerHTML = `
    <div class="chat-layout whatsapp-chat-layout">
      <div class="chat-header whatsapp-chat-header">
        <div class="chat-person-block">
          <div class="chat-person-avatar">${escapeHtml((counterparty || "م")[0] || "م")}</div>
          <div>
            <h3>${escapeHtml(counterparty)}</h3>
            <div class="muted">المنتج: ${escapeHtml(conversation.product?.name || "")}</div>
          </div>
        </div>
        <div class="chat-header-meta">
          <span class="chat-chip">${escapeHtml(formatConversationType(conversation.conversationType))}</span>
          <span class="chat-chip">الحالة: ${escapeHtml(formatConversationStatus(conversation.status || ""))}</span>
          <span class="chat-chip light">${escapeHtml(conversation.seller?.storeName || conversation.seller?.fullName || "")}</span>
        </div>
      </div>

      ${linkedOrders.length ? `
        <div class="deal-strip">
          ${linkedOrders.map((order) => `
            <div class="compact-card linked-orders-card chat-linked-order">
              <div class="deal-head">
                <div class="linked-order-summary">
                  <strong>طلب شراء #${order.id}</strong>
                  <div class="muted">عدد العناصر: ${order.itemsCount || 0} - الإجمالي: ${formatPrice(order.totalAmount || 0, conversation.product?.currency || "ل.س")}</div>
                </div>
                <span class="deal-status ${getOrderStatusTone(order.status)}">${escapeHtml(formatOrderStatus(order.status))}</span>
              </div>
              <div class="deal-actions">
                <button class="btn btn-light" data-open-linked-order="${order.id}" type="button">عرض الطلب</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}

      <div class="chat-thread whatsapp-thread" id="activeChatThread">
        ${renderConversationMessages(conversation.messages || [])}
      </div>

      ${canReply ? `
        <div class="chat-composer whatsapp-composer">
          <div class="chat-input-shell whatsapp-input-shell">
            <input class="field chat-textarea whatsapp-textarea chat-singleline-input" id="conversationMessageInput" type="text" placeholder="اكتب رسالتك" />
            <button class="btn btn-secondary chat-send-inline-btn" id="sendConversationMessageBtn" type="button">إرسال</button>
          </div>
        </div>
      ` : ""}
    </div>
  `;

  const input = document.getElementById("conversationMessageInput");
  const sendButton = document.getElementById("sendConversationMessageBtn");
  const submissionKey = `conversationMessage:${Number(conversation.id)}`;

  const sendConversationMessage = async () => {
    const messageText = input?.value?.trim() || "";
    if (!messageText) {
      showToast("اكتب رسالة أولًا");
      return;
    }

    if (!beginSubmission(submissionKey)) return;
    const restoreUi = setSubmittingUi(sendButton, { loadingText: "جارٍ الإرسال..." });

    try {
      await api(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: messageText })
      });

      const nextMessage = __finalCreateLocalConversationMessage(messageText);
      if (input) input.value = "";

      if (state.activeConversation?.id === Number(conversation.id)) {
        const currentMessages = Array.isArray(state.activeConversation.messages) ? state.activeConversation.messages : [];
        state.activeConversation = {
          ...state.activeConversation,
          messages: [...currentMessages, nextMessage]
        };
      }

      const appended = appendMessageToThread(nextMessage);
      const previewUpdated = updateConversationPreview(Number(conversation.id), messageText, nextMessage.createdAt);
      if (!appended || !previewUpdated || state.activeConversation?.id !== Number(conversation.id)) {
        await openConversation(Number(conversation.id));
      }
    } catch (error) {
      showToast(error.message || "تعذر إرسال الرسالة");
    } finally {
      restoreUi();
      endSubmission(submissionKey);
    }
  };

  sendButton?.addEventListener("click", sendConversationMessage);
  input?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    await sendConversationMessage();
  });

  conversationDetails.querySelectorAll("[data-open-linked-order]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (typeof window.navigateTo === "function") {
        await window.navigateTo(`/order/${Number(btn.dataset.openLinkedOrder)}`);
        return;
      }
      showView("orders");
      await loadOrders();
      await loadOrderDetails(Number(btn.dataset.openLinkedOrder));
    });
  });

  const thread = document.getElementById("activeChatThread");
  if (thread) {
    thread.scrollTop = thread.scrollHeight;
  }
};

window.marketplaceApp.loadMessages = loadMessages;
window.marketplaceApp.openConversation = openConversation;

function createLocalConversationMessage(messageText) {
  return {
    id: Date.now(),
    body: String(messageText || ""),
    senderId: state.user?.id,
    senderName: state.user?.storeName || state.user?.fullName || "",
    createdAt: new Date().toISOString()
  };
}

renderConversationMessages = function renderConversationMessagesFinal(messages = []) {
  const items = Array.isArray(messages) ? messages : [];
  if (!items.length) return '<p class="muted">لا توجد رسائل.</p>';

  let lastDayKey = "";
  return items.map((message) => {
    const dayKey = formatChatDayKey(message.createdAt);
    const daySeparator = dayKey && dayKey !== lastDayKey
      ? `<div class="chat-day-separator"><span>${escapeHtml(formatChatDayLabel(message.createdAt))}</span></div>`
      : "";
    lastDayKey = dayKey || lastDayKey;

    return `
      ${daySeparator}
      <div class="chat-bubble ${message.senderId === state.user?.id ? "is-me is-own" : "is-other"}">
        <div class="chat-body">${escapeHtml(message.body || "")}</div>
      </div>
    `;
  }).join("");
};

renderConversationsList = function renderConversationsListFinal(conversations, activeConversationId = null) {
  const listEl = document.getElementById("conversationsList");
  if (!listEl) return;

  const { filtered, searchValue } = getFilteredConversations(conversations);

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="conversation-list-empty">
        <div class="conversation-list-empty-icon">+</div>
        <div class="conversation-empty-title">${searchValue ? "لا توجد نتائج مطابقة" : "لا توجد محادثات بعد"}</div>
        <div class="conversation-empty-text">${searchValue ? "جرّب كلمة مختلفة أو امسح البحث لعرض كل المحادثات." : "ستظهر هنا الرسائل المرتبطة بمنتجاتك وطلباتك بشكل أوضح."}</div>
      </div>
    `;
    if (mobileConversationCurrent) mobileConversationCurrent.textContent = searchValue ? "لا توجد نتائج" : "لا توجد محادثات";
    if (mobileConversationsMenu) mobileConversationsMenu.innerHTML = "";
    setMobileConversationPickerOpen(false);
    return;
  }

  listEl.innerHTML = filtered.map((conversation) => createConversationCardMarkup(conversation, activeConversationId)).join("");

  const activeConversation = filtered.find((conversation) => conversation.id === activeConversationId) || null;
  if (mobileConversationCurrent) {
    mobileConversationCurrent.textContent = activeConversation ? getConversationDisplayName(activeConversation) : "اختر محادثة";
  }

  if (mobileConversationsMenu) {
    mobileConversationsMenu.innerHTML = filtered.map((conversation) => `
      <button class="mobile-conversation-option ${activeConversationId === conversation.id ? "is-active" : ""}" data-open-conversation="${conversation.id}" type="button">
        <strong>${escapeHtml(getConversationDisplayName(conversation))}</strong>
        <span>${escapeHtml(conversation.product?.name || "بدون منتج")}</span>
      </button>
    `).join("");
  }

  const bindOpenConversation = (scope) => {
    scope?.querySelectorAll("[data-open-conversation]").forEach((item) => {
      item.addEventListener("click", async (event) => {
        const conversationId = Number(item.dataset.openConversation);
        setMobileConversationPickerOpen(false);
        if (typeof window.navigateTo === "function") {
          event.preventDefault();
          await window.navigateTo(`/conversation/${conversationId}`);
          return;
        }
        await openConversation(conversationId);
      });
    });
  };

  bindOpenConversation(listEl);
  bindOpenConversation(mobileConversationsMenu);
};

openConversation = async function openConversationFinal(conversationId) {
  if (!conversationId) return;

  try {
    state.activeConversationId = Number(conversationId);
    state.selectedConversationId = Number(conversationId);

    const data = await api(`/api/conversations/${Number(conversationId)}`);
    state.activeConversation = data.conversation || null;

    renderConversationsList(state.conversations || [], Number(conversationId));
    renderConversationDetails(state.activeConversation);
  } catch (error) {
    showToast(error.message);
  }
};

loadMessages = async function loadMessagesFinal() {
  if (!state.user) return;

  try {
    const data = await api("/api/conversations");
    state.conversations = data.conversations || [];
    refreshNavBadges();

    const targetConversationId = state.activeConversationId || state.selectedConversationId || null;
    renderConversationsList(state.conversations, targetConversationId);

    if (targetConversationId) {
      const stillExists = state.conversations.find((conversation) => conversation.id === Number(targetConversationId));
      if (stillExists) {
        await openConversation(Number(targetConversationId));
      } else {
        state.activeConversationId = null;
        state.selectedConversationId = null;
        state.activeConversation = null;
        renderConversationDetails(null);
      }
    } else {
      renderConversationDetails(null);
    }
  } catch (error) {
    console.error(error);
  }
};

loadConversationsView = async function loadConversationsViewFinal() {
  await loadMessages();
};

sendConversationReply = async function sendConversationReplyFinal(conversationId, body) {
  const messageText = String(body || "").trim();
  if (!messageText) return;

  try {
    await api(`/api/conversations/${Number(conversationId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ message: messageText })
    });

    const nextMessage = createLocalConversationMessage(messageText);
    if (state.activeConversation?.id === Number(conversationId)) {
      const currentMessages = Array.isArray(state.activeConversation.messages) ? state.activeConversation.messages : [];
      state.activeConversation = {
        ...state.activeConversation,
        messages: [...currentMessages, nextMessage]
      };
    }

    const appended = appendMessageToThread(nextMessage);
    const previewUpdated = updateConversationPreview(Number(conversationId), messageText, nextMessage.createdAt);
    if (!appended || !previewUpdated || state.activeConversation?.id !== Number(conversationId)) {
      await openConversation(Number(conversationId));
    }
  } catch (error) {
    showToast(error.message || "تعذر إرسال الرسالة");
  }
};

renderConversationDetails = function renderConversationDetailsFinal(conversation) {
  if (!conversationDetails) return;

  if (!conversation) {
    conversationDetails.innerHTML = `<div class="conversation-empty-panel whatsapp-empty-panel"><h3>اختر محادثة</h3><p class="muted">ستظهر الرسائل هنا داخل إطار واضح مع تمرير مستقل للرسائل.</p></div>`;
    return;
  }

  const canReply = conversation.status === "open";
  const counterparty = state.user?.id === conversation.sellerId
    ? (conversation.buyer?.fullName || "مشتري")
    : (conversation.seller?.storeName || conversation.seller?.fullName || "متجر");
  const linkedOrders = Array.isArray(conversation.linkedOrders) ? conversation.linkedOrders : [];

  conversationDetails.innerHTML = `
    <div class="chat-layout whatsapp-chat-layout">
      <div class="chat-header whatsapp-chat-header">
        <div class="chat-person-block">
          <div class="chat-person-avatar">${escapeHtml((counterparty || "م")[0] || "م")}</div>
          <div>
            <h3>${escapeHtml(counterparty)}</h3>
            <div class="muted">المنتج: ${escapeHtml(conversation.product?.name || "")}</div>
          </div>
        </div>
        <div class="chat-header-meta">
          <span class="chat-chip">${escapeHtml(formatConversationType(conversation.conversationType))}</span>
          <span class="chat-chip">الحالة: ${escapeHtml(formatConversationStatus(conversation.status || ""))}</span>
          <span class="chat-chip light">${escapeHtml(conversation.seller?.storeName || conversation.seller?.fullName || "")}</span>
        </div>
      </div>

      ${linkedOrders.length ? `
        <div class="deal-strip">
          ${linkedOrders.map((order) => `
            <div class="compact-card linked-orders-card chat-linked-order">
              <div class="deal-head">
                <div class="linked-order-summary">
                  <strong>طلب شراء #${order.id}</strong>
                  <div class="muted">عدد العناصر: ${order.itemsCount || 0} - الإجمالي: ${formatPrice(order.totalAmount || 0, conversation.product?.currency || "ل.س")}</div>
                </div>
                <span class="deal-status ${getOrderStatusTone(order.status)}">${escapeHtml(formatOrderStatus(order.status))}</span>
              </div>
              <div class="deal-actions">
                <button class="btn btn-light" data-open-linked-order="${order.id}" type="button">عرض الطلب</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}

      <div class="chat-thread whatsapp-thread" id="activeChatThread">
        ${renderConversationMessages(conversation.messages || [])}
      </div>

      ${canReply ? `
        <div class="chat-composer whatsapp-composer">
          <div class="chat-input-shell whatsapp-input-shell">
            <input class="field chat-textarea whatsapp-textarea chat-singleline-input" id="conversationMessageInput" type="text" placeholder="اكتب رسالتك" />
            <button class="btn btn-secondary chat-send-inline-btn" id="sendConversationMessageBtn" type="button">إرسال</button>
          </div>
        </div>
      ` : ""}
    </div>
  `;

  const input = document.getElementById("conversationMessageInput");
  const sendButton = document.getElementById("sendConversationMessageBtn");
  const submissionKey = `conversationMessage:${Number(conversation.id)}`;

  const sendConversationMessage = async () => {
    const messageText = input?.value?.trim() || "";
    if (!messageText) {
      showToast("اكتب رسالة أولًا");
      return;
    }

    if (!beginSubmission(submissionKey)) return;
    const restoreUi = setSubmittingUi(sendButton, { loadingText: "جارٍ الإرسال..." });

    try {
      await api(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: messageText })
      });

      const nextMessage = createLocalConversationMessage(messageText);
      if (input) input.value = "";

      if (state.activeConversation?.id === Number(conversation.id)) {
        const currentMessages = Array.isArray(state.activeConversation.messages) ? state.activeConversation.messages : [];
        state.activeConversation = {
          ...state.activeConversation,
          messages: [...currentMessages, nextMessage]
        };
      }

      const appended = appendMessageToThread(nextMessage);
      const previewUpdated = updateConversationPreview(Number(conversation.id), messageText, nextMessage.createdAt);
      if (!appended || !previewUpdated || state.activeConversation?.id !== Number(conversation.id)) {
        await openConversation(Number(conversation.id));
      }
    } catch (error) {
      showToast(error.message || "تعذر إرسال الرسالة");
    } finally {
      restoreUi();
      endSubmission(submissionKey);
    }
  };

  sendButton?.addEventListener("click", sendConversationMessage);
  input?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    await sendConversationMessage();
  });

  conversationDetails.querySelectorAll("[data-open-linked-order]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (typeof window.navigateTo === "function") {
        await window.navigateTo(`/order/${Number(btn.dataset.openLinkedOrder)}`);
        return;
      }
      showView("orders");
      await loadOrders();
      await loadOrderDetails(Number(btn.dataset.openLinkedOrder));
    });
  });

  const thread = document.getElementById("activeChatThread");
  if (thread) {
    thread.scrollTop = thread.scrollHeight;
  }
};

window.marketplaceApp.loadMessages = loadMessages;
window.marketplaceApp.openConversation = openConversation;

function createLocalConversationMessage(messageText) {
  return {
    id: Date.now(),
    body: String(messageText || ""),
    senderId: state.user?.id,
    senderName: state.user?.storeName || state.user?.fullName || "",
    createdAt: new Date().toISOString()
  };
}

renderConversationMessages = function renderConversationMessagesCanonical(messages = []) {
  const items = Array.isArray(messages) ? messages : [];
  if (!items.length) return '<p class="muted">لا توجد رسائل.</p>';

  let lastDayKey = "";
  return items.map((message) => {
    const dayKey = formatChatDayKey(message.createdAt);
    const daySeparator = dayKey && dayKey !== lastDayKey
      ? `<div class="chat-day-separator"><span>${escapeHtml(formatChatDayLabel(message.createdAt))}</span></div>`
      : "";
    lastDayKey = dayKey || lastDayKey;

    return `
      ${daySeparator}
      <div class="chat-bubble ${message.senderId === state.user?.id ? "is-me is-own" : "is-other"}">
        <div class="chat-body">${escapeHtml(message.body || "")}</div>
      </div>
    `;
  }).join("");
};

renderConversationsList = function renderConversationsListCanonical(conversations, activeConversationId = null) {
  const listEl = document.getElementById("conversationsList");
  if (!listEl) return;

  const { filtered, searchValue } = getFilteredConversations(conversations);

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="conversation-list-empty">
        <div class="conversation-list-empty-icon">+</div>
        <div class="conversation-empty-title">${searchValue ? "لا توجد نتائج مطابقة" : "لا توجد محادثات بعد"}</div>
        <div class="conversation-empty-text">${searchValue ? "جرّب كلمة مختلفة أو امسح البحث لعرض كل المحادثات." : "ستظهر هنا الرسائل المرتبطة بمنتجاتك وطلباتك بشكل أوضح."}</div>
      </div>
    `;
    if (mobileConversationCurrent) mobileConversationCurrent.textContent = searchValue ? "لا توجد نتائج" : "لا توجد محادثات";
    if (mobileConversationsMenu) mobileConversationsMenu.innerHTML = "";
    setMobileConversationPickerOpen(false);
    return;
  }

  listEl.innerHTML = filtered.map((conversation) => createConversationCardMarkup(conversation, activeConversationId)).join("");

  const activeConversation = filtered.find((conversation) => conversation.id === activeConversationId) || null;
  if (mobileConversationCurrent) {
    mobileConversationCurrent.textContent = activeConversation ? getConversationDisplayName(activeConversation) : "اختر محادثة";
  }

  if (mobileConversationsMenu) {
    mobileConversationsMenu.innerHTML = filtered.map((conversation) => `
      <button class="mobile-conversation-option ${activeConversationId === conversation.id ? "is-active" : ""}" data-open-conversation="${conversation.id}" type="button">
        <strong>${escapeHtml(getConversationDisplayName(conversation))}</strong>
        <span>${escapeHtml(conversation.product?.name || "بدون منتج")}</span>
      </button>
    `).join("");
  }

  const bindOpenConversation = (scope) => {
    scope?.querySelectorAll("[data-open-conversation]").forEach((item) => {
      item.addEventListener("click", async (event) => {
        const conversationId = Number(item.dataset.openConversation);
        setMobileConversationPickerOpen(false);
        if (typeof window.navigateTo === "function") {
          event.preventDefault();
          await window.navigateTo(`/conversation/${conversationId}`);
          return;
        }
        await openConversation(conversationId);
      });
    });
  };

  bindOpenConversation(listEl);
  bindOpenConversation(mobileConversationsMenu);
};

openConversation = async function openConversationCanonical(conversationId) {
  if (!conversationId) return;

  try {
    state.activeConversationId = Number(conversationId);
    state.selectedConversationId = Number(conversationId);

    const data = await api(`/api/conversations/${Number(conversationId)}`);
    state.activeConversation = data.conversation || null;

    renderConversationsList(state.conversations || [], Number(conversationId));
    renderConversationDetails(state.activeConversation);
  } catch (error) {
    showToast(error.message);
  }
};

loadMessages = async function loadMessagesCanonical() {
  if (!state.user) return;

  try {
    const data = await api("/api/conversations");
    state.conversations = data.conversations || [];
    refreshNavBadges();

    renderConversationsList(state.conversations, state.activeConversationId || state.selectedConversationId || null);

    const targetConversationId = state.activeConversationId || state.selectedConversationId;
    if (targetConversationId) {
      const stillExists = state.conversations.find((conversation) => conversation.id === Number(targetConversationId));
      if (stillExists) {
        await openConversation(Number(targetConversationId));
      } else {
        state.activeConversationId = null;
        state.selectedConversationId = null;
        state.activeConversation = null;
        renderConversationDetails(null);
      }
    } else {
      renderConversationDetails(null);
    }
  } catch (error) {
    console.error(error);
  }
};

loadConversationsView = async function loadConversationsViewCanonical() {
  await loadMessages();
};

sendConversationReply = async function sendConversationReplyCanonical(conversationId, body) {
  const messageText = String(body || "").trim();
  if (!messageText) return;

  try {
    await api(`/api/conversations/${Number(conversationId)}/messages`, {
      method: "POST",
      body: JSON.stringify({ message: messageText })
    });

    const nextMessage = createLocalConversationMessage(messageText);
    if (state.activeConversation?.id === Number(conversationId)) {
      const currentMessages = Array.isArray(state.activeConversation.messages) ? state.activeConversation.messages : [];
      state.activeConversation = {
        ...state.activeConversation,
        messages: [...currentMessages, nextMessage]
      };
    }

    const appended = appendMessageToThread(nextMessage);
    const previewUpdated = updateConversationPreview(Number(conversationId), messageText, nextMessage.createdAt);
    if (!appended || !previewUpdated || state.activeConversation?.id !== Number(conversationId)) {
      await openConversation(Number(conversationId));
    }
  } catch (error) {
    showToast(error.message || "تعذر إرسال الرسالة");
  }
};

renderConversationDetails = function renderConversationDetailsCanonical(conversation) {
  if (!conversationDetails) return;

  if (!conversation) {
    conversationDetails.innerHTML = `<div class="conversation-empty-panel whatsapp-empty-panel"><h3>اختر محادثة</h3><p class="muted">ستظهر الرسائل هنا داخل إطار واضح مع تمرير مستقل للرسائل.</p></div>`;
    return;
  }

  const canReply = conversation.status === "open";
  const counterparty = state.user?.id === conversation.sellerId
    ? (conversation.buyer?.fullName || "مشتري")
    : (conversation.seller?.storeName || conversation.seller?.fullName || "متجر");
  const linkedOrders = Array.isArray(conversation.linkedOrders) ? conversation.linkedOrders : [];

  conversationDetails.innerHTML = `
    <div class="chat-layout whatsapp-chat-layout">
      <div class="chat-header whatsapp-chat-header">
        <div class="chat-person-block">
          <div class="chat-person-avatar">${escapeHtml((counterparty || "م")[0] || "م")}</div>
          <div>
            <h3>${escapeHtml(counterparty)}</h3>
            <div class="muted">المنتج: ${escapeHtml(conversation.product?.name || "")}</div>
          </div>
        </div>
        <div class="chat-header-meta">
          <span class="chat-chip">${escapeHtml(formatConversationType(conversation.conversationType))}</span>
          <span class="chat-chip">الحالة: ${escapeHtml(formatConversationStatus(conversation.status || ""))}</span>
          <span class="chat-chip light">${escapeHtml(conversation.seller?.storeName || conversation.seller?.fullName || "")}</span>
        </div>
      </div>

      ${linkedOrders.length ? `
        <div class="deal-strip">
          ${linkedOrders.map((order) => `
            <div class="compact-card linked-orders-card chat-linked-order">
              <div class="deal-head">
                <div class="linked-order-summary">
                  <strong>طلب شراء #${order.id}</strong>
                  <div class="muted">عدد العناصر: ${order.itemsCount || 0} - الإجمالي: ${formatPrice(order.totalAmount || 0, conversation.product?.currency || "ل.س")}</div>
                </div>
                <span class="deal-status ${getOrderStatusTone(order.status)}">${escapeHtml(formatOrderStatus(order.status))}</span>
              </div>
              <div class="deal-actions">
                <button class="btn btn-light" data-open-linked-order="${order.id}" type="button">عرض الطلب</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}

      <div class="chat-thread whatsapp-thread" id="activeChatThread">
        ${renderConversationMessages(conversation.messages || [])}
      </div>

      ${canReply ? `
        <div class="chat-composer whatsapp-composer">
          <div class="chat-input-shell whatsapp-input-shell">
            <input class="field chat-textarea whatsapp-textarea chat-singleline-input" id="conversationMessageInput" type="text" placeholder="اكتب رسالتك" />
            <button class="btn btn-secondary chat-send-inline-btn" id="sendConversationMessageBtn" type="button">إرسال</button>
          </div>
        </div>
      ` : ""}
    </div>
  `;

  const input = document.getElementById("conversationMessageInput");
  const sendButton = document.getElementById("sendConversationMessageBtn");
  const submissionKey = `conversationMessage:${Number(conversation.id)}`;

  const sendConversationMessage = async () => {
    const messageText = input?.value?.trim() || "";
    if (!messageText) {
      showToast("اكتب رسالة أولًا");
      return;
    }

    if (!beginSubmission(submissionKey)) return;
    const restoreUi = setSubmittingUi(sendButton, { loadingText: "جارٍ الإرسال..." });

    try {
      await api(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: messageText })
      });

      const nextMessage = createLocalConversationMessage(messageText);
      if (input) input.value = "";

      if (state.activeConversation?.id === Number(conversation.id)) {
        const currentMessages = Array.isArray(state.activeConversation.messages) ? state.activeConversation.messages : [];
        state.activeConversation = {
          ...state.activeConversation,
          messages: [...currentMessages, nextMessage]
        };
      }

      const appended = appendMessageToThread(nextMessage);
      const previewUpdated = updateConversationPreview(Number(conversation.id), messageText, nextMessage.createdAt);
      if (!appended || !previewUpdated || state.activeConversation?.id !== Number(conversation.id)) {
        await openConversation(Number(conversation.id));
      }
    } catch (error) {
      showToast(error.message || "تعذر إرسال الرسالة");
    } finally {
      restoreUi();
      endSubmission(submissionKey);
    }
  };

  sendButton?.addEventListener("click", sendConversationMessage);
  input?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    await sendConversationMessage();
  });

  conversationDetails.querySelectorAll("[data-open-linked-order]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (typeof window.navigateTo === "function") {
        await window.navigateTo(`/order/${Number(btn.dataset.openLinkedOrder)}`);
        return;
      }
      showView("orders");
      await loadOrders();
      await loadOrderDetails(Number(btn.dataset.openLinkedOrder));
    });
  });

  const thread = document.getElementById("activeChatThread");
  if (thread) {
    thread.scrollTop = thread.scrollHeight;
  }
};

window.marketplaceApp.loadMessages = loadMessages;
window.marketplaceApp.openConversation = openConversation;

const renderConversationDetailsBaseV1 = renderConversationDetails;
renderConversationDetails = function renderConversationDetailsV1(conversation) {
  renderConversationDetailsBaseV1(conversation);

  if (!conversationDetails || !conversation || conversation.status !== "open") {
    return;
  }

  const existingInput = document.getElementById("conversationMessageInput");
  const existingButton = document.getElementById("sendConversationMessageBtn");
  if (!existingInput || !existingButton) {
    return;
  }

  const input = existingInput.cloneNode(true);
  const sendButton = existingButton.cloneNode(true);
  existingInput.replaceWith(input);
  existingButton.replaceWith(sendButton);

  const submissionKey = `conversationMessage:${Number(conversation.id)}`;
  const sendConversationMessage = async () => {
    const message = input.value?.trim() || "";
    if (!message) {
      showToast("اكتب رسالة أولًا");
      return;
    }

    if (!beginSubmission(submissionKey)) return;
    const restoreUi = setSubmittingUi(sendButton, { loadingText: "جارٍ الإرسال..." });

    try {
      const createdAt = new Date().toISOString();
      await api(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message })
      });

      const nextMessage = {
        id: Date.now(),
        body: message,
        senderId: state.user?.id,
        senderName: state.user?.storeName || state.user?.fullName || "",
        createdAt
      };

      input.value = "";
      if (state.activeConversation?.id === conversation.id) {
        const currentMessages = Array.isArray(state.activeConversation.messages) ? state.activeConversation.messages : [];
        state.activeConversation = {
          ...state.activeConversation,
          messages: [...currentMessages, nextMessage]
        };
      }

      const appended = appendMessageToThread(nextMessage);
      const previewUpdated = updateConversationPreview(conversation.id, message, createdAt);
      if (!appended || !previewUpdated || state.activeConversation?.id !== conversation.id) {
        await openConversation(conversation.id);
      }
    } catch (error) {
      showToast(error.message || "تعذر إرسال الرسالة");
    } finally {
      restoreUi();
      endSubmission(submissionKey);
    }
  };

  sendButton.addEventListener("click", sendConversationMessage);
  input.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    await sendConversationMessage();
  });
};

function renderConversationsList(conversations, activeConversationId = null) {
  const listEl = document.getElementById("conversationsList");
  if (!listEl) return;

  const { filtered, searchValue } = getFilteredConversations(conversations);

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="conversation-list-empty">
        <div class="conversation-list-empty-icon">+</div>
        <div class="conversation-empty-title">${searchValue ? "لا توجد نتائج مطابقة" : "لا توجد محادثات بعد"}</div>
        <div class="conversation-empty-text">${searchValue ? "جرّب كلمة مختلفة أو امسح البحث لعرض كل المحادثات." : "ستظهر هنا الرسائل المرتبطة بمنتجاتك وطلباتك بشكل أوضح."}</div>
      </div>
    `;
    if (mobileConversationCurrent) mobileConversationCurrent.textContent = searchValue ? "لا توجد نتائج" : "لا توجد محادثات";
    if (mobileConversationsMenu) mobileConversationsMenu.innerHTML = "";
    setMobileConversationPickerOpen(false);
    return;
  }

  listEl.innerHTML = filtered.map((conversation) => createConversationCardMarkup(conversation, activeConversationId)).join("");

  const activeConversation = filtered.find((conversation) => conversation.id === activeConversationId) || null;
  if (mobileConversationCurrent) {
    mobileConversationCurrent.textContent = activeConversation ? getConversationDisplayName(activeConversation) : "اختر محادثة";
  }

  if (mobileConversationsMenu) {
    mobileConversationsMenu.innerHTML = filtered.map((conversation) => `
      <button class="mobile-conversation-option ${activeConversationId === conversation.id ? "is-active" : ""}" data-open-conversation="${conversation.id}" type="button">
        <strong>${escapeHtml(getConversationDisplayName(conversation))}</strong>
        <span>${escapeHtml(conversation.product?.name || "بدون منتج")}</span>
      </button>
    `).join("");
  }

  const bindOpenConversation = (scope) => {
    scope?.querySelectorAll("[data-open-conversation]").forEach((item) => {
      item.addEventListener("click", async (event) => {
        const conversationId = Number(item.dataset.openConversation);
        setMobileConversationPickerOpen(false);
        if (typeof window.navigateTo === "function") {
          event.preventDefault();
          await window.navigateTo(`/conversation/${conversationId}`);
          return;
        }
        await openConversation(conversationId);
      });
    });
  };

  bindOpenConversation(listEl);
  bindOpenConversation(mobileConversationsMenu);
}

function renderSupportConversation() {
  if (!supportMessagesList) return;
  const messages = state.supportConversation?.messages || [];
  supportMessagesList.innerHTML = messages.length
    ? messages.map((item) => `
        <div class="support-message-bubble ${item.senderRole === "admin" ? "is-admin" : "is-user"}">
          <div class="support-message-meta">${escapeHtml(item.senderName || "")}</div>
          <div>${escapeHtml(item.body || "")}</div>
          <div class="support-message-time">${item.createdAt ? new Date(item.createdAt).toLocaleString("ar") : ""}</div>
        </div>
      `).join("")
    : `<div class="soft-empty">أرسل رسالتك الأولى هنا وسيصلك الرد داخل نفس النافذة.</div>`;
  supportMessagesList.scrollTop = supportMessagesList.scrollHeight;
}

async function loadSupportConversation() {
  if (!state.user) return;
  try {
    const data = await api("/api/support/conversation");
    state.supportConversation = data.conversation || null;
    renderSupportConversation();
  } catch (error) {
    console.error(error);
  }
}

async function sendSupportMessage(messageValue) {
  if (!state.user) {
    showToast("يجب تسجيل الدخول أولاً للتواصل مع الدعم");
    showView("auth");
    return;
  }

  const message = String(messageValue || supportMessageInput?.value || "").trim();
  if (!message) return;

  try {
    const data = await api("/api/support/messages", {
      method: "POST",
      body: JSON.stringify({ message })
    });
    state.supportConversation = data.conversation || null;
    if (supportMessageInput) supportMessageInput.value = "";
    renderSupportConversation();
    showToast("تم إرسال الرسالة إلى الدعم");
  } catch (error) {
    showToast(error.message);
  }
}

async function sendQuickSupportMessage(message) {
  if (!state.user) {
    showToast("يجب تسجيل الدخول أولاً للتواصل مع الدعم");
    showView("auth");
    return;
  }

  try {
    const data = await api("/api/support/quick-message", {
      method: "POST",
      body: JSON.stringify({ quickMessage: message })
    });
    state.supportConversation = data.conversation || null;
    renderSupportConversation();
    supportWidget?.classList.remove("hidden");
  } catch (error) {
    showToast(error.message);
  }
}

async function openSiteContent(contentKey) {
  try {
    const cached = state.siteContentCache[contentKey];
    const content = cached || (await api(`/api/content/${contentKey}`)).content;
    state.siteContentCache[contentKey] = content;
    if (contentModalTitle) contentModalTitle.textContent = content.title || "محتوى ثابت";
    if (contentModalBody) {
      contentModalBody.innerHTML = String(content.content || "")
        .split("\n")
        .map((line) => `<p>${escapeHtml(line)}</p>`)
        .join("");
    }
    openModal(contentModal);
  } catch (error) {
    showToast(error.message);
  }
}

function renderAdminUsers(users) {
  if (!adminUsersList) return;
  adminUsersList.innerHTML = (users || []).length
    ? users.map((user) => `
        <div class="list-item">
          <strong>${escapeHtml(user.storeName || user.fullName || "")}</strong>
          <div class="muted">${escapeHtml(user.role || "")} - ${escapeHtml(user.phone || "")}</div>
          <div class="muted">${user.isActive ? "نشط" : "معطل"}</div>
          <button class="btn btn-light" data-toggle-user="${user.id}" data-next="${user.isActive ? "0" : "1"}" type="button">
            ${user.isActive ? "تعطيل" : "تفعيل"}
          </button>
        </div>
      `).join("")
    : `<p class="muted">لا يوجد مستخدمون.</p>`;

  adminUsersList.querySelectorAll("[data-toggle-user]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api(`/api/admin/users/${Number(btn.dataset.toggleUser)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ isActive: btn.dataset.next === "1" })
        });
        await loadInlineAdmin();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

function renderAdminProducts(products) {
  if (!adminProductsList) return;
  adminProductsList.innerHTML = (products || []).length
    ? products.map((product) => `
        <div class="list-item">
          <strong>${escapeHtml(product.name || "")}</strong>
          <div class="muted">${escapeHtml(product.category || "")} - ${escapeHtml(product.status || "")}</div>
          <div class="muted">${escapeHtml(product.seller?.storeName || "")}</div>
          <div class="nav-actions">
            <button class="btn btn-light" data-product-status="${product.id}" data-next="hidden" type="button">إخفاء</button>
            <button class="btn btn-light" data-product-status="${product.id}" data-next="published" type="button">نشر</button>
            <button class="btn btn-outline" data-product-status="${product.id}" data-next="sold" type="button">مباع</button>
          </div>
        </div>
      `).join("")
    : `<p class="muted">لا توجد منتجات.</p>`;

  adminProductsList.querySelectorAll("[data-product-status]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api(`/api/admin/products/${Number(btn.dataset.productStatus)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: btn.dataset.next })
        });
        await loadInlineAdmin();
      } catch (error) {
        showToast(error.message);
      }
    });
  });
}

async function loadInlineAdmin() {
  if (!state.user || state.user.role !== "admin") return;
  try {
    const [usersData, productsData] = await Promise.all([
      api("/api/admin/users"),
      api("/api/admin/products")
    ]);

    renderAdminUsers(usersData.users || []);
    renderAdminProducts(normalizeProducts(productsData.products || []));
  } catch (error) {
    console.error(error);
  }
}

async function handleSearchAndFilters() {
  state.search = filterKeyword?.value?.trim() || "";
  state.selectedCategory = filterCategory?.value || "all";
  state.selectedRegion = filterRegion?.value || "all";
  state.sort = sortBy?.value || "newest";
  await loadProducts();
}

function updateResultsCount(products) {
  const el = document.getElementById("resultsCount");
  if (el) {
    el.innerText = `${products.length} نتيجة`;
  }
}

function updateCatalogResultsCount(products) {
  const el = document.getElementById("catalogResultsCount");
  if (el) {
    el.innerText = `${products.length} نتيجة`;
  }
}

function renderCatalogProducts(products) {
  if (catalogCount) catalogCount.textContent = `${products.length} منتج`;
  updateCatalogResultsCount(products);
  if (catalogGrid) {
    catalogGrid.innerHTML = products.map(productCardHtml).join("");
    bindProductActions(catalogGrid);
  }
}

function sortProducts(products, sortType) {
  const sorted = [...products];

  if (sortType === "price_low") {
    sorted.sort((a, b) => (a.price || 0) - (b.price || 0));
  } else if (sortType === "price_high") {
    sorted.sort((a, b) => (b.price || 0) - (a.price || 0));
  } else if (sortType === "views") {
    sorted.sort((a, b) => (b.viewsCount || 0) - (a.viewsCount || 0));
  } else {
    // latest (default)
    sorted.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  return sorted;
}


async function updateMyProductStatus(productId, status) {
  try {
    await api(`/api/products/${productId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status })
    });
    await loadProducts();
    await loadDashboard();
    showToast("تم تحديث حالة المنتج");
  } catch (error) {
    showToast(error.message);
  }
}

function managedProductCardHtml(product) {
  return `
    <div class="list-item managed-product-card">
      <div class="managed-product-head">
        ${product.image ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" class="managed-product-image" />` : `<div class="managed-product-image managed-product-image-placeholder"></div>`}
        <div class="managed-product-copy">
          <strong>${escapeHtml(product.name)}</strong>
          <div class="muted">${escapeHtml(product.category || "")} - ${escapeHtml(product.region || "")}</div>
          <div class="muted">${formatPrice(product.price, product.currency)}</div>
          <div class="muted">الحالة الحالية: ${escapeHtml(product.status || "")}</div>
        </div>
      </div>
      <div class="nav-actions managed-product-actions">
        <button class="btn btn-light" type="button" data-my-product-status="${product.id}" data-next="draft">مسودة</button>
        <button class="btn btn-light" type="button" data-my-product-status="${product.id}" data-next="published">نشر</button>
        <button class="btn btn-light" type="button" data-my-product-status="${product.id}" data-next="hidden">إخفاء</button>
        <button class="btn btn-outline" type="button" data-my-product-status="${product.id}" data-next="sold">مباع</button>
        <button class="btn btn-outline" type="button" data-my-product-status="${product.id}" data-next="archived">أرشفة</button>
      </div>
    </div>
  `;
}

function bindStaticEvents() {
  document.getElementById("brandHomeLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    showView("home");
  });

  catalogBackBtn?.addEventListener("click", () => showView("home"));

  globalSearchForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    state.search = globalSearchInput?.value?.trim() || "";
    if (filterKeyword) filterKeyword.value = state.search;
    await loadProducts();
    showView("home");
  });

  document.getElementById("applyFiltersBtn")?.addEventListener("click", handleSearchAndFilters);

  document.getElementById("sortSelect")?.addEventListener("change", function () {
    const sortValue = this.value;
    const sorted = sortProducts(state.currentCatalogProducts, sortValue);
    renderCatalogProducts(sorted);
  });

  closeProductModal?.addEventListener("click", () => closeModal(productModal));
  closeProductFormModal?.addEventListener("click", () => closeModal(productFormModal));
  closeDeliveryInfoModal?.addEventListener("click", () => closeModal(deliveryInfoModal));
  closeConfirmModal?.addEventListener("click", () => resolveConfirm(false));
  closeContentModal?.addEventListener("click", () => closeModal(contentModal));
  confirmModalCancelBtn?.addEventListener("click", () => resolveConfirm(false));
  confirmModalApproveBtn?.addEventListener("click", () => resolveConfirm(true));

  productModal?.addEventListener("click", (e) => {
    if (e.target === productModal) closeModal(productModal);
  });

  productFormModal?.addEventListener("click", (e) => {
    if (e.target === productFormModal) closeModal(productFormModal);
  });

  deliveryInfoModal?.addEventListener("click", (e) => {
    if (e.target === deliveryInfoModal) closeModal(deliveryInfoModal);
  });

  confirmModal?.addEventListener("click", (e) => {
    if (e.target === confirmModal) resolveConfirm(false);
  });
  contentModal?.addEventListener("click", (e) => {
    if (e.target === contentModal) closeModal(contentModal);
  });

  homeCategorySections?.addEventListener("click", async (event) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const trigger = event.target.closest('[data-open-product], a[href^="/product/"]');
    if (!trigger || !homeCategorySections.contains(trigger) || !trigger.closest("[data-home-marquee]")) return;

    const productMatch = String(trigger.getAttribute("href") || "").match(/\/product\/(\d+)/);
    const productId = Number(trigger.dataset.openProduct || productMatch?.[1] || 0);
    if (!productId) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === "function") {
      event.stopImmediatePropagation();
    }

    await openProductModal(productId);
  }, true);

  document.addEventListener("visibilitychange", updateHomeCategoryMarqueeActivity);
  window.addEventListener("marketplace:viewchange", updateHomeCategoryMarqueeActivity);
  navLoginBtn?.addEventListener("click", () => showView("auth"));

  navLogoutBtn?.addEventListener("click", () => {
    setAuth(null);
    state.conversations = [];
    state.selectedConversationId = null;
    state.activeConversation = null;
    state.activeConversationDeals = [];
    state.favorites = [];
    state.favoriteProductIds = [];
    state.cart = null;
    state.orders = [];
    state.activeOrder = null;
    state.notifications = [];
    state.supportConversation = null;
    refreshNavBadges();
    showView("home");
  });

  navProfileBtn?.addEventListener("click", () => {
    fillProfileFormFromUser();
    showView("profile");
  });

  navDashboardBtn?.addEventListener("click", async () => {
    if (state.user?.role !== "seller") {
      if (typeof window.navigateTo === "function") {
        await window.navigateTo(state.user?.role === "buyer" ? "/orders" : "/profile");
      }
      return;
    }
    await loadDashboard();
    showView("dashboard");
  });

  navMessagesBtn?.addEventListener("click", async () => {
    await loadMessages();
    showView("messages");
  });

  navNotificationsBtn?.addEventListener("click", async () => {
    await loadNotifications();
    showView("notifications");
  });

  navFavoritesBtn?.addEventListener("click", async () => {
    await loadFavorites();
    showView("favorites");
  });

  navCartBtn?.addEventListener("click", async () => {
    await loadCart();
    showView("cart");
  });

  navOrdersBtn?.addEventListener("click", async () => {
    await loadOrders();
    showView("orders");
  });

  navAdminBtn?.addEventListener("click", () => {
    if (state.user?.role === "admin") {
      window.location.href = "/admin";
    } else {
      showToast("هذه الصفحة مخصصة لحساب الأدمن فقط");
    }
  });

  navAddProductBtn?.addEventListener("click", () => {
    openModal(productFormModal);
  });

  document.getElementById("openAddProductFromDashboard")?.addEventListener("click", () => {
    openModal(productFormModal);
  });

  document.getElementById("refreshConversationsBtn")?.addEventListener("click", async () => {
    await loadConversationsView();
  });

  document.getElementById("refreshFavoritesBtn")?.addEventListener("click", async () => {
    await loadFavorites();
  });

  document.getElementById("refreshCartBtn")?.addEventListener("click", async () => {
    await loadCart();
  });

  productBackBtn?.addEventListener("click", () => {
    if (typeof window.navigateTo === "function") {
      window.navigateTo(state.currentCatalogProducts?.length ? "/" : "/");
      return;
    }
    if (state.currentCatalogProducts?.length) {
      showView("catalog");
      return;
    }
    showView("home");
  });

  checkoutBackBtn?.addEventListener("click", () => {
    showView("cart");
  });

  document.getElementById("clearCartBtn")?.addEventListener("click", async () => {
    await clearCart();
  });

  document.getElementById("submitCartOrderBtn")?.addEventListener("click", async () => {
    await openCheckoutView();
  });

  confirmCheckoutBtn?.addEventListener("click", async () => {
    await submitOrderFromCart(checkoutNotes?.value || "");
  });

  document.getElementById("refreshOrdersBtn")?.addEventListener("click", async () => {
    await loadOrders();
  });
  document.getElementById("refreshNotificationsBtn")?.addEventListener("click", async () => {
    await loadNotifications();
  });
  document.getElementById("markAllNotificationsBtn")?.addEventListener("click", async () => {
    try {
      await api("/api/notifications/read-all", { method: "POST", body: JSON.stringify({}) });
      await loadNotifications();
    } catch (error) {
      showToast(error.message);
    }
  });

  document.getElementById("conversationQuickSearch")?.addEventListener("input", () => {
    renderConversationsList(state.conversations, state.activeConversationId);
  });

  mobileConversationToggle?.addEventListener("click", () => {
    setMobileConversationPickerOpen(!state.mobileConversationsOpen);
  });

  document.addEventListener("click", (event) => {
    if (!state.mobileConversationsOpen || !mobileConversationPicker) return;
    if (!mobileConversationPicker.contains(event.target)) {
      setMobileConversationPickerOpen(false);
    }
  });

  document.getElementById("refreshAdminUsers")?.addEventListener("click", async () => {
    await loadInlineAdmin();
  });

  document.getElementById("refreshAdminProducts")?.addEventListener("click", async () => {
    await loadInlineAdmin();
  });

  closeReportModal?.addEventListener("click", () => closeModal(reportModal));
  reportModal?.addEventListener("click", (e) => {
    if (e.target === reportModal) closeModal(reportModal);
  });

  loginForm?.addEventListener("submit", handleLoginSubmit);
  registerForm?.addEventListener("submit", handleRegisterSubmit);
  profileForm?.addEventListener("submit", handleProfileSubmit);
  avatarForm?.addEventListener("submit", handleAvatarSubmit);
  addProductForm?.addEventListener("submit", handleAddProductSubmit);
  reportForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!state.reportDraft) return;

    try {
      await api("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          productId: state.reportDraft.productId || null,
          conversationId: state.reportDraft.conversationId || null,
          reportedUserId: state.reportDraft.reportedUserId || null,
          reason: document.getElementById("reportReason")?.value || "",
          details: document.getElementById("reportDetails")?.value?.trim() || ""
        })
      });
      closeModal(reportModal);
      state.reportDraft = null;
      showToast("تم إرسال البلاغ إلى الإدارة");
    } catch (error) {
      showToast(error.message);
    }
  });

  supportFloatingBtn?.addEventListener("click", async () => {
    if (!state.user) {
      showToast("يجب تسجيل الدخول أولاً للتواصل مع الدعم");
      showView("auth");
      return;
    }
    supportWidget?.classList.toggle("hidden");
    if (!supportWidget?.classList.contains("hidden")) {
      await loadSupportConversation();
    }
  });
  closeSupportWidgetBtn?.addEventListener("click", () => supportWidget?.classList.add("hidden"));
  sendSupportMessageBtn?.addEventListener("click", () => sendSupportMessage());
  supportMessageInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendSupportMessage();
    }
  });
  document.querySelectorAll("[data-support-quick]").forEach((btn) => {
    btn.addEventListener("click", () => sendQuickSupportMessage(btn.dataset.supportQuick));
  });
  document.querySelectorAll("[data-content-key]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      openSiteContent(link.dataset.contentKey);
    });
  });
}

function renderConversationsList(conversations, activeConversationId = null) {
  const listEl = document.getElementById("conversationsList");
  if (!listEl) return;

  const searchValue = String(document.getElementById("conversationQuickSearch")?.value || "").trim().toLowerCase();
  const source = Array.isArray(conversations) ? conversations : [];
  const filtered = searchValue
    ? source.filter((conversation) => {
        const haystack = [
          conversation.product?.name,
          conversation.lastMessage,
          conversation.seller?.storeName,
          conversation.seller?.fullName,
          conversation.buyer?.fullName
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(searchValue);
      })
    : source;

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="conversation-list-empty">
        <div class="conversation-list-empty-icon">+</div>
        <div class="conversation-empty-title">${searchValue ? "لا توجد نتائج مطابقة" : "لا توجد محادثات بعد"}</div>
        <div class="conversation-empty-text">${searchValue ? "جرّب كلمة مختلفة أو امسح البحث لعرض كل المحادثات." : "ستظهر هنا الرسائل المرتبطة بمنتجاتك وطلباتك بشكل أوضح."}</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.map((conversation) => {
    const otherPartyName = state.user?.role === "seller"
      ? (conversation.buyer?.fullName || "مستخدم")
      : (conversation.seller?.storeName || conversation.seller?.fullName || "متجر");
    const initial = String(otherPartyName || "م").slice(0, 1);
    return `
      <button class="conversation-entry conversation-card ${activeConversationId === conversation.id ? "is-active active" : ""}" data-open-conversation="${conversation.id}" type="button">
        <div class="conversation-avatar conversation-avatar-pro">${escapeHtml(initial)}</div>
        <div class="conversation-card-body">
          <div class="conversation-row-top">
            <div class="conversation-row-name">${escapeHtml(otherPartyName)}</div>
            <div class="conversation-row-time">${conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleDateString("ar") : ""}</div>
          </div>
          <div class="conversation-row-product">
            <span class="conversation-product-chip">${escapeHtml(formatConversationType(conversation.conversationType))}</span>
            <strong>${escapeHtml(conversation.product?.name || "بدون منتج")}</strong>
          </div>
          <div class="conversation-row-last">${escapeHtml(conversation.lastMessage || "لا توجد رسائل بعد")}</div>
          <div class="conversation-card-footer">
            <div class="conversation-row-status ${getConversationStatusClass(conversation.status)}">${formatConversationStatus(conversation.status)}</div>
            <div class="conversation-meta-note">${conversation.lastMessageAt ? new Date(conversation.lastMessageAt).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }) : "بدون تحديث"}</div>
          </div>
        </div>
      </button>
    `;
  }).join("");

  listEl.querySelectorAll("[data-open-conversation]").forEach((item) => {
    item.addEventListener("click", async (event) => {
      if (typeof window.navigateTo === "function") {
        event.preventDefault();
        await window.navigateTo(`/conversation/${Number(item.dataset.openConversation)}`);
        return;
      }
      openConversation(Number(item.dataset.openConversation));
    });
  });
}

function renderSupportConversation() {
  if (!supportMessagesList) return;
  const conversation = state.supportConversation || null;
  const messages = conversation?.messages || [];
  const statusText = formatSupportStatus(conversation?.status || "open");
  const statusClass = getSupportStatusClass(conversation?.status || "open");

  if (!messages.length) {
    supportMessagesList.innerHTML = `
      <div class="support-empty-state">
        <div class="support-empty-icon">+</div>
        <strong>ابدأ المحادثة مع الدعم الفني</strong>
        <p>اكتب رسالتك هنا أو استخدم إحدى الرسائل الجاهزة وسنرد عليك داخل نفس النافذة.</p>
      </div>
    `;
    return;
  }

  supportMessagesList.innerHTML = `
    <div class="support-conversation-banner ${statusClass}">
      <div>
        <strong>حالة المحادثة: ${escapeHtml(statusText)}</strong>
        <div class="muted">تتم متابعة الرسائل هنا بشكل مباشر ومنظم.</div>
      </div>
      <span class="support-status-pill ${statusClass}">${escapeHtml(statusText)}</span>
    </div>
    ${messages.map((item) => `
      <div class="support-message-bubble ${item.senderRole === "admin" ? "is-admin" : "is-user"}">
        <div class="support-message-meta">${escapeHtml(item.senderName || "")}</div>
        <div class="support-message-text">${escapeHtml(item.body || "")}</div>
        <div class="support-message-time">${item.createdAt ? new Date(item.createdAt).toLocaleString("ar") : ""}</div>
      </div>
    `).join("")}
  `;
  supportMessagesList.scrollTop = supportMessagesList.scrollHeight;
}

async function loadSupportConversation() {
  if (!state.user) return;
  try {
    if (supportMessagesList) {
      supportMessagesList.innerHTML = `<div class="support-loading-state">جارٍ تحميل محادثة الدعم...</div>`;
    }
    const data = await api("/api/support/conversation");
    state.supportConversation = data.conversation || null;
    renderSupportConversation();
  } catch (error) {
    if (supportMessagesList) {
      supportMessagesList.innerHTML = `<div class="support-error-state">تعذر تحميل محادثة الدعم الآن.</div>`;
    }
    showToast(error.message);
  }
}

async function loadMessages() {
  if (!state.user) return;
  try {
    const data = await api("/api/conversations");
    state.conversations = data.conversations || [];
    renderConversationsList(state.conversations, state.activeConversationId);
    if (state.selectedConversationId) {
      await openConversation(state.selectedConversationId);
    } else {
      renderConversationDetails(null);
    }
  } catch (error) {
    renderConversationsList([], null);
    renderConversationDetails(null);
    showToast(error.message);
  }
}

async function bootstrap() {
  refreshNav();
  bindStaticEvents();
  await loadSiteAppearance();
  await restoreSession();
  await loadMeta();
  await loadProducts();

  if (state.user) {
    fillProfileFormFromUser();
    await loadMessages();
    await loadNotifications();
    await loadFavorites();
    await loadCart();
    await loadOrders();
    await loadSupportConversation();
  }

  if (state.user?.role === "seller") {
    await loadDashboard();
  }

  showView("home");
}

const bootstrapPromise = bootstrap().catch((error) => {
  console.error(error);
  showToast("حدث خطأ أثناء تحميل الصفحة");
});
function productCardHtml(product) {
  const sellerName = escapeHtml(product.seller.storeName || product.seller.fullName || "");
  const favoriteActive = isFavoriteProduct(product.id);
  const detailPath = `/product/${product.id}`;
  const detailAction = `<a class="product-detail-link" href="${detailPath}" data-route="${detailPath}" aria-label="عرض التفاصيل" title="عرض التفاصيل">👁</a>`;
  const productImage = product.image
    ? `<div class="product-image product-image-wrap"><button class="favorite-fab ${favoriteActive ? "is-active-favorite" : ""}" data-toggle-favorite="${product.id}" type="button" aria-label="${favoriteActive ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}">${favoriteActive ? "♥" : "♡"}</button>${detailAction}<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" /></div>`
    : `<div class="product-image product-image-placeholder product-image-wrap"><button class="favorite-fab ${favoriteActive ? "is-active-favorite" : ""}" data-toggle-favorite="${product.id}" type="button" aria-label="${favoriteActive ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}">${favoriteActive ? "♥" : "♡"}</button>${detailAction}</div>`;

  let conditionClass = "";
  if (product.condition === "جديد") conditionClass = "condition-new";
  else if (product.condition === "مستعمل كالجديد") conditionClass = "condition-like-new";
  else if (product.condition === "مستعمل بحالة جيدة") conditionClass = "condition-used-good";

  const canMessage = state.user && state.user.role !== "seller";

  return `
    <article class="product-card auction-card product-card-refined">
      ${product.condition ? `<div class="condition-ribbon ${conditionClass}">${escapeHtml(product.condition)}</div>` : ""}
      ${productImage}
      <div class="product-body product-body-pro">
        <div class="product-title" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</div>
        <div class="product-price product-price-centered product-price-hero">${formatPrice(product.price, product.currency)}</div>
        <div class="product-meta-grid pro-meta-grid">
          <span class="product-region-badge region-pill">
            <span class="region-icon" aria-hidden="true">📍</span>
            ${escapeHtml(product.region)}
          </span>
          <span class="views-badge compact-pill">
            <span class="views-icon" aria-hidden="true">👁</span>
            <span>${product.viewsCount}</span>
          </span>
        </div>
        <div class="product-store-block product-store-block-pro">
          <a class="store-link store-link-pro" href="/seller/${product.seller.id}" data-route="/seller/${product.seller.id}" data-open-seller="${product.seller.id}">${sellerName}</a>
          <div class="store-rating store-rating-pro">
            <span class="star-icon" aria-hidden="true">★</span>
            ${product.seller.averageRating.toFixed(1)}
            <span class="rating-count">(${product.seller.ratingsCount})</span>
          </div>
        </div>
        ${deliveryIndicatorHtml(product, "product-delivery-pill")}
        <div class="product-quick-actions">
          <button class="icon-action-button" data-add-cart="${product.id}" type="button" aria-label="أضف إلى السلة" title="أضف إلى السلة">
            <span aria-hidden="true">🛒</span>
          </button>
          <button class="icon-action-button" data-report-product="${product.id}" type="button" aria-label="إرسال بلاغ" title="إرسال بلاغ">
            <span aria-hidden="true">⚑</span>
          </button>
        </div>
      </div>
    </article>
  `;
}

// Final override for the storefront card: one clear CTA only.
function productCardHtml(product) {
  const sellerName = escapeHtml(product.seller.storeName || product.seller.fullName || "");
  const favoriteActive = isFavoriteProduct(product.id);
  const detailPath = `/product/${product.id}`;
  const deliveryAvailable = Boolean(product.hasDeliveryService);
  const productImage = product.image
    ? `<div class="product-image product-image-wrap"><button class="favorite-fab ${favoriteActive ? "is-active-favorite" : ""}" data-toggle-favorite="${product.id}" type="button" aria-label="${favoriteActive ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}">${favoriteActive ? "♥" : "♡"}</button><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" /></div>`
    : `<div class="product-image product-image-placeholder product-image-wrap"><button class="favorite-fab ${favoriteActive ? "is-active-favorite" : ""}" data-toggle-favorite="${product.id}" type="button" aria-label="${favoriteActive ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}">${favoriteActive ? "♥" : "♡"}</button></div>`;

  let conditionClass = "";
  if (product.condition === "جديد") conditionClass = "condition-new";
  else if (product.condition === "مستعمل كالجديد") conditionClass = "condition-like-new";
  else if (product.condition === "مستعمل بحالة جيدة") conditionClass = "condition-used-good";

  return `
    <article class="product-card auction-card product-card-refined">
      ${product.condition ? `<div class="condition-ribbon ${conditionClass}">${escapeHtml(product.condition)}</div>` : ""}
      ${productImage}
      <div class="product-body product-body-pro">
        <div class="product-title product-title-compact" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</div>
        <div class="product-info-stack">
          <div class="product-info-row">
            <div class="product-price product-price-inline">${formatPrice(product.price, product.currency)}</div>
            <button class="product-delivery-icon ${deliveryAvailable ? "is-available" : "is-unavailable"}" data-delivery-info="${deliveryAvailable ? "available" : "unavailable"}" type="button" aria-label="${deliveryAvailable ? "التوصيل متاح" : "التوصيل غير متاح"}" title="${deliveryAvailable ? "التوصيل متاح" : "التوصيل غير متاح"}">🚚</button>
          </div>
          <div class="product-info-row product-info-row-muted">
            <div class="product-location-text">📍 ${escapeHtml(product.region)}</div>
            <div class="product-views-text">👁 ${product.viewsCount}</div>
          </div>
          <div class="product-info-row">
            <a class="store-link store-link-pro product-store-inline" href="/seller/${product.seller.id}" data-route="/seller/${product.seller.id}" data-open-seller="${product.seller.id}" title="${sellerName}">${sellerName}</a>
            <div class="product-rating-inline"><span class="product-rating-star">★</span> ${product.seller.averageRating.toFixed(1)} <span class="rating-count">(${product.seller.ratingsCount})</span></div>
          </div>
        </div>
        <div class="product-card-bottom-actions product-card-bottom-actions-wide">
          <a class="product-inline-action product-inline-action-wide" href="${detailPath}" data-route="${detailPath}">التفاصيل</a>
        </div>
      </div>
    </article>
  `;
}

function productCardHtml(product) {
  const sellerName = escapeHtml(product.seller.storeName || product.seller.fullName || "");
  const favoriteActive = isFavoriteProduct(product.id);
  const detailPath = `/product/${product.id}`;
  const deliveryAvailable = Boolean(product.hasDeliveryService);
  const productImage = product.image
    ? `<div class="product-image product-image-wrap"><button class="favorite-fab ${favoriteActive ? "is-active-favorite" : ""}" data-toggle-favorite="${product.id}" type="button" aria-label="${favoriteActive ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}">${favoriteActive ? "♥" : "♡"}</button><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" /></div>`
    : `<div class="product-image product-image-placeholder product-image-wrap"><button class="favorite-fab ${favoriteActive ? "is-active-favorite" : ""}" data-toggle-favorite="${product.id}" type="button" aria-label="${favoriteActive ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}">${favoriteActive ? "♥" : "♡"}</button></div>`;

  let conditionClass = "";
  if (product.condition === "جديد") conditionClass = "condition-new";
  else if (product.condition === "مستعمل كالجديد") conditionClass = "condition-like-new";
  else if (product.condition === "مستعمل بحالة جيدة") conditionClass = "condition-used-good";

  return `
    <article class="product-card auction-card product-card-refined">
      ${product.condition ? `<div class="condition-ribbon ${conditionClass}">${escapeHtml(product.condition)}</div>` : ""}
      ${productImage}
      <div class="product-body product-body-pro">
        <div class="product-title product-title-compact" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</div>
        <div class="product-info-stack">
          <div class="product-info-row">
            <div class="product-price product-price-inline">${formatPrice(product.price, product.currency)}</div>
            <button class="product-delivery-icon ${deliveryAvailable ? "is-available" : "is-unavailable"}" data-delivery-info="${deliveryAvailable ? "available" : "unavailable"}" type="button" aria-label="${deliveryAvailable ? "التوصيل متاح" : "التوصيل غير متاح"}" title="${deliveryAvailable ? "التوصيل متاح" : "التوصيل غير متاح"}">🚚</button>
          </div>
          <div class="product-info-row product-info-row-muted">
            <div class="product-location-text">📍 ${escapeHtml(product.region)}</div>
            <div class="product-views-text">👁 ${product.viewsCount}</div>
          </div>
          <div class="product-info-row">
            <a class="store-link store-link-pro product-store-inline" href="/seller/${product.seller.id}" data-route="/seller/${product.seller.id}" data-open-seller="${product.seller.id}" title="${sellerName}">${sellerName}</a>
            <div class="product-rating-inline"><span class="product-rating-star">★</span> ${product.seller.averageRating.toFixed(1)} <span class="rating-count">(${product.seller.ratingsCount})</span></div>
          </div>
        </div>
        <div class="product-card-bottom-actions product-card-bottom-actions-wide">
          <a class="product-inline-action product-inline-action-wide" href="${detailPath}" data-route="${detailPath}">التفاصيل</a>
        </div>
      </div>
    </article>
  `;
}

function renderCart() {
  if (!cartItemsList || !cartSummaryPanel) return;

  const cart = state.cart;
  const items = cart?.items || [];

  if (!items.length) {
    setSoftEmpty(cartItemsList, "السلة فارغة حالياً.");
    cartSummaryPanel.innerHTML = `<div class="soft-empty">أضف منتجات من صفحة التفاصيل لبدء الطلب.</div>`;
    return;
  }

  cartItemsList.innerHTML = items.map((item) => `
    <div class="list-item cart-item-card">
      <div class="cart-item-head">
        <div class="cart-item-main">
          ${item.product?.image ? `<img class="cart-item-image" src="${escapeHtml(item.product.image)}" alt="${escapeHtml(item.product.name || "")}">` : `<div class="cart-item-image placeholder"></div>`}
          <div class="cart-item-copy">
            <strong>${escapeHtml(item.product?.name || "")}</strong>
            <div class="muted">البائع: ${escapeHtml(item.seller?.storeName || item.seller?.fullName || "")}</div>
            ${deliveryIndicatorHtml(item.product, "cart-delivery-pill")}
            <div class="cart-meta-row">
              <span class="muted">سعر الوحدة: ${formatPrice(item.snapshotPrice, item.product?.currency || "ل.س")}</span>
              <span class="muted">الإجمالي الفرعي: ${formatPrice(item.lineTotal || 0, item.product?.currency || "ل.س")}</span>
            </div>
          </div>
        </div>
        <div class="cart-item-side">
          <div class="summary-line compact">
            <span>الكمية الحالية</span>
            <strong>${item.quantity}</strong>
          </div>
        </div>
      </div>
      <div class="cart-item-actions">
        <div class="cart-qty-stepper" aria-label="تحديد كمية المنتج">
          <button class="cart-qty-btn" data-cart-qty-step="-1" data-cart-item="${item.cartItemId}" type="button" aria-label="تقليل الكمية">-</button>
          <input class="field cart-qty-input" data-cart-qty="${item.cartItemId}" type="number" min="1" value="${item.quantity}">
          <button class="cart-qty-btn" data-cart-qty-step="1" data-cart-item="${item.cartItemId}" type="button" aria-label="زيادة الكمية">+</button>
        </div>
        <button class="btn btn-outline" data-cart-remove="${item.cartItemId}" type="button">حذف العنصر</button>
      </div>
    </div>
  `).join("");

  cartSummaryPanel.innerHTML = `
    <div class="summary-box cart-summary-box">
      <div class="summary-line"><span>إجمالي العناصر</span><strong>${cart.totals?.quantity || 0}</strong></div>
      <div class="summary-line"><span>عدد المنتجات</span><strong>${cart.totals?.itemsCount || 0}</strong></div>
      <div class="summary-line"><span>الإجمالي</span><strong>${formatPrice(cart.totals?.amount || 0, "ل.س")}</strong></div>
      <div class="summary-line"><span>حالة السلة</span><strong>${escapeHtml(cart.status || "active")}</strong></div>
    </div>
  `;

  const normalizeCartQuantity = (itemId, nextValue) => {
    const qtyInput = cartItemsList.querySelector(`[data-cart-qty="${itemId}"]`);
    if (!qtyInput) return 1;
    let safeValue = Number(nextValue ?? qtyInput.value ?? 1);
    if (!Number.isFinite(safeValue)) safeValue = 1;
    safeValue = Math.max(1, Math.round(safeValue));
    qtyInput.value = String(safeValue);
    return safeValue;
  };

  cartItemsList.querySelectorAll("[data-cart-qty-step]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const itemId = Number(btn.dataset.cartItem);
      const delta = Number(btn.dataset.cartQtyStep || 0);
      const currentValue = normalizeCartQuantity(itemId);
      const nextQuantity = normalizeCartQuantity(itemId, currentValue + delta);
      await updateCartItem(itemId, nextQuantity);
    });
  });

  cartItemsList.querySelectorAll("[data-cart-qty]").forEach((input) => {
    input.addEventListener("change", async () => {
      const itemId = Number(input.dataset.cartQty);
      const nextQuantity = normalizeCartQuantity(itemId, input.value);
      await updateCartItem(itemId, nextQuantity);
    });
  });

  cartItemsList.querySelectorAll("[data-cart-remove]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await removeCartItem(Number(btn.dataset.cartRemove));
    });
  });
}

function productCardHtml(product) {
  const sellerName = escapeHtml(product.seller.storeName || product.seller.fullName || "");
  const favoriteActive = isFavoriteProduct(product.id);
  const detailPath = `/product/${product.id}`;
  const deliveryAvailable = Boolean(product.hasDeliveryService);
  const productImage = product.image
    ? `<div class="product-image product-image-wrap"><button class="favorite-fab ${favoriteActive ? "is-active-favorite" : ""}" data-toggle-favorite="${product.id}" type="button" aria-label="${favoriteActive ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}">${favoriteActive ? "♥" : "♡"}</button><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy" /></div>`
    : `<div class="product-image product-image-placeholder product-image-wrap"><button class="favorite-fab ${favoriteActive ? "is-active-favorite" : ""}" data-toggle-favorite="${product.id}" type="button" aria-label="${favoriteActive ? "إزالة من المفضلة" : "إضافة إلى المفضلة"}">${favoriteActive ? "♥" : "♡"}</button></div>`;

  let conditionClass = "";
  if (product.condition === "جديد") conditionClass = "condition-new";
  else if (product.condition === "مستعمل كالجديد") conditionClass = "condition-like-new";
  else if (product.condition === "مستعمل بحالة جيدة") conditionClass = "condition-used-good";

  return `
    <article class="product-card auction-card product-card-refined">
      ${product.condition ? `<div class="condition-ribbon ${conditionClass}">${escapeHtml(product.condition)}</div>` : ""}
      ${productImage}
      <div class="product-body product-body-pro">
        <div class="product-title product-title-compact" title="${escapeHtml(product.name)}">${escapeHtml(product.name)}</div>
        <div class="product-info-stack">
          <div class="product-info-row">
            <div class="product-price product-price-inline">${formatPrice(product.price, product.currency)}</div>
            <button class="product-delivery-icon ${deliveryAvailable ? "is-available" : "is-unavailable"}" data-delivery-info="${deliveryAvailable ? "available" : "unavailable"}" type="button" aria-label="${deliveryAvailable ? "التوصيل متاح" : "التوصيل غير متاح"}" title="${deliveryAvailable ? "التوصيل متاح" : "التوصيل غير متاح"}">🚚</button>
          </div>
          <div class="product-info-row product-info-row-muted">
            <div class="product-location-text">📍 ${escapeHtml(product.region)}</div>
            <div class="product-views-text">👁 ${product.viewsCount}</div>
          </div>
          <div class="product-info-row">
            <a class="store-link store-link-pro product-store-inline" href="/seller/${product.seller.id}" data-route="/seller/${product.seller.id}" data-open-seller="${product.seller.id}" title="${sellerName}">${sellerName}</a>
            <div class="product-rating-inline"><span class="product-rating-star">★</span> ${product.seller.averageRating.toFixed(1)} <span class="rating-count">(${product.seller.ratingsCount})</span></div>
          </div>
        </div>
        <div class="product-card-bottom-actions product-card-bottom-actions-wide">
          <a class="product-inline-action product-inline-action-wide" href="${detailPath}" data-route="${detailPath}">التفاصيل</a>
        </div>
      </div>
    </article>
  `;
}

window.marketplaceApp = {
  state,
  showView,
  loadProducts,
  loadFavorites,
  loadCart,
  loadOrders,
  loadMessages,
  loadOrderDetails,
  openConversation,
  openProductPage,
  openProductModal,
  openSellerPage,
  fillProfileFormFromUser,
  loadDashboard,
  closeProductModal() {
    closeModal(productModal);
  },
  isAuthenticated() {
    return Boolean(state.user);
  },
  isSeller() {
    return state.user?.role === "seller";
  },
  isBuyer() {
    return state.user?.role === "buyer";
  }
};

window.marketplaceApp.ready = bootstrapPromise;
bootstrapPromise.finally(() => {
  window.dispatchEvent(new CustomEvent("marketplace:ready"));
});

function ensureSecurityUi() {
  state.securityChallenges = state.securityChallenges || {};

  const injectChallenge = (formId, afterInputId, promptId, answerId) => {
    const form = document.getElementById(formId);
    const afterInput = document.getElementById(afterInputId);
    if (!form || !afterInput || document.getElementById(promptId)) return;
    const wrapper = document.createElement("div");
    wrapper.className = "security-challenge-box";
    wrapper.innerHTML = `
      <div id="${promptId}" class="security-challenge-prompt">جارٍ تحميل سؤال التحقق...</div>
      <input class="field" id="${answerId}" placeholder="اكتب ناتج السؤال" required />
    `;
    afterInput.insertAdjacentElement("afterend", wrapper);
  };

  injectChallenge("loginForm", "loginPassword", "loginChallengePrompt", "loginChallengeAnswer");
  injectChallenge("registerForm", "registerPassword", "registerChallengePrompt", "registerChallengeAnswer");

  if (!document.getElementById("verificationModal")) {
    const modal = document.createElement("div");
    modal.className = "modal";
    modal.id = "verificationModal";
    modal.innerHTML = `
      <div class="modal-content small-modal">
        <div class="modal-header">
          <h2>تحقق الحساب</h2>
          <button class="icon-btn" id="closeVerificationModal" type="button">×</button>
        </div>
        <div class="verification-modal-body">
          <div id="verificationStatusBox" class="verification-status-box">جارٍ تحميل حالة التحقق...</div>
          <select id="verificationChannel" class="field">
            <option value="phone">رسالة هاتف</option>
            <option value="email">بريد إلكتروني</option>
            <option value="whatsapp">واتساب</option>
          </select>
          <div class="verification-action-row">
            <button id="requestVerificationCodeBtn" class="btn btn-light" type="button">إرسال رمز التحقق</button>
          </div>
          <input id="verificationCodeInput" class="field" placeholder="أدخل رمز التحقق" />
          <div class="verification-action-row">
            <button id="submitVerificationCodeBtn" class="btn btn-primary" type="button">تأكيد الرمز</button>
          </div>
          <div id="verificationHintBox" class="mini-note hidden"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
  }
}

async function refreshSecurityChallenge(scope) {
  try {
    const data = await api(`/api/security/challenge?scope=${encodeURIComponent(scope)}`);
    state.securityChallenges = state.securityChallenges || {};
    state.securityChallenges[scope] = data;
    const promptEl = document.getElementById(`${scope}ChallengePrompt`);
    if (promptEl) {
      promptEl.textContent = data.prompt || "أجب عن السؤال للمتابعة";
    }
  } catch (_error) {
    const promptEl = document.getElementById(`${scope}ChallengePrompt`);
    if (promptEl) promptEl.textContent = "تعذر تحميل سؤال التحقق. حدّث الصفحة.";
  }
}

function openVerificationModal() {
  openModal(document.getElementById("verificationModal"));
}

function closeVerificationModalUi() {
  closeModal(document.getElementById("verificationModal"));
}

function renderVerificationStatus(verification) {
  const statusBox = document.getElementById("verificationStatusBox");
  const channelSelect = document.getElementById("verificationChannel");
  if (!statusBox || !verification) return;

  statusBox.innerHTML = `
    <div><strong>حالة الحساب:</strong> ${escapeHtml(verification.verificationStatus || "unverified")}</div>
    <div>البريد: ${verification.isEmailVerified ? "تم التحقق" : "غير متحقق"}</div>
    <div>الهاتف: ${verification.isPhoneVerified ? "تم التحقق" : "غير متحقق"}</div>
  `;

  if (channelSelect) {
    if (!verification.email) {
      const emailOption = channelSelect.querySelector('option[value="email"]');
      if (emailOption) emailOption.disabled = true;
    }
    channelSelect.value = verification.phone ? "phone" : (verification.email ? "email" : "whatsapp");
  }
}

async function loadVerificationStatus() {
  if (!state.user) return;
  try {
    const data = await api("/api/auth/verification-status");
    state.verification = data.verification || null;
    if (state.verification && state.verification.verificationEnabled === false) {
      closeVerificationModalUi();
      return;
    }
    renderVerificationStatus(state.verification);

    const shouldPrompt = state.verification &&
      !state.verification.isPhoneVerified &&
      !state.verification.isEmailVerified;
    if (shouldPrompt) openVerificationModal();
  } catch (_error) {
  }
}

async function requestVerificationCode() {
  const channel = document.getElementById("verificationChannel")?.value || "phone";
  const hintBox = document.getElementById("verificationHintBox");
  if (state.verification && state.verification.verificationEnabled === false) {
    showToast("ميزة التحقق بالرمز موقوفة مؤقتا");
    return;
  }
  try {
    const data = await api("/api/auth/verification/request", {
      method: "POST",
      body: JSON.stringify({ channel })
    });
    if (hintBox) {
      hintBox.classList.remove("hidden");
      hintBox.innerHTML = `
        <div>تم إرسال الرمز إلى: ${escapeHtml(data.delivery?.destination || "-")}</div>
        ${data.delivery?.previewCode ? `<div><strong>رمز التطوير:</strong> ${escapeHtml(data.delivery.previewCode)}</div>` : ""}
      `;
    }
    showToast("تم إنشاء رمز التحقق بنجاح");
  } catch (error) {
    showToast(error.message);
  }
}

async function submitVerificationCode() {
  const channel = document.getElementById("verificationChannel")?.value || "phone";
  const code = document.getElementById("verificationCodeInput")?.value?.trim() || "";
  if (state.verification && state.verification.verificationEnabled === false) {
    showToast("ميزة التحقق بالرمز موقوفة مؤقتا");
    closeVerificationModalUi();
    return;
  }
  if (!code) {
    showToast("أدخل رمز التحقق أولاً");
    return;
  }
  try {
    const data = await api("/api/auth/verification/confirm", {
      method: "POST",
      body: JSON.stringify({ channel, code })
    });
    setAuth({ token: state.token, user: data.user });
    state.verification = data.verification || null;
    renderVerificationStatus(state.verification);
    showToast("تم تأكيد التحقق بنجاح");
    if (state.verification?.isPhoneVerified || state.verification?.isEmailVerified) {
      closeVerificationModalUi();
    }
  } catch (error) {
    showToast(error.message);
  }
}

async function handleSecureLoginSubmit(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  const submissionKey = "login";
  const submitButton = getFormSubmitButton(event, loginForm);

  const identifier = document.getElementById("loginIdentifier")?.value?.trim() || "";
  const password = document.getElementById("loginPassword")?.value || "";
  const challengeAnswer = document.getElementById("loginChallengeAnswer")?.value?.trim() || "";

  if (!identifier || !password || !challengeAnswer) {
    showToast("يرجى إكمال بيانات الدخول وسؤال التحقق");
    return;
  }

  if (!beginSubmission(submissionKey)) return;
  const restoreUi = setSubmittingUi(submitButton, { loadingText: "جارٍ تسجيل الدخول..." });

  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        identifier,
        password,
        challengeId: state.securityChallenges?.login?.challengeId,
        challengeAnswer
      })
    });

    setAuth(data);
    await afterAuthLoad();
    await loadNotifications();
    await loadVerificationStatus();
    document.getElementById("loginChallengeAnswer") && (document.getElementById("loginChallengeAnswer").value = "");
    await refreshSecurityChallenge("login");
    showView(state.user?.role === "seller" ? "dashboard" : "home");
    showToast("تم تسجيل الدخول بنجاح");
  } catch (error) {
    await refreshSecurityChallenge("login");
    showToast(error.message || "فشل تسجيل الدخول");
  } finally {
    restoreUi();
    endSubmission(submissionKey);
  }
}

async function handleSecureRegisterSubmit(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  const submissionKey = "register";
  const submitButton = getFormSubmitButton(event, registerForm);

  const payload = {
    role: document.getElementById("registerRole")?.value || "buyer",
    fullName: document.getElementById("registerFullName")?.value?.trim() || "",
    storeName: document.getElementById("registerStoreName")?.value?.trim() || "",
    phone: document.getElementById("registerPhone")?.value?.trim() || "",
    email: document.getElementById("registerEmail")?.value?.trim() || "",
    region: document.getElementById("registerRegion")?.value?.trim() || "",
    password: document.getElementById("registerPassword")?.value || "",
    profileDescription: document.getElementById("registerDescription")?.value?.trim() || "",
    challengeId: state.securityChallenges?.register?.challengeId,
    challengeAnswer: document.getElementById("registerChallengeAnswer")?.value?.trim() || ""
  };

  if (!payload.fullName || !payload.phone || !payload.password || !payload.region || !payload.challengeAnswer) {
    showToast("يرجى تعبئة الحقول المطلوبة وسؤال التحقق");
    return;
  }

  if (!beginSubmission(submissionKey)) return;
  const restoreUi = setSubmittingUi(submitButton, { loadingText: "جارٍ إنشاء الحساب..." });

  try {
    const data = await api("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    setAuth(data);
    await afterAuthLoad();
    await loadNotifications();
    await loadVerificationStatus();
    document.getElementById("registerChallengeAnswer") && (document.getElementById("registerChallengeAnswer").value = "");
    await refreshSecurityChallenge("register");
    showToast("تم إنشاء الحساب بنجاح. أكمل التحقق من الحساب.");
    showView("home");
  } catch (error) {
    await refreshSecurityChallenge("register");
    showToast(error.message || "تعذر إنشاء الحساب");
  } finally {
    restoreUi();
    endSubmission(submissionKey);
  }
}

function bindSecurityOverrides() {
  document.addEventListener("submit", (event) => {
    if (event.target?.id === "loginForm") {
      handleSecureLoginSubmit(event);
    }
    if (event.target?.id === "registerForm") {
      handleSecureRegisterSubmit(event);
    }
  }, true);

  document.getElementById("closeVerificationModal")?.addEventListener("click", closeVerificationModalUi);
  document.getElementById("verificationModal")?.addEventListener("click", (event) => {
    if (event.target?.id === "verificationModal") closeVerificationModalUi();
  });
  document.getElementById("requestVerificationCodeBtn")?.addEventListener("click", requestVerificationCode);
  document.getElementById("submitVerificationCodeBtn")?.addEventListener("click", submitVerificationCode);
}

function renderConversationDetails(conversation) {
  if (!conversationDetails) return;

  if (!conversation) {
    conversationDetails.innerHTML = `<div class="conversation-empty-panel whatsapp-empty-panel"><h3>اختر محادثة</h3><p class="muted">ستظهر الرسائل هنا داخل إطار ثابت مع تمرير مستقل للرسائل.</p></div>`;
    return;
  }

  const canReply = conversation.status === "open";
  const counterparty = state.user?.id === conversation.sellerId
    ? (conversation.buyer?.fullName || "مشتري")
    : (conversation.seller?.storeName || conversation.seller?.fullName || "متجر");
  const linkedOrders = Array.isArray(conversation.linkedOrders) ? conversation.linkedOrders : [];

  conversationDetails.innerHTML = `
    <div class="chat-layout whatsapp-chat-layout">
      <div class="chat-header whatsapp-chat-header">
        <div class="chat-person-block">
          <div class="chat-person-avatar">${escapeHtml((counterparty || "م")[0] || "م")}</div>
          <div>
            <h3>${escapeHtml(counterparty)}</h3>
          </div>
        </div>
        <div class="chat-header-meta">
          <span class="chat-chip">${escapeHtml(formatConversationType(conversation.conversationType))}</span>
          <span class="chat-chip">الحالة: ${escapeHtml(formatConversationStatus(conversation.status || ""))}</span>
          <span class="chat-chip light">${escapeHtml(conversation.seller?.storeName || conversation.seller?.fullName || "")}</span>
          <button class="btn btn-light" id="conversationReportBtn" type="button">بلاغ</button>
        </div>
      </div>

      ${linkedOrders.length ? `
        <div class="deal-strip">
          ${linkedOrders.map((order) => `
            <div class="compact-card linked-orders-card">
              <div class="deal-head">
                <div>
                  <strong>طلب شراء #${order.id}</strong>
                  <div class="muted">عدد العناصر: ${order.itemsCount || 0} - الإجمالي: ${formatPrice(order.totalAmount || 0, conversation.product?.currency || "ل.س")}</div>
                </div>
                <span class="deal-status ${getOrderStatusTone(order.status)}">${escapeHtml(formatOrderStatus(order.status))}</span>
              </div>
              <div class="muted">${escapeHtml(getOrderStatusExplanation(order))}</div>
              <div class="deal-actions">
                <button class="btn btn-light" data-open-linked-order="${order.id}" type="button">عرض الطلب</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}

      <div class="chat-thread whatsapp-thread" id="activeChatThread">
        ${renderConversationMessages(conversation.messages || [])}
      </div>

      ${canReply ? `
        <div class="chat-composer whatsapp-composer">
          <div class="chat-input-shell whatsapp-input-shell">
            <input class="field chat-textarea whatsapp-textarea chat-singleline-input" id="conversationMessageInput" type="text" placeholder="اكتب رسالتك" />
            <button class="btn btn-secondary chat-send-inline-btn" id="sendConversationMessageBtn" type="button">إرسال</button>
          </div>
        </div>
      ` : ""}
    </div>
  `;

  document.getElementById("sendConversationMessageBtn")?.addEventListener("click", async () => {
    const input = document.getElementById("conversationMessageInput");
    const message = input?.value?.trim() || "";
    if (!message) {
      showToast("اكتب رسالة أولًا");
      return;
    }

    try {
      await api(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message })
      });
      input.value = "";
      await openConversation(conversation.id);
      await loadMessages();
    } catch (error) {
      showToast(error.message);
    }
  });

  document.getElementById("conversationReportBtn")?.addEventListener("click", async () => {
    await openReportModal({
      conversationId: conversation.id,
      productId: conversation.product?.id,
      productName: conversation.product?.name,
      reportedUserId: conversation.sellerId,
      reportedUserName: conversation.seller?.storeName || conversation.seller?.fullName
    });
  });

  conversationDetails.querySelectorAll("[data-open-linked-order]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (typeof window.navigateTo === "function") {
        await window.navigateTo(`/order/${Number(btn.dataset.openLinkedOrder)}`);
        return;
      }
      showView("orders");
      await loadOrders();
      await loadOrderDetails(Number(btn.dataset.openLinkedOrder));
    });
  });

  const thread = document.getElementById("activeChatThread");
  if (thread) {
    thread.scrollTop = thread.scrollHeight;
  }
}

function renderConversationsList(conversations, activeConversationId = null) {
  const listEl = document.getElementById("conversationsList");
  if (!listEl) return;

  const { filtered, searchValue } = getFilteredConversations(conversations);

  if (!filtered.length) {
    listEl.innerHTML = `
      <div class="conversation-list-empty">
        <div class="conversation-list-empty-icon">+</div>
        <div class="conversation-empty-title">${searchValue ? "لا توجد نتائج مطابقة" : "لا توجد محادثات بعد"}</div>
        <div class="conversation-empty-text">${searchValue ? "جرّب كلمة مختلفة أو امسح البحث لعرض كل المحادثات." : "ستظهر هنا الرسائل المرتبطة بمنتجاتك وطلباتك بشكل أوضح."}</div>
      </div>
    `;
    if (mobileConversationCurrent) mobileConversationCurrent.textContent = searchValue ? "لا توجد نتائج" : "لا توجد محادثات";
    if (mobileConversationsMenu) mobileConversationsMenu.innerHTML = "";
    setMobileConversationPickerOpen(false);
    return;
  }

  listEl.innerHTML = filtered.map((conversation) => createConversationCardMarkup(conversation, activeConversationId)).join("");

  const activeConversation = filtered.find((conversation) => conversation.id === activeConversationId) || filtered[0];
  if (mobileConversationCurrent) {
    mobileConversationCurrent.textContent = activeConversation ? getConversationDisplayName(activeConversation) : "اختر محادثة";
  }

  if (mobileConversationsMenu) {
    mobileConversationsMenu.innerHTML = filtered.map((conversation) => `
      <button class="mobile-conversation-option ${activeConversationId === conversation.id ? "is-active" : ""}" data-open-conversation="${conversation.id}" type="button">
        <strong>${escapeHtml(getConversationDisplayName(conversation))}</strong>
        <span>${escapeHtml(conversation.product?.name || "بدون منتج")}</span>
      </button>
    `).join("");
  }

  const bindOpenConversation = (scope) => {
    scope?.querySelectorAll("[data-open-conversation]").forEach((item) => {
      item.addEventListener("click", async (event) => {
        const conversationId = Number(item.dataset.openConversation);
        setMobileConversationPickerOpen(false);
        if (typeof window.navigateTo === "function") {
          event.preventDefault();
          await window.navigateTo(`/conversation/${conversationId}`);
          return;
        }
        await openConversation(conversationId);
      });
    });
  };

  bindOpenConversation(listEl);
  bindOpenConversation(mobileConversationsMenu);
}

function renderConversationDetails(conversation) {
  if (!conversationDetails) return;

  if (!conversation) {
    conversationDetails.innerHTML = `<div class="conversation-empty-panel whatsapp-empty-panel"><h3>اختر محادثة</h3><p class="muted">ستظهر الرسائل هنا داخل إطار واضح مع تمرير مستقل للرسائل.</p></div>`;
    return;
  }

  const canReply = conversation.status === "open";
  const counterparty = state.user?.id === conversation.sellerId
    ? (conversation.buyer?.fullName || "مشتري")
    : (conversation.seller?.storeName || conversation.seller?.fullName || "متجر");
  const linkedOrders = Array.isArray(conversation.linkedOrders) ? conversation.linkedOrders : [];

  conversationDetails.innerHTML = `
    <div class="chat-layout whatsapp-chat-layout">
      <div class="chat-header whatsapp-chat-header">
        <div class="chat-person-block">
          <div class="chat-person-avatar">${escapeHtml((counterparty || "م")[0] || "م")}</div>
          <div>
            <h3>${escapeHtml(counterparty)}</h3>
            <div class="muted">المنتج: ${escapeHtml(conversation.product?.name || "")}</div>
          </div>
        </div>
        <div class="chat-header-meta">
          <span class="chat-chip">${escapeHtml(formatConversationType(conversation.conversationType))}</span>
          <span class="chat-chip">الحالة: ${escapeHtml(formatConversationStatus(conversation.status || ""))}</span>
          <span class="chat-chip light">${escapeHtml(conversation.seller?.storeName || conversation.seller?.fullName || "")}</span>
          <button class="btn btn-light" id="conversationReportBtn" type="button">بلاغ</button>
        </div>
      </div>

      ${linkedOrders.length ? `
        <div class="deal-strip">
          ${linkedOrders.map((order) => `
            <div class="compact-card linked-orders-card chat-linked-order">
              <div class="deal-head">
                <div class="linked-order-summary">
                  <strong>طلب شراء #${order.id}</strong>
                  <div class="muted">عدد العناصر: ${order.itemsCount || 0} - الإجمالي: ${formatPrice(order.totalAmount || 0, conversation.product?.currency || "ل.س")}</div>
                </div>
                <span class="deal-status ${getOrderStatusTone(order.status)}">${escapeHtml(formatOrderStatus(order.status))}</span>
              </div>
              <div class="deal-actions">
                <button class="btn btn-light" data-open-linked-order="${order.id}" type="button">عرض الطلب</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}

      <div class="chat-thread whatsapp-thread" id="activeChatThread">
        ${renderConversationMessages(conversation.messages || [])}
      </div>

      ${canReply ? `
        <div class="chat-composer whatsapp-composer">
          <div class="chat-input-shell whatsapp-input-shell">
            <input class="field chat-textarea whatsapp-textarea chat-singleline-input" id="conversationMessageInput" type="text" placeholder="اكتب رسالتك" />
            <button class="btn btn-secondary chat-send-inline-btn" id="sendConversationMessageBtn" type="button">إرسال</button>
          </div>
        </div>
      ` : ""}
    </div>
  `;

  const sendConversationMessage = async () => {
    const input = document.getElementById("conversationMessageInput");
    const sendButton = document.getElementById("sendConversationMessageBtn");
    const message = input?.value?.trim() || "";
    if (!message) {
      showToast("اكتب رسالة أولًا");
      return;
    }

    try {
      await api(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message })
      });
      input.value = "";
      await openConversation(conversation.id);
      await loadMessages();
    } catch (error) {
      showToast(error.message || "تعذر إرسال الرسالة");
    }
  };

  document.getElementById("sendConversationMessageBtn")?.addEventListener("click", sendConversationMessage);
  document.getElementById("conversationMessageInput")?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    await sendConversationMessage();
  });

  document.getElementById("conversationReportBtn")?.addEventListener("click", async () => {
    await openReportModal({
      conversationId: conversation.id,
      productId: conversation.product?.id,
      productName: conversation.product?.name,
      reportedUserId: conversation.sellerId,
      reportedUserName: conversation.seller?.storeName || conversation.seller?.fullName
    });
  });

  conversationDetails.querySelectorAll("[data-open-linked-order]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (typeof window.navigateTo === "function") {
        await window.navigateTo(`/order/${Number(btn.dataset.openLinkedOrder)}`);
        return;
      }
      showView("orders");
      await loadOrders();
      await loadOrderDetails(Number(btn.dataset.openLinkedOrder));
    });
  });

  const thread = document.getElementById("activeChatThread");
  if (thread) {
    thread.scrollTop = thread.scrollHeight;
  }
}

bootstrapPromise.finally(async () => {
  ensureSecurityUi();
  bindSecurityOverrides();
  await refreshSecurityChallenge("login");
  await refreshSecurityChallenge("register");
  if (state.user) {
    await loadVerificationStatus();
  }
});

function formatOrderStatus(status) {
  const labels = {
    submitted: "بانتظار رد التاجر",
    seller_confirmed: "مقبول من التاجر",
    buyer_confirmed: "مقبول (مسار قديم)",
    in_preparation: "قيد التنفيذ (مسار قديم)",
    in_transport: "قيد النقل (مسار قديم)",
    cancelled: "مرفوض",
    completed: "مكتمل (مسار قديم)"
  };
  return labels[status] || status || "-";
}

function getOrderStatusExplanation(order) {
  const messages = {
    submitted: "تم إرسال طلب الشراء وهو الآن بانتظار رد التاجر.",
    seller_confirmed: "وافق التاجر على طلب الشراء. تابع التفاصيل من داخل المحادثة المرتبطة بالطلب.",
    buyer_confirmed: "هذا الطلب يتبع مسارًا قديمًا محفوظًا للعرض فقط في النسخة الحالية.",
    in_preparation: "هذا الطلب يتبع مسارًا قديمًا وانتقل إلى مرحلة لاحقة خارج نطاق النسخة الأولى.",
    in_transport: "هذا الطلب يتبع مسارًا قديمًا وانتقل إلى مرحلة لاحقة خارج نطاق النسخة الأولى.",
    cancelled: "تم رفض الطلب من التاجر أو إلغاؤه ولن تظهر له إجراءات إضافية.",
    completed: "هذا الطلب يتبع مسارًا قديمًا وتم إكماله بالفعل."
  };
  return messages[order?.status] || "لا توجد تفاصيل إضافية لهذه الحالة حاليًا.";
}

function getOrderActionLabel(status) {
  const labels = {
    seller_confirmed: "قبول الطلب",
    cancelled: "رفض الطلب"
  };
  return labels[status] || status;
}

function getAllowedOrderActions(order) {
  const actions = [];
  const isSeller = state.user?.id === order.sellerId;

  if (order.status === "submitted" && isSeller) {
    actions.push({ key: "seller_confirmed", label: getOrderActionLabel("seller_confirmed"), tone: "btn-primary" });
    actions.push({ key: "cancelled", label: getOrderActionLabel("cancelled"), tone: "btn-outline" });
  }

  return actions;
}

function getOrderProgressSteps(status) {
  const normalizedStatus = ["seller_confirmed", "buyer_confirmed", "in_preparation", "in_transport", "completed"].includes(status)
    ? "seller_confirmed"
    : status;
  const steps = [
    { key: "submitted", label: "إرسال الطلب" },
    { key: "seller_confirmed", label: "رد التاجر" }
  ];
  const currentIndex = steps.findIndex((step) => step.key === normalizedStatus);
  return steps.map((step, index) => ({
    ...step,
    state: status === "cancelled"
      ? "cancelled"
      : index < currentIndex
        ? "done"
        : index === currentIndex
          ? "current"
          : "upcoming"
  }));
}

async function updateOrderStatus(orderId, status) {
  const nextStatus = String(status || "").trim();
  if (!V1_ALLOWED_ORDER_TRANSITIONS.has(nextStatus)) {
    showToast("إجراءات الطلب المتاحة في هذه النسخة هي قبول الطلب أو رفضه فقط.", "error", "إجراء غير متاح");
    return;
  }


  try {
    await api(`/api/orders/${Number(orderId)}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: nextStatus })
    });
    await loadOrders();
    await loadOrderDetails(orderId);
    await loadMessages();
    showToast(getOrderStatusExplanation({ status: nextStatus }), "success", formatOrderStatus(nextStatus));
  } catch (error) {
    showToast(error.message, "error", "تعذر تحديث الطلب");
  }
}

async function loadConversationDeals(conversationId) {
  if (!isV1FeatureEnabled("conversationDeals")) {
    state.activeConversationDeals = [];
    return [];
  }
  if (!conversationId) return [];
  const data = await api(`/api/conversations/${Number(conversationId)}/deals`);
  state.activeConversationDeals = data.deals || [];
  return state.activeConversationDeals;
}

async function createConversationDeal(conversationId, payload) {
  if (!isV1FeatureEnabled("conversationDeals")) return null;
  const data = await api(`/api/conversations/${Number(conversationId)}/deals`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  await loadConversationDeals(conversationId);
  return data.deal;
}

async function updateConversationDeal(dealId, payload, conversationId) {
  if (!isV1FeatureEnabled("conversationDeals")) return;
  await api(`/api/conversations/deals/${Number(dealId)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
  await loadConversationDeals(conversationId);
}

async function deleteConversationDeal(dealId, conversationId) {
  if (!isV1FeatureEnabled("conversationDeals")) return;
  await api(`/api/conversations/deals/${Number(dealId)}`, { method: "DELETE" });
  await loadConversationDeals(conversationId);
}

async function submitOrderFromDeal(_dealId) {
  if (!isV1FeatureEnabled("conversationDeals")) return;
}

async function openReportModal(context) {
  if (!isV1FeatureEnabled("reports")) return;
  if (!ensureAuthenticated()) return;

  state.reportDraft = context;
  const contextLines = [];
  if (context.productName) contextLines.push(`المنتج: ${context.productName}`);
  if (context.sellerName) contextLines.push(`التاجر: ${context.sellerName}`);
  if (context.conversationId) contextLines.push(`المحادثة: #${context.conversationId}`);
  if (context.reportedUserName) contextLines.push(`المستخدم المبلغ عنه: ${context.reportedUserName}`);

  const reportContextBox = document.getElementById("reportContextBox");
  if (reportContextBox) {
    reportContextBox.innerHTML = contextLines.length
      ? contextLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")
      : "سيتم إرسال البلاغ إلى الإدارة مع السياق الحالي.";
  }

  reportForm?.reset();
  openModal(reportModal);
}

async function loadNotifications() {
  if (!isV1FeatureEnabled("notifications")) {
    state.notifications = [];
    refreshNavBadges();
    if (notificationsList) notificationsList.innerHTML = "";
    return [];
  }
  if (!state.user) return [];

  try {
    const data = await api("/api/notifications");
    state.notifications = data.notifications || [];
    refreshNavBadges();
    renderNotifications();
    return state.notifications;
  } catch (error) {
    console.error(error);
    return [];
  }
}

async function loadSupportConversation() {
  if (!isV1FeatureEnabled("support")) {
    state.supportConversation = null;
    return null;
  }
  if (!state.user) return null;

  try {
    if (supportMessagesList) {
      supportMessagesList.innerHTML = `<div class="support-loading-state">جارٍ تحميل محادثة الدعم...</div>`;
    }
    const data = await api("/api/support/conversation");
    state.supportConversation = data.conversation || null;
    renderSupportConversation();
    return state.supportConversation;
  } catch (error) {
    if (supportMessagesList) {
      supportMessagesList.innerHTML = `<div class="support-error-state">تعذر تحميل محادثة الدعم الآن.</div>`;
    }
    showToast(error.message);
    return null;
  }
}

async function openProductModal(productId) {
  if (typeof window.navigateTo === "function") {
    await window.navigateTo(`/product/${Number(productId)}`);
    return;
  }
  await openProductPage(Number(productId));
}

async function openSellerPage(sellerId) {
  try {
    const data = await api(`/api/sellers/${sellerId}/public`);
    const seller = data.seller;
    const products = normalizeProducts(data.products || []);
    const ratings = data.ratings || [];
    state.currentSellerId = Number(sellerId);
    state.currentSellerProducts = products;

    if (sellerSummary) {
      sellerSummary.innerHTML = `
        <div class="seller-hero seller-hero-centered seller-hero-pro">
          <div class="seller-title-block">
            <div class="seller-name-frame seller-name-frame-centered seller-name-frame-pro">
              <div class="seller-frame-topline">واجهة المتجر</div>
              <h2>${escapeHtml(seller.storeName || seller.fullName)}</h2>
              <div class="seller-rate-chip seller-rate-chip-pro">⭐ ${Number(seller.averageRating || 0).toFixed(1)} (${Number(seller.ratingsCount || 0)})</div>
            </div>
          </div>

          <div class="seller-subline seller-subline-centered seller-subline-pro">
            <span class="seller-location-chip">${escapeHtml(seller.region || "")}</span>
            <span class="seller-products-chip">${Number(seller.totalProducts || products.length)} منتج</span>
          </div>

          <p class="seller-description seller-description-centered seller-description-pro">${escapeHtml(seller.profileDescription || seller.bio || "لا يوجد وصف بعد.")}</p>
          <div class="account-actions-row">
            ${state.user && state.user.role !== "seller" ? `<button class="btn btn-secondary seller-contact-btn" id="sellerHeaderMessageBtn" type="button">محادثة مع المتجر</button>` : ""}
          </div>
        </div>
      `;
    }

    document.getElementById("sellerHeaderMessageBtn")?.addEventListener("click", async () => {
      const firstProduct = products[0];
      if (!firstProduct) {
        showToast("لا توجد منتجات منشورة لبدء محادثة من خلالها");
        return;
      }
      await startConversation(firstProduct.id);
    });

    if (sellerProductsGrid) {
      sellerProductsGrid.innerHTML = products.length
        ? products.map(productCardHtml).join("")
        : `<p class="muted">لا توجد منتجات منشورة.</p>`;
      bindProductActions(sellerProductsGrid);
    }

    if (sellerRatingsList) {
      sellerRatingsList.innerHTML = ratings.length
        ? ratings.map((rating) => `
            <div class="rating-card rating-card-compact rating-card-pro">
              <div class="rating-head">
                <strong>${escapeHtml(rating.buyerName || "مستخدم")}</strong>
                <span class="rating-stars">${"★".repeat(Number(rating.score || 0))}</span>
              </div>
              <p class="muted">${escapeHtml(rating.comment || "")}</p>
            </div>
          `).join("")
        : `<p class="muted">لا توجد تقييمات بعد.</p>`;
    }

    showView("seller");
  } catch (error) {
    showToast(error.message);
  } finally {
    endSubmission(submissionKey);
  }
}

function renderConversationDetails(conversation) {
  if (!conversationDetails) return;

  if (!conversation) {
    conversationDetails.innerHTML = `<div class="conversation-empty-panel whatsapp-empty-panel"><h3>اختر محادثة</h3><p class="muted">ستظهر الرسائل هنا داخل إطار واضح مع تمرير مستقل للرسائل.</p></div>`;
    return;
  }

  const canReply = conversation.status === "open";
  const counterparty = state.user?.id === conversation.sellerId
    ? (conversation.buyer?.fullName || "مشتري")
    : (conversation.seller?.storeName || conversation.seller?.fullName || "متجر");
  const linkedOrders = Array.isArray(conversation.linkedOrders) ? conversation.linkedOrders : [];

  conversationDetails.innerHTML = `
    <div class="chat-layout whatsapp-chat-layout">
      <div class="chat-header whatsapp-chat-header">
        <div class="chat-person-block">
          <div class="chat-person-avatar">${escapeHtml((counterparty || "م")[0] || "م")}</div>
          <div>
            <h3>${escapeHtml(counterparty)}</h3>
            <div class="muted">المنتج: ${escapeHtml(conversation.product?.name || "")}</div>
          </div>
        </div>
        <div class="chat-header-meta">
          <span class="chat-chip">${escapeHtml(formatConversationType(conversation.conversationType))}</span>
          <span class="chat-chip">الحالة: ${escapeHtml(formatConversationStatus(conversation.status || ""))}</span>
          <span class="chat-chip light">${escapeHtml(conversation.seller?.storeName || conversation.seller?.fullName || "")}</span>
        </div>
      </div>

      ${linkedOrders.length ? `
        <div class="deal-strip">
          ${linkedOrders.map((order) => `
            <div class="compact-card linked-orders-card chat-linked-order">
              <div class="deal-head">
                <div class="linked-order-summary">
                  <strong>طلب شراء #${order.id}</strong>
                  <div class="muted">عدد العناصر: ${order.itemsCount || 0} - الإجمالي: ${formatPrice(order.totalAmount || 0, conversation.product?.currency || "ل.س")}</div>
                </div>
                <span class="deal-status ${getOrderStatusTone(order.status)}">${escapeHtml(formatOrderStatus(order.status))}</span>
              </div>
              <div class="deal-actions">
                <button class="btn btn-light" data-open-linked-order="${order.id}" type="button">عرض الطلب</button>
              </div>
            </div>
          `).join("")}
        </div>
      ` : ""}

      <div class="chat-thread whatsapp-thread" id="activeChatThread">
        ${renderConversationMessages(conversation.messages || [])}
      </div>

      ${canReply ? `
        <div class="chat-composer whatsapp-composer">
          <div class="chat-input-shell whatsapp-input-shell">
            <input class="field chat-textarea whatsapp-textarea chat-singleline-input" id="conversationMessageInput" type="text" placeholder="اكتب رسالتك" />
            <button class="btn btn-secondary chat-send-inline-btn" id="sendConversationMessageBtn" type="button">إرسال</button>
          </div>
        </div>
      ` : ""}
    </div>
  `;

  const sendConversationMessage = async () => {
    const input = document.getElementById("conversationMessageInput");
    const message = input?.value?.trim() || "";
    if (!message) {
      showToast("اكتب رسالة أولًا");
      return;
    }

    try {
      await api(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message })
      });
      input.value = "";
      await openConversation(conversation.id);
      await loadMessages();
    } catch (error) {
      showToast(error.message || "تعذر إرسال الرسالة");
    }
  };

  document.getElementById("sendConversationMessageBtn")?.addEventListener("click", sendConversationMessage);
  document.getElementById("conversationMessageInput")?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    await sendConversationMessage();
  });

  conversationDetails.querySelectorAll("[data-open-linked-order]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (typeof window.navigateTo === "function") {
        await window.navigateTo(`/order/${Number(btn.dataset.openLinkedOrder)}`);
        return;
      }
      showView("orders");
      await loadOrders();
      await loadOrderDetails(Number(btn.dataset.openLinkedOrder));
    });
  });

  const thread = document.getElementById("activeChatThread");
  if (thread) {
    thread.scrollTop = thread.scrollHeight;
  }
}
