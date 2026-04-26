
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
  productsPagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasMore: false,
    isLoading: false
  },
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
  orderFilterStatus: "all",
  activeOrder: null,
  dashboardProducts: [],
  dashboardProductSearch: "",
  dashboardProductStatus: "all",
  dashboardProductSort: "newest",
  notifications: [],
  siteAppearance: {
    backgroundImage: "",
    heroImage: ""
  },
  homeAds: {
    top: [],
    bottom: null
  },
  supportConversation: null,
  siteContentCache: {},
  reportDraft: null,
  dashboardSummary: null,
  metaLoaded: false,
  mobileConversationsOpen: false,
  mobileHeaderMenuOpen: false,
  mobileFiltersOpen: false,
  mobileActiveSheet: "",
  mobileNavContext: {
    view: "home"
  }
};

const PUSH_PROMPT_STORAGE_KEY = "marketplacePushPromptStateV1";
const PUSH_SERVICE_WORKER_PATH = "/sw.js";
const SERVICE_WORKER_SUPPORTED = typeof window !== "undefined" && "serviceWorker" in navigator;
const PUSH_SUPPORTED =
  SERVICE_WORKER_SUPPORTED
  && "Notification" in window
  && "PushManager" in window;

function getPushPromptStorageKey(userId = state.user?.id) {
  const normalizedUserId = Number.parseInt(String(userId || ""), 10);
  if (Number.isInteger(normalizedUserId) && normalizedUserId > 0) {
    return `${PUSH_PROMPT_STORAGE_KEY}:u:${normalizedUserId}`;
  }
  return PUSH_PROMPT_STORAGE_KEY;
}

function readPushPromptState(userId = state.user?.id) {
  try {
    const scopedKey = getPushPromptStorageKey(userId);
    const fallbackKeys = [scopedKey];

    for (const key of fallbackKeys) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      return {
        asked: Boolean(parsed?.asked),
        accepted: Boolean(parsed?.accepted),
        declined: Boolean(parsed?.declined)
      };
    }

    return { asked: false, accepted: false, declined: false };
  } catch (_error) {
    return { asked: false, accepted: false, declined: false };
  }
}

function writePushPromptState(nextState, userId = state.user?.id) {
  const normalized = {
    asked: Boolean(nextState?.asked),
    accepted: Boolean(nextState?.accepted),
    declined: Boolean(nextState?.declined)
  };
  localStorage.setItem(getPushPromptStorageKey(userId), JSON.stringify(normalized));
  state.pushRuntime.promptState = normalized;
  return normalized;
}

state.pushRuntime = state.pushRuntime || {
  promptState: readPushPromptState(),
  registrationPromise: null,
  subscribePromise: null,
  vapidPublicKey: "",
  isSubscribed: false,
  updatePromptVisible: false,
  isReloadingForUpdate: false
};

const V1_FLAGS = {
  admin: false,
  notifications: true,
  support: false,
  reports: false,
  conversationDeals: false,
  ratingsSubmission: false,
  legacyPurchaseModal: false
};

const DEFAULT_HOME_ADS = {
  top: [
    {
      title: "إعلان رئيسي 1",
      subtitle: "يمكن تعديله من لوحة الإدارة",
      image: "/assets/site/black-gold-marble-reference.jpg",
      link: ""
    },
    {
      title: "إعلان رئيسي 2",
      subtitle: "مخصص لعرض عروضك أو حملاتك",
      image: "/assets/site/black-gold-marble-reference.jpg",
      link: ""
    }
  ],
  bottom: {
    title: "إعلان أسفل المنتجات",
    subtitle: "يمكن تعديل الصورة والنص والرابط من لوحة الإدارة",
    image: "/assets/site/black-gold-marble-reference.jpg",
    link: ""
  }
};
const HOME_ADS_REFRESH_MIN_MS = 15000;
let homeAdsLastLoadedAt = 0;
let homeAdsRefreshPromise = null;

const V1_ALLOWED_ORDER_TRANSITIONS = new Set(["seller_confirmed", "completed", "cancelled"]);

