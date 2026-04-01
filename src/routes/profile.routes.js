const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
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

router.get('/api/me', authRequired, async (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.patch('/api/users/profile', authRequired, async (req, res, next) => {
  try {
    const { fullName, storeName, region, address, profileDescription, whatsapp } = req.body;

    const result = await query(
      `UPDATE users
       SET
         full_name = COALESCE($1, full_name),
         store_name = CASE WHEN role = 'seller' THEN COALESCE($2, store_name) ELSE store_name END,
         region = COALESCE($3, region),
         address = COALESCE($4, address),
         profile_description = COALESCE($5, profile_description),
         whatsapp = COALESCE($6, whatsapp),
         updated_at = NOW()
       WHERE id = $7
       RETURNING *`,
      [
        fullName?.trim() || null,
        storeName?.trim() || null,
        region?.trim() || null,
        address?.trim() || null,
        profileDescription?.trim() || null,
        whatsapp?.trim() || null,
        req.user.id
      ]
    );

    const user = result.rows[0];

    if (user.role === 'seller') {
      await query(
        `INSERT INTO seller_profiles (user_id, display_name, bio)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id)
         DO UPDATE SET
           display_name = EXCLUDED.display_name,
           bio = EXCLUDED.bio,
           updated_at = NOW()`,
        [user.id, user.store_name || user.full_name, user.profile_description || null]
      );
    }

    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/users/avatar', authRequired, upload.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Avatar file is required.' });
    }

    const avatarUrl = `/uploads/${req.file.filename}`;

    const oldUserResult = await query(`SELECT avatar_url FROM users WHERE id = $1 LIMIT 1`, [req.user.id]);
    const oldAvatarUrl = oldUserResult.rows[0]?.avatar_url || null;

    const result = await query(
      `UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [avatarUrl, req.user.id]
    );

    if (oldAvatarUrl && oldAvatarUrl.startsWith('/uploads/')) {
      const oldPath = path.join(__dirname, oldAvatarUrl.replace(/^\//, ''));
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }

    const user = result.rows[0];

    if (user.role === 'seller') {
      await query(
        `INSERT INTO seller_profiles (user_id, display_name, logo_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id)
         DO UPDATE SET
           display_name = EXCLUDED.display_name,
           logo_url = EXCLUDED.logo_url,
           updated_at = NOW()`,
        [user.id, user.store_name || user.full_name, avatarUrl]
      );
    }

    res.json({ user: publicUser(user) });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
