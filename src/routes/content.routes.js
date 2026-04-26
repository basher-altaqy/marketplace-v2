const express = require('express');
const router = express.Router();
const { getSiteContentByKey, listHomeAdsConfig } = require('../services/platform.service');

router.get('/api/content/home-ads', async (_req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    const homeAds = await listHomeAdsConfig();
    res.json({ homeAds });
  } catch (error) {
    next(error);
  }
});

router.get('/api/content/:key', async (req, res, next) => {
  try {
    const content = await getSiteContentByKey(req.params.key);
    if (!content) {
      return res.status(404).json({ error: 'Content not found.' });
    }
    res.json({ content });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
