const express = require('express');
const router = express.Router();
const {
  publicUser,
  query,
  logAudit,
  mapProductRows,
  getProductById,
  refreshSellerStats
} = require('../services/marketplace.service');
const { adminAuthRequired } = require('./admin-auth.routes');
const {
  listSiteContent,
  upsertSiteContent,
  listSupportConversations,
  getSupportConversationDetails,
  updateSupportConversation,
  sendSupportMessage,
  collectSystemStatus,
  createNotification
} = require('../services/platform.service');

router.get('/api/admin/users', adminAuthRequired, async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT
         u.*,
         COALESCE(sp.average_rating, 0) AS average_rating,
         COALESCE(sp.ratings_count, 0) AS ratings_count,
         COALESCE(sp.total_products, 0) AS total_products
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       ORDER BY u.created_at DESC`
    );

    res.json({
      users: result.rows.map(u => ({
        ...publicUser(u),
        averageRating: Number(u.average_rating || 0),
        ratingsCount: Number(u.ratings_count || 0),
        totalProducts: Number(u.total_products || 0)
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/admin/users/:id/status', adminAuthRequired, async (req, res, next) => {
  try {
    const targetId = Number(req.params.id);
    const { isActive } = req.body;

    if (!Number.isInteger(targetId)) {
      return res.status(400).json({ error: 'Invalid user id.' });
    }

    if (req.admin.id === targetId && Boolean(isActive) === false) {
      return res.status(400).json({ error: 'Admin cannot disable the current logged-in account.' });
    }

    const result = await query(
      `UPDATE users
       SET is_active = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [Boolean(isActive), targetId]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' });

    await logAudit(req.admin.id, 'admin.user.status.update', 'user', targetId, {
      isActive: Boolean(isActive)
    });
    await createNotification(
      targetId,
      'account',
      Boolean(isActive) ? 'تحديث حالة الحساب' : 'تم تعليق الحساب',
      Boolean(isActive)
        ? 'تم تفعيل حسابك أو إبقاؤه نشطًا من قبل الإدارة.'
        : 'تم تعليق حسابك من قبل الإدارة. يمكنك التواصل مع الدعم لمزيد من التفاصيل.',
      '/profile',
      { isActive: Boolean(isActive) }
    );

    res.json({ user: publicUser(result.rows[0]) });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/products', adminAuthRequired, async (_req, res, next) => {
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
       ORDER BY p.created_at DESC`
    );

    const products = await mapProductRows(result.rows);
    res.json({ products });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/admin/products/:id/status', adminAuthRequired, async (req, res, next) => {
  try {
    const productId = Number(req.params.id);
    const { status } = req.body;

    if (!['published', 'hidden', 'sold', 'deleted'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const result = await query(
      `UPDATE products SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [status, productId]
    );

    const product = result.rows[0];
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    await refreshSellerStats(product.seller_id);
    await logAudit(req.admin.id, 'admin.product.status.update', 'product', productId, { status });
    const mapped = await getProductById(productId);
    res.json({ product: mapped });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/users/:id', adminAuthRequired, async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ error: 'Invalid user id.' });
    }

    const userResult = await query(
      `SELECT
         u.*,
         COALESCE(sp.average_rating, 0) AS average_rating,
         COALESCE(sp.ratings_count, 0) AS ratings_count,
         COALESCE(sp.total_products, 0) AS total_products
       FROM users u
       LEFT JOIN seller_profiles sp ON sp.user_id = u.id
       WHERE u.id = $1
       LIMIT 1`,
      [userId]
    );

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const recentProductsResult = await query(
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
       ORDER BY p.created_at DESC
       LIMIT 8`,
      [userId]
    );

    const recentConversationsResult = await query(
      `SELECT
         c.id,
         c.status,
         c.created_at,
         c.last_message_at,
         p.name AS product_name,
         seller.full_name AS seller_name,
         buyer.full_name AS buyer_name
       FROM conversations c
       LEFT JOIN products p ON p.id = c.product_id
       LEFT JOIN users seller ON seller.id = c.seller_id
       LEFT JOIN users buyer ON buyer.id = c.buyer_id
       WHERE c.seller_id = $1 OR c.buyer_id = $1
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
       LIMIT 8`,
      [userId]
    );

    const ratingsResult = await query(
      `SELECT
         r.id,
         r.score,
         r.comment,
         r.created_at,
         buyer.full_name AS buyer_name
       FROM ratings r
       LEFT JOIN users buyer ON buyer.id = r.buyer_id
       WHERE r.seller_id = $1
       ORDER BY r.created_at DESC
       LIMIT 8`,
      [userId]
    );

    const recentProducts = await mapProductRows(recentProductsResult.rows);

    res.json({
      user: {
        ...publicUser(user),
        averageRating: Number(user.average_rating || 0),
        ratingsCount: Number(user.ratings_count || 0),
        totalProducts: Number(user.total_products || 0)
      },
      recentProducts,
      recentConversations: recentConversationsResult.rows.map((row) => ({
        id: row.id,
        status: row.status,
        createdAt: row.created_at,
        lastMessageAt: row.last_message_at,
        productName: row.product_name,
        sellerName: row.seller_name,
        buyerName: row.buyer_name
      })),
      ratings: ratingsResult.rows.map((row) => ({
        id: row.id,
        score: Number(row.score || 0),
        comment: row.comment,
        createdAt: row.created_at,
        buyerName: row.buyer_name
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/products/:id', adminAuthRequired, async (req, res, next) => {
  try {
    const productId = Number(req.params.id);
    if (!Number.isInteger(productId)) {
      return res.status(400).json({ error: 'Invalid product id.' });
    }

    const product = await getProductById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }

    const conversationsResult = await query(
      `SELECT
         c.id,
         c.status,
         c.created_at,
         c.last_message_at,
         buyer.full_name AS buyer_name
       FROM conversations c
       LEFT JOIN users buyer ON buyer.id = c.buyer_id
       WHERE c.product_id = $1
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
       LIMIT 10`,
      [productId]
    );

    res.json({
      product,
      conversations: conversationsResult.rows.map((row) => ({
        id: row.id,
        status: row.status,
        createdAt: row.created_at,
        lastMessageAt: row.last_message_at,
        buyerName: row.buyer_name
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/stats', adminAuthRequired, async (_req, res, next) => {
  try {
    const [
      usersResult,
      productsResult,
      reportsResult,
      conversationsResult,
      categoriesResult
    ] = await Promise.all([
      query(`SELECT
        COUNT(*)::int AS total_users,
        COUNT(*) FILTER (WHERE role = 'seller')::int AS total_sellers,
        COUNT(*) FILTER (WHERE role = 'buyer')::int AS total_buyers
      FROM users`),
      query(`SELECT COUNT(*)::int AS total_products FROM products WHERE status <> 'deleted'`),
      query(`SELECT COUNT(*)::int AS open_reports FROM reports WHERE status = 'open'`),
      query(`SELECT COUNT(*)::int AS open_conversations FROM conversations WHERE status = 'open'`),
      query(`SELECT category, COUNT(*)::int AS count
             FROM products
             WHERE status = 'published'
             GROUP BY category
             ORDER BY count DESC, category ASC
             LIMIT 6`)
    ]);

    const users = usersResult.rows[0] || {};
    const products = productsResult.rows[0] || {};
    const reports = reportsResult.rows[0] || {};
    const conversations = conversationsResult.rows[0] || {};

    res.json({
      stats: {
        totalUsers: Number(users.total_users || 0),
        totalSellers: Number(users.total_sellers || 0),
        totalBuyers: Number(users.total_buyers || 0),
        totalProducts: Number(products.total_products || 0),
        openReports: Number(reports.open_reports || 0),
        openConversations: Number(conversations.open_conversations || 0),
        topCategories: categoriesResult.rows.map((row) => ({
          category: row.category,
          count: Number(row.count || 0)
        }))
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/conversations', adminAuthRequired, async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT
         c.id,
         c.product_id,
         c.seller_id,
         c.buyer_id,
         c.status,
         c.last_message_at,
         c.created_at,
         p.name AS product_name,
         seller.full_name AS seller_name,
         buyer.full_name AS buyer_name,
         COUNT(m.id)::int AS messages_count,
         MAX(m.message_body) FILTER (
           WHERE m.created_at = (
             SELECT MAX(m2.created_at) FROM messages m2 WHERE m2.conversation_id = c.id
           )
         ) AS last_message_preview
       FROM conversations c
       LEFT JOIN products p ON p.id = c.product_id
       LEFT JOIN users seller ON seller.id = c.seller_id
       LEFT JOIN users buyer ON buyer.id = c.buyer_id
       LEFT JOIN messages m ON m.conversation_id = c.id
       GROUP BY c.id, p.name, seller.full_name, buyer.full_name
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC`
    );

    res.json({
      conversations: result.rows.map((row) => ({
        id: row.id,
        productId: row.product_id,
        productName: row.product_name,
        sellerId: row.seller_id,
        sellerName: row.seller_name,
        buyerId: row.buyer_id,
        buyerName: row.buyer_name,
        status: row.status,
        messagesCount: Number(row.messages_count || 0),
        lastMessagePreview: row.last_message_preview,
        lastMessageAt: row.last_message_at,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/reports', adminAuthRequired, async (_req, res, next) => {
  try {
    const result = await query(
      `SELECT
         r.id,
         r.reason,
         r.details,
         r.status,
         r.admin_notes,
         r.created_at,
         r.product_id,
         r.conversation_id,
         r.reported_user_id,
         r.reporter_user_id,
         reporter.full_name AS reporter_name,
         reported.full_name AS reported_user_name,
         p.name AS product_name
       FROM reports r
       LEFT JOIN users reporter ON reporter.id = r.reporter_user_id
       LEFT JOIN users reported ON reported.id = r.reported_user_id
       LEFT JOIN products p ON p.id = r.product_id
       ORDER BY r.created_at DESC, r.id DESC`
    );

    res.json({
      reports: result.rows.map((row) => ({
        id: row.id,
        reason: row.reason,
        details: row.details,
        status: row.status,
        adminNotes: row.admin_notes,
        createdAt: row.created_at,
        productId: row.product_id,
        productName: row.product_name,
        conversationId: row.conversation_id,
        reportedUserId: row.reported_user_id,
        reportedUserName: row.reported_user_name,
        reporterUserId: row.reporter_user_id,
        reporterName: row.reporter_name
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/admin/reports/:id/status', adminAuthRequired, async (req, res, next) => {
  try {
    const reportId = Number(req.params.id);
    const { status, adminNote = null } = req.body;

    if (!['open', 'reviewed', 'closed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid report status.' });
    }

    const result = await query(
      `UPDATE reports
       SET status = $1,
           admin_notes = COALESCE($2, admin_notes)
       WHERE id = $3
       RETURNING *`,
      [status, adminNote?.trim() || null, reportId]
    );

    if (!result.rows[0]) {
      return res.status(404).json({ error: 'Report not found.' });
    }

    await logAudit(req.admin.id, 'admin.report.status.update', 'report', reportId, {
      status,
      adminNote: adminNote?.trim() || null
    });
    if (result.rows[0].reporter_user_id) {
      await createNotification(
        result.rows[0].reporter_user_id,
        'report',
        'تحديث على البلاغ',
        `تم تحديث حالة البلاغ رقم #${reportId} إلى: ${status}.`,
        '/profile',
        { reportId, status }
      );
    }

    res.json({
      report: {
        ...result.rows[0],
        adminNotes: result.rows[0].admin_notes
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/audit-logs', adminAuthRequired, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 200);

    const result = await query(
      `SELECT
         a.id,
         a.action_type,
         a.target_type,
         a.target_id,
         a.metadata_json,
         a.created_at,
         u.full_name AS actor_name,
         u.role AS actor_role
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.actor_user_id
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      logs: result.rows.map((row) => ({
        id: row.id,
        actionType: row.action_type,
        targetType: row.target_type,
        targetId: row.target_id,
        metadata: row.metadata_json || {},
        createdAt: row.created_at,
        actorName: row.actor_name,
        actorRole: row.actor_role
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/overview', adminAuthRequired, async (_req, res, next) => {
  try {
    const [
      usersResult,
      productsResult,
      conversationsResult,
      reportsResult,
      latestUsersResult,
      latestProductsResult
    ] = await Promise.all([
      query(`
        SELECT
          COUNT(*)::int AS total_users,
          COUNT(*) FILTER (WHERE role = 'seller')::int AS total_sellers,
          COUNT(*) FILTER (WHERE role = 'buyer')::int AS total_buyers,
          COUNT(*) FILTER (WHERE role = 'admin')::int AS total_admins
        FROM users
      `),
      query(`
        SELECT
          COUNT(*)::int AS total_products,
          COUNT(*) FILTER (WHERE status = 'published')::int AS published_products,
          COUNT(*) FILTER (WHERE status = 'hidden')::int AS hidden_products,
          COUNT(*) FILTER (WHERE status = 'sold')::int AS sold_products
        FROM products
        WHERE status <> 'deleted'
      `),
      query(`
        SELECT
          COUNT(*)::int AS total_conversations,
          COUNT(*) FILTER (WHERE status = 'open')::int AS open_conversations
        FROM conversations
      `),
      query(`
        SELECT
          COUNT(*)::int AS total_reports,
          COUNT(*) FILTER (WHERE status = 'open')::int AS open_reports
        FROM reports
      `),
      query(`
        SELECT id, full_name, role, created_at
        FROM users
        ORDER BY created_at DESC
        LIMIT 6
      `),
      query(`
        SELECT id, name, status, created_at
        FROM products
        ORDER BY created_at DESC
        LIMIT 6
      `)
    ]);

    res.json({
      stats: {
        ...(usersResult.rows[0] || {}),
        ...(productsResult.rows[0] || {}),
        ...(conversationsResult.rows[0] || {}),
        ...(reportsResult.rows[0] || {})
      },
      latestUsers: latestUsersResult.rows,
      latestProducts: latestProductsResult.rows
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/activity', adminAuthRequired, async (_req, res, next) => {
  try {
    const result = await query(`
      SELECT
        a.id,
        a.action_type,
        a.target_type,
        a.target_id,
        a.metadata_json,
        a.created_at,
        u.full_name AS actor_name
      FROM audit_logs a
      LEFT JOIN users u ON u.id = a.actor_user_id
      ORDER BY a.created_at DESC
      LIMIT 50
    `);

    res.json({
      activity: result.rows.map((row) => ({
        id: row.id,
        actionType: row.action_type,
        targetType: row.target_type,
        targetId: row.target_id,
        metadata: row.metadata_json || {},
        createdAt: row.created_at,
        actorName: row.actor_name || 'غير معروف'
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/content', adminAuthRequired, async (_req, res, next) => {
  try {
    const content = await listSiteContent();
    res.json({ content });
  } catch (error) {
    next(error);
  }
});

router.put('/api/admin/content/:key', adminAuthRequired, async (req, res, next) => {
  try {
    const key = String(req.params.key || '').trim();
    const title = String(req.body.title || '').trim();
    const contentValue = String(req.body.content || '').trim();
    if (!key || !title || !contentValue) {
      return res.status(400).json({ error: 'Key, title, and content are required.' });
    }

    const content = await upsertSiteContent(key, title, contentValue);
    await logAudit(req.admin.id, 'admin.site_content.update', 'site_content', content.id, { key });
    res.json({ content });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/support', adminAuthRequired, async (req, res, next) => {
  try {
    const conversations = await listSupportConversations({ status: req.query.status || 'all' });
    res.json({ conversations });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/support/:id', adminAuthRequired, async (req, res, next) => {
  try {
    const conversation = await getSupportConversationDetails(req.params.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Support conversation not found.' });
    }
    res.json({ conversation });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/admin/support/:id', adminAuthRequired, async (req, res, next) => {
  try {
    const updated = await updateSupportConversation(req.params.id, {
      status: req.body.status,
      assignedAdminId: req.body.assignedAdminId === undefined ? req.admin.id : req.body.assignedAdminId
    });
    if (!updated) {
      return res.status(404).json({ error: 'Support conversation not found.' });
    }
    await logAudit(req.admin.id, 'admin.support.update', 'support_conversation', Number(req.params.id), {
      status: req.body.status,
      assignedAdminId: req.body.assignedAdminId === undefined ? req.admin.id : req.body.assignedAdminId
    });
    res.json({ conversation: updated });
  } catch (error) {
    next(error);
  }
});

router.post('/api/admin/support/:id/messages', adminAuthRequired, async (req, res, next) => {
  try {
    const message = String(req.body.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'Message is required.' });
    }
    const details = await getSupportConversationDetails(req.params.id);
    if (!details) {
      return res.status(404).json({ error: 'Support conversation not found.' });
    }

    await sendSupportMessage({
      conversationId: details.id,
      senderUserId: req.admin.id,
      senderRole: 'admin',
      messageBody: message
    });
    await updateSupportConversation(details.id, {
      status: 'open',
      assignedAdminId: req.admin.id
    });
    await createNotification(
      details.requesterUserId,
      'support',
      'رد جديد من الدعم الفني',
      'تمت إضافة رد جديد على محادثة الدعم الخاصة بك.',
      '/profile',
      { supportConversationId: details.id }
    );
    await logAudit(req.admin.id, 'admin.support.reply', 'support_conversation', details.id, {});
    const conversation = await getSupportConversationDetails(details.id);
    res.status(201).json({ conversation });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/system/status', adminAuthRequired, async (_req, res, next) => {
  try {
    const status = await collectSystemStatus();
    res.json({ status });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