state.submissionState = state.submissionState || {};
window.marketplaceApp = window.marketplaceApp || {};

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
    <div class="stat-card dashboard-stat-card"><div class="stat-icon">💰</div><div class="value">${Number(summary.totalRevenue || 0).toLocaleString("ar")}</div><div class="label">إجمالي المبيعات</div></div>
    <div class="stat-card dashboard-stat-card"><div class="stat-icon">📦</div><div class="value">${Number(state.orders?.length || 0)}</div><div class="label">طلبات جديدة</div></div>
    <div class="stat-card dashboard-stat-card"><div class="stat-icon">📋</div><div class="value">${Number(summary.publishedProducts || summary.totalProducts || 0)}</div><div class="label">منتج نشط</div></div>
    <div class="stat-card dashboard-stat-card"><div class="stat-icon">⭐</div><div class="value">${Number(summary.averageRating || 0).toFixed(1)}</div><div class="label">تقييم المتجر</div></div>
    <div class="stat-card dashboard-stat-card"><div class="stat-icon">👁️</div><div class="value">${Number(summary.totalViews || 0).toLocaleString("ar")}</div><div class="label">إجمالي المشاهدات</div></div>
    <div class="stat-card dashboard-stat-card"><div class="stat-icon">📝</div><div class="value">${Number(summary.draftProducts || 0)}</div><div class="label">مسودات</div></div>
  `;
}

function getFilteredDashboardProducts() {
  const query = String(state.dashboardProductSearch || "").trim().toLowerCase();
  const statusFilter = String(state.dashboardProductStatus || "all");
  const sortKey = String(state.dashboardProductSort || "newest");
  const items = [...(state.dashboardProducts || [])]
    .filter((product) => statusFilter === "all" ? true : String(product.status || "") === statusFilter)
    .filter((product) => {
      if (!query) return true;
      const haystack = [
        product.name,
        product.category,
        product.region,
        product.status
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });

  items.sort((a, b) => {
    if (sortKey === "priceAsc") return Number(a.price || 0) - Number(b.price || 0);
    if (sortKey === "priceDesc") return Number(b.price || 0) - Number(a.price || 0);
    if (sortKey === "views") return Number(b.viewsCount || 0) - Number(a.viewsCount || 0);
    if (sortKey === "status") return String(a.status || "").localeCompare(String(b.status || ""), "ar");
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
  });

  return items;
}

function renderDashboardRecentOrders() {
  if (!dashboardRecentOrders) return;
  const recentOrders = [...(state.orders || [])]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
    .slice(0, 4);

  if (!recentOrders.length) {
    dashboardRecentOrders.innerHTML = `<div class="soft-empty">لا توجد طلبات حديثة حالياً.</div>`;
    return;
  }

  dashboardRecentOrders.innerHTML = recentOrders.map((order) => `
    <button class="dashboard-order-row" data-dashboard-order="${order.id}" type="button">
      <div class="dashboard-order-main">
        <strong>#${order.id}</strong>
        <span>${escapeHtml(getOrderPartyName(order, true) || "مشتري")}</span>
        <span>${order.createdAt ? new Date(order.createdAt).toLocaleDateString("ar") : ""}</span>
      </div>
      <div class="dashboard-order-secondary">
        <span class="dashboard-order-total">${formatPrice(order.totalAmount || 0, "ل.س")}</span>
        <span class="order-card-status ${getOrderStatusBadgeClass(order.status)}">${escapeHtml(formatOrderStatus(order.status))}</span>
      </div>
    </button>
  `).join("");

  dashboardRecentOrders.querySelectorAll("[data-dashboard-order]").forEach((button) => {
    button.addEventListener("click", async () => {
      await loadOrders();
      showView("orders");
      await loadOrderDetails(Number(button.dataset.dashboardOrder));
    });
  });
}

function renderDashboardSpotlightProducts(products = []) {
  if (!dashboardSpotlightProducts) return;
  const spotlight = [...products]
    .sort((a, b) => Number(b.viewsCount || 0) - Number(a.viewsCount || 0))
    .slice(0, 4);

  if (!spotlight.length) {
    dashboardSpotlightProducts.innerHTML = `<div class="soft-empty">لا توجد منتجات بارزة حالياً.</div>`;
    return;
  }

  dashboardSpotlightProducts.innerHTML = spotlight.map((product) => `
    <div class="dashboard-spotlight-card">
      ${product.image ? `<img class="dashboard-spotlight-thumb" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy">` : `<div class="dashboard-spotlight-thumb dashboard-spotlight-thumb-placeholder"></div>`}
      <div class="dashboard-spotlight-copy">
        <strong>${escapeHtml(product.name || "")}</strong>
        <div class="muted">${getProductPriceLabel(product)}</div>
      </div>
      <span class="dashboard-spotlight-badge">مشاهدات: ${Number(product.viewsCount || 0)}</span>
    </div>
  `).join("");
}

function renderDashboardProducts() {
  if (!myProductsGrid) return;
  const products = getFilteredDashboardProducts();
  if (dashboardProductsCounter) {
    dashboardProductsCounter.textContent = `${products.length} ${products.length === 1 ? "منتج" : "منتج"}`;
  }
  myProductsGrid.innerHTML = products.length
    ? products.map(managedProductCardHtml).join("")
    : `<p class="muted">لا توجد منتجات مطابقة لهذا الفلتر حالياً.</p>`;

  bindManagedProductCard(myProductsGrid);
  renderDashboardSpotlightProducts(state.dashboardProducts || []);
}

function bindManagedProductCard(scope) {
  scope?.querySelectorAll("[data-my-product-status]").forEach((btn) => {
    btn.addEventListener("click", () => {
      updateMyProductStatus(Number(btn.dataset.myProductStatus), btn.dataset.next);
    });
  });
  scope?.querySelectorAll("[data-dashboard-open-product]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const productId = Number(btn.dataset.dashboardOpenProduct || 0);
      if (!productId) return;
      if (typeof window.navigateTo === "function") {
        await window.navigateTo(`/product/${productId}`);
        return;
      }
      await openProductPage(productId);
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
const homeLoadMoreWrap = document.getElementById("homeLoadMoreWrap");
const homeLoadMoreBtn = document.getElementById("homeLoadMoreBtn");
const categoryChips = document.getElementById("categoryChips");

const filterKeyword = document.getElementById("filterKeyword");
const filterCategory = document.getElementById("filterCategory");
const filterRegion = document.getElementById("filterRegion");
const sortBy = document.getElementById("sortBy");

const globalSearchForm = document.getElementById("globalSearchForm");
const globalSearchInput = document.getElementById("globalSearchInput");
const globalSearchInputOverlay = document.getElementById("globalSearchInputOverlay");
const searchArea = document.getElementById("searchArea");
const searchQuickActions = document.querySelector(".search-quick-actions");
const navSearchToggleBtn = document.getElementById("navSearchToggleBtn");
const closeSearchAreaBtn = document.getElementById("closeSearchAreaBtn");
const siteBrandTitle = document.getElementById("siteBrandTitle");
const siteBrandTagline = document.getElementById("siteBrandTagline");
const heroKicker = document.getElementById("heroKicker");
const heroTitle = document.getElementById("heroTitle");
const heroDescription = document.getElementById("heroDescription");
const heroPosterMedia = document.getElementById("heroPosterMedia");
const heroSellerCtaBtn = document.getElementById("heroSellerCtaBtn");
const homeAdsTopSection = document.getElementById("homeAdsTopSection");
const homeAdsBottomSection = document.getElementById("homeAdsBottomSection");
const homeTopAds = document.getElementById("homeTopAds");
const homeBottomAd = document.getElementById("homeBottomAd");

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
const mobileHeaderMenu = document.getElementById("mobileHeaderMenu");
const mobileHeaderMenuToggle = document.getElementById("mobileHeaderMenuToggle");
const mobileHeaderDropdown = document.getElementById("mobileHeaderDropdown");
const mobileBottomNav = document.getElementById("mobileBottomNav");
const mobileSheetBackdrop = document.getElementById("mobileSheetBackdrop");
const mobileHeaderSheet = document.getElementById("mobileHeaderSheet");
const mobileHeaderSheetMenu = document.getElementById("mobileHeaderSheetMenu");
const mobileHeaderSheetCloseBtn = document.getElementById("mobileHeaderSheetCloseBtn");
const mobileFiltersToolbar = document.getElementById("mobileFiltersToolbar");
const mobileFiltersResultsCount = document.getElementById("mobileFiltersResultsCount");
const mobileSortBy = document.getElementById("mobileSortBy");
const mobileFiltersOpenBtn = document.getElementById("mobileFiltersOpenBtn");
const mobileFiltersSheet = document.getElementById("mobileFiltersSheet");
const mobileFiltersCloseBtn = document.getElementById("mobileFiltersCloseBtn");
const mobileFilterKeyword = document.getElementById("mobileFilterKeyword");
const mobileFilterCategory = document.getElementById("mobileFilterCategory");
const mobileFilterRegion = document.getElementById("mobileFilterRegion");
const mobileSheetSortBy = document.getElementById("mobileSheetSortBy");
const mobileFiltersApplyBtn = document.getElementById("mobileFiltersApplyBtn");
const mobileFiltersResetBtn = document.getElementById("mobileFiltersResetBtn");
const mobileCategoryChips = document.getElementById("mobileCategoryChips");

const catalogBackBtn = document.getElementById("catalogBackBtn");
const productBackBtn = document.getElementById("productBackBtn");
const checkoutBackBtn = document.getElementById("checkoutBackBtn");

const productModal = document.getElementById("productModal");
const productModalContent = document.getElementById("productModalContent");
const closeProductModal = document.getElementById("closeProductModal");

const productFormModal = document.getElementById("productFormModal");
const closeProductFormModal = document.getElementById("closeProductFormModal");
const productFormCancelBtn = document.getElementById("productFormCancelBtn");
const productImagesInput = document.getElementById("pImages");
const productImagePreview = document.getElementById("productImagePreview");
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
const enableBrowserPushBtn = document.getElementById("enableBrowserPushBtn");
const unsubscribeBrowserPushBtn = document.getElementById("unsubscribeBrowserPushBtn");
const pushSubscriptionStatusText = document.getElementById("pushSubscriptionStatusText");
const addProductForm = document.getElementById("addProductForm");
const reportForm = document.getElementById("reportForm");

let homeCategoryMarqueeControllers = [];
let rtlScrollTypeCache = null;
let lastMobileScrollY = 0;

const dashboardUserInfo = document.getElementById("dashboardUserInfo");
const statsGrid = document.getElementById("statsGrid");
const myProductsGrid = document.getElementById("myProductsGrid");
const dashboardHeroTitle = document.getElementById("dashboardHeroTitle");
const dashboardHeroSubtitle = document.getElementById("dashboardHeroSubtitle");
const dashboardQuickActions = document.getElementById("dashboardQuickActions");
const dashboardRecentOrders = document.getElementById("dashboardRecentOrders");
const dashboardOpenOrdersBtn = document.getElementById("dashboardOpenOrdersBtn");
const dashboardProductsCounter = document.getElementById("dashboardProductsCounter");
const dashboardProductSearch = document.getElementById("dashboardProductSearch");
const dashboardProductStatusFilter = document.getElementById("dashboardProductStatusFilter");
const dashboardProductSort = document.getElementById("dashboardProductSort");
const dashboardSpotlightProducts = document.getElementById("dashboardSpotlightProducts");
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
const ordersTabs = document.getElementById("ordersTabs");

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
const conversationOrderSheetModal = document.getElementById("conversationOrderSheetModal");
const closeConversationOrderSheetBtn = document.getElementById("closeConversationOrderSheetBtn");
const conversationOrderSheetContent = document.getElementById("conversationOrderSheetContent");
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

function isPriceOnRequestProduct(product) {
  return Boolean(
    product?.priceOnRequest
    || product?.customFields?.price_on_request
    || product?.customFields?.priceOnRequest
  );
}

function getProductPriceLabel(product) {
  if (isPriceOnRequestProduct(product)) return "تواصل للسعر";
  return formatPrice(product?.price || 0, product?.currency || "ل.س");
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

function renderProductImagePreview() {
  if (!productImagePreview) return;
  const files = Array.from(productImagesInput?.files || []).slice(0, 5);

  if (!files.length) {
    productImagePreview.innerHTML = `
      <div class="product-upload-empty">
        <span aria-hidden="true">＋</span>
        <span>لم يتم اختيار صور بعد</span>
      </div>
    `;
    return;
  }

  productImagePreview.innerHTML = files.map((file) => {
    const safeName = escapeHtml(file.name || "صورة");
    return `
      <div class="product-upload-preview-chip">
        <span class="product-upload-preview-name">${safeName}</span>
        <span class="product-upload-preview-size">${Math.max(1, Math.round(file.size / 1024))} KB</span>
      </div>
    `;
  }).join("");
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

  if (window.innerWidth > 620) {
    topbar.classList.remove("topbar-mobile-hidden");
    lastMobileScrollY = Math.max(0, window.scrollY || 0);
    return;
  }

  const currentY = Math.max(0, window.scrollY || 0);
  const scrollingDown = currentY > lastMobileScrollY + 6;
  const shouldForceVisible = currentY <= 36 || state.mobileActiveSheet || searchArea?.classList.contains("search-active");

  topbar.classList.toggle("topbar-mobile-hidden", !shouldForceVisible && scrollingDown && currentY > 96);
  lastMobileScrollY = currentY;
}

function openSearchArea() {
  if (!searchArea) return;
  setMobileSheetState("");
  searchArea.classList.add("search-active");
  searchArea.setAttribute("aria-hidden", "false");
  document.body.classList.add("search-area-open");
  document.querySelector(".topbar")?.classList.remove("topbar-mobile-hidden");
  renderMobileBottomNav();
  window.setTimeout(() => (globalSearchInputOverlay || globalSearchInput)?.focus(), 80);
}

function closeSearchArea() {
  if (!searchArea) return;
  searchArea.classList.remove("search-active");
  searchArea.setAttribute("aria-hidden", "true");
  document.body.classList.remove("search-area-open");
  syncTopbarScrollState();
  renderMobileBottomNav();
}

async function goToHomeSection(sectionId) {
  const scrollToTarget = () => {
    const section = document.getElementById(sectionId);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  setMobileSheetState("");

  if (!homeView?.classList.contains("hidden")) {
    scrollToTarget();
    return;
  }

  if (typeof window.navigateTo === "function") {
    await window.navigateTo("/");
  } else {
    if (!state.products.length) await loadProducts();
    showView("home");
  }

  window.setTimeout(scrollToTarget, 120);
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

  if (window.marketplacePoller?.notifyApiRequest) {
    window.marketplacePoller.notifyApiRequest(path);
  }

  return fetch(path, { ...options, headers })
    .then(async (res) => {
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
    })
    .catch((error) => {
      const message = String(error?.message || "");
      const isOfflineError =
        !navigator.onLine
        || message.toLowerCase() === "failed to fetch"
        || message.toLowerCase().includes("networkerror");

      if (isOfflineError) {
        throw new Error("لا يوجد اتصال إنترنت حاليًا. الواجهة تعمل محليًا لكن هذه البيانات تحتاج اتصال.");
      }

      throw error;
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
    state.pushRuntime.promptState = readPushPromptState(nextUserId);
  }

  if (state.token) localStorage.setItem("token", state.token);
  else localStorage.removeItem("token");

  if (state.user) localStorage.setItem("user", JSON.stringify(state.user));
  else localStorage.removeItem("user");

  syncRoleSpecificFields();
  refreshNav();
  if (state.user && state.token) {
    window.marketplacePoller?.start?.();
    if (PUSH_SUPPORTED && Notification.permission === "granted") {
      ensurePushSubscription("auth").catch(() => {});
    }
    syncPushSettingsUi().catch(() => {});
  } else {
    window.marketplacePoller?.stop?.();
    state.pushRuntime.isSubscribed = false;
    syncPushSettingsUi().catch(() => {});
  }
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
  renderMobileHeaderMenu();
  renderMobileBottomNav();
}

function getActiveAppPath() {
  const [pathname] = String(location.pathname || "/").split("?");
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

function updateMobileNavContext(viewName = state.mobileNavContext?.view || "home") {
  state.mobileNavContext = {
    ...state.mobileNavContext,
    view: getSafeViewName(viewName),
    path: getActiveAppPath()
  };
}

function getMobileBottomNavItems() {
  const hasUser = !!state.user;
  const isBuyer = hasUser && isBuyerUser();
  const isSeller = hasUser && isSellerUser();

  if (!hasUser) {
    return [
      { key: "home", label: "الرئيسية", icon: "⌂", type: "route", value: "/" },
      { key: "products", label: "المنتجات", icon: "▦", type: "action", value: "filtersSection" },
      { key: "search", label: "بحث", icon: "⌕", type: "action", value: "search" },
      { key: "auth", label: "دخول", icon: "⇥", type: "route", value: "/auth" },
      { key: "menu", label: "القائمة", icon: "☰", type: "action", value: "menu" }
    ];
  }

  if (isSeller) {
    return [
      { key: "home", label: "الرئيسية", icon: "⌂", type: "route", value: "/" },
      { key: "notifications", label: "تنبيهات", icon: "🔔", type: "action", value: "notifications", badge: Number((state.notifications || []).filter((item) => !item.isRead).length || 0) },
      { key: "messages", label: "محادثات", icon: "✉", type: "route", value: "/conversations", badge: Number(state.conversations?.length || 0) },
      { key: "dashboard", label: "لوحتي", icon: "▦", type: "route", value: "/dashboard" },
      { key: "orders", label: "طلبات", icon: "📦", type: "route", value: "/orders", badge: Number(state.orders?.length || 0) }
    ];
  }

  if (isBuyer) {
    return [
      { key: "home", label: "الرئيسية", icon: "⌂", type: "route", value: "/" },
      { key: "notifications", label: "تنبيهات", icon: "🔔", type: "action", value: "notifications", badge: Number((state.notifications || []).filter((item) => !item.isRead).length || 0) },
      { key: "favorites", label: "المفضلة", icon: "♡", type: "route", value: "/favorites", badge: Number(state.favorites?.length || 0) },
      { key: "cart", label: "السلة", icon: "🛒", type: "route", value: "/cart", badge: Number(state.cart?.totals?.quantity || 0) },
      { key: "messages", label: "محادثات", icon: "✉", type: "route", value: "/conversations", badge: Number(state.conversations?.length || 0) }
    ];
  }

  return [
    { key: "home", label: "الرئيسية", icon: "⌂", type: "route", value: "/" },
    { key: "notifications", label: "تنبيهات", icon: "🔔", type: "action", value: "notifications", badge: Number((state.notifications || []).filter((item) => !item.isRead).length || 0) },
    { key: "messages", label: "محادثات", icon: "✉", type: "route", value: "/conversations", badge: Number(state.conversations?.length || 0) },
    { key: "favorites", label: "المفضلة", icon: "♡", type: "route", value: "/favorites", badge: Number(state.favorites?.length || 0) },
    { key: "profile", label: "حسابي", icon: "◉", type: "route", value: "/profile" }
  ];
}

function isMobileNavItemActive(item) {
  const currentView = state.mobileNavContext?.view || "home";
  const currentPath = state.mobileNavContext?.path || getActiveAppPath();
  const currentMenuViews = new Set(["profile", "orders", "notifications", "admin"]);
  const storefrontViews = new Set(["home", "catalog", "product", "seller"]);

  if (item.key === "search") return searchArea?.classList.contains("search-active");
  if (item.key === "notifications") return currentView === "notifications";
  if (item.key === "products") return storefrontViews.has(currentView) || currentPath === "/";
  if (item.key === "menu") return state.mobileActiveSheet === "menu" || currentMenuViews.has(currentView);
  if (item.value === "/") return storefrontViews.has(currentView) || currentPath === "/";
  if (item.value === "/auth") return currentView === "auth" || currentPath === "/auth";
  if (item.value === "/favorites") return currentView === "favorites" || currentPath === "/favorites";
  if (item.value === "/cart") return currentView === "cart" || currentPath === "/cart";
  if (item.value === "/dashboard") return currentView === "dashboard" || currentPath === "/dashboard";
  if (item.value === "/conversations") return currentView === "messages" || currentPath === "/conversations" || currentPath.startsWith("/conversation/");
  if (item.value === "/profile") return currentView === "profile" || currentPath === "/profile";
  return false;
}

function renderMobileBottomNav() {
  if (!mobileBottomNav) return;
  const items = getMobileBottomNavItems();

  mobileBottomNav.innerHTML = items.map((item) => {
    const isActive = isMobileNavItemActive(item);
    const badge = Math.max(0, Number(item.badge || 0));
    const badgeMarkup = badge > 0
      ? `<span class="mobile-bottom-nav-badge">${badge}</span>`
      : "";

    return `
      <button
        class="mobile-bottom-nav-item ${isActive ? "is-active" : ""}"
        data-mobile-bottom-type="${item.type}"
        data-mobile-bottom-value="${escapeHtml(item.value)}"
        type="button"
        ${isActive ? 'aria-current="page"' : ""}
      >
        <span class="mobile-bottom-nav-icon" aria-hidden="true">${item.icon}</span>
        <span class="mobile-bottom-nav-label">${item.label}</span>
        ${badgeMarkup}
      </button>
    `;
  }).join("");
}

function setMobileSheetState(sheetName = "") {
  const nextSheet = String(sheetName || "");
  const menuOpen = nextSheet === "menu";
  const filtersOpen = nextSheet === "filters";

  state.mobileActiveSheet = nextSheet;
  state.mobileHeaderMenuOpen = menuOpen;
  state.mobileFiltersOpen = filtersOpen;

  document.body.classList.toggle("mobile-sheet-open", Boolean(nextSheet));
  mobileSheetBackdrop?.classList.toggle("hidden", !nextSheet);
  mobileSheetBackdrop?.setAttribute("aria-hidden", nextSheet ? "false" : "true");

  mobileHeaderMenu?.classList.toggle("is-open", menuOpen);
  mobileHeaderDropdown?.classList.add("hidden");
  mobileHeaderSheet?.classList.toggle("hidden", !menuOpen);
  mobileHeaderSheet?.setAttribute("aria-hidden", menuOpen ? "false" : "true");
  mobileFiltersSheet?.classList.toggle("hidden", !filtersOpen);
  mobileFiltersSheet?.setAttribute("aria-hidden", filtersOpen ? "false" : "true");
  mobileHeaderMenuToggle?.setAttribute("aria-expanded", menuOpen ? "true" : "false");
  mobileFiltersOpenBtn?.setAttribute("aria-expanded", filtersOpen ? "true" : "false");

  document.querySelector(".topbar")?.classList.remove("topbar-mobile-hidden");
  renderMobileBottomNav();
}

function setMobileHeaderMenuOpen(nextOpen) {
  if (nextOpen) renderMobileHeaderMenu();
  setMobileSheetState(Boolean(nextOpen) ? "menu" : "");
}

function setMobileFiltersOpen(nextOpen) {
  if (nextOpen) syncMobileFilterControls();
  setMobileSheetState(Boolean(nextOpen) ? "filters" : "");
}

function renderMobileHeaderMenu() {
  if (!mobileHeaderDropdown && !mobileHeaderSheetMenu) return;
  const hasUser = !!state.user;
  const isBuyer = hasUser && isBuyerUser();
  const isSeller = hasUser && isSellerUser();
  const isAdmin = hasUser && isAdminUser();

  const items = [
    `<button class="mobile-header-dropdown-item" data-mobile-nav-action="home" type="button">الرئيسية</button>`,
    `<button class="mobile-header-dropdown-item" data-mobile-nav-action="filtersSection" type="button">المنتجات</button>`
  ];

  if (!hasUser) {
    items.push(`<button class="mobile-header-dropdown-item" data-mobile-nav-action="login" type="button">تسجيل الدخول</button>`);
  } else {
    items.push(`<button class="mobile-header-dropdown-item" data-mobile-nav-action="profile" type="button">الملف الشخصي</button>`);
    items.push(`<button class="mobile-header-dropdown-item" data-mobile-nav-action="messages" type="button">المحادثات</button>`);
    if (isV1FeatureEnabled("notifications")) items.push(`<button class="mobile-header-dropdown-item" data-mobile-nav-action="notifications" type="button">التنبيهات</button>`);
    if (isBuyer) items.push(`<button class="mobile-header-dropdown-item" data-mobile-nav-action="favorites" type="button">المفضلة</button>`);
    if (isBuyer) items.push(`<button class="mobile-header-dropdown-item" data-mobile-nav-action="cart" type="button">السلة</button>`);
    items.push(`<button class="mobile-header-dropdown-item" data-mobile-nav-action="orders" type="button">الطلبات</button>`);
    if (isSeller) items.push(`<button class="mobile-header-dropdown-item" data-mobile-nav-action="dashboard" type="button">لوحتي</button>`);
    if (isSeller) items.push(`<button class="mobile-header-dropdown-item" data-mobile-nav-action="add-product" type="button">إضافة منتج</button>`);
    if (isAdmin && isV1FeatureEnabled("admin")) items.push(`<button class="mobile-header-dropdown-item" data-mobile-nav-action="admin" type="button">الإدارة</button>`);
    items.push(`<button class="mobile-header-dropdown-item is-danger" data-mobile-nav-action="logout" type="button">خروج</button>`);
  }

  const markup = items.join("");
  if (mobileHeaderDropdown) mobileHeaderDropdown.innerHTML = markup;
  if (mobileHeaderSheetMenu) mobileHeaderSheetMenu.innerHTML = markup;
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
  renderMobileBottomNav();
}

function normalizeSiteAssetUrl(value) {
  const raw = String(value || "")
    .trim()
    .replace(/^\/?ssets\//i, "/assets/");
  if (!raw) return "";
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("/")) return raw;
  return "/" + raw.replace(/^\/+/, "");
}

function normalizeAdLink(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const normalized = raw.toLowerCase();
  if (normalized === "none" || normalized === "null" || normalized === "disabled" || normalized === "-" || normalized === "#") {
    return "";
  }
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith("/")) return raw;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return "";
  return "/" + raw.replace(/^\/+/, "");
}

function normalizeHomeAd(ad = {}, fallback = {}) {
  const title = String(ad.title || fallback.title || "").trim();
  const subtitle = String(ad.subtitle || fallback.subtitle || "").trim();
  const image = normalizeSiteAssetUrl(ad.image || fallback.image || "");
  const link = normalizeAdLink(ad.link || fallback.link || "");
  return { title, subtitle, image, link };
}

function getHomeAdCardMarkup(ad = {}, variant = "top") {
  const safeAd = normalizeHomeAd(ad);
  const title = safeAd.title || "إعلان";
  const subtitle = safeAd.subtitle || "";
  const imageMarkup = safeAd.image
    ? `<img class="home-ad-image" src="${escapeHtml(safeAd.image)}" alt="${escapeHtml(title)}" loading="lazy">`
    : `<div class="home-ad-image home-ad-image-placeholder" aria-hidden="true"></div>`;
  const bodyMarkup = `
    <div class="home-ad-body">
      <h3 class="home-ad-title">${escapeHtml(title)}</h3>
      ${subtitle ? `<p class="home-ad-subtitle">${escapeHtml(subtitle)}</p>` : ""}
    </div>
  `;

  if (safeAd.link) {
    return `
      <button class="home-ad-card home-ad-${variant} is-clickable" type="button" data-home-ad-link="${escapeHtml(safeAd.link)}">
        <div class="home-ad-media">${imageMarkup}</div>
        ${bodyMarkup}
      </button>
    `;
  }

  return `
    <article class="home-ad-card home-ad-${variant}">
      <div class="home-ad-media">${imageMarkup}</div>
      ${bodyMarkup}
    </article>
  `;
}

function bindHomeAdActions(scope) {
  if (!scope) return;
  scope.querySelectorAll("[data-home-ad-link]").forEach((node) => {
    if (node.dataset.homeAdBound === "true") return;
    node.dataset.homeAdBound = "true";
    node.addEventListener("click", async () => {
      const target = String(node.dataset.homeAdLink || "").trim();
      if (!target) return;
      if (/^(https?:)?\/\//i.test(target)) {
        window.open(target, "_blank", "noopener,noreferrer");
        return;
      }
      if (typeof window.navigateTo === "function") {
        await window.navigateTo(target);
        return;
      }
      location.href = target;
    });
  });
}

function renderHomeAds() {
  const topAds = (Array.isArray(state.homeAds?.top) ? state.homeAds.top : [])
    .filter((ad) => Boolean(ad?.isVisible ?? (ad?.title && ad?.image)));
  const bottomCandidate = state.homeAds?.bottom || null;
  const bottomAdItem = bottomCandidate && Boolean(bottomCandidate.isVisible ?? (bottomCandidate.title && bottomCandidate.image))
    ? bottomCandidate
    : null;

  if (homeTopAds) {
    homeTopAds.innerHTML = topAds.map((ad) => getHomeAdCardMarkup(ad, "top")).join("");
    bindHomeAdActions(homeTopAds);
  }

  if (homeBottomAd) {
    homeBottomAd.innerHTML = bottomAdItem ? getHomeAdCardMarkup(bottomAdItem, "bottom") : "";
    bindHomeAdActions(homeBottomAd);
  }

  homeAdsTopSection?.classList.toggle("hidden", !topAds.length);
  homeAdsBottomSection?.classList.toggle("hidden", !bottomAdItem);
}

async function loadHomeAds() {
  try {
    const response = await api(`/api/content/home-ads?t=${Date.now()}`);
    const topAds = Array.isArray(response?.homeAds?.top) ? response.homeAds.top : [];
    const bottomAd = response?.homeAds?.bottom || null;
    const mapApiAd = (ad, slotFallback) => {
      const normalized = normalizeHomeAd({
        title: ad?.title,
        subtitle: ad?.subtitle,
        image: ad?.image,
        link: ad?.link
      });
      return {
        ...normalized,
        slot: String(ad?.slot || slotFallback),
        isVisible: ad?.isVisible === undefined ? Boolean(normalized.title && normalized.image) : Boolean(ad?.isVisible)
      };
    };

    state.homeAds = {
      top: [
        mapApiAd(topAds[0], "top_1"),
        mapApiAd(topAds[1], "top_2")
      ],
      bottom: mapApiAd(bottomAd, "bottom")
    };

    renderHomeAds();
    homeAdsLastLoadedAt = Date.now();
    return;
  } catch (error) {
    console.debug("[home-ads] load failed:", error?.message || error);
    homeAdsLastLoadedAt = Date.now();
  }
}

function refreshHomeAdsIfNeeded(force = false) {
  const now = Date.now();
  if (!force && homeAdsRefreshPromise) return homeAdsRefreshPromise;
  if (!force && homeAdsLastLoadedAt && (now - homeAdsLastLoadedAt) < HOME_ADS_REFRESH_MIN_MS) {
    return Promise.resolve();
  }

  homeAdsRefreshPromise = loadHomeAds()
    .catch((error) => {
      console.debug("[home-ads] refresh failed:", error?.message || error);
    })
    .finally(() => {
      homeAdsRefreshPromise = null;
    });

  return homeAdsRefreshPromise;
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
  updateMobileNavContext(safeViewName);
  setMobileSheetState("");
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

  if (safeViewName === "home") {
    refreshHomeAdsIfNeeded(false);
  }

  window.dispatchEvent(new CustomEvent("marketplace:viewchange", {
    detail: { view: safeViewName }
  }));
  syncIsolatedMessagesMode(safeViewName);
  renderMobileBottomNav();
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
    customFields: product.customFields || product.custom_fields_json || {},
    priceOnRequest: Boolean(
      product.priceOnRequest
      || product?.customFields?.price_on_request
      || product?.customFields?.priceOnRequest
      || product?.custom_fields_json?.price_on_request
      || product?.custom_fields_json?.priceOnRequest
    ),
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

  const normalizedId = Number(productId);
  const setFavoriteButtonsState = (isActive) => {
    document.querySelectorAll(`[data-toggle-favorite="${normalizedId}"]`).forEach((btn) => {
      btn.classList.toggle("is-active-favorite", isActive);
      const nextLabel = isActive ? "إزالة من المفضلة" : "إضافة إلى المفضلة";
      btn.setAttribute("aria-label", nextLabel);
      btn.setAttribute("title", nextLabel);
      const iconNode = btn.querySelector("span");
      if (iconNode) iconNode.textContent = isActive ? "♥" : "♡";
    });
  };

  try {
    const wasFavorite = isFavoriteProduct(normalizedId);

    if (wasFavorite) {
      await api(`/api/favorites/${normalizedId}`, { method: "DELETE" });
      state.favoriteProductIds = state.favoriteProductIds.filter((id) => id !== normalizedId);
      state.favorites = state.favorites.filter((item) => item.id !== normalizedId);
      setFavoriteButtonsState(false);
      showToast("تمت إزالة المنتج من المفضلة");
    } else {
      await api("/api/favorites", {
        method: "POST",
        body: JSON.stringify({ productId: normalizedId })
      });
      if (!state.favoriteProductIds.includes(normalizedId)) {
        state.favoriteProductIds = [...state.favoriteProductIds, normalizedId];
      }
      setFavoriteButtonsState(true);
      showToast("تمت إضافة المنتج إلى المفضلة");
    }

    refreshNavBadges();

    if (favoritesView && !favoritesView.classList.contains("hidden")) {
      await loadFavorites();
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
  const filteredOrders = getFilteredOrders();
  const currentVisibleOrder = filteredOrders.find((order) => order.id === state.activeOrder?.id);
  if (!filteredOrders.length) {
    state.activeOrder = null;
    renderOrderDetails();
    return;
  }
  if (!currentVisibleOrder) {
    await loadOrderDetails(filteredOrders[0].id);
  }
}

function focusSellerRegistrationFlow() {
  const registerRole = document.getElementById("registerRole");
  if (registerRole) {
    registerRole.value = "seller";
    registerRole.dispatchEvent(new Event("change", { bubbles: true }));
  }

  syncRoleSpecificFields();

  const registerCard = registerRole?.closest(".card");
  registerCard?.scrollIntoView({ behavior: "smooth", block: "center" });
  document.getElementById("registerFullName")?.focus();
}

async function loadOrderDetails(orderId) {
  const data = await api(`/api/orders/${Number(orderId)}`);
  state.activeOrder = data.order || null;
  renderOrders();
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
  requestContextualPushPermission("order-cart").catch(() => {});
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

function getProductsPaginationDefault() {
  return {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
    hasMore: false,
    isLoading: false
  };
}

function setProductsLoadingState(isLoading) {
  state.productsPagination = {
    ...getProductsPaginationDefault(),
    ...state.productsPagination,
    isLoading: Boolean(isLoading)
  };
}

async function loadProducts({ mode = "reset" } = {}) {
  const appendMode = mode === "append";
  const currentPagination = {
    ...getProductsPaginationDefault(),
    ...state.productsPagination
  };

  if (currentPagination.isLoading) return;
  if (appendMode && !currentPagination.hasMore) return;

  const nextPage = appendMode ? currentPagination.page + 1 : 1;
  const nextLimit = currentPagination.limit || 20;

  setProductsLoadingState(true);
  renderHomeLoadMoreControl();

  const params = new URLSearchParams();
  if (state.search) params.set("keyword", state.search);
  if (state.selectedCategory !== "all") params.set("category", state.selectedCategory);
  if (state.selectedRegion !== "all") params.set("region", state.selectedRegion);
  if (state.sort) params.set("sort", state.sort);
  params.set("page", String(nextPage));
  params.set("limit", String(nextLimit));

  try {
    const data = await api(`/api/products?${params.toString()}`);
    const incomingProducts = normalizeProducts(data.items || data.products || []);

    if (appendMode) {
      const existingIds = new Set((state.products || []).map((item) => Number(item.id)));
      const merged = [...state.products];
      for (const product of incomingProducts) {
        if (existingIds.has(Number(product.id))) continue;
        merged.push(product);
      }
      state.products = merged;
    } else {
      state.products = incomingProducts;
    }

    state.filteredProducts = [...state.products];

    const responsePagination = data.pagination || {};
    const safeTotal = Number(responsePagination.total || state.products.length || 0);
    const safePage = Number(responsePagination.page || nextPage || 1);
    const safeLimit = Number(responsePagination.limit || nextLimit || 20);
    const safeTotalPages = Number(
      responsePagination.totalPages
      || (safeLimit > 0 ? Math.ceil(safeTotal / safeLimit) : 0)
      || 0
    );
    const safeHasMore = typeof responsePagination.hasMore === "boolean"
      ? responsePagination.hasMore
      : safePage < safeTotalPages;

    state.productsPagination = {
      page: safePage,
      limit: safeLimit,
      total: safeTotal,
      totalPages: safeTotalPages,
      hasMore: safeHasMore,
      isLoading: false
    };

    if (!state.metaLoaded) {
      buildMetaFromProducts();
    }

    renderFilters();
    renderHomeSections();
  } catch (error) {
    setProductsLoadingState(false);
    renderHomeLoadMoreControl();
    throw error;
  }
}

function buildMetaFromProducts() {
  const categories = [...new Set(state.products.map((p) => p.category).filter(Boolean))];
  const regions = [...new Set(state.products.map((p) => p.region).filter(Boolean))];
  state.categories = categories.sort((a, b) => a.localeCompare(b, "ar"));
  state.regions = regions.sort((a, b) => a.localeCompare(b, "ar"));
}

function syncDesktopFilterControls() {
  if (filterKeyword) filterKeyword.value = state.search;
  if (filterCategory) filterCategory.value = state.selectedCategory;
  if (filterRegion) filterRegion.value = state.selectedRegion;
  if (sortBy) sortBy.value = state.sort;
}

function syncMobileFilterControls() {
  if (mobileFilterKeyword) mobileFilterKeyword.value = state.search;
  if (mobileFilterCategory) mobileFilterCategory.value = state.selectedCategory;
  if (mobileFilterRegion) mobileFilterRegion.value = state.selectedRegion;
  if (mobileSortBy) mobileSortBy.value = state.sort;
  if (mobileSheetSortBy) mobileSheetSortBy.value = state.sort;
}

function updateMobileFiltersSummary(productsCount = state.filteredProducts?.length || state.products?.length || 0) {
  const safeCount = Math.max(0, Number(productsCount || 0));
  if (resultsCount) {
    resultsCount.textContent = `${safeCount} منتج`;
    resultsCount.classList.toggle("hidden", safeCount <= 0);
    resultsCount.setAttribute("aria-hidden", safeCount <= 0 ? "true" : "false");
  }
  if (mobileFiltersResultsCount) {
    mobileFiltersResultsCount.textContent = `${safeCount} منتج`;
  }
  mobileFiltersToolbar?.classList.toggle(
    "has-active-filters",
    Boolean(state.search || state.selectedCategory !== "all" || state.selectedRegion !== "all" || state.sort !== "newest")
  );
}

function renderFilterChips(container, { closeOnSelect = false } = {}) {
  if (!container) return;

  container.innerHTML = `
    <button class="chip ${state.selectedCategory === "all" ? "active" : ""}" data-chip-category="all">كل التصنيفات</button>
    ${state.categories.map((category) => `
      <button class="chip ${state.selectedCategory === category ? "active" : ""}" data-chip-category="${escapeHtml(category)}">${escapeHtml(category)}</button>
    `).join("")}
  `;

  container.querySelectorAll("[data-chip-category]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.selectedCategory = btn.dataset.chipCategory || "all";
      syncDesktopFilterControls();
      syncMobileFilterControls();
      await loadProducts();
      if (closeOnSelect) setMobileFiltersOpen(false);
    });
  });
}

function toUint8ArrayFromBase64(base64Value = "") {
  const padding = "=".repeat((4 - (base64Value.length % 4)) % 4);
  const base64 = (base64Value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    bytes[index] = raw.charCodeAt(index);
  }
  return bytes;
}

async function registerPushServiceWorker() {
  if (!SERVICE_WORKER_SUPPORTED) return null;
  if (state.pushRuntime.registrationPromise) return state.pushRuntime.registrationPromise;

  state.pushRuntime.registrationPromise = navigator.serviceWorker.register(PUSH_SERVICE_WORKER_PATH)
    .then((registration) => {
      const promptUpdateIfWaiting = (nextRegistration) => {
        if (nextRegistration?.waiting) {
          showServiceWorkerUpdatePrompt(nextRegistration);
        }
      };

      promptUpdateIfWaiting(registration);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener("statechange", () => {
          if (installing.state === "installed" && navigator.serviceWorker.controller) {
            showServiceWorkerUpdatePrompt(registration);
          }
        });
      });
      return registration;
    })
    .catch((error) => {
      console.debug("[sw] registration failed", error?.message || error);
      return null;
    })
    .finally(() => {
      state.pushRuntime.registrationPromise = null;
    });

  return state.pushRuntime.registrationPromise;
}

function removeServiceWorkerUpdatePrompt() {
  const banner = document.getElementById("swUpdateBanner");
  banner?.remove();
  state.pushRuntime.updatePromptVisible = false;
}

function showServiceWorkerUpdatePrompt(registration) {
  if (!registration?.waiting || state.pushRuntime.updatePromptVisible) return;

  state.pushRuntime.updatePromptVisible = true;
  const existing = document.getElementById("swUpdateBanner");
  if (existing) existing.remove();

  const banner = document.createElement("div");
  banner.id = "swUpdateBanner";
  banner.setAttribute("role", "status");
  banner.style.position = "fixed";
  banner.style.left = "16px";
  banner.style.right = "16px";
  banner.style.bottom = "16px";
  banner.style.zIndex = "1600";
  banner.style.background = "#0f172a";
  banner.style.color = "#ffffff";
  banner.style.borderRadius = "14px";
  banner.style.padding = "12px 14px";
  banner.style.display = "flex";
  banner.style.alignItems = "center";
  banner.style.justifyContent = "space-between";
  banner.style.gap = "10px";
  banner.style.boxShadow = "0 16px 36px rgba(15, 23, 42, 0.35)";
  banner.innerHTML = `
    <span style="font-size:13px;font-weight:700;">يوجد تحديث جديد للتطبيق.</span>
    <button id="swUpdateNowBtn" type="button" style="border:0;border-radius:10px;padding:8px 12px;background:#22c55e;color:#052e16;font-weight:800;cursor:pointer;">تحديث الآن</button>
  `;

  document.body.appendChild(banner);

  document.getElementById("swUpdateNowBtn")?.addEventListener("click", () => {
    state.pushRuntime.isReloadingForUpdate = true;
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  });
}

async function getPushVapidPublicKey() {
  if (state.pushRuntime.vapidPublicKey) return state.pushRuntime.vapidPublicKey;

  try {
    const data = await api("/api/push/vapid-public-key");
    const publicKey = String(data?.publicKey || "").trim();
    if (!publicKey) return "";
    state.pushRuntime.vapidPublicKey = publicKey;
    return publicKey;
  } catch (error) {
    const message = String(error?.message || "");
    if (message.toLowerCase().includes("disabled")) return "";
    console.debug("[push] failed to fetch vapid key", message);
    return "";
  }
}

async function ensurePushSubscription(reason = "runtime") {
  if (!PUSH_SUPPORTED || !state.user || !state.token) return false;
  if (Notification.permission !== "granted") return false;

  if (state.pushRuntime.subscribePromise) return state.pushRuntime.subscribePromise;

  state.pushRuntime.subscribePromise = (async () => {
    const registration = await registerPushServiceWorker();
    if (!registration) return false;

    try {
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const publicKey = await getPushVapidPublicKey();
        if (!publicKey) return false;
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toUint8ArrayFromBase64(publicKey)
        });
      }

      const serialized = subscription?.toJSON ? subscription.toJSON() : subscription;
      await api("/api/push/subscribe", {
        method: "POST",
        body: JSON.stringify({ subscription: serialized })
      });

      state.pushRuntime.isSubscribed = true;
      return true;
    } catch (error) {
      const message = String(error?.message || "");
      if (!message.toLowerCase().includes("disabled")) {
        console.debug(`[push] ensure subscription failed (${reason})`, message);
      }
      return false;
    } finally {
      state.pushRuntime.subscribePromise = null;
    }
  })();

  return state.pushRuntime.subscribePromise;
}

function fireAndForgetPushClientEvent(eventType, metadata = {}) {
  if (!state.token || !eventType) return;
  fetch("/api/push/client-event", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${state.token}`
    },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify({
      eventType,
      metadata
    })
  }).catch(() => {});
}

