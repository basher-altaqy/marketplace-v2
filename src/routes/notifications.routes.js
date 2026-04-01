const express = require('express');
const router = express.Router();
const { authRequired } = require('../services/marketplace.service');
const {
  listNotificationsByUser,
  markNotificationRead,
  markAllNotificationsRead
} = require('../services/platform.service');

router.get('/api/notifications', authRequired, async (req, res, next) => {
  try {
    const notifications = await listNotificationsByUser(req.user.id);
    res.json({ notifications });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/notifications/:id/read', authRequired, async (req, res, next) => {
  try {
    const notification = await markNotificationRead(req.params.id, req.user.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found.' });
    }
    res.json({ notification });
  } catch (error) {
    next(error);
  }
});

router.post('/api/notifications/read-all', authRequired, async (req, res, next) => {
  try {
    await markAllNotificationsRead(req.user.id);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
