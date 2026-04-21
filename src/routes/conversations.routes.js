const express = require('express');
const router = express.Router();
const {
  query,
  authRequired,
  roleRequired,
  getProductById,
  getConversationById
} = require('../services/marketplace.service');
const { createNotification, logSystemEvent } = require('../services/platform.service');

router.post('/api/conversations', authRequired, roleRequired('buyer'), async (req, res, next) => {
  try {
    const { productId, message } = req.body;
    const product = await getProductById(Number(productId));
    if (!product) return res.status(404).json({ error: 'Product not found.' });
    if (product.status !== 'published') return res.status(400).json({ error: 'Product is not available.' });
    if (product.seller.id === req.user.id) return res.status(400).json({ error: 'Buyer cannot message own product.' });

    const existing = await query(
      `SELECT * FROM conversations
       WHERE product_id = $1 AND seller_id = $2 AND buyer_id = $3
         AND conversation_type = 'inquiry'
       ORDER BY id DESC
       LIMIT 1`,
      [product.id, product.seller.id, req.user.id]
    );

    let conversationId;
    if (existing.rows[0]) {
      conversationId = existing.rows[0].id;
      if (existing.rows[0].status !== 'open') {
        await query(`UPDATE conversations SET status = 'open', updated_at = NOW() WHERE id = $1`, [conversationId]);
      }
    } else {
      const createResult = await query(
        `INSERT INTO conversations (product_id, seller_id, buyer_id, conversation_type, status, last_message_at)
         VALUES ($1, $2, $3, 'inquiry', 'open', NOW())
         RETURNING id`,
        [product.id, product.seller.id, req.user.id]
      );
      conversationId = createResult.rows[0].id;
    }

    if (message && String(message).trim()) {
      await query(
        `INSERT INTO messages (conversation_id, sender_id, message_body, is_read)
         VALUES ($1, $2, $3, FALSE)`,
        [conversationId, req.user.id, String(message).trim()]
      );
      await query(`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`, [conversationId]);
    }

    const convo = await getConversationById(conversationId, req.user.id);
    await createNotification(
      product.seller.id,
      'message',
      'رسالة جديدة على منتجك',
      `وصلتك رسالة جديدة بخصوص المنتج: ${product.name}`,
      '/messages',
      { conversationId, productId: product.id }
    );
    await logSystemEvent('info', 'message', 'conversation created or updated', {
      conversationId,
      productId: product.id
    }, req.user.id);
    res.status(201).json({ conversation: convo });
  } catch (error) {
    next(error);
  }
});


