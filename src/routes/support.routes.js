const express = require('express');
const router = express.Router();
const { authRequired } = require('../services/marketplace.service');
const {
  getOrCreateSupportConversation,
  sendSupportMessage,
  getSupportConversationDetails,
  createNotification,
  logSystemEvent
} = require('../services/platform.service');

router.get('/api/support/conversation', authRequired, async (req, res, next) => {
  try {
    const conversation = await getOrCreateSupportConversation(req.user.id);
    const details = await getSupportConversationDetails(conversation.id);
    res.json({ conversation: details });
  } catch (error) {
    next(error);
  }
});

router.post('/api/support/messages', authRequired, async (req, res, next) => {
  try {
    const body = String(req.body.message || '').trim();
    const category = String(req.body.category || 'general').trim() || 'general';
    if (!body) {
      return res.status(400).json({ error: 'Message is required.' });
    }

    const conversation = await getOrCreateSupportConversation(req.user.id, category);
    await sendSupportMessage({
      conversationId: conversation.id,
      senderUserId: req.user.id,
      senderRole: 'user',
      messageBody: body,
      category
    });

    await logSystemEvent('info', 'support', 'new support message', {
      conversationId: conversation.id,
      requesterUserId: req.user.id,
      category
    }, req.user.id);

    const details = await getSupportConversationDetails(conversation.id);
    res.status(201).json({ conversation: details });
  } catch (error) {
    next(error);
  }
});

router.post('/api/support/quick-message', authRequired, async (req, res, next) => {
  try {
    const quick = String(req.body.quickMessage || '').trim();
    if (!quick) {
      return res.status(400).json({ error: 'Quick message is required.' });
    }
    const conversation = await getOrCreateSupportConversation(req.user.id, 'general');
    await sendSupportMessage({
      conversationId: conversation.id,
      senderUserId: req.user.id,
      senderRole: 'user',
      messageBody: quick,
      category: 'general'
    });
    const details = await getSupportConversationDetails(conversation.id);
    res.status(201).json({ conversation: details });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
