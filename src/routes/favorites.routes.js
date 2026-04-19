const express = require('express');
const router = express.Router();
const {
  authRequired,
  query,
  mapProductRows
} = require('../services/marketplace.service');

router.get('/api/favorites', authRequired, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT
         p.*,
         u.full_name AS seller_full_name,
         u.store_name AS seller_store_name,
         u.phone AS seller_phone,
         u.whatsapp AS seller_whatsapp,
         u.region AS seller_region,
         u.avatar_url AS seller_avatar_url,
         u.profile_description AS seller_profile_description,
         sp.average_rating AS seller_average_rating,
         sp.ratings_count AS seller_ratings_count,
         sp.total_products AS seller_total_products
       FROM user_favorites f
       JOIN products p ON p.id = f.product_id
       JOIN users u ON u.id = p.seller_id
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );

    const favorites = await mapProductRows(result.rows);
    res.json({ favorites });
  } catch (error) {
    next(error);
  }
});

router.post('/api/favorites', authRequired, async (req, res, next) => {
  try {
    const productId = Number(req.body.productId);
    if (!Number.isInteger(productId)) {
      return res.status(400).json({ error: 'Invalid product id.' });
    }

    const productResult = await query(
      `SELECT id FROM products WHERE id = $1 AND status <> 'deleted' LIMIT 1`,
      [productId]
    );

    if (!productResult.rows[0]) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    await query(
      `INSERT INTO user_favorites (user_id, product_id)
       VALUES ($1, $2)
       ON CONFLICT (user_id, product_id) DO NOTHING`,
      [req.user.id, productId]
    );

    res.status(201).json({ ok: true, productId });
  } catch (error) {
    next(error);
  }
});

router.delete('/api/favorites/:productId', authRequired, async (req, res, next) => {
  try {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId)) {
      return res.status(400).json({ error: 'Invalid product id.' });
    }

    await query(
      `DELETE FROM user_favorites WHERE user_id = $1 AND product_id = $2`,
      [req.user.id, productId]
    );

    res.json({ ok: true, productId });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