async function getCurrentPushSubscription() {
  if (!PUSH_SUPPORTED) return null;
  const existingRegistration = await navigator.serviceWorker.getRegistration();
  const registration = existingRegistration || await registerPushServiceWorker();
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

async function syncPushSettingsUi() {
  if (!pushSubscriptionStatusText) return;

  if (!state.user || !state.token) {
    pushSubscriptionStatusText.textContent = "سجل الدخول أولًا لإدارة إشعارات المتصفح.";
    if (enableBrowserPushBtn) enableBrowserPushBtn.disabled = true;
    if (unsubscribeBrowserPushBtn) unsubscribeBrowserPushBtn.disabled = true;
    return;
  }

  if (!PUSH_SUPPORTED) {
    pushSubscriptionStatusText.textContent = "هذا المتصفح لا يدعم Web Push.";
    if (enableBrowserPushBtn) enableBrowserPushBtn.disabled = true;
    if (unsubscribeBrowserPushBtn) unsubscribeBrowserPushBtn.disabled = true;
    return;
  }

  try {
    const permission = Notification.permission;
    let subscription = await getCurrentPushSubscription();
    let hasSubscription = Boolean(subscription);

    if (permission === "granted" && !hasSubscription) {
      const subscribed = await ensurePushSubscription("settings-sync");
      if (subscribed) {
        subscription = await getCurrentPushSubscription();
        hasSubscription = Boolean(subscription);
      }
    }

    if (permission === "denied") {
      pushSubscriptionStatusText.textContent = "الإشعارات محظورة من إعدادات المتصفح لهذا الموقع.";
    } else if (permission === "granted" && hasSubscription) {
      pushSubscriptionStatusText.textContent = "الإشعارات مفعّلة على هذا الجهاز.";
    } else if (permission === "granted") {
      pushSubscriptionStatusText.textContent = "الإذن مفعّل ولكن لا يوجد اشتراك نشط لهذا الجهاز.";
    } else {
      pushSubscriptionStatusText.textContent = "الإشعارات غير مفعّلة بعد. يمكنك تفعيلها من الزر أدناه.";
    }

    if (enableBrowserPushBtn) {
      enableBrowserPushBtn.disabled = permission === "denied";
    }
    if (unsubscribeBrowserPushBtn) {
      unsubscribeBrowserPushBtn.disabled = !hasSubscription;
    }
  } catch (error) {
    pushSubscriptionStatusText.textContent = "تعذر قراءة حالة الإشعارات على هذا الجهاز حاليًا.";
    if (enableBrowserPushBtn) enableBrowserPushBtn.disabled = false;
    if (unsubscribeBrowserPushBtn) unsubscribeBrowserPushBtn.disabled = true;
    console.debug("[push] failed to sync settings UI", error?.message || error);
  }
}

async function requestContextualPushPermission(trigger = "general") {
  if (!PUSH_SUPPORTED || !state.user || !state.token) return false;

  if (Notification.permission === "denied") {
    fireAndForgetPushClientEvent("push_permission_denied", { trigger, reason: "browser-denied" });
    writePushPromptState({ asked: true, accepted: false, declined: true });
    syncPushSettingsUi().catch(() => {});
    return false;
  }

  if (Notification.permission === "granted") {
    fireAndForgetPushClientEvent("push_permission_granted", { trigger, reason: "already-granted" });
    writePushPromptState({ asked: true, accepted: true, declined: false });
    const subscribed = await ensurePushSubscription(`${trigger}:already-granted`);
    syncPushSettingsUi().catch(() => {});
    return subscribed;
  }

  const publicKey = await getPushVapidPublicKey();
  if (!publicKey) return false;

  const promptState = state.pushRuntime.promptState || readPushPromptState();
  if (promptState.declined || promptState.asked) {
    return false;
  }

  writePushPromptState({ asked: true, accepted: false, declined: false });
  fireAndForgetPushClientEvent("push_permission_requested", { trigger });

  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      fireAndForgetPushClientEvent("push_permission_granted", { trigger, reason: "prompt-granted" });
      writePushPromptState({ asked: true, accepted: true, declined: false });
      const subscribed = await ensurePushSubscription(`${trigger}:prompt-granted`);
      syncPushSettingsUi().catch(() => {});
      return subscribed;
    }

    fireAndForgetPushClientEvent("push_permission_denied", { trigger, reason: "prompt-denied" });
    writePushPromptState({ asked: true, accepted: false, declined: true });
    syncPushSettingsUi().catch(() => {});
    return false;
  } catch (error) {
    console.debug("[push] permission request failed", error?.message || error);
    syncPushSettingsUi().catch(() => {});
    return false;
  }
}

