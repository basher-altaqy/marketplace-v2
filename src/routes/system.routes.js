const express = require('express');
const router = express.Router();
const {
  query,
} = require('../services/marketplace.service');
const { collectSystemStatus } = require('../services/platform.service');
const { adminAuthRequired } = require('./admin-auth.routes');

router.get('/api/health', async (_req, res, next) => {
  try {
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

router.get('/api/system/status', adminAuthRequired, async (_req, res, next) => {
  try {
    const status = await collectSystemStatus();
    res.json({ status });
  } catch (error) {
    next(error);
  }
});

router.get('/api/meta', async (_req, res, next) => {
  try {
    const [categoriesResult, regionsResult] = await Promise.all([
      query(`SELECT DISTINCT category FROM products WHERE status = 'published' ORDER BY category ASC`),
      query(`SELECT DISTINCT region FROM products WHERE status = 'published' ORDER BY region ASC`)
    ]);
    res.json({
      categories: categoriesResult.rows.map(r => r.category),
      regions: regionsResult.rows.map(r => r.region)
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
