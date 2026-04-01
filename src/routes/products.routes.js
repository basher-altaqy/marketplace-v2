const express = require('express');
const router = express.Router();
const { pool } = require('../db/pool');
const {
  PRODUCT_STATUSES,
  normalizePhone,
  whatsappLink,
  signToken,
  publicUser,
  query,
  logAudit,
  authRequired,
  roleRequired,
  mapProductRow,
  getProductById,
  refreshSellerStats,
  seedDatabase,
  getConversationById
} = require('../services/marketplace.service');
const { upload } = require('../config/uploads');

router.get('/api/products', async (req, res, next) => {
  try {
    const {
      keyword = '',
      category = 'all',
      region = 'all',
      minPrice = '',
      maxPrice = '',
      condition = 'all',
      sort = 'newest'
    } = req.query;

    const params = [];
    const where = [`p.status = 'published'`, `u.is_active = TRUE`, `u.role = 'seller'`];

    if (keyword) {
      params.push(`%${keyword}%`);
      where.push(`(
        p.name ILIKE $${params.length}
        OR p.description ILIKE $${params.length}
        OR CAST(p.tags_json AS TEXT) ILIKE $${params.length}
      )`);
    }
    if (category !== 'all') {
      params.push(category);
      where.push(`p.category = $${params.length}`);
    }
    if (region !== 'all') {
      params.push(region);
      where.push(`p.region = $${params.length}`);
    }
    if (minPrice !== '') {
      params.push(Number(minPrice));
      where.push(`p.price >= $${params.length}`);
    }
    if (maxPrice !== '') {
      params.push(Number(maxPrice));
      where.push(`p.price <= $${params.length}`);
    }
    if (condition !== 'all') {
      params.push(condition);
      where.push(`p.item_condition = $${params.length}`);
    }

    let orderBy = 'p.id DESC';
    if (sort === 'priceAsc') orderBy = 'p.price ASC, p.id DESC';
    if (sort === 'priceDesc') orderBy = 'p.price DESC, p.id DESC';
    if (sort === 'views') orderBy = 'p.views_count DESC, p.id DESC';

    const sql = `
      SELECT
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
      FROM products p
      JOIN users u ON u.id = p.seller_id
      LEFT JOIN seller_profiles sp ON sp.user_id = u.id
      WHERE ${where.join(' AND ')}
      ORDER BY ${orderBy}
    `;

    const result = await query(sql, params);
    const products = await Promise.all(result.rows.map(mapProductRow));
    res.json({ products });
  } catch (error) {
    next(error);
  }
});

router.get('/api/products/:id', async (req, res, next) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId)) {
      return res.status(400).json({ error: 'Invalid product id.' });
    }

    await query(
      `UPDATE products
       SET views_count = views_count + 1, updated_at = NOW()
       WHERE id = $1`,
      [productId]
    );

    const product = await getProductById(productId);
    if (!product || product.status === 'deleted') {
      return res.status(404).json({ error: 'Product not found.' });
    }

    res.json({ product });
  } catch (error) {
    next(error);
  }
});

