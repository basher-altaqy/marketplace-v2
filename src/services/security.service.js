const crypto = require('crypto');
const { query } = require('../db/pool');
const { logSystemEvent } = require('./platform.service');

const challengeStore = new Map();
const abuseStore = new Map();

function cleanupMap(store, maxAgeMs) {
  const now = Date.now();
  for (const [key, value] of store.entries()) {
    if (!value || (value.expiresAt && value.expiresAt <= now) || (value.updatedAt && value.updatedAt + maxAgeMs <= now)) {
      store.delete(key);
    }
  }
}

async function ensureSecuritySupport() {
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50)`);
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status VARCHAR(30) NOT NULL DEFAULT 'unverified'`);
  await query(`UPDATE users SET phone_number = COALESCE(phone_number, phone)`);
  await query(`
    CREATE TABLE IF NOT EXISTS verification_codes (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel VARCHAR(20) NOT NULL,
      destination VARCHAR(255) NOT NULL,
      code_hash TEXT NOT NULL,
      code_hint VARCHAR(12) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      expires_at TIMESTAMP NOT NULL,
      consumed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_verification_codes_user_channel ON verification_codes(user_id, channel, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_verification_codes_status ON verification_codes(status, expires_at DESC)`);
}

function buildChallenge(scope = 'general') {
  cleanupMap(challengeStore, 1000 * 60 * 30);
  const a = Math.floor(Math.random() * 8) + 1;
  const b = Math.floor(Math.random() * 8) + 1;
  const id = crypto.randomUUID();
  const answer = String(a + b);
  challengeStore.set(id, {
    scope,
    answer,
    expiresAt: Date.now() + 1000 * 60 * 10
  });
  return {
    challengeId: id,
    prompt: `ما ناتج ${a} + ${b} ؟`
  };
}

function verifyChallenge(challengeId, answer, scope = 'general') {
  cleanupMap(challengeStore, 1000 * 60 * 30);
  const challenge = challengeStore.get(String(challengeId || ''));
  if (!challenge || challenge.scope !== scope || challenge.expiresAt <= Date.now()) {
    return { ok: false, error: 'انتهت صلاحية التحقق البشري. حدّث السؤال وأعد المحاولة.' };
  }

  if (String(answer || '').trim() !== challenge.answer) {
    return { ok: false, error: 'إجابة التحقق البشري غير صحيحة.' };
  }

  challengeStore.delete(String(challengeId || ''));
  return { ok: true };
}

async function enforceAbuseLimit(scope, key, limit = 6, windowMs = 1000 * 60 * 15) {
  cleanupMap(abuseStore, windowMs);
  const storeKey = `${scope}:${String(key || 'unknown').trim().toLowerCase()}`;
  const current = abuseStore.get(storeKey);
  const now = Date.now();

  if (!current || current.updatedAt + windowMs <= now) {
    abuseStore.set(storeKey, { count: 1, updatedAt: now });
    return;
  }

  current.count += 1;
  current.updatedAt = now;
  abuseStore.set(storeKey, current);

  if (current.count > limit) {
    await logSystemEvent('warning', 'abuse_guard', `${scope} rate limit reached`, { key: storeKey, limit });
    throw new Error('تم تجاوز عدد المحاولات المسموح بها مؤقتاً. حاول مرة أخرى بعد قليل.');
  }
}

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function randomCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function maskDestination(channel, destination) {
  const value = String(destination || '').trim();
  if (!value) return '-';
  if (channel === 'email') {
    const [name, domain] = value.split('@');
    if (!domain) return value;
    return `${name.slice(0, 2)}***@${domain}`;
  }
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}

function resolveVerificationStatus(row) {
  if (!row) return 'unverified';
  return row.is_email_verified || row.is_phone_verified ? 'verified' : 'unverified';
}

function mapVerificationStatus(row) {
  if (!row) return null;
  return {
    userId: row.id,
    email: row.email,
    phone: row.phone_number || row.phone,
    whatsapp: row.whatsapp,
    isEmailVerified: Boolean(row.is_email_verified),
    isPhoneVerified: Boolean(row.is_phone_verified),
    verificationStatus: resolveVerificationStatus(row)
  };
}