if (SERVICE_WORKER_SUPPORTED) {
  navigator.serviceWorker.addEventListener("message", (event) => {
    const eventType = String(event?.data?.type || "").trim();
    if (eventType === "APP_UPDATE_AVAILABLE") {
      registerPushServiceWorker().catch(() => {});
      return;
    }

    if (eventType === "push:open") {
      const targetUrl = String(event?.data?.targetUrl || "");
      if (!targetUrl) return;
      const path = new URL(targetUrl, window.location.origin).pathname;
      if (typeof window.navigateTo === "function") {
        window.navigateTo(path).catch(() => {});
        return;
      }
      window.location.href = path;
    }
  });

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!state.pushRuntime.isReloadingForUpdate) return;
    window.location.reload();
  });
}

async function applyFiltersFromSource(source = "desktop") {
  if (source === "mobile") {
    state.search = mobileFilterKeyword?.value?.trim() || "";
    state.selectedCategory = mobileFilterCategory?.value || "all";
    state.selectedRegion = mobileFilterRegion?.value || "all";
    state.sort = mobileSheetSortBy?.value || mobileSortBy?.value || "newest";
  } else if (source === "toolbar") {
    state.sort = mobileSortBy?.value || "newest";
  } else {
    state.search = filterKeyword?.value?.trim() || "";
    state.selectedCategory = filterCategory?.value || "all";
    state.selectedRegion = filterRegion?.value || "all";
    state.sort = sortBy?.value || "newest";
  }

  syncDesktopFilterControls();
  syncMobileFilterControls();
  await loadProducts();
}

function renderFilters() {
  if (!filterCategory || !filterRegion || !filterKeyword || !sortBy || !categoryChips) return;

  const categoryOptions =
    `<option value="all">كل التصنيفات</option>` +
    state.categories.map((category) => {
      const selected = state.selectedCategory === category ? "selected" : "";
      return `<option value="${escapeHtml(category)}" ${selected}>${escapeHtml(category)}</option>`;
    }).join("");

  const regionOptions =
    `<option value="all">كل المناطق</option>` +
    state.regions.map((region) => {
      const selected = state.selectedRegion === region ? "selected" : "";
      return `<option value="${escapeHtml(region)}" ${selected}>${escapeHtml(region)}</option>`;
    }).join("");

  filterCategory.innerHTML = categoryOptions;
  if (mobileFilterCategory) mobileFilterCategory.innerHTML = categoryOptions;

  filterRegion.innerHTML = regionOptions;
  if (mobileFilterRegion) mobileFilterRegion.innerHTML = regionOptions;

  syncDesktopFilterControls();
  syncMobileFilterControls();
  renderFilterChips(categoryChips);
  renderFilterChips(mobileCategoryChips, { closeOnSelect: true });
  const productsTotal = Number(state.productsPagination?.total || 0);
  updateMobileFiltersSummary(productsTotal > 0 ? productsTotal : state.products.length);
}


