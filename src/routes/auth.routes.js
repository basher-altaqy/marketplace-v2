const bcrypt = require('bcryptjs');
const express = require('express');
const router = express.Router();
const {
  normalizePhone,
  signToken,
  publicUser,
  query,
  authRequired
} = require('../services/marketplace.service');
const { createNotification, logSystemEvent } = require('../services/platform.service');
const {
  enforceAbuseLimit,
  createVerificationCode,
  verifySubmittedCode,
  getUserVerificationStatus
} = require('../services/security.service');

router.post('/api/auth/register', async (req, res, next) => {
  try {
    const {
      fullName,
      storeName,
      phone,
      email,
      password,
      region,
      address,
      profileDescription,
      whatsapp,
      role
    } = req.body;

    if (!fullName || !phone || !password || !region) {
      return res.status(400).json({ error: 'fullName, phone, password, and region are required.' });
    }

    await enforceAbuseLimit('register', req.ip || req.headers['x-forwarded-for'] || phone, 8);

    const normalizedPhone = normalizePhone(phone);
    const safeRole = ['seller', 'buyer'].includes(role) ? role : 'buyer';

    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const exists = await query(
      `SELECT id FROM users WHERE phone = $1 OR ($2::text IS NOT NULL AND email = $2) LIMIT 1`,
      [normalizedPhone, email?.trim() || null]
    );

    if (exists.rows.length > 0) {
      return res.status(409).json({ error: 'Phone or email already exists.' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);

    const insertResult = await query(
      `INSERT INTO users (
         full_name, store_name, phone, phone_number, email, password_hash, role, region,
         address, avatar_url, profile_description, whatsapp, verification_status
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11, 'unverified')
       RETURNING *`,
      [
        fullName.trim(),
        safeRole === 'seller' ? (storeName?.trim() || fullName.trim()) : null,
        normalizedPhone,
        normalizedPhone,
        email?.trim() || null,
        passwordHash,
        safeRole,
        region.trim(),
        address?.trim() || null,
        profileDescription?.trim() || null,
        whatsapp?.trim() || normalizedPhone
      ]
    );

    const user = insertResult.rows[0];

    if (safeRole === 'seller') {
      await query(
        `INSERT INTO seller_profiles (user_id, display_name, bio)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id, user.store_name || user.full_name, user.profile_description || null]
      );
    }

    const token = signToken(user);
    await createNotification(
      user.id,
      'account',
      'تم إنشاء الحساب',
      'مرحبًا بك في المنصة. ننصح بإكمال التحقق من البريد أو الهاتف لحماية الحساب.',
      '/profile'
    );
    await logSystemEvent('info', 'auth', 'user registered', { userId: user.id, role: user.role }, user.id);
    res.status(201).json({
      token,
      user: publicUser(user),
      verification: await getUserVerificationStatus(user.id)
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/auth/login', async (req, res, next) => {
  try {
    const { identifier, password } = req.body;

    if (!identifier || !password) {
      await logSystemEvent('warning', 'auth_failure', 'login missing credentials', { identifier: String(identifier || '') });
      return res.status(400).json({ error: 'Identifier and password are required.' });
    }

    await enforceAbuseLimit('login', req.ip || req.headers['x-forwarded-for'] || identifier, 10);

    const result = await query(
      `SELECT *
       FROM users
       WHERE (phone = $1 OR email = $2)
         AND is_active = TRUE
       LIMIT 1`,
      [normalizePhone(identifier), String(identifier).trim()]
    );

    const user = result.rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      await logSystemEvent('warning', 'auth_failure', 'invalid user credentials', { identifier: String(identifier || '') });
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    await query(`UPDATE users SET last_login_at = NOW() WHERE id = $1`, [user.id]);
    const token = signToken(user);
    await logSystemEvent('info', 'auth', 'user login success', {
      userId: user.id,
      verificationStatus: user.verification_status || 'unverified'
    }, user.id);
    res.json({
      token,
      user: publicUser(user),
      verification: await getUserVerificationStatus(user.id)
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/auth/verification-status', authRequired, async (req, res, next) => {
  try {
    const verification = await getUserVerificationStatus(req.user.id);
    res.json({ verification });
  } catch (error) {
    next(error);
  }
});

router.post('/api/auth/verification/request', authRequired, async (req, res, next) => {
  try {
    const channel = String(req.body.channel || '').trim().toLowerCase();
    const delivery = await createVerificationCode(req.user.id, channel);
    await createNotification(
      req.user.id,
      'account',
      'تم إنشاء رمز تحقق',
      `تم إنشاء رمز تحقق جديد عبر قناة ${channel}.`,
      '/profile',
      { channel }
    );
    res.status(201).json({
      ok: true,
      delivery
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/auth/verification/confirm', authRequired, async (req, res, next) => {
  try {
    const verification = await verifySubmittedCode(req.user.id, req.body.channel, req.body.code);
    const userResult = await query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [req.user.id]);
    await createNotification(
      req.user.id,
      'account',
      'تم تحديث حالة التحقق',
      'تم تأكيد إحدى قنوات التحقق لحسابك بنجاح.',
      '/profile',
      { channel: String(req.body.channel || '').trim().toLowerCase() }
    );
    res.json({
      ok: true,
      user: publicUser(userResult.rows[0]),
      verification
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
