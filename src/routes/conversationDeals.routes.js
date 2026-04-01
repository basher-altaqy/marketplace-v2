const express = require('express');
const router = express.Router();
const {
  authRequired,
  query,
  getConversationById,
  getConversationDeals,
  getProductById,
  mapConversationDealRow
} = require('../services/marketplace.service');

function canAccessConversation(userId, conversation) {
  return conversation && (conversation.sellerId === userId || conversation.buyerId === userId);
}

router.get('/api/conversations/:conversationId/deals', authRequired, async (req, res, next) => {
  try {
    const conversationId = Number(req.params.conversationId);
    const conversation = await getConversationById(conversationId, req.user.id);
    if (!conversation || !canAccessConversation(req.user.id, conversation)) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    const deals = await getConversationDeals(conversationId);
    res.json({ deals });
  } catch (error) {
    next(error);
  }
});

router.post('/api/conversations/:conversationId/deals', authRequired, async (req, res, next) => {
  try {
    const conversationId = Number(req.params.conversationId);
    const conversation = await getConversationById(conversationId, req.user.id);
    if (!conversation || !canAccessConversation(req.user.id, conversation)) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    const productId = Number(req.body.productId || conversation.productId);
    const quantity = Math.max(1, Number(req.body.quantity || 1));
    const agreedPrice = Number(req.body.agreedPrice);
    const note = req.body.note?.trim() || null;

    if (!Number.isFinite(agreedPrice) || agreedPrice <= 0) {
      return res.status(400).json({ error: 'Agreed price is required.' });
    }

    const product = await getProductById(productId);
    if (!product || product.id !== conversation.productId) {
      return res.status(400).json({ error: 'Deal product must match the conversation product.' });
    }

    const result = await query(
      `INSERT INTO conversation_deals (
         conversation_id,
         product_id,
         buyer_id,
         seller_id,
         quantity,
         agreed_price,
         note,
         status,
         created_at,
         updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW(), NOW())
       RETURNING *`,
      [conversationId, productId, conversation.buyerId, conversation.sellerId, quantity, agreedPrice, note]
    );

    const details = await getConversationDeals(conversationId);
    const deal = details.find((item) => item.id === result.rows[0].id);
    res.status(201).json({ deal });
  } catch (error) {
    next(error);
  }
});

router.put('/api/conversations/deals/:dealId', authRequired, async (req, res, next) => {
  try {
    const dealId = Number(req.params.dealId);
    const existingResult = await query(`SELECT * FROM conversation_deals WHERE id = $1 LIMIT 1`, [dealId]);
    const existing = existingResult.rows[0];
    if (!existing) {
      return res.status(404).json({ error: 'Deal not found.' });
    }

    const conversation = await getConversationById(existing.conversation_id, req.user.id);
    if (!conversation || !canAccessConversation(req.user.id, conversation)) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    const quantity = req.body.quantity != null ? Math.max(1, Number(req.body.quantity || 1)) : Number(existing.quantity);
    const agreedPrice = req.body.agreedPrice != null ? Number(req.body.agreedPrice) : Number(existing.agreed_price);
    const note = req.body.note != null ? req.body.note?.trim() || null : existing.note;
    const status = req.body.status || existing.status;

    if (!['pending', 'agreed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid deal status.' });
    }

    await query(
      `UPDATE conversation_deals
       SET quantity = $1,
           agreed_price = $2,
           note = $3,
           status = $4,
           updated_at = NOW()
       WHERE id = $5`,
      [quantity, agreedPrice, note, status, dealId]
    );

    const details = await getConversationDeals(existing.conversation_id);
    const deal = details.find((item) => item.id === dealId);
    res.json({ deal });
  } catch (error) {
    next(error);
  }
});

router.delete('/api/conversations/deals/:dealId', authRequired, async (req, res, next) => {
  try {
    const dealId = Number(req.params.dealId);
    const existingResult = await query(`SELECT * FROM conversation_deals WHERE id = $1 LIMIT 1`, [dealId]);
    const existing = existingResult.rows[0];
    if (!existing) {
      return res.status(404).json({ error: 'Deal not found.' });
    }

    const conversation = await getConversationById(existing.conversation_id, req.user.id);
    if (!conversation || !canAccessConversation(req.user.id, conversation)) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    await query(`DELETE FROM conversation_deals WHERE id = $1`, [dealId]);
    res.json({ ok: true, dealId });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
