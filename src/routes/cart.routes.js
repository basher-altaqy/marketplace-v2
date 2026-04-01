const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const {
  authRequired,
  query,
  getProductById,
  getCartSummaryByUserId,
  getOrCreateActiveCart
} = require('../services/marketplace.service');

router.get('/api/cart', authRequired, async (req, res, next) => {
  try {
    const cart = await getCartSummaryByUserId(req.user.id);
    res.json({ cart });
  } catch (error) {
    next(error);
  }
});

router.post('/api/cart/items', authRequired, async (req, res, next) => {
  try {
    const productId = Number(req.body.productId);
    const quantity = Math.max(1, Number(req.body.quantity || 1));
    const note = req.body.note?.trim() || null;

    if (!Number.isInteger(productId)) {
      return res.status(400).json({ error: 'Invalid product id.' });
    }

    const product = await getProductById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    if (product.status !== 'published') {
      return res.status(400).json({ error: 'Product is not available for cart.' });
    }

    const cart = await getOrCreateActiveCart(req.user.id);
    const existing = await query(
      `SELECT * FROM cart_items WHERE cart_id = $1 AND product_id = $2 LIMIT 1`,
      [cart.id, productId]
    );

    if (existing.rows[0]) {
      await query(
        `UPDATE cart_items
         SET quantity = quantity + $1,
             note = COALESCE($2, note),
             updated_at = NOW()
         WHERE id = $3`,
        [quantity, note, existing.rows[0].id]
      );
    } else {
      await query(
        `INSERT INTO cart_items (cart_id, product_id, seller_id, quantity, snapshot_price, note, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
        [cart.id, productId, product.sellerId, quantity, Number(product.price || 0), note]
      );
    }

    await query(`UPDATE carts SET updated_at = NOW() WHERE id = $1`, [cart.id]);

    const summary = await getCartSummaryByUserId(req.user.id);
    res.status(201).json({ cart: summary });
  } catch (error) {
    next(error);
  }
});

router.put('/api/cart/items/:itemId', authRequired, async (req, res, next) => {
  try {
    const itemId = Number.parseInt(req.params.itemId, 10);
    const quantity = Math.max(1, Number(req.body.quantity || 1));
    const note = req.body.note?.trim();

    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ error: 'Invalid cart item id.' });
    }

    const itemResult = await query(
      `SELECT ci.id, ci.cart_id
       FROM cart_items ci
       JOIN carts c ON c.id = ci.cart_id
       WHERE ci.id = $1 AND c.user_id = $2 AND c.status = 'active'
       LIMIT 1`,
      [itemId, req.user.id]
    );

    const item = itemResult.rows[0];
    if (!item) {
      return res.status(404).json({ error: 'Cart item not found.' });
    }

    await query(
      `UPDATE cart_items
       SET quantity = $1,
           note = COALESCE($2, note),
           updated_at = NOW()
       WHERE id = $3`,
      [quantity, note || null, itemId]
    );

    await query(`UPDATE carts SET updated_at = NOW() WHERE id = $1`, [item.cart_id]);

    const summary = await getCartSummaryByUserId(req.user.id);
    res.json({ cart: summary });
  } catch (error) {
    next(error);
  }
});

router.delete('/api/cart/items/:itemId', authRequired, async (req, res, next) => {
  try {
    const itemId = Number.parseInt(req.params.itemId, 10);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ error: 'Invalid cart item id.' });
    }

    const itemResult = await query(
      `SELECT ci.id, ci.cart_id
       FROM cart_items ci
       JOIN carts c ON c.id = ci.cart_id
       WHERE ci.id = $1 AND c.user_id = $2 AND c.status = 'active'
       LIMIT 1`,
      [itemId, req.user.id]
    );

    const item = itemResult.rows[0];
    if (!item) {
      return res.status(404).json({ error: 'Cart item not found.' });
    }

    await query(`DELETE FROM cart_items WHERE id = $1`, [itemId]);
    await query(`UPDATE carts SET updated_at = NOW() WHERE id = $1`, [item.cart_id]);

    const summary = await getCartSummaryByUserId(req.user.id);
    res.json({ cart: summary });
  } catch (error) {
    next(error);
  }
});

router.delete('/api/cart', authRequired, async (req, res, next) => {
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cartResult = await client.query(
        `SELECT * FROM carts WHERE user_id = $1 AND status = 'active' ORDER BY id DESC LIMIT 1`,
        [req.user.id]
      );

      const cart = cartResult.rows[0];
      if (cart) {
        await client.query(`DELETE FROM cart_items WHERE cart_id = $1`, [cart.id]);
        await client.query(`UPDATE carts SET updated_at = NOW() WHERE id = $1`, [cart.id]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    const summary = await getCartSummaryByUserId(req.user.id);
    res.json({ cart: summary });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
