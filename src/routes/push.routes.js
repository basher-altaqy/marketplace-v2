const express = require('express');
const router = express.Router();
const { authRequired } = require('../services/marketplace.service');
const { WEB_PUSH_ENABLED } = require('../config/env');
const {
  getPushPublicKey,
  upsertPushSubscription,
  removePushSubscription,
  logSystemEvent
} = require('../services/platform.service');

router.get('/api/push/vapid-public-key', authRequired, async (req, res, next) => {
  try {
    if (!WEB_PUSH_ENABLED) {
      return res.status(503).json({ error: 'Web push is disabled.' });
    }

    const publicKey = getPushPublicKey();
    if (!publicKey) {
      return res.status(503).json({ error: 'VAPID public key is unavailable.' });
    }

    await logSystemEvent(
      'info',
      'push',
      'push_permission_requested',
      { source: 'vapid_public_key_request' },
      Number(req.user?.id || 0) || null
    );

    res.json({ publicKey });
  } catch (error) {
    next(error);
  }
});

router.post('/api/push/subscribe', authRequired, async (req, res, next) => {
  try {
    if (!WEB_PUSH_ENABLED) {
      return res.status(503).json({ error: 'Web push is disabled.' });
    }

    const subscription = req.body?.subscription || req.body;
    const saved = await upsertPushSubscription(
      req.user.id,
      subscription,
      req.headers['user-agent'] || null
    );

    if (!saved) {
      return res.status(400).json({ error: 'Invalid push subscription payload.' });
    }

    await logSystemEvent(
      'info',
      'push',
      'push_permission_granted',
      { source: 'subscription_saved', subscriptionId: Number(saved.id || 0) || null },
      Number(req.user?.id || 0) || null
    );

    res.status(201).json({ ok: true, subscription: saved });
  } catch (error) {
    next(error);
  }
});

router.post('/api/push/unsubscribe', authRequired, async (req, res, next) => {
  try {
    if (!WEB_PUSH_ENABLED) {
      return res.status(200).json({ ok: true, removed: false });
    }

    const endpoint = String(
      req.body?.endpoint
      || req.body?.subscription?.endpoint
      || ''
    ).trim();

    if (!endpoint) {
      return res.status(400).json({ error: 'Subscription endpoint is required.' });
    }

    const removed = await removePushSubscription(req.user.id, endpoint);
    res.json({ ok: true, removed });
  } catch (error) {
    next(error);
  }
});

router.post('/api/push/client-event', authRequired, async (req, res, next) => {
  try {
    const eventType = String(req.body?.eventType || '').trim();
    const allowedEvents = new Set([
      'push_permission_requested',
      'push_permission_granted',
      'push_permission_denied'
    ]);

    if (!allowedEvents.has(eventType)) {
      return res.status(400).json({ error: 'Unsupported push client event.' });
    }

    const rawMetadata = req.body?.metadata;
    const metadata = rawMetadata && typeof rawMetadata === 'object' && !Array.isArray(rawMetadata)
      ? rawMetadata
      : {};

    await logSystemEvent(
      'info',
      'push',
      eventType,
      {
        ...metadata,
        source: 'client',
        userAgent: String(req.headers['user-agent'] || '').slice(0, 512)
      },
      Number(req.user?.id || 0) || null
    );

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
