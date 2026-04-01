const express = require('express');
const router = express.Router();
const {
  authRequired,
  query,
  getConversationById,
  getProductById
} = require('../services/marketplace.service');
const { logSystemEvent } = require('../services/platform.service');

router.post('/api/reports', authRequired, async (req, res, next) => {
  try {
    const reporterUserId = req.user.id;
    const reportedUserId = req.body.reportedUserId ? Number(req.body.reportedUserId) : null;
    const productId = req.body.productId ? Number(req.body.productId) : null;
    const conversationId = req.body.conversationId ? Number(req.body.conversationId) : null;
    const reason = String(req.body.reason || '').trim();
    const details = req.body.details?.trim() || null;

    if (!reason) {
      return res.status(400).json({ error: 'Reason is required.' });
    }

    if (productId) {
      const product = await getProductById(productId);
      if (!product) {
        return res.status(404).json({ error: 'Product not found.' });
      }
    }

    if (conversationId) {
      const conversation = await getConversationById(conversationId, reporterUserId);
      if (!conversation) {
        return res.status(404).json({ error: 'Conversation not found.' });
      }
    }

    const result = await query(
      `INSERT INTO reports (
         reporter_user_id,
         reported_user_id,
         product_id,
         conversation_id,
         reason,
         details,
         status,
         created_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'open', NOW())
       RETURNING *`,
      [reporterUserId, reportedUserId, productId, conversationId, reason, details]
    );

    const report = result.rows[0];
    await logSystemEvent('warning', 'report', 'new report submitted', {
      reportId: report.id,
      reporterUserId,
      productId,
      conversationId
    }, reporterUserId);
    res.status(201).json({
      report: {
        id: report.id,
        reason: report.reason,
        details: report.details,
        status: report.status,
        conversationId: report.conversation_id,
        productId: report.product_id,
        reportedUserId: report.reported_user_id,
        reporterUserId: report.reporter_user_id,
        createdAt: report.created_at
      }
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