async function getUserVerificationStatus(userId) {
  const result = await query(
    `SELECT id, email, phone, phone_number, whatsapp, is_email_verified, is_phone_verified, verification_status
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [Number(userId)]
  );
  return mapVerificationStatus(result.rows[0]);
}

async function createVerificationCode(userId, channel) {
  const safeChannel = String(channel || '').trim().toLowerCase();
  if (!['email', 'phone', 'whatsapp'].includes(safeChannel)) {
    throw new Error('قناة التحقق غير مدعومة.');
  }

  const userResult = await query(
    `SELECT id, email, phone, phone_number, whatsapp, is_email_verified, is_phone_verified, verification_status
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [Number(userId)]
  );
  const user = userResult.rows[0];
  if (!user) throw new Error('المستخدم غير موجود.');

  const destination = safeChannel === 'email'
    ? String(user.email || '').trim()
    : String(user.phone_number || user.phone || user.whatsapp || '').trim();

  if (!destination) {
    throw new Error(safeChannel === 'email' ? 'لا يوجد بريد إلكتروني مرتبط بالحساب.' : 'لا يوجد رقم هاتف صالح مرتبط بالحساب.');
  }

  await query(
    `UPDATE verification_codes
     SET status = 'replaced'
     WHERE user_id = $1 AND channel = $2 AND status = 'pending'`,
    [Number(userId), safeChannel]
  );

  const code = randomCode();
  const result = await query(
    `INSERT INTO verification_codes (user_id, channel, destination, code_hash, code_hint, status, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, 'pending', NOW() + INTERVAL '10 minutes', NOW())
     RETURNING id, expires_at`,
    [Number(userId), safeChannel, destination, hashCode(code), code.slice(-2)]
  );

  await logSystemEvent('info', 'verification', 'verification code created', {
    verificationId: result.rows[0].id,
    userId: Number(userId),
    channel: safeChannel,
    destination: maskDestination(safeChannel, destination)
  }, Number(userId));

  return {
    verificationId: result.rows[0].id,
    channel: safeChannel,
    destination: maskDestination(safeChannel, destination),
    expiresAt: result.rows[0].expires_at,
    previewCode: process.env.NODE_ENV === 'production' ? null : code
  };
}

async function verifySubmittedCode(userId, channel, code) {
  const safeChannel = String(channel || '').trim().toLowerCase();
  const safeCode = String(code || '').trim();
  if (!safeCode) {
    throw new Error('رمز التحقق مطلوب.');
  }

  const result = await query(
    `SELECT *
     FROM verification_codes
     WHERE user_id = $1
       AND channel = $2
       AND status = 'pending'
       AND expires_at > NOW()
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [Number(userId), safeChannel]
  );
  const record = result.rows[0];
  if (!record) {
    throw new Error('لا يوجد رمز تحقق صالح لهذه القناة.');
  }

  if (record.code_hash !== hashCode(safeCode)) {
    await logSystemEvent('warning', 'verification', 'invalid verification code', {
      verificationId: record.id,
      userId: Number(userId),
      channel: safeChannel
    }, Number(userId));
    throw new Error('رمز التحقق غير صحيح.');
  }

  await query(
    `UPDATE verification_codes
     SET status = 'verified', consumed_at = NOW()
     WHERE id = $1`,
    [record.id]
  );

  if (safeChannel === 'email') {
    await query(
      `UPDATE users
       SET is_email_verified = TRUE,
           verification_status = 'verified'
       WHERE id = $1`,
      [Number(userId)]
    );
  } else {
    await query(
      `UPDATE users
       SET is_phone_verified = TRUE,
           verification_status = 'verified'
       WHERE id = $1`,
      [Number(userId)]
    );
  }

  await logSystemEvent('info', 'verification', 'verification channel confirmed', {
    userId: Number(userId),
    channel: safeChannel
  }, Number(userId));

  return getUserVerificationStatus(userId);
}

module.exports = {
  ensureSecuritySupport,
  buildChallenge,
  verifyChallenge,
  enforceAbuseLimit,
  createVerificationCode,
  verifySubmittedCode,
  getUserVerificationStatus
};