router.post('/api/products', authRequired, roleRequired('seller', 'admin'), upload.array('images', 5), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { name, description, price, currency, category, subcategory, tags, region, condition, quantity, customFields, status, has_delivery_service } = req.body;

    if (!name || !description || !category || !region) {
      return res.status(400).json({ error: 'Name, description, category, and region are required.' });
    }

    const parsedTags = String(tags || '').split(',').map(tag => tag.trim()).filter(Boolean);

    let parsedCustomFields = {};
    if (customFields) {
      try { parsedCustomFields = JSON.parse(customFields); } catch { parsedCustomFields = {}; }
    }

    const safeStatus = ['draft', 'published'].includes(status) ? status : 'published';
    const hasDeliveryService = ['true', '1', 'on', 'yes'].includes(String(has_delivery_service || '').toLowerCase());

    await client.query('BEGIN');

    const insertResult = await client.query(
      `INSERT INTO products (
         seller_id, name, description, price, currency, category, subcategory,
         tags_json, region, item_condition, quantity, has_delivery_service, custom_fields_json, status
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13::jsonb,$14)
       RETURNING id`,
      [
        req.user.id,
        name.trim(),
        description.trim(),
        Number(price || 0),
        currency || 'ل.س',
        category.trim(),
        subcategory?.trim() || null,
        JSON.stringify(parsedTags),
        region.trim(),
        condition || 'جديد',
        Number(quantity || 1),
        hasDeliveryService,
        JSON.stringify(parsedCustomFields),
        safeStatus
      ]
    );

    const productId = insertResult.rows[0].id;

    for (let index = 0; index < (req.files || []).length; index += 1) {
      const file = req.files[index];
      await client.query(
        `INSERT INTO product_images (product_id, image_url, sort_order)
         VALUES ($1, $2, $3)`,
        [productId, `/uploads/${file.filename}`, index]
      );
    }

    await client.query('COMMIT');

    await refreshSellerStats(req.user.id);
    const product = await getProductById(productId);
    res.status(201).json({ product });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
});