function productCardHtml(product) {
  const sellerName = escapeHtml(product.seller?.storeName || product.seller?.fullName || "");
  const sellerId = Number(product.seller?.id || 0);
  const favoriteActive = isFavoriteProduct(product.id);
  const favoriteLabel = favoriteActive ? "إزالة من المفضلة" : "إضافة إلى المفضلة";
  const deliveryAvailable = Boolean(product.hasDeliveryService);
  const deliveryLabel = deliveryAvailable ? "التوصيل متاح" : "التوصيل غير متاح";
  const ratingValue = Number(product.seller?.averageRating || 0);
  const ratingLabel = Number.isFinite(ratingValue) ? ratingValue.toFixed(1) : "0.0";
  const ratingsCount = Number(product.seller?.ratingsCount || 0);
  const viewsCount = Number(product.viewsCount || 0);
  const regionLabel = product.region ? escapeHtml(product.region) : "غير محدد";
  const title = escapeHtml(product.name || "");
  const productImage = product.image
    ? `<img src="${escapeHtml(product.image)}" alt="${title}" loading="lazy" />`
    : `<div class="product-image-placeholder" aria-hidden="true"></div>`;

  let conditionClass = "";
  if (product.condition === "جديد") conditionClass = "condition-new";
  else if (product.condition === "مستعمل كالجديد") conditionClass = "condition-like-new";
  else if (product.condition === "مستعمل بحالة جيدة") conditionClass = "condition-used-good";

  return `
    <article class="product-card auction-card product-card-refined" data-open-product-card="${product.id}" tabindex="0" aria-label="عرض تفاصيل ${title}">
      ${product.condition ? `<div class="condition-ribbon ${conditionClass}">${escapeHtml(product.condition)}</div>` : ""}
      <div class="product-image product-image-wrap">
        ${productImage}
        <span class="views-badge compact-pill product-views-corner">
          <span class="views-icon" aria-hidden="true">👁</span>
          <span>${viewsCount}</span>
        </span>
        <div class="product-image-overlay" aria-hidden="true"></div>
        <div class="product-hover-actions" role="group" aria-label="إجراءات المنتج">
          <button class="product-hover-action product-hover-action-favorite ${favoriteActive ? "is-active-favorite" : ""}" data-toggle-favorite="${product.id}" type="button" aria-label="${favoriteLabel}" title="${favoriteLabel}">
            <span aria-hidden="true">${favoriteActive ? "♥" : "♡"}</span>
          </button>
        </div>
      </div>
      <div class="product-body product-body-pro">
        <div class="product-title" title="${title}">${title}</div>
        <div class="product-price-row">
          <div class="product-price product-price-inline product-price-hero">${getProductPriceLabel(product)}</div>
        </div>
        <div class="product-meta-grid pro-meta-grid">
          <div class="product-meta-inline">
            <span class="product-region-badge region-pill">
              <span class="region-icon" aria-hidden="true">📌</span>
              <span>${regionLabel}</span>
            </span>
            <button class="product-delivery-icon ${deliveryAvailable ? "is-available" : "is-unavailable"}" data-delivery-info="${deliveryAvailable ? "available" : "unavailable"}" type="button" aria-label="${deliveryLabel}" title="${deliveryLabel}">🚚</button>
          </div>
        </div>
        <div class="product-store-block product-store-block-pro product-store-rating-row">
          <a class="store-link store-link-pro product-store-inline" href="/seller/${sellerId}" data-route="/seller/${sellerId}" data-open-seller="${sellerId}" title="${sellerName}">${sellerName}</a>
          <div class="product-rating-inline">
            <span class="product-rating-star" aria-hidden="true">★</span>
            ${ratingLabel}
            <span class="rating-count">(${ratingsCount})</span>
          </div>
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
  scope.querySelectorAll("[data-open-product-card]").forEach((card) => {
    if (card.dataset.cardOpenBound === "true") return;
    card.dataset.cardOpenBound = "true";

    const openCardProduct = async () => {
      const productId = Number(card.dataset.openProductCard || 0);
      if (!productId) return;
      if (typeof window.navigateTo === "function") {
        await window.navigateTo(`/product/${productId}`);
        return;
      }
      await openProductPage(productId);
    };

    card.addEventListener("click", async (event) => {
      const interactiveTarget = event.target.closest("button, a, input, select, textarea, label");
      if (interactiveTarget) return;
      await openCardProduct();
    });

    card.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const interactiveTarget = event.target.closest("button, a, input, select, textarea, label");
      if (interactiveTarget && interactiveTarget !== card) return;
      event.preventDefault();
      await openCardProduct();
    });
  });

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
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      await toggleFavorite(Number(btn.dataset.toggleFavorite));
    });
  });

  scope.querySelectorAll("[data-add-cart]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await addProductToCart(Number(btn.dataset.addCart), 1);
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
  const totalProducts = Number(state.productsPagination?.total || state.filteredProducts.length || 0);
  resultsCount.textContent = `${totalProducts} منتج`;

  if (!state.filteredProducts.length) {
    destroyHomeCategoryMarquees();
    homeCategorySections.innerHTML = `<div class="card" style="padding:20px;"><p class="muted">لا توجد منتجات مطابقة.</p></div>`;
    renderHomeLoadMoreControl();
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
  renderHomeLoadMoreControl();
}

function renderHomeLoadMoreControl() {
  if (!homeLoadMoreWrap || !homeLoadMoreBtn) return;

  const hasProducts = Array.isArray(state.filteredProducts) && state.filteredProducts.length > 0;
  const hasMore = Boolean(state.productsPagination?.hasMore);
  const isLoading = Boolean(state.productsPagination?.isLoading);

  homeLoadMoreWrap.classList.toggle("hidden", !hasProducts || !hasMore);
  homeLoadMoreBtn.disabled = isLoading;
  homeLoadMoreBtn.textContent = isLoading ? "جارٍ التحميل..." : "تحميل المزيد";
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

  const canStartInquiry = state.user?.role === "buyer" && state.user.id !== product.seller.id;
  const canBuyDirect = !state.user || state.user.id !== product.seller.id;
  const productInfo = formatDetailRows([
    { label: "التصنيف", value: product.category },
    { label: "الموقع", value: product.region },
    { label: "الحالة", value: product.condition },
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
            <div class="product-price modal-price store-product-price">${getProductPriceLabel(product)}</div>
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
                <div class="detail-card-title">الشراء</div>
                <div class="muted">يمكنك الإضافة إلى السلة أو تنفيذ شراء مباشر وفتح المحادثة فوراً.</div>
              </div>
            </div>
            <div class="modal-cart-inline">
              <div class="modal-qty-stepper" aria-label="تحديد الكمية">
                <button class="modal-qty-btn" data-product-qty-change="-1" type="button" aria-label="تقليل الكمية">-</button>
                <input id="productViewQuantity" class="modal-qty-input" type="number" min="1" value="1" inputmode="numeric" />
                <button class="modal-qty-btn" data-product-qty-change="1" type="button" aria-label="زيادة الكمية">+</button>
              </div>
              <button class="btn btn-success store-buy-btn" id="productViewAddToCartBtn" type="button">أضف إلى السلة</button>
              ${canBuyDirect
                ? `<button class="btn btn-primary store-direct-buy-btn" id="productViewDirectBuyBtn" type="button">شراء مباشر</button>`
                : ""
              }
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

  document.getElementById("productViewDirectBuyBtn")?.addEventListener("click", async () => {
    const quantity = normalizeProductViewQuantity();
    await purchaseProduct(product.id, quantity);
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
    const canPurchaseProduct = !state.user || state.user.id !== product.seller.id;

    const productInfo = formatDetailRows([
      { label: "التصنيف", value: product.category },
      { label: "الموقع", value: product.region },
      { label: "الحالة", value: product.condition },
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
            <div class="product-price modal-price">${getProductPriceLabel(product)}</div>
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
  requestContextualPushPermission("conversation-start").catch(() => {});

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
  requestContextualPushPermission("order-product").catch(() => {});

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

function getOrderStatusFilterOptions() {
  const orderedKeys = ["submitted", "seller_confirmed", "buyer_confirmed", "in_preparation", "in_transport", "completed", "cancelled"];
  const labels = {
    submitted: "الجديدة",
    seller_confirmed: "المقبولة",
    buyer_confirmed: "قيد المتابعة",
    in_preparation: "قيد التحضير",
    in_transport: "قيد النقل",
    completed: "المكتملة",
    cancelled: "المرفوضة"
  };

  const statuses = Array.from(new Set((state.orders || []).map((order) => String(order.status || "").trim()).filter(Boolean)));
  const sortedStatuses = orderedKeys.filter((status) => statuses.includes(status)).concat(
    statuses.filter((status) => !orderedKeys.includes(status))
  );

  return [
    { key: "all", label: "الكل" },
    ...sortedStatuses.map((status) => ({ key: status, label: labels[status] || formatOrderStatus(status) }))
  ];
}

function getFilteredOrders() {
  const activeFilter = String(state.orderFilterStatus || "all");
  if (activeFilter === "all") return [...(state.orders || [])];
  return (state.orders || []).filter((order) => String(order.status || "") === activeFilter);
}

function getOrderPartyName(order, isSellerView = isSellerUser()) {
  return isSellerView
    ? String(order?.buyerName || order?.buyer?.fullName || order?.buyer?.name || "").trim()
    : String(order?.sellerName || order?.seller?.storeName || order?.seller?.fullName || "").trim();
}

function getOrderAddress(order, isSellerView = isSellerUser()) {
  const directAddress = isSellerView
    ? order?.buyerAddress || order?.shippingAddress || order?.deliveryAddress || order?.address
    : order?.sellerAddress || order?.seller?.address;
  const partyRegion = isSellerView
    ? order?.buyerRegion || order?.buyer?.region
    : order?.sellerRegion || order?.seller?.region;
  return String(directAddress || partyRegion || "").trim();
}

function getOrderPreviewItems(order) {
  return Array.isArray(order?.items) ? order.items.slice(0, 2) : [];
}

function getOrderStatusBadgeClass(status) {
  const tone = getOrderStatusTone(status);
  if (tone === "status-success") return "is-success";
  if (tone === "status-danger") return "is-danger";
  if (tone === "status-progress") return "is-progress";
  if (tone === "status-accent") return "is-accent";
  return "is-pending";
}

function renderOrderTabs() {
  if (!ordersTabs) return;
  const options = getOrderStatusFilterOptions();

  ordersTabs.innerHTML = options.map((option) => {
    const count = option.key === "all"
      ? (state.orders || []).length
      : (state.orders || []).filter((order) => String(order.status || "") === option.key).length;

    return `
      <button class="orders-status-tab ${state.orderFilterStatus === option.key ? "is-active" : ""}" data-order-filter="${escapeHtml(option.key)}" type="button">
        <span>${escapeHtml(option.label)}</span>
        <strong>${count}</strong>
      </button>
    `;
  }).join("");

  ordersTabs.querySelectorAll("[data-order-filter]").forEach((button) => {
    button.addEventListener("click", async () => {
      state.orderFilterStatus = String(button.dataset.orderFilter || "all");
      renderOrders();
      const filteredOrders = getFilteredOrders();
      if (!filteredOrders.length) {
        state.activeOrder = null;
        renderOrderDetails();
        return;
      }
      if (!filteredOrders.find((order) => order.id === state.activeOrder?.id)) {
        await loadOrderDetails(filteredOrders[0].id);
      }
    });
  });
}

function renderOrders() {
  if (!ordersList) return;
  const isSellerView = isSellerUser();
  const filteredOrders = getFilteredOrders();
  renderOrderTabs();

  if (!filteredOrders.length) {
    setSoftEmpty(ordersList, isSellerView ? "لا توجد طلبات واردة بعد." : "لا توجد طلبات بعد.");
    if (orderDetailsPanel) orderDetailsPanel.innerHTML = `اختر طلبًا لعرض تفاصيله`;
    return;
  }

  ordersList.innerHTML = filteredOrders.map((order) => {
    const counterpartName = getOrderPartyName(order, isSellerView) || "-";
    const address = getOrderAddress(order, isSellerView);
    const previewItems = getOrderPreviewItems(order);
    const quickPrimaryAction = getAllowedOrderActions(order)[0] || null;

    return `
      <article class="order-card-pro ${state.activeOrder?.id === order.id ? "is-active" : ""}" data-open-order="${order.id}" tabindex="0" aria-label="عرض تفاصيل الطلب ${order.id}">
        <div class="order-card-pro-head">
          <div class="order-card-head-main">
            <span class="order-card-id">#${order.id}</span>
            <span class="order-card-date">${order.createdAt ? new Date(order.createdAt).toLocaleDateString("ar") : ""}</span>
          </div>
          <span class="order-card-status ${getOrderStatusBadgeClass(order.status)}">${escapeHtml(formatOrderStatus(order.status))}</span>
        </div>

        <div class="order-card-party">
          <div class="order-card-party-name">
            <span aria-hidden="true">${isSellerView ? "🧑‍💼" : "🏪"}</span>
            <strong>${escapeHtml(counterpartName)}</strong>
          </div>
          ${address ? `
            <div class="order-card-party-address">
              <span aria-hidden="true">📍</span>
              <span>${escapeHtml(address)}</span>
            </div>
          ` : ""}
        </div>

        <div class="order-card-products">
          ${previewItems.length ? previewItems.map((item) => `
            <div class="order-card-product-item">
              ${item.product?.image ? `<img class="order-card-product-thumb" src="${escapeHtml(item.product.image)}" alt="${escapeHtml(item.product?.name || "")}" loading="lazy">` : `<div class="order-card-product-thumb order-card-product-thumb-placeholder" aria-hidden="true"></div>`}
              <div class="order-card-product-copy">
                <div class="order-card-product-name">${escapeHtml(item.product?.name || "منتج")}</div>
                <div class="order-card-product-meta">
                  <span>الكمية: ${Number(item.quantity || 0)}</span>
                  <span>${formatPrice(item.lineTotal || item.price || 0, item.product?.currency || "ل.س")}</span>
                </div>
              </div>
            </div>
          `).join("") : `
            <div class="order-card-fallback-meta">
              <span>المصدر: ${escapeHtml(formatOrderSource(order.sourceType))}</span>
              <span>عدد العناصر: ${Number(order.itemsCount || 0)}</span>
            </div>
          `}
        </div>

        <div class="order-card-total">
          <span>الإجمالي</span>
          <strong>${formatPrice(order.totalAmount, "ل.س")}</strong>
        </div>

        <div class="order-card-actions">
          <button class="btn btn-outline" data-order-card-chat="${order.id}" type="button">محادثة</button>
          ${quickPrimaryAction
            ? `<button class="btn ${quickPrimaryAction.tone}" data-order-card-status="${escapeHtml(quickPrimaryAction.key)}" data-order-id="${order.id}" type="button">${escapeHtml(quickPrimaryAction.label)}</button>`
            : `<button class="btn btn-light" data-order-card-details="${order.id}" type="button">عرض التفاصيل</button>`
          }
        </div>
      </article>
    `;
  }).join("");

  ordersList.querySelectorAll("[data-open-order]").forEach((node) => {
    node.addEventListener("click", async (event) => {
      const actionTrigger = event.target.closest("[data-order-card-chat], [data-order-card-status]");
      if (actionTrigger) return;
      await loadOrderDetails(Number(node.dataset.openOrder));
    });

    node.addEventListener("keydown", async (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest("[data-order-card-chat], [data-order-card-status]")) return;
      event.preventDefault();
      await loadOrderDetails(Number(node.dataset.openOrder));
    });
  });

  ordersList.querySelectorAll("[data-order-card-chat]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      const order = filteredOrders.find((item) => item.id === Number(button.dataset.orderCardChat));
      if (!order) return;
      await goToOrderConversation(order);
    });
  });

  ordersList.querySelectorAll("[data-order-card-status]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await updateOrderStatus(Number(button.dataset.orderId), button.dataset.orderCardStatus);
    });
  });

  ordersList.querySelectorAll("[data-order-card-details]").forEach((button) => {
    button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await loadOrderDetails(Number(button.dataset.orderCardDetails));
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
  const counterpartAddress = getOrderAddress(order, isSellerView);

  orderDetailsPanel.innerHTML = `
    <div class="order-details-hero">
      <div class="order-details-hero-head">
        <div>
          <div class="order-details-eyebrow">طلب #${order.id}</div>
          <h3>${escapeHtml(formatOrderStatus(order.status))}</h3>
        </div>
        <span class="order-card-status ${getOrderStatusBadgeClass(order.status)}">${escapeHtml(formatOrderStatus(order.status))}</span>
      </div>

      <div class="order-details-party">
        <div class="order-card-party-name">
          <span aria-hidden="true">${isSellerView ? "🧑‍💼" : "🏪"}</span>
          <strong>${escapeHtml(counterpartName || counterpartLabel)}</strong>
        </div>
        ${counterpartAddress ? `
          <div class="order-card-party-address">
            <span aria-hidden="true">📍</span>
            <span>${escapeHtml(counterpartAddress)}</span>
          </div>
        ` : ""}
      </div>

      <div class="order-details-summary-grid">
        <div class="order-details-stat"><span>الإجمالي</span><strong>${formatPrice(order.totalAmount, "ل.س")}</strong></div>
        <div class="order-details-stat"><span>العناصر</span><strong>${Number(order.itemsCount || order.items?.length || 0)}</strong></div>
        <div class="order-details-stat"><span>المصدر</span><strong>${escapeHtml(formatOrderSource(order.sourceType))}</strong></div>
        <div class="order-details-stat"><span>المحادثة</span><strong>${order.conversationId ? ("#" + order.conversationId) : "غير متوفرة"}</strong></div>
      </div>
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

    <div class="order-item-actions order-item-actions-pro" style="margin-top:14px;">
      <button class="btn btn-secondary" data-order-conversation="${order.id}" type="button">${order.conversationId ? "فتح المحادثة" : "مراسلة ${counterpartLabel}"}</button>
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
  syncPushSettingsUi().catch(() => {});
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
    const [summaryData, productsData, ordersData] = await Promise.all([
      api("/api/dashboard/summary"),
      api("/api/my/products"),
      api("/api/orders")
    ]);

    const summary = summaryData.summary || {};
    const products = normalizeProducts(productsData.products || []);
    state.orders = ordersData.orders || [];
    state.dashboardSummary = summary;
    state.dashboardProducts = products;

    if (dashboardUserInfo) {
      dashboardUserInfo.textContent = `${state.user.storeName || state.user.fullName || ""} - ${state.user.region || ""}`;
    }

    if (dashboardHeroTitle) {
      dashboardHeroTitle.textContent = `مرحباً، ${state.user.storeName || state.user.fullName || "التاجر"}`;
    }

    if (dashboardHeroSubtitle) {
      dashboardHeroSubtitle.textContent = "إليك ملخص متجرك اليوم، وأحدث الطلبات، وأسرع الطرق لإدارة المنتجات من مكان واحد.";
    }

    renderDashboardStats(summary);
    renderDashboardRecentOrders();
    renderDashboardProducts();
    refreshNavBadges();
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
    const priceOnRequest = document.getElementById("pPriceOnRequest")?.checked === true;
    formData.append("name", document.getElementById("pName")?.value?.trim() || "");
    formData.append("description", document.getElementById("pDescription")?.value?.trim() || "");
    formData.append("price", priceOnRequest ? "0" : (document.getElementById("pPrice")?.value || "0"));
    formData.append("currency", document.getElementById("pCurrency")?.value || "ل.س");
    formData.append("category", document.getElementById("pCategory")?.value?.trim() || "");
    formData.append("region", document.getElementById("pRegion")?.value?.trim() || "");
    formData.append("condition", document.getElementById("pCondition")?.value || "جديد");
    formData.append("has_delivery_service", document.getElementById("pHasDeliveryService")?.checked ? "true" : "false");
    formData.append("tags", document.getElementById("pTags")?.value?.trim() || "");
    formData.append("status", document.getElementById("pStatus")?.value || "published");
    formData.append("customFields", JSON.stringify({ price_on_request: priceOnRequest }));

    const files = document.getElementById("pImages")?.files || [];
    Array.from(files).slice(0, 5).forEach((file) => formData.append("images", file));

    const data = await api("/api/products", {
      method: "POST",
      body: formData
    });

    const newProduct = data?.product ? normalizeProducts([data.product])[0] : null;
    showToast("تمت إضافة المنتج");
    addProductForm?.reset();
    syncPriceModeInProductForm();
    renderProductImagePreview();
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
  if (!state.user?.role || state.user.role !== "seller") clearBuyerExperienceState();
  if (state.user) fillProfileFormFromUser();
  if (state.user) window.marketplacePoller?.start?.();
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
        <div class="message-bubble ${isMessageFromCurrentUser(message) ? "mine" : "other"}">
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
    const nextConversationId = Number(
      state.selectedConversationId
      || state.activeConversationId
      || state.conversations[0]?.id
      || 0
    );

    renderConversationsList(state.conversations, nextConversationId || null);

    if (nextConversationId) {
      await openConversation(nextConversationId);
    } else {
      renderConversationDetails(null);
    }
  } catch (error) {
    showToast(error.message);
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

function isMessageFromCurrentUser(message) {
  const currentUserId = Number(state.user?.id || 0);
  const senderId = Number(
    message?.senderId
      ?? message?.sender_id
      ?? message?.senderUserId
      ?? message?.sender_user_id
      ?? message?.userId
      ?? message?.user_id
      ?? 0
  );
  if (currentUserId > 0 && senderId > 0) {
    return currentUserId === senderId;
  }

  const currentRole = String(state.user?.role || "").trim().toLowerCase();
  const senderRole = String(message?.senderRole || message?.sender_role || "").trim().toLowerCase();
  if (currentRole && senderRole) {
    return currentRole === senderRole;
  }

  return false;
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
    const isOwn = isMessageFromCurrentUser(message);
    const sendState = String(message.sendState || "").toLowerCase();
    const isPending = sendState === "pending";
    const isFailed = sendState === "failed";
    const statusLabel = isPending ? "قيد الإرسال..." : isFailed ? "فشل الإرسال" : "";
    const retryAction = isFailed && message.clientTempId
      ? `<button class="chat-retry-btn" type="button" data-retry-message="${escapeHtml(String(message.clientTempId))}">إعادة المحاولة</button>`
      : "";

    return `
      ${daySeparator}
      <div class="chat-row ${isOwn ? "is-me" : "is-other"}">
        <div class="chat-bubble ${isOwn ? "is-me is-own" : "is-other"}">
          <div class="chat-body">${escapeHtml(message.body || "")}</div>
          <div class="chat-meta-inline">
            <span class="chat-time-inline">${escapeHtml(formatChatTime(message.createdAt))}</span>
            ${isOwn ? '<span class="chat-status-inline" aria-hidden="true">✓✓</span>' : ""}
            ${statusLabel ? `<span class="chat-send-state">${escapeHtml(statusLabel)}</span>` : ""}
          </div>
          ${retryAction}
        </div>
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
          <div class="chat-bubble ${isMessageFromCurrentUser(message) ? "is-me" : "is-other"}">
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
    window.marketplacePoller?.notifyConversationOpened?.(conversationId);
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

function resolveNotificationTargetPath(notification) {
  if (!notification || typeof notification !== "object") return "";

  const rawLink = String(notification.linkUrl || "").trim();
  const metadata = notification.metadata && typeof notification.metadata === "object"
    ? notification.metadata
    : {};
  const conversationId = Number.parseInt(String(metadata.conversationId || ""), 10);

  if ((notification.type === "message" || rawLink === "/messages")
    && Number.isInteger(conversationId)
    && conversationId > 0) {
    return `/conversation/${conversationId}`;
  }

  return rawLink;
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
            ${resolveNotificationTargetPath(item) ? `<a class="btn btn-light" href="${escapeHtml(resolveNotificationTargetPath(item))}" data-route="${escapeHtml(resolveNotificationTargetPath(item))}" data-open-notification="${item.id}">فتح</a>` : ""}
            ${item.isRead ? "" : `<button class="btn btn-outline" type="button" data-read-notification="${item.id}">تمت القراءة</button>`}
          </div>
        </div>
      `).join("")
    : `<div class="soft-empty">لا توجد إشعارات حالياً.</div>`;

  const markNotificationReadInBackground = (notificationId) => {
    if (!state.token || !Number.isInteger(notificationId) || notificationId <= 0) return;
    fetch(`/api/notifications/${notificationId}/read`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${state.token}`
      },
      credentials: "same-origin",
      keepalive: true
    }).catch((error) => {
      console.debug("[notifications] background mark-read failed", notificationId, error?.message || error);
    });
  };

  notificationsList.querySelectorAll("[data-open-notification]").forEach((link) => {
    link.addEventListener("click", () => {
      const notificationId = Number(link.dataset.openNotification || 0);
      if (!Number.isInteger(notificationId) || notificationId <= 0) return;

      const notification = (state.notifications || []).find((item) => Number(item.id) === notificationId);
      const wasUnread = Boolean(notification && !notification.isRead);
      if (wasUnread) {
        notification.isRead = true;
        link.closest(".notification-item")?.classList.remove("is-unread");
        link.closest(".notification-item")?.querySelector("[data-read-notification]")?.remove();
        refreshNavBadges();
      }

      // Fire-and-forget to avoid blocking navigation while still persisting read state.
      if (wasUnread) markNotificationReadInBackground(notificationId);
    }, { capture: true });
  });

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

function getConversationPresenceLabel(conversation) {
  if (!conversation) return "آخر ظهور غير متاح";
  if (conversation.status === "open") return "متاح للمراسلة الآن";
  const lastActivity = conversation.lastMessageAt || conversation.updatedAt || conversation.createdAt;
  if (!lastActivity) return "آخر ظهور غير متاح";
  try {
    return `آخر نشاط ${new Date(lastActivity).toLocaleString("ar", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}`;
  } catch (_error) {
    return "آخر ظهور غير متاح";
  }
}

function getPrimaryLinkedOrder(conversation) {
  const linkedOrders = Array.isArray(conversation?.linkedOrders) ? conversation.linkedOrders : [];
  return linkedOrders[0] || null;
}

function getConversationOrderStateMeta(conversation) {
  const order = getPrimaryLinkedOrder(conversation);
  if (!order) return null;

  const orderStatus = String(order.status || "").trim();
  const currentUserId = Number(state.user?.id || 0);
  const orderSellerId = Number(order.sellerId || 0);
  const isSellerForOrder = currentUserId > 0 && orderSellerId > 0 && currentUserId === orderSellerId;

  if (orderStatus === "cancelled") {
    return {
      label: "ملغي",
      className: "status-order-cancelled"
    };
  }

  if (orderStatus === "completed") {
    return {
      label: "مقبول",
      className: "status-order-accepted"
    };
  }

  if (orderStatus === "seller_confirmed") {
    return isSellerForOrder
      ? { label: "مقبول", className: "status-order-accepted" }
      : { label: "بانتظار الاستلام", className: "status-order-awaiting" };
  }

  return null;
}

function renderConversationOrderSheet(conversation) {
  if (!conversationOrderSheetContent) return;

  const order = getPrimaryLinkedOrder(conversation);
  const product = conversation?.product || {};
  const productTitle = escapeHtml(product.name || "منتج مرتبط");
  const priceLabel = order
    ? formatPrice(order.totalAmount || product.price || 0, product.currency || "ل.س")
    : getProductPriceLabel(product);
  const statusLabel = order
    ? formatOrderStatus(order.status)
    : formatConversationStatus(conversation?.status || "");
  const imageMarkup = product.image
    ? `<img class="chat-order-sheet-image" src="${escapeHtml(product.image)}" alt="${productTitle}" />`
    : `<div class="chat-order-sheet-image chat-order-sheet-image-placeholder" aria-hidden="true"></div>`;

  conversationOrderSheetContent.innerHTML = `
    <div class="chat-order-sheet-card">
      ${imageMarkup}
      <div class="chat-order-sheet-copy">
        <div class="chat-order-sheet-title">${productTitle}</div>
        <div class="chat-order-sheet-price">${priceLabel}</div>
        <div class="chat-order-sheet-status">${escapeHtml(statusLabel || "بدون حالة")}</div>
        <div class="chat-order-sheet-actions">
          <button class="btn btn-secondary" id="conversationOrderOpenProductBtn" type="button">عرض المنتج</button>
          <button class="btn btn-light" id="conversationOrderOpenSellerBtn" type="button">عرض التاجر</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById("conversationOrderOpenProductBtn")?.addEventListener("click", async () => {
    closeModal(conversationOrderSheetModal);
    if (!product.id) return;
    if (typeof window.navigateTo === "function") {
      await window.navigateTo(`/product/${Number(product.id)}`);
      return;
    }
    await openProductPage(Number(product.id));
  });

  document.getElementById("conversationOrderOpenSellerBtn")?.addEventListener("click", async () => {
    closeModal(conversationOrderSheetModal);
    const sellerId = Number(conversation?.sellerId || conversation?.seller?.id || 0);
    if (!sellerId) return;
    if (typeof window.navigateTo === "function") {
      await window.navigateTo(`/seller/${sellerId}`);
      return;
    }
    await openSellerPage(sellerId);
  });
}

function openConversationOrderSheet(conversation) {
  renderConversationOrderSheet(conversation);
  openModal(conversationOrderSheetModal);
}

async function openActiveConversationsList() {
  if (!state.user) return;

  if (!Array.isArray(state.conversations) || !state.conversations.length) {
    await loadMessages();
  }

  if (!Array.isArray(state.conversations) || !state.conversations.length) {
    showToast("لا توجد محادثات فعالة حالياً");
    return;
  }

  if (window.innerWidth > 900) {
    const sidebar = document.querySelector(".conversations-card");
    const activeCard = conversationsList?.querySelector(".conversation-card.is-active, .conversation-entry.is-active")
      || conversationsList?.querySelector("[data-open-conversation]");

    sidebar?.classList.add("is-attention");
    window.setTimeout(() => sidebar?.classList.remove("is-attention"), 1400);

    if (activeCard && typeof activeCard.scrollIntoView === "function") {
      activeCard.scrollIntoView({ block: "nearest", behavior: "smooth" });
      activeCard.focus?.();
    }
    return;
  }

  renderConversationsList(state.conversations, Number(state.selectedConversationId || state.activeConversation?.id || state.conversations[0]?.id || 0));
  setMobileConversationPickerOpen(true);
  window.setTimeout(() => {
    mobileConversationsMenu?.querySelector("[data-open-conversation]")?.focus?.();
  }, 40);
}

function getConversationAvatarToken(conversation, fallbackLabel = "") {
  const raw = String(
    conversation?.seller?.storeName
    || conversation?.seller?.fullName
    || conversation?.buyer?.fullName
    || fallbackLabel
    || ""
  ).trim();
  return raw ? raw.charAt(0) : "م";
}

function syncIsolatedMessagesMode(viewName = state.mobileNavContext?.view || "home") {
  const isChatScreen = viewName === "messages" && window.innerWidth <= 900;
  document.body.classList.toggle("chat-screen-active", isChatScreen);
  if (!isChatScreen) {
    supportWidget?.classList.add("hidden");
    setMobileConversationPickerOpen(false);
    closeModal(conversationOrderSheetModal);
  }
}

async function handleConversationBackNavigation() {
  setMobileConversationPickerOpen(false);
  closeModal(conversationOrderSheetModal);

  try {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
  } catch (_error) {}

  if (typeof window.navigateTo === "function") {
    await window.navigateTo("/");
    return;
  }

  showView("home");
}

function createConversationCardMarkup(conversation, activeConversationId = null) {
  const otherPartyName = getConversationDisplayName(conversation);
  const initial = String(otherPartyName || "م").slice(0, 1);
  const orderState = getConversationOrderStateMeta(conversation);
  const lastMessageText = escapeHtml(conversation.lastMessage || "لا توجد رسائل بعد");
  const footerStatusClass = orderState ? orderState.className : getConversationStatusClass(conversation.status);
  const footerStatusLabel = orderState ? orderState.label : formatConversationStatus(conversation.status);
  const tailState = orderState
    ? `<span class="conversation-tail-label ${orderState.className}">${escapeHtml(orderState.label)}</span>`
    : "";

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
        <div class="conversation-row-last"><span class="conversation-last-text">${lastMessageText}</span>${tailState}</div>
        <div class="conversation-card-footer">
          <div class="conversation-row-status ${footerStatusClass}">${footerStatusLabel}</div>
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
      await api(`/api/conversations/${conversation.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ message })
      });

      input.value = "";
      await openConversation(conversation.id);
      await loadMessages();
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
    mobileConversationsMenu.innerHTML = `
      <div class="mobile-conversations-sheet-head">
        <div class="mobile-conversations-sheet-handle" aria-hidden="true"></div>
        <div class="mobile-conversations-sheet-title">المحادثات</div>
        <input class="mobile-conversations-search" id="mobileConversationSearchField" type="search" placeholder="ابحث في المحادثات..." value="${escapeHtml(searchValue)}" />
      </div>
      <div class="mobile-conversations-sheet-list">
        ${filtered.map((conversation) => `
          <button class="mobile-conversation-option ${activeConversationId === conversation.id ? "is-active" : ""}" data-open-conversation="${conversation.id}" type="button">
            <span class="mobile-conversation-avatar" aria-hidden="true">${escapeHtml(getConversationAvatarToken(conversation, getConversationDisplayName(conversation)))}</span>
            <span class="mobile-conversation-copy">
              <strong>${escapeHtml(getConversationDisplayName(conversation))}</strong>
              <span>${escapeHtml(conversation.product?.name || "بدون منتج")}</span>
            </span>
          </button>
        `).join("")}
      </div>
    `;
  }

  const bindOpenConversation = (scope) => {
    scope?.querySelectorAll("[data-open-conversation]").forEach((item) => {
      item.addEventListener("click", async (event) => {
        const conversationId = Number(item.dataset.openConversation);
        setMobileConversationPickerOpen(false);
        if (typeof window.navigateTo === "function" && window.innerWidth > 900) {
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
  document.getElementById("mobileConversationSearchField")?.addEventListener("input", (event) => {
    const nextValue = String(event.target?.value || "");
    const desktopSearch = document.getElementById("conversationQuickSearch");
    if (desktopSearch) desktopSearch.value = nextValue;
    renderConversationsList(state.conversations, activeConversationId);
  });
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

async function handleMobileNavigationAction(action) {
  const normalizedAction = String(action || "");
  if (!normalizedAction) return;

  if (normalizedAction === "menu") {
    setMobileHeaderMenuOpen(!state.mobileHeaderMenuOpen);
    return;
  }

  if (normalizedAction === "search") {
    setMobileSheetState("");
    openSearchArea();
    return;
  }

  setMobileSheetState("");

  if (normalizedAction === "home") {
    if (typeof window.navigateTo === "function") {
      await window.navigateTo("/");
      return;
    }
    showView("home");
    return;
  }

  if (normalizedAction === "filtersSection" || normalizedAction === "benefitsSection") {
    await goToHomeSection(normalizedAction);
    return;
  }

  if (normalizedAction === "login") {
    if (typeof window.navigateTo === "function") {
      await window.navigateTo("/auth");
      return;
    }
    showView("auth");
    return;
  }

  if (normalizedAction === "profile") {
    if (typeof window.navigateTo === "function") {
      await window.navigateTo("/profile");
      return;
    }
    fillProfileFormFromUser();
    showView("profile");
    return;
  }

  if (normalizedAction === "messages") {
    if (typeof window.navigateTo === "function") {
      await window.navigateTo("/conversations");
      return;
    }
    await loadMessages();
    showView("messages");
    return;
  }

  if (normalizedAction === "notifications") {
    await loadNotifications();
    showView("notifications");
    return;
  }

  if (normalizedAction === "favorites") {
    if (typeof window.navigateTo === "function") {
      await window.navigateTo("/favorites");
      return;
    }
    await loadFavorites();
    showView("favorites");
    return;
  }

  if (normalizedAction === "cart") {
    if (typeof window.navigateTo === "function") {
      await window.navigateTo("/cart");
      return;
    }
    await loadCart();
    showView("cart");
    return;
  }

  if (normalizedAction === "orders") {
    if (typeof window.navigateTo === "function") {
      await window.navigateTo("/orders");
      return;
    }
    await loadOrders();
    showView("orders");
    return;
  }

  if (normalizedAction === "dashboard") {
    if (typeof window.navigateTo === "function") {
      await window.navigateTo("/dashboard");
      return;
    }
    await loadDashboard();
    showView("dashboard");
    return;
  }

  if (normalizedAction === "add-product") {
    openModal(productFormModal);
    return;
  }

  if (normalizedAction === "admin") {
    if (state.user?.role === "admin") window.location.href = "/admin";
    return;
  }

  if (normalizedAction === "logout") {
    navLogoutBtn?.click();
  }
}

async function handleSearchAndFilters() {
  await applyFiltersFromSource("desktop");
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
  const statusLabelMap = {
    draft: "مسودة",
    published: "منشور",
    hidden: "مخفي",
    sold: "مباع",
    archived: "مؤرشف"
  };
  const statusLabel = statusLabelMap[product.status] || product.status || "-";
  const actions = [
    { type: "open", icon: "↗", label: "عرض المنتج", className: "dashboard-icon-open" },
    {
      type: "status",
      next: product.status === "published" ? "hidden" : "published",
      icon: product.status === "published" ? "🙈" : "✈",
      label: product.status === "published" ? "إخفاء المنتج" : "نشر المنتج",
      className: product.status === "published" ? "dashboard-icon-hide" : "dashboard-icon-publish"
    },
    {
      type: "status",
      next: product.status === "sold" ? "draft" : "sold",
      icon: product.status === "sold" ? "📝" : "✓",
      label: product.status === "sold" ? "إعادته كمسودة" : "تحديده كمباع",
      className: product.status === "sold" ? "dashboard-icon-draft" : "dashboard-icon-sold"
    },
    { type: "status", next: "archived", icon: "🗑", label: "أرشفة المنتج", className: "dashboard-icon-delete" }
  ];

  return `
    <article class="list-item managed-product-card managed-product-card-mini">
      <div class="managed-product-head">
        ${product.image ? `<img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" class="managed-product-image" />` : `<div class="managed-product-image managed-product-image-placeholder"></div>`}
        <div class="managed-product-copy">
          <div class="managed-product-title-row">
            <strong>${escapeHtml(product.name)}</strong>
          </div>
          <div class="managed-product-meta-row">
            <span>SKU: #${product.id}</span>
            <span>المشاهدات: ${Number(product.viewsCount || 0).toLocaleString("ar")}</span>
          </div>
          <div class="managed-product-support-row">
            <span>${escapeHtml(product.category || "بدون تصنيف")}</span>
            <span>${escapeHtml(product.region || "بدون منطقة")}</span>
          </div>
        </div>
        <div class="managed-product-side">
          <span class="managed-product-status-chip managed-product-status-${escapeHtml(product.status || "draft")}">${escapeHtml(statusLabel)}</span>
          <div class="managed-product-price">${getProductPriceLabel(product)}</div>
          <span class="managed-product-side-note">${product.hasDeliveryService ? "توصيل متاح" : "بدون توصيل"}</span>
        </div>
      </div>
      <div class="nav-actions managed-product-actions managed-product-actions-mini">
        ${actions.map((action) => action.type === "open"
          ? `<button class="managed-action-icon ${action.className}" type="button" data-dashboard-open-product="${product.id}" aria-label="${escapeHtml(action.label)}" title="${escapeHtml(action.label)}"><span class="managed-action-glyph" aria-hidden="true">${action.icon}</span><span class="managed-action-label">${escapeHtml(action.label)}</span></button>`
          : `<button class="managed-action-icon ${action.className}" type="button" data-my-product-status="${product.id}" data-next="${escapeHtml(action.next)}" aria-label="${escapeHtml(action.label)}" title="${escapeHtml(action.label)}"><span class="managed-action-glyph" aria-hidden="true">${action.icon}</span><span class="managed-action-label">${escapeHtml(action.label)}</span></button>`
        ).join("")}
      </div>
    </article>
  `;
}

function syncPriceModeInProductForm() {
  const priceOnRequestInput = document.getElementById("pPriceOnRequest");
  const priceInput = document.getElementById("pPrice");
  if (!priceOnRequestInput || !priceInput) return;

  if (priceOnRequestInput.checked) {
    priceInput.value = "0";
    priceInput.disabled = true;
    priceInput.required = false;
    priceInput.placeholder = "سيظهر: تواصل للسعر";
    return;
  }

  priceInput.disabled = false;
  priceInput.required = true;
  priceInput.placeholder = "مثال: 325000";
}

function bindStaticEvents() {
  const menuToggleBtn = document.getElementById("menuToggleBtn");
  const dropdownMenu = document.getElementById("dropdownMenu");

  menuToggleBtn?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const expanded = menuToggleBtn.getAttribute("aria-expanded") === "true";
    menuToggleBtn.setAttribute("aria-expanded", expanded ? "false" : "true");
    dropdownMenu?.classList.toggle("show", !expanded);
  });

  dropdownMenu?.addEventListener("click", async (event) => {
    const routeTarget = event.target.closest("[data-route]");
    if (!routeTarget) return;
    const path = String(routeTarget.dataset.route || "/");
    dropdownMenu.classList.remove("show");
    menuToggleBtn?.setAttribute("aria-expanded", "false");
    if (typeof window.navigateTo === "function") {
      await window.navigateTo(path);
      return;
    }
    if (path === "/") showView("home");
  });

  document.addEventListener("click", (event) => {
    if (!dropdownMenu || !menuToggleBtn) return;
    if (menuToggleBtn.contains(event.target) || dropdownMenu.contains(event.target)) return;
    dropdownMenu.classList.remove("show");
    menuToggleBtn.setAttribute("aria-expanded", "false");
  });

  document.getElementById("brandHomeLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    showView("home");
  });

  catalogBackBtn?.addEventListener("click", () => showView("home"));

  globalSearchForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const typedQuery = globalSearchInputOverlay?.value?.trim() || globalSearchInput?.value?.trim() || "";
    state.search = typedQuery;
    if (filterKeyword) filterKeyword.value = state.search;
    if (globalSearchInput) globalSearchInput.value = state.search;
    syncMobileFilterControls();
    await loadProducts();
    showView("home");
    closeSearchArea();
  });

  navSearchToggleBtn?.addEventListener("click", () => {
    closeSearchArea();
    const keywordField = document.getElementById("globalSearchInput");
    if (keywordField) {
      keywordField.focus();
      keywordField.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    openSearchArea();
  });
  mobileHeaderMenuToggle?.addEventListener("click", (event) => {
    event.stopPropagation();
    setMobileHeaderMenuOpen(!state.mobileHeaderMenuOpen);
  });
  closeSearchAreaBtn?.addEventListener("click", closeSearchArea);
  searchQuickActions?.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-search-shortcut]");
    if (!trigger) return;

    const shortcutValue = String(trigger.dataset.searchShortcut || "").trim();
    if (!shortcutValue) return;

    state.search = shortcutValue;
    if (globalSearchInput) globalSearchInput.value = shortcutValue;
    if (globalSearchInputOverlay) globalSearchInputOverlay.value = shortcutValue;
    if (filterKeyword) filterKeyword.value = shortcutValue;
    syncMobileFilterControls();
    await loadProducts();
    showView("home");
    closeSearchArea();
  });
  searchArea?.addEventListener("click", (event) => {
    if (event.target === searchArea || event.target.closest(".search-area-backdrop")) {
      closeSearchArea();
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeSearchArea();
      setMobileSheetState("");
    }
  });

  document.querySelectorAll("[data-home-scroll]").forEach((trigger) => {
    trigger.addEventListener("click", async (event) => {
      event.preventDefault();
      await goToHomeSection(trigger.dataset.homeScroll);
    });
  });

  const onMobileMenuAction = async (event) => {
    const trigger = event.target.closest("[data-mobile-nav-action]");
    if (!trigger) return;
    await handleMobileNavigationAction(trigger.dataset.mobileNavAction || "");
  };

  mobileHeaderDropdown?.addEventListener("click", onMobileMenuAction);
  mobileHeaderSheetMenu?.addEventListener("click", onMobileMenuAction);

  mobileHeaderSheetCloseBtn?.addEventListener("click", () => setMobileHeaderMenuOpen(false));
  mobileFiltersOpenBtn?.addEventListener("click", () => {
    setMobileFiltersOpen(!state.mobileFiltersOpen);
  });
  mobileFiltersCloseBtn?.addEventListener("click", () => setMobileFiltersOpen(false));
  mobileSheetBackdrop?.addEventListener("click", () => setMobileSheetState(""));

  document.getElementById("applyFiltersBtn")?.addEventListener("click", handleSearchAndFilters);
  mobileFiltersApplyBtn?.addEventListener("click", async () => {
    await applyFiltersFromSource("mobile");
    setMobileFiltersOpen(false);
  });
  mobileFiltersResetBtn?.addEventListener("click", async () => {
    state.search = "";
    state.selectedCategory = "all";
    state.selectedRegion = "all";
    state.sort = "newest";
    syncDesktopFilterControls();
    syncMobileFilterControls();
    await loadProducts();
    setMobileFiltersOpen(false);
  });
  mobileSortBy?.addEventListener("change", async () => {
    await applyFiltersFromSource("toolbar");
  });
  mobileFilterKeyword?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    await applyFiltersFromSource("mobile");
    setMobileFiltersOpen(false);
  });
  homeLoadMoreBtn?.addEventListener("click", async () => {
    try {
      await loadProducts({ mode: "append" });
    } catch (error) {
      showToast(error.message || "تعذر تحميل المزيد من المنتجات");
    }
  });
  mobileBottomNav?.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-mobile-bottom-value]");
    if (!trigger) return;
    const actionType = String(trigger.dataset.mobileBottomType || "");
    const actionValue = String(trigger.dataset.mobileBottomValue || "");
    if (actionType === "route") {
      setMobileSheetState("");
      closeSearchArea();
      if (actionValue === "/conversations") {
        state.mobileNavContext = {
          ...state.mobileNavContext,
          path: "/conversations",
          view: "messages"
        };
        try {
          if (location.pathname !== "/conversations") {
            history.pushState({ path: "/conversations" }, "", "/conversations");
          }
        } catch (_error) {}
        await loadMessages();
        showView("messages");
        renderMobileBottomNav();
        return;
      }
      if (typeof window.navigateTo === "function") {
        await window.navigateTo(actionValue);
        return;
      }
      if (actionValue === "/") {
        showView("home");
        return;
      }
      if (actionValue === "/auth") {
        showView("auth");
        return;
      }
      if (actionValue === "/favorites") {
        await loadFavorites();
        showView("favorites");
        return;
      }
      if (actionValue === "/cart") {
        await loadCart();
        showView("cart");
        return;
      }
      if (actionValue === "/dashboard") {
        await loadDashboard();
        showView("dashboard");
        return;
      }
      if (actionValue === "/profile") {
        fillProfileFormFromUser();
        showView("profile");
        return;
      }
    }
    await handleMobileNavigationAction(actionValue);
  });

  document.getElementById("sortSelect")?.addEventListener("change", function () {
    const sortValue = this.value;
    const sorted = sortProducts(state.currentCatalogProducts, sortValue);
    renderCatalogProducts(sorted);
  });

  closeProductModal?.addEventListener("click", () => closeModal(productModal));
  closeProductFormModal?.addEventListener("click", () => {
    closeModal(productFormModal);
    syncPriceModeInProductForm();
    renderProductImagePreview();
  });
  productFormCancelBtn?.addEventListener("click", () => {
    closeModal(productFormModal);
    syncPriceModeInProductForm();
    renderProductImagePreview();
  });
  closeDeliveryInfoModal?.addEventListener("click", () => closeModal(deliveryInfoModal));
  closeConfirmModal?.addEventListener("click", () => resolveConfirm(false));
  closeContentModal?.addEventListener("click", () => closeModal(contentModal));
  confirmModalCancelBtn?.addEventListener("click", () => resolveConfirm(false));
  confirmModalApproveBtn?.addEventListener("click", () => resolveConfirm(true));

  productModal?.addEventListener("click", (e) => {
    if (e.target === productModal) closeModal(productModal);
  });

  productFormModal?.addEventListener("click", (e) => {
    if (e.target === productFormModal) {
      closeModal(productFormModal);
      syncPriceModeInProductForm();
      renderProductImagePreview();
    }
  });

  document.getElementById("pPriceOnRequest")?.addEventListener("change", syncPriceModeInProductForm);
  syncPriceModeInProductForm();

  productImagesInput?.addEventListener("change", renderProductImagePreview);
  renderProductImagePreview();

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
  window.addEventListener("focus", () => {
    if (!homeView?.classList.contains("hidden")) {
      refreshHomeAdsIfNeeded(true);
    }
  });
  navLoginBtn?.addEventListener("click", () => showView("auth"));

  navLogoutBtn?.addEventListener("click", () => {
    window.marketplacePoller?.stop?.();
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
    syncPushSettingsUi().catch(() => {});
    showView("home");
  });

  navProfileBtn?.addEventListener("click", () => {
    fillProfileFormFromUser();
    syncPushSettingsUi().catch(() => {});
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

  heroSellerCtaBtn?.addEventListener("click", async () => {
    if (state.user?.role === "seller") {
      openModal(productFormModal);
      return;
    }

    showToast("لبدء البيع، يجب إنشاء حساب تاجر (بائع) أولاً.");

    if (typeof window.navigateTo === "function") {
      await window.navigateTo("/auth");
      window.setTimeout(focusSellerRegistrationFlow, 90);
      return;
    }

    showView("auth");
    window.setTimeout(focusSellerRegistrationFlow, 50);
  });

  document.getElementById("openAddProductFromDashboard")?.addEventListener("click", () => {
    openModal(productFormModal);
  });

  dashboardQuickActions?.addEventListener("click", async (event) => {
    const trigger = event.target.closest("[data-dashboard-action]");
    if (!trigger) return;
    const action = String(trigger.dataset.dashboardAction || "");
    if (action === "add-product") {
      openModal(productFormModal);
      return;
    }
    if (action === "orders") {
      await loadOrders();
      showView("orders");
      return;
    }
    if (action === "products") {
      document.getElementById("myProductsGrid")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    if (action === "refresh") {
      await loadDashboard();
    }
  });

  dashboardOpenOrdersBtn?.addEventListener("click", async () => {
    await loadOrders();
    showView("orders");
  });

  dashboardProductSearch?.addEventListener("input", () => {
    state.dashboardProductSearch = dashboardProductSearch.value || "";
    renderDashboardProducts();
  });

  dashboardProductStatusFilter?.addEventListener("change", () => {
    state.dashboardProductStatus = dashboardProductStatusFilter.value || "all";
    renderDashboardProducts();
  });

  dashboardProductSort?.addEventListener("change", () => {
    state.dashboardProductSort = dashboardProductSort.value || "newest";
    renderDashboardProducts();
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
    const clickedConversationTrigger = event.target.closest("#conversationDropdownTriggerBtn");
    const clickedChatMenuConversationAction = event.target.closest('[data-chat-menu-action="conversations"]');
    if (!mobileConversationPicker.contains(event.target) && !clickedConversationTrigger && !clickedChatMenuConversationAction) {
      setMobileConversationPickerOpen(false);
    }
  });

  enableBrowserPushBtn?.addEventListener("click", async () => {
    if (!state.user || !state.token) {
      showToast("يجب تسجيل الدخول أولًا.");
      return;
    }

    const enabled = await requestContextualPushPermission("profile-settings");
    if (enabled) {
      showToast("تم تفعيل إشعارات المتصفح لهذا الجهاز.", "success");
    } else if (Notification.permission === "denied") {
      showToast("الإشعارات محظورة من المتصفح. يمكنك تغيير ذلك من إعدادات الموقع.", "error");
    } else {
      showToast("لم يتم تفعيل الإشعارات على هذا الجهاز.", "info");
    }

    await syncPushSettingsUi();
  });

  unsubscribeBrowserPushBtn?.addEventListener("click", async () => {
    if (!state.user || !state.token) {
      showToast("يجب تسجيل الدخول أولًا.");
      return;
    }

    if (!PUSH_SUPPORTED) {
      showToast("هذا المتصفح لا يدعم Web Push.");
      return;
    }

    try {
      const subscription = await getCurrentPushSubscription();
      const endpoint = String(subscription?.endpoint || "").trim();
      if (!subscription || !endpoint) {
        showToast("لا يوجد اشتراك نشط على هذا الجهاز.");
        await syncPushSettingsUi();
        return;
      }

      fireAndForgetPushClientEvent("push_permission_denied", { trigger: "profile-unsubscribe", reason: "manual-unsubscribe" });
      await api("/api/push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint })
      });
      await subscription.unsubscribe().catch(() => {});
      state.pushRuntime.isSubscribed = false;
      writePushPromptState({ asked: true, accepted: false, declined: false });
      showToast("تم إلغاء اشتراك هذا الجهاز من إشعارات المتصفح.", "success");
    } catch (error) {
      showToast(error.message || "تعذر إلغاء الاشتراك من هذا الجهاز.", "error");
    } finally {
      await syncPushSettingsUi();
    }
  });

  document.addEventListener("click", (event) => {
    if (!state.mobileHeaderMenuOpen) return;
    const clickedInsideMenuTrigger = mobileHeaderMenu?.contains(event.target);
    const clickedInsideMenuSheet = mobileHeaderSheet?.contains(event.target);
    if (!clickedInsideMenuTrigger && !clickedInsideMenuSheet) {
      setMobileHeaderMenuOpen(false);
    }
  });

  document.addEventListener("click", (event) => {
    if (!window.matchMedia("(hover: none), (pointer: coarse)").matches) return;
    if (event.target.closest(".product-card.product-card-refined")) return;
    document.querySelectorAll(".product-card.product-card-refined.is-mobile-actions-visible").forEach((card) => {
      card.classList.remove("is-mobile-actions-visible");
    });
  });

  document.getElementById("refreshAdminUsers")?.addEventListener("click", async () => {
    await loadInlineAdmin();
  });

  document.getElementById("refreshAdminProducts")?.addEventListener("click", async () => {
    await loadInlineAdmin();
  });

  closeReportModal?.addEventListener("click", () => closeModal(reportModal));
  closeConversationOrderSheetBtn?.addEventListener("click", () => closeModal(conversationOrderSheetModal));
  reportModal?.addEventListener("click", (e) => {
    if (e.target === reportModal) closeModal(reportModal);
  });
  conversationOrderSheetModal?.addEventListener("click", (e) => {
    if (e.target === conversationOrderSheetModal) closeModal(conversationOrderSheetModal);
  });

  loginForm?.addEventListener("submit", handleLoginSubmit);
  registerForm?.addEventListener("submit", handleRegisterSubmit);
  document.getElementById("registerRole")?.addEventListener("change", syncRoleSpecificFields);
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

  syncTopbarScrollState();
  window.addEventListener("scroll", syncTopbarScrollState, { passive: true });
  window.addEventListener("resize", () => {
    syncTopbarScrollState();
    if (window.innerWidth > 620) setMobileSheetState("");
    syncIsolatedMessagesMode();
    renderMobileBottomNav();
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
    refreshNavBadges();

    const fallbackConversationId = Number(
      state.selectedConversationId
      || state.activeConversation?.id
      || state.conversations[0]?.id
      || 0
    );

    renderConversationsList(state.conversations, fallbackConversationId || null);

    if (fallbackConversationId) {
      await openConversation(fallbackConversationId);
    } else {
      state.selectedConversationId = null;
      state.activeConversation = null;
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
  await loadHomeAds();
  await restoreSession();
  await loadMeta();
  await loadProducts();

  if (state.user) {
    fillProfileFormFromUser();
    await syncPushSettingsUi();
  }

  showView("home");
}

const bootstrapPromise = bootstrap().catch((error) => {
  console.error(error);
  showToast("حدث خطأ أثناء تحميل الصفحة");
});

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
}

async function refreshSecurityChallenge(_scope) {}

function openVerificationModal() {}

function closeVerificationModalUi() {}

function renderVerificationStatus(_verification) {}

async function loadVerificationStatus() {
  state.verification = null;
  if (!state.user) return;
  try {
    const data = await api("/api/auth/verification-status");
    state.verification = data.verification || null;
  } catch (_error) {
  }
}

async function requestVerificationCode() {}

async function submitVerificationCode() {}

async function handleSecureLoginSubmit(event) {
  event.preventDefault();
  event.stopImmediatePropagation();
  const submissionKey = "login";
  const submitButton = getFormSubmitButton(event, loginForm);

  const identifier = document.getElementById("loginIdentifier")?.value?.trim() || "";
  const password = document.getElementById("loginPassword")?.value || "";
  if (!identifier || !password) {
    showToast("يرجى إكمال بيانات الدخول");
    return;
  }

  if (!beginSubmission(submissionKey)) return;
  const restoreUi = setSubmittingUi(submitButton, { loadingText: "جارٍ تسجيل الدخول..." });

  try {
    const data = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        identifier,
        password
      })
    });

    setAuth(data);
    await afterAuthLoad();
    await loadNotifications();
    await loadVerificationStatus();
    requestContextualPushPermission("login-success").catch(() => {});
    showView(state.user?.role === "seller" ? "dashboard" : "home");
    showToast("تم تسجيل الدخول بنجاح");
  } catch (error) {
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
    await loadNotifications();
    await loadVerificationStatus();
    requestContextualPushPermission("register-success").catch(() => {});
    showToast("تم إنشاء الحساب بنجاح");
    showView("home");
  } catch (error) {
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
        if (typeof window.navigateTo === "function" && window.innerWidth > 900) {
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
  const isSeller = isSellerUser();
  const labels = {
    submitted: isSeller ? "بانتظار ردك" : "بانتظار رد التاجر",
    seller_confirmed: isSeller ? "تم قبول الطلب" : "بانتظار استلامك أو إلغائك",
    buyer_confirmed: "مقبول (مسار قديم)",
    in_preparation: "قيد التنفيذ (مسار قديم)",
    in_transport: "قيد النقل (مسار قديم)",
    cancelled: "ملغي",
    completed: isSeller ? "تم الاستلام من المشتري" : "تم الاستلام"
  };
  return labels[status] || status || "-";
}

function getOrderStatusExplanation(order) {
  const isSeller = isSellerUser();
  const messages = {
    submitted: isSeller
      ? "تم استلام طلب شراء جديد وهو الآن بانتظار قرارك بالقبول أو الرفض."
      : "تم إرسال طلب الشراء وهو الآن بانتظار رد التاجر.",
    seller_confirmed: isSeller
      ? "قمت بقبول هذا الطلب، ويمكنك متابعة التفاصيل من داخل المحادثة المرتبطة به."
      : "وافق التاجر على الطلب. يمكنك الآن استلام الطلب أو إلغاؤه من نفس البطاقة.",
    buyer_confirmed: isSeller
      ? "هذا الطلب يتبع مسارًا قديمًا محفوظًا للعرض فقط في النسخة الحالية."
      : "هذا الطلب يتبع مسارًا قديمًا محفوظًا للعرض فقط في النسخة الحالية.",
    in_preparation: isSeller
      ? "هذا الطلب يتبع مسارًا قديمًا وانتقل إلى مرحلة لاحقة خارج نطاق النسخة الأولى."
      : "هذا الطلب يتبع مسارًا قديمًا وانتقل إلى مرحلة لاحقة خارج نطاق النسخة الأولى.",
    in_transport: isSeller
      ? "هذا الطلب يتبع مسارًا قديمًا وانتقل إلى مرحلة لاحقة خارج نطاق النسخة الأولى."
      : "هذا الطلب يتبع مسارًا قديمًا وانتقل إلى مرحلة لاحقة خارج نطاق النسخة الأولى.",
    cancelled: "تم إلغاء الطلب وإغلاق المحادثة المرتبطة به نهائيًا.",
    completed: "تم استلام الطلب وإغلاق المحادثة المرتبطة به نهائيًا."
  };
  return messages[order?.status] || "لا توجد تفاصيل إضافية لهذه الحالة حاليًا.";
}

function getOrderActionLabel(status) {
  const labels = {
    seller_confirmed: "قبول الطلب",
    completed: "استلام الطلب",
    cancelled: "إلغاء الطلب"
  };
  return labels[status] || status;
}

function getAllowedOrderActions(order) {
  const actions = [];
  const currentUserId = Number(state.user?.id || 0);
  const sellerId = Number(order?.sellerId || 0);
  const buyerId = Number(order?.buyerId || 0);
  const isSeller = currentUserId > 0 && sellerId > 0 && currentUserId === sellerId;
  const isBuyer = currentUserId > 0 && buyerId > 0 && currentUserId === buyerId;
  const buyerFallback = !isSeller && isBuyerUser();
  const sellerFallback = !isBuyer && isSellerUser();

  if (order.status === "submitted" && (isSeller || sellerFallback)) {
    actions.push({ key: "seller_confirmed", label: getOrderActionLabel("seller_confirmed"), tone: "btn-primary" });
    actions.push({ key: "cancelled", label: "رفض الطلب", tone: "btn-outline" });
  }

  if (order.status === "seller_confirmed" && (isBuyer || buyerFallback)) {
    actions.push({ key: "completed", label: getOrderActionLabel("completed"), tone: "btn-primary" });
    actions.push({ key: "cancelled", label: getOrderActionLabel("cancelled"), tone: "btn-outline" });
  }

  return actions;
}

function getOrderProgressSteps(status) {
  const normalizedStatus = ["buyer_confirmed", "in_preparation", "in_transport"].includes(status)
    ? "seller_confirmed"
    : status;
  const steps = [
    { key: "submitted", label: "إرسال الطلب" },
    { key: "seller_confirmed", label: "قبول التاجر" },
    { key: "completed", label: "الاستلام" }
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
    showToast("الإجراءات المتاحة: قبول/رفض من التاجر، ثم استلام/إلغاء من المشتري.", "error", "إجراء غير متاح");
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

function upsertMessageInActiveConversation(message) {
  if (!state.activeConversation) return;
  const messages = Array.isArray(state.activeConversation.messages) ? state.activeConversation.messages : [];
  const matchById = message.id ? messages.findIndex((item) => Number(item.id) === Number(message.id)) : -1;
  const matchByTemp = message.clientTempId
    ? messages.findIndex((item) => item.clientTempId && item.clientTempId === message.clientTempId)
    : -1;
  const index = matchById >= 0 ? matchById : matchByTemp;

  if (index >= 0) {
    messages[index] = { ...messages[index], ...message };
  } else {
    messages.push(message);
  }

  messages.sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    if (aTime === bTime) return Number(a.id || 0) - Number(b.id || 0);
    return aTime - bTime;
  });

  state.activeConversation.messages = messages;
}

async function sendConversationMessageOptimistic(conversationId, rawBody, clientTempId = null) {
  const body = String(rawBody || "").trim();
  if (!body) return;
  requestContextualPushPermission("message").catch(() => {});

  const tempId = clientTempId || `tmp-${conversationId}-${Date.now()}`;
  const optimisticMessage = {
    id: tempId,
    clientTempId: tempId,
    conversationId: Number(conversationId),
    senderId: Number(state.user?.id || 0),
    senderName: state.user?.fullName || state.user?.storeName || "أنت",
    body,
    createdAt: new Date().toISOString(),
    sendState: "pending"
  };

  upsertMessageInActiveConversation(optimisticMessage);
  renderConversationDetails(state.activeConversation);
  updateConversationPreview(conversationId, body, optimisticMessage.createdAt);

  try {
    await api(`/api/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({ message: body })
    });
    window.marketplacePoller?.triggerImmediatePoll?.();
  } catch (error) {
    upsertMessageInActiveConversation({
      ...optimisticMessage,
      sendState: "failed"
    });
    renderConversationDetails(state.activeConversation);
    throw error;
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
  const hasOrderDetails = Boolean(getPrimaryLinkedOrder(conversation) || conversation.product?.id);
  const presenceLabel = getConversationPresenceLabel(conversation);
  const linkedOrder = getPrimaryLinkedOrder(conversation);
  const product = conversation?.product || {};
  const sellerId = Number(conversation?.sellerId || conversation?.seller?.id || 0);
  const avatarToken = getConversationAvatarToken(conversation, counterparty);
  const productTitle = escapeHtml(product.name || "منتج مرتبط");
  const productPrice = escapeHtml(
    linkedOrder
      ? formatPrice(linkedOrder.totalAmount || product.price || 0, product.currency || "ل.س")
      : getProductPriceLabel(product)
  );
  const contextStatus = escapeHtml(
    linkedOrder ? formatOrderStatus(linkedOrder.status) : formatConversationStatus(conversation?.status || "")
  );
  const contextImage = product.image
    ? `<img class="chat-order-context-thumb" src="${escapeHtml(product.image)}" alt="${productTitle}" />`
    : `<div class="chat-order-context-thumb chat-order-context-thumb-fallback" aria-hidden="true">🛍</div>`;

  conversationDetails.innerHTML = `
    <div class="chat-layout whatsapp-chat-layout">
      <div class="chat-header whatsapp-chat-header">
        <div class="chat-header-leading">
          <button class="chat-icon-btn chat-back-btn" id="conversationBackBtn" type="button" aria-label="رجوع">→</button>
          <div class="chat-avatar-wrap">
            <div class="chat-avatar-badge">${escapeHtml(avatarToken)}</div>
            <span class="chat-avatar-status-dot" aria-hidden="true"></span>
          </div>
          <div class="chat-person-block">
            <div class="chat-header-title-block">
              <h3>${escapeHtml(counterparty)}</h3>
              <div class="chat-presence">${escapeHtml(presenceLabel)}</div>
            </div>
          </div>
          <details class="chat-header-menu-wrap" id="conversationActionsMenuDetails">
            <summary class="chat-icon-btn chat-menu-trigger" aria-label="خيارات المحادثة">⋮</summary>
            <div class="chat-header-menu">
              ${sellerId ? `<button class="chat-header-menu-item" data-chat-menu-action="seller" type="button"><span>🏪</span><span>زيارة المتجر</span></button>` : ""}
              <button class="chat-header-menu-item" data-chat-menu-action="conversations" type="button"><span>📋</span><span>المحادثات الأخرى</span></button>
            </div>
          </details>
        </div>
      </div>

      ${hasOrderDetails ? `
        <button class="chat-order-context-bar" id="conversationOrderContextBtn" type="button">
          ${contextImage}
          <div class="chat-order-context-copy">
            <span class="chat-order-context-title">${productTitle}</span>
            <span class="chat-order-context-subline">
              <strong>${productPrice}</strong>
              <span class="chat-order-context-dot">•</span>
              <span>${contextStatus || "بدون حالة"}</span>
            </span>
          </div>
          <span class="chat-order-context-cta">تفاصيل</span>
        </button>
      ` : ""}

      <div class="chat-thread whatsapp-thread" id="activeChatThread">
        ${renderConversationMessages(conversation.messages || [])}
      </div>

      ${canReply ? `
        <div class="chat-composer whatsapp-composer">
          <div class="chat-input-shell whatsapp-input-shell">
            <div class="chat-input-box">
              <input class="field chat-textarea whatsapp-textarea chat-singleline-input" id="conversationMessageInput" type="text" placeholder="اكتب رسالة..." />
            </div>
            <button class="chat-send-inline-btn is-send" id="sendConversationMessageBtn" type="button" aria-label="إرسال">➤</button>
          </div>
        </div>
      ` : ""}
    </div>
  `;

  const sendConversationMessage = async () => {
    const sendLockKey = `chat-send:${Number(conversation.id)}`;
    if (!beginSubmission(sendLockKey)) return;
    const input = document.getElementById("conversationMessageInput");
    const sendBtn = document.getElementById("sendConversationMessageBtn");
    const message = input?.value?.trim() || "";
    if (!message) {
      showToast("اكتب رسالة أولًا");
      endSubmission(sendLockKey);
      return;
    }

    try {
      if (sendBtn) sendBtn.disabled = true;
      input.value = "";
      await sendConversationMessageOptimistic(conversation.id, message);
    } catch (error) {
      showToast(error.message || "تعذر إرسال الرسالة");
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      endSubmission(sendLockKey);
    }
  };

  document.getElementById("sendConversationMessageBtn")?.addEventListener("click", sendConversationMessage);
  const messageInput = document.getElementById("conversationMessageInput");
  messageInput?.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    await sendConversationMessage();
  });

  document.getElementById("conversationBackBtn")?.addEventListener("click", async () => {
    await handleConversationBackNavigation();
  });

  document.getElementById("conversationOrderContextBtn")?.addEventListener("click", () => openConversationOrderSheet(conversation));

  const actionMenuDetails = document.getElementById("conversationActionsMenuDetails");
  actionMenuDetails?.querySelectorAll("[data-chat-menu-action]").forEach((item) => {
    item.addEventListener("click", async (event) => {
      const action = item.dataset.chatMenuAction;
      actionMenuDetails.removeAttribute("open");

      if (action === "seller") {
        if (!sellerId) return;
        if (typeof window.navigateTo === "function") {
          await window.navigateTo(`/seller/${sellerId}`);
          return;
        }
        await openSellerPage(sellerId);
        return;
      }

      if (action === "conversations") {
        event.stopPropagation();
        if (state.mobileConversationsOpen) {
          setMobileConversationPickerOpen(false);
          return;
        }
        await openActiveConversationsList();
      }
    });
  });

  const sendButton = document.getElementById("sendConversationMessageBtn");
  if (sendButton) {
    sendButton.textContent = "➤";
    sendButton.setAttribute("aria-label", "إرسال");
    sendButton.classList.add("is-send");
    sendButton.classList.remove("is-mic");
  }

  const thread = document.getElementById("activeChatThread");
  thread?.querySelectorAll("[data-retry-message]").forEach((button) => {
    button.addEventListener("click", async () => {
      const clientTempId = String(button.dataset.retryMessage || "");
      const failedMessage = (state.activeConversation?.messages || []).find(
        (item) => item.clientTempId === clientTempId
      );
      if (!failedMessage?.body) return;

      try {
        upsertMessageInActiveConversation({
          ...failedMessage,
          sendState: "pending",
          createdAt: new Date().toISOString()
        });
        renderConversationDetails(state.activeConversation);
        await sendConversationMessageOptimistic(conversation.id, failedMessage.body, clientTempId);
      } catch (error) {
        showToast(error.message || "تعذرت إعادة المحاولة");
      }
    });
  });

  if (thread) {
    thread.scrollTop = thread.scrollHeight;
  }
}