router.get('/api/conversations', authRequired, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT
         c.id,
         c.conversation_type,
         c.status,
         c.last_message_at,
         c.created_at,
         p.id AS product_id,
         p.name AS product_name,
         p.status AS product_status,
         s.id AS seller_id,
         s.full_name AS seller_full_name,
         s.store_name AS seller_store_name,
         b.id AS buyer_id,
         b.full_name AS buyer_full_name,
         (
           SELECT m.message_body
           FROM messages m
           WHERE m.conversation_id = c.id
           ORDER BY m.created_at DESC, m.id DESC
           LIMIT 1
         ) AS last_message
       FROM conversations c
       JOIN products p ON p.id = c.product_id
       JOIN users s ON s.id = c.seller_id
       JOIN users b ON b.id = c.buyer_id
       WHERE (
         c.seller_id = $1 OR c.buyer_id = $1 OR EXISTS (
           SELECT 1 FROM users u WHERE u.id = $1 AND u.role = 'admin'
         )
       )
       ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.id DESC`,
      [req.user.id]
    );

    res.json({
      conversations: result.rows.map(row => ({
        id: row.id,
        conversationType: row.conversation_type || 'inquiry',
        status: row.status,
        lastMessageAt: row.last_message_at,
        createdAt: row.created_at,
        product: {
          id: row.product_id,
          name: row.product_name,
          status: row.product_status
        },
        seller: {
          id: row.seller_id,
          fullName: row.seller_full_name,
          storeName: row.seller_store_name || row.seller_full_name
        },
        buyer: {
          id: row.buyer_id,
          fullName: row.buyer_full_name
        },
        lastMessage: row.last_message
      }))
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/conversations/:id', authRequired, async (req, res, next) => {
  try {
    const conversation = await getConversationById(Number(req.params.id), req.user.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    await query(
      `UPDATE messages
       SET is_read = TRUE
       WHERE conversation_id = $1 AND sender_id <> $2`,
      [conversation.id, req.user.id]
    );

    const refreshed = await getConversationById(conversation.id, req.user.id);
    res.json({ conversation: refreshed });
  } catch (error) {
    next(error);
  }
});

router.post('/api/conversations/:id/messages', authRequired, async (req, res, next) => {
  try {
    const conversationId = Number(req.params.id);
    const messageText = String(req.body?.message || '').trim();

    if (!messageText) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const conversation = await getConversationById(conversationId, req.user.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }
    if (conversation.status !== 'open') {
      return res.status(400).json({ error: 'Conversation is not open.' });
    }

    const duplicateMessageResult = await query(
      `SELECT id
       FROM messages
       WHERE conversation_id = $1
         AND sender_id = $2
         AND message_body = $3
         AND created_at >= NOW() - INTERVAL '3 seconds'
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [conversationId, req.user.id, messageText]
    );
    const isDuplicateQuickSubmit = Boolean(duplicateMessageResult.rows[0]);

    if (!isDuplicateQuickSubmit) {
      await query(
        `INSERT INTO messages (conversation_id, sender_id, message_body, is_read)
         VALUES ($1, $2, $3, FALSE)`,
        [conversationId, req.user.id, messageText]
      );

      await query(
        `UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [conversationId]
      );
    }

    const refreshed = await getConversationById(conversationId, req.user.id);
    if (!isDuplicateQuickSubmit) {
      const recipientId = conversation.sellerId === req.user.id ? conversation.buyerId : conversation.sellerId;
      await createNotification(
        recipientId,
        'message',
        'New message',
        `You received a new message in conversation: ${conversation.product?.name || 'Product'}`,
        '/messages',
        { conversationId }
      );
    }

    res.status(201).json({ conversation: refreshed });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/conversations/:id/close', authRequired, async (req, res, next) => {
  try {
    const conversationId = Number(req.params.id);
    const { status = 'closed' } = req.body;

    if (!['closed', 'cancelled', 'open'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    const conversation = await getConversationById(conversationId, req.user.id);
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    if (
      conversation.conversationType === 'order' &&
      ['closed', 'cancelled'].includes(conversation.status) &&
      status !== conversation.status
    ) {
      return res.status(400).json({ error: 'Order conversation is final and cannot be reopened.' });
    }

    await query(
      `UPDATE conversations SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, conversationId]
    );

    const refreshed = await getConversationById(conversationId, req.user.id);
    res.json({ conversation: refreshed });
  } catch (error) {
    next(error);
  }
});

// Ratings

router.post('/api/ratings', authRequired, roleRequired('buyer', 'admin'), async (req, res, next) => {
  try {
    const { conversationId, score, comment } = req.body;
    const parsedScore = Number(score);

    if (!Number.isInteger(parsedScore) || parsedScore < 1 || parsedScore > 5) {
      return res.status(400).json({ error: 'Score must be an integer between 1 and 5.' });
    }

    const convoResult = await query(
      `SELECT * FROM conversations WHERE id = $1 LIMIT 1`,
      [Number(conversationId)]
    );

    const convo = convoResult.rows[0];
    if (!convo) return res.status(404).json({ error: 'Conversation not found.' });
    if (req.user.role !== 'admin' && convo.buyer_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the buyer can rate this conversation.' });
    }
    if (!['closed', 'cancelled'].includes(convo.status)) {
      return res.status(400).json({ error: 'Rating is allowed only after closing or cancelling the conversation.' });
    }

    const existing = await query(
      `SELECT id FROM ratings WHERE conversation_id = $1 LIMIT 1`,
      [convo.id]
    );
    if (existing.rows[0]) {
      return res.status(409).json({ error: 'This conversation has already been rated.' });
    }

    const result = await query(
      `INSERT INTO ratings (conversation_id, product_id, seller_id, buyer_id, score, comment)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [convo.id, convo.product_id, convo.seller_id, convo.buyer_id, parsedScore, comment?.trim() || null]
    );

    await refreshSellerStats(convo.seller_id);
    res.status(201).json({ rating: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.get('/api/sellers/:id/ratings', async (req, res, next) => {
  try {
    const sellerId = Number(req.params.id);
    const result = await query(
      `SELECT
         r.id,
         r.score,
         r.comment,
         r.created_at,
         u.full_name AS buyer_name
       FROM ratings r
       JOIN users u ON u.id = r.buyer_id
       WHERE r.seller_id = $1
       ORDER BY r.created_at DESC`,
      [sellerId]
    );

    res.json({
      ratings: result.rows.map(r => ({
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

// Admin

module.exports = router;