router.get('/api/my/products', authRequired, roleRequired('seller'), async (req, res, next) => {
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
       FROM products p
       JOIN users u ON u.id = p.seller_id
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       WHERE p.seller_id = $1
       ORDER BY p.id DESC`,
      [req.user.id]
    );

    const products = await Promise.all(result.rows.map(mapProductRow));
    res.json({ products });
  } catch (error) {
    next(error);
  }
});

router.get('/api/dashboard/summary', authRequired, roleRequired('seller'), async (req, res, next) => {
  try {
    const productsSummary = await query(
      `SELECT
         COUNT(*) AS total_products,
         COALESCE(SUM(views_count), 0) AS total_views,
         COUNT(*) FILTER (WHERE status = 'draft') AS draft_products,
         COUNT(*) FILTER (WHERE status = 'published') AS published_products,
         COUNT(*) FILTER (WHERE status = 'hidden') AS hidden_products,
         COUNT(*) FILTER (WHERE status = 'sold') AS sold_products,
         COUNT(*) FILTER (WHERE status = 'archived') AS archived_products
       FROM products
       WHERE seller_id = $1`,
      [req.user.id]
    );

    const messagesSummary = await query(
      `SELECT
         COUNT(*)::int AS total_conversations,
         COUNT(*) FILTER (WHERE status = 'open')::int AS open_conversations
       FROM conversations
       WHERE seller_id = $1`,
      [req.user.id]
    );

    const ratingsSummary = await query(
      `SELECT
         COALESCE(AVG(score), 0) AS average_rating,
         COUNT(*)::int AS ratings_count
       FROM ratings
       WHERE seller_id = $1`,
      [req.user.id]
    );

    const row = productsSummary.rows[0] || {};
    const mrow = messagesSummary.rows[0] || {};
    const rrow = ratingsSummary.rows[0] || {};

    res.json({
      summary: {
        totalProducts: Number(row.total_products || 0),
        totalViews: Number(row.total_views || 0),
        draftProducts: Number(row.draft_products || 0),
        publishedProducts: Number(row.published_products || 0),
        hiddenProducts: Number(row.hidden_products || 0),
        soldProducts: Number(row.sold_products || 0),
        archivedProducts: Number(row.archived_products || 0),
        totalConversations: Number(mrow.total_conversations || 0),
        openConversations: Number(mrow.open_conversations || 0),
        averageRating: Number(rrow.average_rating || 0),
        ratingsCount: Number(rrow.ratings_count || 0)
      }
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/products/:id/status', authRequired, roleRequired('seller', 'admin'), async (req, res, next) => {
  try {
    const productId = Number(req.params.id);
    const { status } = req.body;

    if (!PRODUCT_STATUSES.includes(status) || status === 'deleted') {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const productResult = await query(`SELECT * FROM products WHERE id = $1 LIMIT 1`, [productId]);
    const product = productResult.rows[0];
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    if (req.user.role !== 'admin' && product.seller_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    await query(`UPDATE products SET status = $1, updated_at = NOW() WHERE id = $2`, [status, productId]);

    await refreshSellerStats(product.seller_id);
    await logAudit(req.user.id, 'seller_product_status_changed', 'product', productId, {
      previousStatus: product.status,
      nextStatus: status
    });

    const updated = await getProductById(productId);
    res.json({ product: updated });
  } catch (error) {
    next(error);
  }
});

router.get('/api/sellers/:id/public', async (req, res, next) => {
  try {
    const sellerId = Number(req.params.id);
    if (!Number.isInteger(sellerId)) {
      return res.status(400).json({ error: 'Invalid seller id.' });
    }

    const sellerResult = await query(
      `SELECT * FROM seller_public_view WHERE seller_id = $1 AND is_active = TRUE LIMIT 1`,
      [sellerId]
    );

    const seller = sellerResult.rows[0];
    if (!seller) {
      return res.status(404).json({ error: 'Seller not found.' });
    }

    const productsResult = await query(
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
       FROM products p
       JOIN users u ON u.id = p.seller_id
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       WHERE p.seller_id = $1 AND p.status = 'published'
       ORDER BY p.id DESC`,
      [sellerId]
    );

    const ratingsResult = await query(
      `SELECT
         r.id,
         r.score,
         r.comment,
         r.created_at,
         u.full_name AS buyer_name
       FROM ratings r
       JOIN users u ON u.id = r.buyer_id
       WHERE r.seller_id = $1
       ORDER BY r.created_at DESC
       LIMIT 20`,
      [sellerId]
    );

    const products = await Promise.all(productsResult.rows.map(mapProductRow));

    res.json({
      seller: {
        id: seller.seller_id,
        fullName: seller.full_name,
        storeName: seller.store_name,
        phone: seller.phone,
        whatsapp: seller.whatsapp || seller.phone,
        whatsappLink: whatsappLink(seller.whatsapp || seller.phone),
        region: seller.region,
        avatarUrl: seller.avatar_url,
        logoUrl: seller.logo_url,
        coverUrl: seller.cover_url,
        profileDescription: seller.profile_description,
        bio: seller.bio,
        averageRating: Number(seller.average_rating || 0),
        ratingsCount: Number(seller.ratings_count || 0),
        totalProducts: Number(seller.total_products || 0)
      },
      products,
      ratings: ratingsResult.rows.map(r => ({
        id: r.id,
        score: Number(r.score),
        comment: r.comment,
        createdAt: r.created_at,
        buyerName: r.buyer_name
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/sellers/:id/products', async (req, res, next) => {
  try {
    const sellerId = Number(req.params.id);
    if (!Number.isInteger(sellerId)) {
      return res.status(400).json({ error: 'Invalid seller id.' });
    }

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
       FROM products p
       JOIN users u ON u.id = p.seller_id
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       WHERE p.seller_id = $1 AND p.status = 'published'
       ORDER BY p.id DESC`,
      [sellerId]
    );

    const products = await Promise.all(result.rows.map(mapProductRow));
    res.json({ products });
  } catch (error) {
    next(error);
  }
});

// Conversations & messages

router.patch('/api/products/:id/visibility', authRequired, roleRequired('seller', 'admin'), async (req, res, next) => {
  try {
    const productId = Number(req.params.id);
    const { status } = req.body;

    if (!['published', 'hidden', 'sold'].includes(status)) {
      return res.status(400).json({ error: 'Status must be published, hidden, or sold.' });
    }

    const productResult = await query(
      `SELECT * FROM products WHERE id = $1 LIMIT 1`,
      [productId]
    );

    const product = productResult.rows[0];
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    if (product.seller_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden.' });
    }

    await query(
      `UPDATE products SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, productId]
    );

    await refreshSellerStats(product.seller_id);
    const updated = await getProductById(productId);
    res.json({ product: updated });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