const POLL_ACTIVE_INTERVAL_MS = 2000;
const POLL_PASSIVE_INTERVAL_MS = 5000;
const POLL_IDLE_INTERVAL_MS = 10000;
const POLL_SLOW_INTERVAL_MS = 30000;
const POLL_NO_CHANGE_THRESHOLD = 50;
const POLL_ACTIVE_NO_CHANGE_THRESHOLD = 100;
const POLL_IDLE_TIMEOUT_MS = 30000;
const POLL_BATCH_WINDOW_MS = 500;

state.realtimePolling = state.realtimePolling || {
  lastServerNow: null,
  noChangePollCount: 0
};

const pollRuntime = {
  started: false,
  timerId: null,
  nextPollAt: 0,
  lastInteractionAt: Date.now(),
  pending: false,
  lastApiRequestAt: 0,
  retryAfterMs: 0,
  debugEnabled: false
};

function pollDebug(message) {
  if (!pollRuntime.debugEnabled) return;
  console.log(`[Poller] ${message}`);
}

function recordRealtimeInteraction() {
  pollRuntime.lastInteractionAt = Date.now();
}

function getActiveConversationId() {
  return Number(state.selectedConversationId || state.activeConversation?.id || 0) || null;
}

function isInteractiveConversationSession() {
  const activeConversationId = getActiveConversationId();
  if (!activeConversationId) return false;
  const elapsed = Date.now() - Number(pollRuntime.lastInteractionAt || 0);
  return elapsed <= POLL_IDLE_TIMEOUT_MS;
}

