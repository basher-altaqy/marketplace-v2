function normalizePath(path) {
  if (!path) return "/";
  const [pathname] = String(path).split("?");
  if (!pathname || pathname === "/") return "/";
  return pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
}

function parseRoute(path) {
  const normalized = normalizePath(path);
  const patterns = [
    { match: /^\/$/, name: "home" },
    { match: /^\/auth$/, name: "auth" },
    { match: /^\/cart$/, name: "cart" },
    { match: /^\/orders$/, name: "orders" },
    { match: /^\/order\/(\d+)$/, name: "order" },
    { match: /^\/profile$/, name: "profile" },
    { match: /^\/favorites$/, name: "favorites" },
    { match: /^\/conversations$/, name: "conversations" },
    { match: /^\/conversation\/(\d+)$/, name: "conversation" },
    { match: /^\/product\/(\d+)$/, name: "product" },
    { match: /^\/seller\/(\d+)$/, name: "seller" },
    { match: /^\/dashboard$/, name: "dashboard" }
  ];

  for (const route of patterns) {
    const result = normalized.match(route.match);
    if (result) {
      return { name: route.name, params: result.slice(1), path: normalized };
    }
  }

  return { name: "home", params: [], path: "/" };
}

async function waitForApp() {
  if (window.marketplaceApp) {
    await window.marketplaceApp.ready;
    return window.marketplaceApp;
  }
  return new Promise((resolve) => {
    window.addEventListener("marketplace:ready", async () => {
      await window.marketplaceApp?.ready;
      resolve(window.marketplaceApp);
    }, { once: true });
  });
}

function setFooterRoutes() {
  const footerRouteMap = {
    "#home": "/",
    "#catalog": "/",
    "#messages": "/conversations",
    "#profile": "/profile",
    "#favorites": "/favorites",
    "#orders": "/orders"
  };

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    const mapped = footerRouteMap[link.getAttribute("href")];
    if (mapped) {
      link.setAttribute("href", mapped);
      link.dataset.route = mapped;
    }
  });
}

async function loadContent(path, options = {}) {
  const app = await waitForApp();
  const route = parseRoute(path);

  if (!options.skipHistory) {
    const method = options.replace ? "replaceState" : "pushState";
    history[method]({ path: route.path }, "", route.path);
  }

  if (!route.path.startsWith("/product/")) {
    app.closeProductModal?.();
  }

  switch (route.name) {
    case "auth":
      app.showView("auth");
      return;
    case "cart":
      if (app.isAuthenticated()) await app.loadCart();
      app.showView(app.isAuthenticated() ? "cart" : "auth");
      return;
    case "orders":
      if (app.isAuthenticated()) await app.loadOrders();
      app.showView(app.isAuthenticated() ? "orders" : "auth");
      return;
    case "order":
      if (!app.isAuthenticated()) {
        app.showView("auth");
        return;
      }
      await app.loadOrders();
      app.showView("orders");
      await app.loadOrderDetails(Number(route.params[0]));
      return;
    case "profile":
      if (!app.isAuthenticated()) {
        app.showView("auth");
        return;
      }
      app.fillProfileFormFromUser?.();
      app.showView("profile");
      return;
    case "favorites":
      if (!app.isAuthenticated()) {
        app.showView("auth");
        return;
      }
      await app.loadFavorites();
      app.showView("favorites");
      return;
    case "conversations":
      if (!app.isAuthenticated()) {
        app.showView("auth");
        return;
      }
      await app.loadMessages();
      app.showView("messages");
      return;
    case "conversation":
      if (!app.isAuthenticated()) {
        app.showView("auth");
        return;
      }
      await app.loadMessages();
      app.showView("messages");
      await app.openConversation(Number(route.params[0]));
      return;
    case "product":
      if (!app.state?.products?.length) {
        await app.loadProducts();
      }
      await app.openProductPage(Number(route.params[0]));
      return;
    case "seller":
      await app.openSellerPage(Number(route.params[0]));
      return;
    case "dashboard":
      if (!app.isAuthenticated()) {
        app.showView("auth");
        return;
      }
      if (!app.isSeller?.()) {
        navigateTo(app.isBuyer?.() ? "/orders" : "/profile", { replace: true });
        return;
      }
      await app.loadDashboard();
      app.showView("dashboard");
      return;
    case "home":
    default:
      await app.loadProducts();
      app.showView("home");
  }
}

function navigateTo(path, options = {}) {
  return loadContent(path, options);
}

function bindRouteTriggers() {
  const buttonRoutes = [
    ["navLoginBtn", "/auth"],
    ["navProfileBtn", "/profile"],
    ["navMessagesBtn", "/conversations"],
    ["navFavoritesBtn", "/favorites"],
    ["navCartBtn", "/cart"],
    ["navOrdersBtn", "/orders"],
    ["navDashboardBtn", "/dashboard"],
    ["catalogBackBtn", "/"],
    ["brandHomeLink", "/"]
  ];

  buttonRoutes.forEach(([id, path]) => {
    document.getElementById(id)?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      navigateTo(path);
    }, true);
  });

  document.addEventListener("click", (event) => {
    const link = event.target.closest('a[href^="/"], a[data-route]');
    if (!link) return;
    if (link.target === "_blank" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const href = link.dataset.route || link.getAttribute("href");
    if (!href || href.startsWith("/admin")) return;
    event.preventDefault();
    navigateTo(href);
  });

  document.getElementById("closeProductModal")?.addEventListener("click", (event) => {
    if (!location.pathname.startsWith("/product/")) return;
    event.preventDefault();
    event.stopPropagation();
    navigateTo("/", { replace: true });
  }, true);

  window.addEventListener("popstate", () => {
    loadContent(location.pathname, { skipHistory: true, replace: true });
  });
}

window.navigateTo = navigateTo;
window.loadContent = loadContent;

setFooterRoutes();
bindRouteTriggers();
waitForApp().then(() => {
  loadContent(location.pathname, { skipHistory: true, replace: true });
});
