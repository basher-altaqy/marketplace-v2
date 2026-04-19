const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const router = express.Router();
const { query, publicUser, normalizePhone } = require('../services/marketplace.service');
const { JWT_SECRET } = require('../config/env');
const { logSystemEvent } = require('../services/platform.service');
const { enforceAbuseLimit } = require('../services/security.service');

function signAdminToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      phone: user.phone,
      scope: 'admin'
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

async function adminAuthRequired(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      await logSystemEvent('warning', 'auth_failure', 'missing admin token', {});
      return res.status(401).json({ error: 'Admin authentication required.' });
    }

    const payload = jwt.verify(token, JWT_SECRET);

    if (payload.scope !== 'admin') {
      await logSystemEvent('warning', 'auth_failure', 'invalid admin scope', { userId: payload.id });
      return res.status(403).json({ error: 'Invalid admin scope.' });
    }

    const result = await query(
      `SELECT * FROM users WHERE id = $1 AND role = 'admin' AND is_active = TRUE LIMIT 1`,
      [payload.id]
    );

    const user = result.rows[0];
    if (!user) {
      await logSystemEvent('warning', 'auth_failure', 'admin not found or inactive', { userId: payload.id });
      return res.status(401).json({ error: 'Admin not found or inactive.' });
    }

    req.admin = user;
    next();
  } catch (_error) {
    await logSystemEvent('warning', 'auth_failure', 'invalid or expired admin token', {});
    return res.status(401).json({ error: 'Invalid or expired admin token.' });
  }
}

router.post('/api/admin/auth/login', async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      await logSystemEvent('warning', 'auth_failure', 'admin login missing credentials', { identifier: String(identifier || '') });
      return res.status(400).json({ error: 'Identifier and password are required.' });
    }

    try {
      await enforceAbuseLimit('admin_login', req.ip || req.headers['x-forwarded-for'] || identifier, 6, 1000 * 60 * 15);
    } catch (limitError) {
      return res.status(429).json({ error: limitError.message || 'Too many attempts. Try again later.' });
    }

    const result = await query(
      `SELECT *
       FROM users
       WHERE (phone = $1 OR email = $2)
         AND role = 'admin'
         AND is_active = TRUE
       LIMIT 1`,
      [normalizePhone(identifier), String(identifier).trim()]
    );

    const user = result.rows[0];

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      await logSystemEvent('warning', 'auth_failure', 'invalid admin credentials', { identifier: String(identifier || '') });
      return res.status(401).json({ error: 'Invalid admin credentials.' });
    }

    await query(
      `UPDATE users SET last_login_at = NOW() WHERE id = $1`,
      [user.id]
    );

    const token = signAdminToken(user);
    await logSystemEvent('info', 'admin_action', 'admin login success', { adminId: user.id }, user.id);

    res.json({
      token,
      admin: publicUser(user)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/admin/auth/me', adminAuthRequired, async (req, res) => {
  res.json({
    admin: publicUser(req.admin)
  });
});

router.post('/api/admin/auth/logout', adminAuthRequired, async (_req, res) => {
  await logSystemEvent('info', 'admin_action', 'admin logout', {}, _req.admin?.id || null);
  res.json({ ok: true });
});

module.exports = {
  adminAuthRoutes: router,
  adminAuthRequired
};