function sortConversationsByRecency(conversations = []) {
  return conversations.sort((a, b) => {
    const aTime = new Date(a.lastMessageAt || a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.lastMessageAt || b.updatedAt || b.createdAt || 0).getTime();
    if (aTime === bTime) return Number(b.id || 0) - Number(a.id || 0);
    return bTime - aTime;
  });
}

function mergeNotificationsFromPoll(nextItems = []) {
  if (!Array.isArray(nextItems) || !nextItems.length) return false;
  const prevLength = state.notifications.length;
  const byId = new Map((state.notifications || []).map((item) => [Number(item.id), item]));
  for (const item of nextItems) {
    const id = Number(item?.id || 0);
    if (!id) continue;
    byId.set(id, { ...(byId.get(id) || {}), ...item });
  }
  state.notifications = Array.from(byId.values()).sort((a, b) => {
    const aTime = new Date(a.createdAt || a.updatedAt || 0).getTime();
    const bTime = new Date(b.createdAt || b.updatedAt || 0).getTime();
    if (aTime === bTime) return Number(b.id || 0) - Number(a.id || 0);
    return bTime - aTime;
  });
  return state.notifications.length !== prevLength || nextItems.length > 0;
}

function mergeConversationsFromPoll(nextItems = []) {
  if (!Array.isArray(nextItems) || !nextItems.length) return false;
  const byId = new Map((state.conversations || []).map((item) => [Number(item.id), item]));
  let changed = false;

  for (const item of nextItems) {
    const id = Number(item?.id || 0);
    if (!id) continue;
    const previous = byId.get(id);
    byId.set(id, { ...(previous || {}), ...item });
    if (!previous) {
      changed = true;
      continue;
    }
    if (
      previous.lastMessage !== item.lastMessage
      || String(previous.lastMessageAt || "") !== String(item.lastMessageAt || "")
      || String(previous.status || "") !== String(item.status || "")
    ) {
      changed = true;
    }
  }

  state.conversations = sortConversationsByRecency(Array.from(byId.values()));
  return changed;
}

