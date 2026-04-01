const express = require('express');
const router = express.Router();
const { getSiteContentByKey } = require('../services/platform.service');

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
