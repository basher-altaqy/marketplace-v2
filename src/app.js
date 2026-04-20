const express = require('express');
const path = require('path');
const { PUBLIC_DIR, UPLOADS_DIR } = require('./config/env');
const { query } = require('./services/marketplace.service');
const { assertDatabaseReady } = require('./services/bootstrap.service');
const { ensurePlatformSupport } = require('./services/platform.service');
const { errorHandler } = require('./middleware/error-handler');

const systemRoutes = require('./routes/system.routes');
const authRoutes = require('./routes/auth.routes');
const profileRoutes = require('./routes/profile.routes');
const productRoutes = require('./routes/products.routes');
const conversationRoutes = require('./routes/conversations.routes');
const favoritesRoutes = require('./routes/favorites.routes');
const cartRoutes = require('./routes/cart.routes');
const reportsRoutes = require('./routes/reports.routes');
const ordersRoutes = require('./routes/orders.routes');
const adminRoutes = require('./routes/admin.routes');
const { adminAuthRoutes } = require('./routes/admin-auth.routes');
const contentRoutes = require('./routes/content.routes');
const supportRoutes = require('./routes/support.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const pollRoutes = require('./routes/poll.routes');
const pushRoutes = require('./routes/push.routes');

function createApp() {
  const app = express();

  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/uploads', express.static(UPLOADS_DIR));
  app.use(express.static(PUBLIC_DIR));

  app.use(systemRoutes);
  app.use(authRoutes);
  app.use(profileRoutes);
  app.use(productRoutes);
  app.use(conversationRoutes);
  app.use(favoritesRoutes);
  app.use(cartRoutes);
  app.use(reportsRoutes);
  app.use(ordersRoutes);
  app.use(contentRoutes);
  app.use(supportRoutes);
  app.use(notificationsRoutes);
  app.use(pushRoutes);
  app.use(pollRoutes);
  app.use(adminAuthRoutes);
  app.use(adminRoutes);

  app.get('/admin/login', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'admin', 'login.html'));
  });

  app.get('/admin', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'admin', 'admin.html'));
  });

  app.get(/^\/admin(?:\/.*)?$/, (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'admin', 'admin.html'));
  });

  app.get('/', (_req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  app.use(errorHandler);

  return app;
}

async function prepareApp() {
  await query('SELECT 1');
  await assertDatabaseReady();
  await ensurePlatformSupport();
}

module.exports = { createApp, prepareApp };