function mergeMessagesFromPoll(nextItems = []) {
  if (!Array.isArray(nextItems) || !nextItems.length || !state.activeConversation) return false;

  const messages = Array.isArray(state.activeConversation.messages) ? [...state.activeConversation.messages] : [];
  let changed = false;

  for (const serverMessage of nextItems) {
    const serverId = Number(serverMessage?.id || 0);
    if (!serverId) continue;

    const existingServerIndex = messages.findIndex((item) => Number(item.id || 0) === serverId);
    if (existingServerIndex >= 0) {
      messages[existingServerIndex] = { ...messages[existingServerIndex], ...serverMessage, sendState: "" };
      continue;
    }

    const pendingIndex = messages.findIndex((item) => {
      if (item.sendState !== "pending") return false;
      if (Number(item.senderId || 0) !== Number(serverMessage.senderId || 0)) return false;
      if (String(item.body || "").trim() !== String(serverMessage.body || "").trim()) return false;
      const pendingTime = new Date(item.createdAt || 0).getTime();
      const serverTime = new Date(serverMessage.createdAt || 0).getTime();
      return Number.isFinite(pendingTime) && Number.isFinite(serverTime) && Math.abs(serverTime - pendingTime) <= 120000;
    });

    if (pendingIndex >= 0) {
      messages[pendingIndex] = { ...serverMessage, sendState: "" };
      changed = true;
      continue;
    }

    messages.push({ ...serverMessage, sendState: "" });
    changed = true;
  }

  messages.sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    if (aTime === bTime) return Number(a.id || 0) - Number(b.id || 0);
    return aTime - bTime;
  });

  state.activeConversation.messages = messages;
  return changed;
}

function getNextPollDelay() {
  if (document.hidden || !state.user || !state.token) return null;

  const activeConversationId = getActiveConversationId();
  const noChange = Number(state.realtimePolling?.noChangePollCount || 0);

  if (activeConversationId) {
    if (isInteractiveConversationSession()) return POLL_ACTIVE_INTERVAL_MS;
    if (noChange >= POLL_ACTIVE_NO_CHANGE_THRESHOLD) return Math.min(POLL_IDLE_INTERVAL_MS, POLL_SLOW_INTERVAL_MS);
    return POLL_PASSIVE_INTERVAL_MS;
  }

  if (noChange >= POLL_NO_CHANGE_THRESHOLD) return POLL_SLOW_INTERVAL_MS;
  return POLL_IDLE_INTERVAL_MS;
}

function clearPollTimer() {
  if (!pollRuntime.timerId) return;
  window.clearTimeout(pollRuntime.timerId);
  pollRuntime.timerId = null;
  pollRuntime.nextPollAt = 0;
}

function schedulePoll(delayMs = null) {
  clearPollTimer();
  const nextDelay = delayMs == null ? getNextPollDelay() : delayMs;
  if (nextDelay == null) return;

  pollRuntime.nextPollAt = Date.now() + Math.max(0, nextDelay);
  pollRuntime.timerId = window.setTimeout(() => {
    pollRuntime.timerId = null;
    pollRuntime.nextPollAt = 0;
    runAdaptivePoll();
  }, Math.max(0, nextDelay));
}

async function runAdaptivePoll({ force = false } = {}) {
  if (!state.user || !state.token) return;
  if (document.hidden && !force) return;
  if (pollRuntime.pending) return;

  pollRuntime.pending = true;

  try {
    const params = new URLSearchParams();
    if (state.realtimePolling?.lastServerNow) {
      params.set("since", String(state.realtimePolling.lastServerNow));
    }
    const activeConversationId = getActiveConversationId();
    if (activeConversationId) {
      params.set("conversationId", String(activeConversationId));
    }

    const response = await fetch(`/api/poll?${params.toString()}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${state.token}`
      },
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(`poll failed (${response.status})`);
    }

    const retryAfterSeconds = Number.parseInt(response.headers.get("Retry-After") || "0", 10);
    pollRuntime.retryAfterMs = Number.isInteger(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 0;
    pollRuntime.debugEnabled = response.headers.get("X-Poll-Debug") === "1";

    const payload = await response.json();
    const conversationsChanged = mergeConversationsFromPoll(payload.conversations || []);
    const notificationsChanged = mergeNotificationsFromPoll(payload.notifications || []);
    const messagesChanged = mergeMessagesFromPoll(payload.messages || []);
    const hasChange = conversationsChanged || notificationsChanged || messagesChanged;

    if (payload?.serverNow) {
      state.realtimePolling.lastServerNow = payload.serverNow;
    }

    if (hasChange) {
      state.realtimePolling.noChangePollCount = 0;
      refreshNavBadges();
      if (!messagesView?.classList.contains("hidden")) {
        renderConversationsList(state.conversations, getActiveConversationId());
        if (state.activeConversation) renderConversationDetails(state.activeConversation);
      }
      if (!notificationsView?.classList.contains("hidden")) {
        renderNotifications();
      }
    } else {
      state.realtimePolling.noChangePollCount = Number(state.realtimePolling.noChangePollCount || 0) + 1;
      if (state.realtimePolling.noChangePollCount === POLL_NO_CHANGE_THRESHOLD) {
        pollDebug(`No changes for ${POLL_NO_CHANGE_THRESHOLD} polls, slowing down to ${POLL_SLOW_INTERVAL_MS}ms`);
      }
      if (state.realtimePolling.noChangePollCount === POLL_ACTIVE_NO_CHANGE_THRESHOLD && getActiveConversationId()) {
        pollDebug(`Active conversation idle for ${POLL_ACTIVE_NO_CHANGE_THRESHOLD} polls, moving to passive interval`);
      }
    }
  } catch (_error) {
    const nextNoChange = Number(state.realtimePolling.noChangePollCount || 0) + 1;
    state.realtimePolling.noChangePollCount = Math.max(nextNoChange, POLL_NO_CHANGE_THRESHOLD);
  } finally {
    pollRuntime.pending = false;
    const suggestedDelay = pollRuntime.retryAfterMs > 0 ? pollRuntime.retryAfterMs : null;
    schedulePoll(suggestedDelay);
  }
}

function onPollingVisibilityChange() {
  if (!pollRuntime.started) return;
  if (document.hidden) {
    clearPollTimer();
    return;
  }
  runAdaptivePoll({ force: true });
}

function startAdaptivePolling() {
  if (pollRuntime.started || !state.user || !state.token) return;
  pollRuntime.started = true;
  pollRuntime.lastInteractionAt = Date.now();
  pollRuntime.retryAfterMs = 0;
  window.addEventListener("visibilitychange", onPollingVisibilityChange);
  window.addEventListener("mousemove", recordRealtimeInteraction, { passive: true });
  window.addEventListener("keydown", recordRealtimeInteraction);
  window.addEventListener("touchstart", recordRealtimeInteraction, { passive: true });
  window.addEventListener("click", recordRealtimeInteraction, { passive: true });
  runAdaptivePoll({ force: true });
}

function stopAdaptivePolling() {
  if (!pollRuntime.started) return;
  pollRuntime.started = false;
  clearPollTimer();
  pollRuntime.pending = false;
  window.removeEventListener("visibilitychange", onPollingVisibilityChange);
  window.removeEventListener("mousemove", recordRealtimeInteraction);
  window.removeEventListener("keydown", recordRealtimeInteraction);
  window.removeEventListener("touchstart", recordRealtimeInteraction);
  window.removeEventListener("click", recordRealtimeInteraction);
}

window.marketplacePoller = {
  start: startAdaptivePolling,
  stop: stopAdaptivePolling,
  triggerImmediatePoll() {
    if (!pollRuntime.started) return;
    runAdaptivePoll({ force: true });
  },
  notifyConversationOpened(_conversationId) {
    recordRealtimeInteraction();
    if (!pollRuntime.started) return;
    runAdaptivePoll({ force: true });
  },
  notifyApiRequest(path) {
    if (!pollRuntime.started) return;
    if (String(path || "").startsWith("/api/poll")) return;
    pollRuntime.lastApiRequestAt = Date.now();

    if (!pollRuntime.timerId || !pollRuntime.nextPollAt) return;
    const remaining = pollRuntime.nextPollAt - Date.now();
    if (remaining <= POLL_BATCH_WINDOW_MS) {
      const nextDelay = Math.max(getNextPollDelay() || POLL_IDLE_INTERVAL_MS, POLL_BATCH_WINDOW_MS * 2);
      pollDebug(`API request near scheduled poll; postponing by ${nextDelay}ms`);
      schedulePoll(nextDelay);
    }
  }
};

bootstrapPromise.finally(() => {
  if (SERVICE_WORKER_SUPPORTED) {
    registerPushServiceWorker().catch(() => {});
  }
  if (state.user && state.token) {
    window.marketplacePoller.start();
    if (PUSH_SUPPORTED && Notification.permission === "granted") {
      ensurePushSubscription("bootstrap").catch(() => {});
    }
  }
});
