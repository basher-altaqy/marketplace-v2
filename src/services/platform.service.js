const fs = require('fs');
const path = require('path');
const { query } = require('../db/pool');
const {
  ROOT_DIR,
  UPLOADS_DIR,
  WEB_PUSH_ENABLED,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT,
  PUSH_METRICS_WINDOW_HOURS
} = require('../config/env');

const LOGS_DIR = path.join(ROOT_DIR, 'logs');
const APP_LOG_FILE = path.join(LOGS_DIR, 'application.log');
const BACKUP_SCRIPT_PATH = path.join(ROOT_DIR, 'scripts', 'db-backup.ps1');
const PUSH_EVENTS_ENABLED = new Set(['message', 'order']);
let webPushClientCache;
const HOME_AD_SLOT_DEFINITIONS = {
  top_1: {
    slot: 'top_1',
    keyPrefix: 'home_top_ad_1_',
    titlePrefix: 'Home Top Ad 1'
  },
  top_2: {
    slot: 'top_2',
    keyPrefix: 'home_top_ad_2_',
    titlePrefix: 'Home Top Ad 2'
  },
  bottom: {
    slot: 'bottom',
    keyPrefix: 'home_bottom_ad_',
    titlePrefix: 'Home Bottom Ad'
  }
};
const HOME_AD_SLOT_ORDER = ['top_1', 'top_2', 'bottom'];
const HOME_AD_FIELDS = ['title', 'subtitle', 'image', 'link'];
const HOME_AD_CONTENT_KEYS = new Set(
  HOME_AD_SLOT_ORDER.flatMap((slot) => {
    const slotConfig = HOME_AD_SLOT_DEFINITIONS[slot];
    return HOME_AD_FIELDS.map((field) => `${slotConfig.keyPrefix}${field}`);
  })
);
const DEFAULT_CONTENT = [
  {
    key: 'about_company',
    title: 'معلومات الشركة',
    content: 'يمكن للإدارة تعديل هذا النص من لوحة التحكم لعرض نبذة الشركة ورسالتها وخدماتها.'
  },
  {
    key: 'terms_of_use',
    title: 'سياسة الاستخدام',
    content: 'يمكن للإدارة تعديل هذا النص لتوضيح آلية استخدام المنصة ومسؤوليات المستخدمين.'
  },
  {
    key: 'privacy_policy',
    title: 'سياسة الخصوصية',
    content: 'يمكن للإدارة تعديل هذا النص لشرح آلية جمع البيانات وحمايتها واستخدامها داخل المنصة.'
  },
  {
    key: 'contact_info',
    title: 'معلومات التواصل',
    content: 'الهاتف: -\nالبريد الإلكتروني: -\nالعنوان: -'
  },
  {
    key: 'general_terms',
    title: 'الشروط العامة',
    content: 'يمكن للإدارة تعديل هذا النص لإضافة الشروط العامة الخاصة بالشراء والبيع والدعم.'
  },
  {
    key: 'faq',
    title: 'الأسئلة المتكررة',
    content: 'س: كيف أضيف منتجًا؟\nج: من لوحة المستخدم أو زر إضافة منتج.\n\nس: كيف أتواصل مع الدعم؟\nج: من زر الدعم العائم داخل المنصة.'
  },
  {
    key: 'site_background_image',
    title: 'صورة خلفية الموقع',
    content: '/assets/site/black-gold-marble-reference.jpg'
  },
  {
    key: 'home_hero_image',
    title: 'صورة الواجهة العليا',
    content: '/assets/site/black-gold-marble-reference.jpg'
  },
];

fs.mkdirSync(LOGS_DIR, { recursive: true });
fs.mkdirSync(path.dirname(BACKUP_SCRIPT_PATH), { recursive: true });

function appendFileLog(payload) {
  const line = JSON.stringify({
    ...payload,
    createdAt: new Date().toISOString()
  }) + '\n';
  fs.appendFileSync(APP_LOG_FILE, line, 'utf8');
}

async function logSystemEvent(level, category, message, metadata = {}, actorUserId = null) {
  const safeLevel = String(level || 'info').toLowerCase();
  const safeCategory = String(category || 'general').toLowerCase();
  const safeMessage = String(message || '').trim() || 'system event';
  const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};

  appendFileLog({
    level: safeLevel,
    category: safeCategory,
    actorUserId,
    message: safeMessage,
    metadata: safeMetadata
  });

  try {
    await query(
      `INSERT INTO system_logs (actor_user_id, log_level, category, message, metadata_json, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())`,
      [actorUserId, safeLevel, safeCategory, safeMessage, JSON.stringify(safeMetadata)]
    );
  } catch (_error) {
    // Avoid recursive logging failures.
  }
}

function getWebPushClient() {
  if (webPushClientCache !== undefined) return webPushClientCache;

  if (!WEB_PUSH_ENABLED) {
    webPushClientCache = null;
    return webPushClientCache;
  }

  try {
    const webPush = require('web-push');
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    webPushClientCache = webPush;
  } catch (error) {
    console.error('[push] web-push is unavailable:', error.message);
    webPushClientCache = null;
  }

  return webPushClientCache;
}

function normalizePushSubscription(subscription = {}) {
  const endpoint = String(subscription.endpoint || '').trim();
  const keys = subscription.keys && typeof subscription.keys === 'object' ? subscription.keys : {};
  const p256dh = String(keys.p256dh || '').trim();
  const auth = String(keys.auth || '').trim();
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, keys: { p256dh, auth } };
}

function mapPushSubscriptionRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth
    },
    userAgent: row.user_agent,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSuccessAt: row.last_success_at,
    lastErrorAt: row.last_error_at
  };
}

function getPushPublicKey() {
  if (!WEB_PUSH_ENABLED) return null;
  return VAPID_PUBLIC_KEY || null;
}

function summarizePushEndpoint(endpoint) {
  const safe = String(endpoint || '').trim();
  if (!safe) return '';
  if (safe.length <= 80) return safe;
  return `${safe.slice(0, 38)}...${safe.slice(-32)}`;
}

function sanitizeHomeAdText(value, maxLength = 1200) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizeHomeAdImageForResponse(value) {
  const raw = sanitizeHomeAdText(value, 2048);
  if (!raw) return '';
  const fixedTypo = raw.replace(/^\/?ssets\//i, '/assets/');
  if (/^(https?:)?\/\//i.test(fixedTypo) || fixedTypo.startsWith('/')) return fixedTypo;
  return '/' + fixedTypo.replace(/^\/+/, '');
}

function normalizeHomeAdLinkForResponse(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const lowered = raw.toLowerCase();
  if (lowered === 'none' || lowered === '#') return null;
  if (/^(https?:)?\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return raw;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw)) return null;
  return '/' + raw.replace(/^\/+/, '');
}

function normalizeHomeAdLinkForStorage(value) {
  const normalized = normalizeHomeAdLinkForResponse(value);
  return normalized ? normalized : 'none';
}

function getHomeAdSlotConfig(slot) {
  return HOME_AD_SLOT_DEFINITIONS[String(slot || '').trim().toLowerCase()] || null;
}

function getHomeAdContentTitle(slotConfig, field) {
  const fieldLabel = field.charAt(0).toUpperCase() + field.slice(1);
  return `${slotConfig.titlePrefix} ${fieldLabel}`;
}

function mapHomeAdFromContent(slotConfig, valuesByKey = {}) {
  const titleKey = `${slotConfig.keyPrefix}title`;
  const subtitleKey = `${slotConfig.keyPrefix}subtitle`;
  const imageKey = `${slotConfig.keyPrefix}image`;
  const linkKey = `${slotConfig.keyPrefix}link`;

  const title = sanitizeHomeAdText(valuesByKey[titleKey], 240);
  const subtitle = sanitizeHomeAdText(valuesByKey[subtitleKey], 800);
  const image = normalizeHomeAdImageForResponse(valuesByKey[imageKey]);
  const link = normalizeHomeAdLinkForResponse(valuesByKey[linkKey]);
  const isVisible = Boolean(title && image);

  return {
    slot: slotConfig.slot,
    title,
    subtitle,
    image,
    link,
    isVisible
  };
}

async function upsertPushSubscription(userId, subscription, userAgent = null) {
  const normalized = normalizePushSubscription(subscription);
  if (!normalized || !Number.isInteger(Number(userId))) return null;

  const result = await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     ON CONFLICT (user_id, endpoint)
     DO UPDATE SET
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       user_agent = EXCLUDED.user_agent,
       updated_at = NOW()
     RETURNING *`,
    [
      Number(userId),
      normalized.endpoint,
      normalized.keys.p256dh,
      normalized.keys.auth,
      userAgent ? String(userAgent).slice(0, 512) : null
    ]
  );

  const mapped = mapPushSubscriptionRow(result.rows[0]);
  if (mapped) {
    await logSystemEvent(
      'info',
      'push',
      'push_subscription_upserted',
      {
        subscriptionId: mapped.id,
        endpoint: summarizePushEndpoint(mapped.endpoint)
      },
      Number(userId)
    );
  }
  return mapped;
}

async function removePushSubscription(userId, endpoint) {
  if (!Number.isInteger(Number(userId))) return false;
  const safeEndpoint = String(endpoint || '').trim();
  if (!safeEndpoint) return false;

  const result = await query(
    `DELETE FROM push_subscriptions
     WHERE user_id = $1 AND endpoint = $2
     RETURNING id`,
    [Number(userId), safeEndpoint]
  );
  const removed = Boolean(result.rows[0]);
  if (removed) {
    await logSystemEvent(
      'info',
      'push',
      'push_subscription_unsubscribed',
      {
        subscriptionId: Number(result.rows[0].id || 0) || null,
        endpoint: summarizePushEndpoint(safeEndpoint)
      },
      Number(userId)
    );
  }
  return removed;
}

async function listPushSubscriptionsByUser(userId) {
  const result = await query(
    `SELECT *
     FROM push_subscriptions
     WHERE user_id = $1
     ORDER BY updated_at DESC, id DESC`,
    [Number(userId)]
  );
  return result.rows.map(mapPushSubscriptionRow);
}

async function logPushDelivery({
  notificationId = null,
  userId = null,
  subscriptionId = null,
  eventType = 'general',
  status = 'failure',
  errorCode = null,
  errorMessage = null,
  latencyMs = null
} = {}) {
  if (!Number.isInteger(Number(userId))) return;
  await query(
    `INSERT INTO push_delivery_logs (
       notification_id,
       user_id,
       subscription_id,
       event_type,
       status,
       error_code,
       error_message,
       latency_ms,
       created_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
    [
      Number.isInteger(Number(notificationId)) ? Number(notificationId) : null,
      Number(userId),
      Number.isInteger(Number(subscriptionId)) ? Number(subscriptionId) : null,
      String(eventType || 'general').trim() || 'general',
      status === 'success' ? 'success' : 'failure',
      errorCode ? String(errorCode).slice(0, 120) : null,
      errorMessage ? String(errorMessage).slice(0, 4000) : null,
      Number.isInteger(Number(latencyMs)) ? Number(latencyMs) : null
    ]
  );
}

async function sendPushToUser(userId, payload = {}, { eventType = 'general', notificationId = null } = {}) {
  if (!WEB_PUSH_ENABLED) {
    return { totalAttempts: 0, successCount: 0, failureCount: 0, invalidRemoved: 0 };
  }

  const webPush = getWebPushClient();
  if (!webPush) {
    return { totalAttempts: 0, successCount: 0, failureCount: 0, invalidRemoved: 0 };
  }

  const subscriptions = await listPushSubscriptionsByUser(userId);
  if (!subscriptions.length) {
    return { totalAttempts: 0, successCount: 0, failureCount: 0, invalidRemoved: 0 };
  }

  const pushPayload = JSON.stringify(payload || {});
  const counters = {
    totalAttempts: 0,
    successCount: 0,
    failureCount: 0,
    invalidRemoved: 0
  };

  for (const subscription of subscriptions) {
    counters.totalAttempts += 1;
    const startedAt = Date.now();

    try {
      await webPush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.keys?.p256dh,
            auth: subscription.keys?.auth
          }
        },
        pushPayload
      );

      counters.successCount += 1;
      const latencyMs = Date.now() - startedAt;
      await query(
        `UPDATE push_subscriptions
         SET last_success_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [subscription.id]
      );
      await logPushDelivery({
        notificationId,
        userId,
        subscriptionId: subscription.id,
        eventType,
        status: 'success',
        latencyMs
      });
      await logSystemEvent(
        'info',
        'push',
        'push_delivery_success',
        {
          notificationId: Number(notificationId || 0) || null,
          subscriptionId: subscription.id,
          eventType,
          latencyMs
        },
        Number(userId)
      );
    } catch (error) {
      counters.failureCount += 1;
      const statusCode = Number(error?.statusCode || 0);
      const isInvalidSubscription = statusCode === 404 || statusCode === 410;
      const latencyMs = Date.now() - startedAt;

      if (isInvalidSubscription) {
        counters.invalidRemoved += 1;
        await query(`DELETE FROM push_subscriptions WHERE id = $1`, [subscription.id]);
      } else {
        await query(
          `UPDATE push_subscriptions
           SET last_error_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [subscription.id]
        );
      }

      await logPushDelivery({
        notificationId,
        userId,
        subscriptionId: subscription.id,
        eventType,
        status: 'failure',
        errorCode: isInvalidSubscription ? 'invalid_subscription_removed' : String(error?.code || statusCode || 'unknown'),
        errorMessage: String(error?.message || error?.body || 'Push delivery failed.'),
        latencyMs
      });
      await logSystemEvent(
        isInvalidSubscription ? 'warning' : 'error',
        'push',
        isInvalidSubscription ? 'push_delivery_failure_invalid_removed' : 'push_delivery_failure',
        {
          notificationId: Number(notificationId || 0) || null,
          subscriptionId: subscription.id,
          eventType,
          latencyMs,
          errorCode: String(error?.code || statusCode || 'unknown')
        },
        Number(userId)
      );
    }
  }

  return counters;
}

async function getPushDeliveryMetrics(windowHours = PUSH_METRICS_WINDOW_HOURS) {
  const safeWindowHours = Math.max(1, Number.parseInt(String(windowHours || PUSH_METRICS_WINDOW_HOURS), 10) || PUSH_METRICS_WINDOW_HOURS);
  const result = await query(
    `SELECT
       COUNT(*)::int AS total_attempts,
       COUNT(*) FILTER (WHERE status = 'success')::int AS success_count,
       COUNT(*) FILTER (WHERE status = 'failure')::int AS failure_count,
       COUNT(*) FILTER (WHERE error_code = 'invalid_subscription_removed')::int AS invalid_removed
     FROM push_delivery_logs
     WHERE created_at >= NOW() - ($1::int * INTERVAL '1 hour')`,
    [safeWindowHours]
  );

  const row = result.rows[0] || {};
  const totalAttempts = Number(row.total_attempts || 0);
  const successCount = Number(row.success_count || 0);
  const failureCount = Number(row.failure_count || 0);
  const invalidRemoved = Number(row.invalid_removed || 0);
  const successRate = totalAttempts > 0 ? Number(((successCount / totalAttempts) * 100).toFixed(2)) : 0;

  return {
    windowHours: safeWindowHours,
    totalAttempts,
    successCount,
    failureCount,
    successRate,
    invalidRemoved
  };
}

async function createNotification(userId, type, title, body, linkUrl = null, metadata = {}) {
  if (!Number.isInteger(Number(userId))) return null;

  const safeType = String(type || 'general').trim() || 'general';
  const safeTitle = String(title || 'New notification').trim() || 'New notification';
  const safeBody = String(body || '').trim() || 'A new notification was created.';
  const safeLink = linkUrl?.trim() || null;
  const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {};

  const result = await query(
    `INSERT INTO notifications (user_id, type, title, body, link_url, metadata_json, is_read, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, FALSE, NOW(), NOW())
     RETURNING *`,
    [
      Number(userId),
      safeType,
      safeTitle,
      safeBody,
      safeLink,
      JSON.stringify(safeMetadata)
    ]
  );

  const notification = mapNotificationRow(result.rows[0]);
  if (notification && WEB_PUSH_ENABLED && PUSH_EVENTS_ENABLED.has(safeType)) {
    const pushPayload = {
      title: safeTitle,
      body: safeBody,
      linkUrl: safeLink || '/',
      type: safeType,
      notificationId: notification.id,
      metadata: safeMetadata
    };

    Promise.resolve()
      .then(() => sendPushToUser(Number(userId), pushPayload, { eventType: safeType, notificationId: notification.id }))
      .catch((error) => {
        console.error('[push] failed to dispatch push payload:', error.message);
      });
  }

  return notification;
}

function mapNotificationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    title: row.title,
    body: row.body,
    linkUrl: row.link_url,
    metadata: row.metadata_json || {},
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function listNotificationsByUser(userId) {
  const result = await query(
    `SELECT *
     FROM notifications
     WHERE user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 100`,
    [Number(userId)]
  );

  return result.rows.map(mapNotificationRow);
}

async function markNotificationRead(notificationId, userId) {
  const result = await query(
    `UPDATE notifications
     SET is_read = TRUE, updated_at = NOW()
     WHERE id = $1 AND user_id = $2
     RETURNING *`,
    [Number(notificationId), Number(userId)]
  );
  return mapNotificationRow(result.rows[0]);
}

async function markAllNotificationsRead(userId) {
  await query(
    `UPDATE notifications
     SET is_read = TRUE, updated_at = NOW()
     WHERE user_id = $1 AND is_read = FALSE`,
    [Number(userId)]
  );
}

async function ensurePlatformSupport() {
  await query(`
    CREATE TABLE IF NOT EXISTS system_logs (
      id SERIAL PRIMARY KEY,
      actor_user_id INT REFERENCES users(id) ON DELETE SET NULL,
      log_level VARCHAR(20) NOT NULL,
      category VARCHAR(50) NOT NULL,
      message TEXT NOT NULL,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS site_content (
      id SERIAL PRIMARY KEY,
      content_key VARCHAR(100) UNIQUE NOT NULL,
      title VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS support_conversations (
      id SERIAL PRIMARY KEY,
      requester_user_id INT REFERENCES users(id) ON DELETE CASCADE,
      category VARCHAR(50) NOT NULL DEFAULT 'general',
      status VARCHAR(20) NOT NULL DEFAULT 'open',
      assigned_admin_id INT REFERENCES users(id) ON DELETE SET NULL,
      first_response_at TIMESTAMP NULL,
      last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      closed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS support_messages (
      id SERIAL PRIMARY KEY,
      conversation_id INT NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
      sender_user_id INT REFERENCES users(id) ON DELETE SET NULL,
      sender_role VARCHAR(20) NOT NULL DEFAULT 'user',
      message_body TEXT NOT NULL,
      is_internal BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL DEFAULT 'general',
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      link_url TEXT NULL,
      metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      user_agent TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_success_at TIMESTAMP NULL,
      last_error_at TIMESTAMP NULL
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS push_delivery_logs (
      id SERIAL PRIMARY KEY,
      notification_id INT REFERENCES notifications(id) ON DELETE SET NULL,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subscription_id INT REFERENCES push_subscriptions(id) ON DELETE SET NULL,
      event_type VARCHAR(50) NOT NULL DEFAULT 'general',
      status VARCHAR(20) NOT NULL,
      error_code VARCHAR(120) NULL,
      error_message TEXT NULL,
      latency_ms INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(log_level)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_site_content_key ON site_content(content_key)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_support_conversations_status ON support_conversations(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_support_conversations_requester ON support_conversations(requester_user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_support_messages_conversation ON support_messages(conversation_id, created_at ASC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read)`);
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_user_endpoint_unique ON push_subscriptions(user_id, endpoint)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated_at ON push_subscriptions(updated_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_created_at ON push_delivery_logs(created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_user_created ON push_delivery_logs(user_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_status_created ON push_delivery_logs(status, created_at DESC)`);

  for (const item of DEFAULT_CONTENT) {
    await query(
      `INSERT INTO site_content (content_key, title, content, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (content_key) DO NOTHING`,
      [item.key, item.title, item.content]
    );
  }

  if (!fs.existsSync(BACKUP_SCRIPT_PATH)) {
    fs.writeFileSync(
      BACKUP_SCRIPT_PATH,
      [
        '$ErrorActionPreference = "Stop"',
        '$ts = Get-Date -Format "yyyyMMdd-HHmmss"',
        '$backupDir = Join-Path $PSScriptRoot "..\\backups"',
        'New-Item -ItemType Directory -Force -Path $backupDir | Out-Null',
        'Write-Host "Prepare pg_dump execution here using DATABASE_URL environment variable."',
        'Write-Host ("Suggested target: " + (Join-Path $backupDir ("marketplace-" + $ts + ".sql")))',
        'Write-Host "Retention policy: keep last 7 daily backups."'
      ].join('\r\n'),
      'utf8'
    );
  }
}

async function getSiteContentByKey(key) {
  const result = await query(
    `SELECT * FROM site_content WHERE content_key = $1 LIMIT 1`,
    [String(key || '').trim()]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: row.id,
    key: row.content_key,
    title: row.title,
    content: row.content,
    updatedAt: row.updated_at
  };
}

async function listSiteContent() {
  const result = await query(
    `SELECT * FROM site_content ORDER BY content_key ASC`
  );
  return result.rows
    .filter((row) => !HOME_AD_CONTENT_KEYS.has(row.content_key))
    .map((row) => ({
      id: row.id,
      key: row.content_key,
      title: row.title,
      content: row.content,
      updatedAt: row.updated_at
    }));
}

async function listHomeAdsConfig() {
  const contentKeys = HOME_AD_SLOT_ORDER.flatMap((slot) => {
    const slotConfig = HOME_AD_SLOT_DEFINITIONS[slot];
    return HOME_AD_FIELDS.map((field) => `${slotConfig.keyPrefix}${field}`);
  });

  const result = await query(
    `SELECT content_key, content
     FROM site_content
     WHERE content_key = ANY($1::text[])`,
    [contentKeys]
  );

  const valuesByKey = Object.fromEntries(
    result.rows.map((row) => [row.content_key, row.content])
  );

  const slotMap = Object.fromEntries(
    HOME_AD_SLOT_ORDER.map((slot) => {
      const slotConfig = HOME_AD_SLOT_DEFINITIONS[slot];
      return [slot, mapHomeAdFromContent(slotConfig, valuesByKey)];
    })
  );

  return {
    top: [slotMap.top_1, slotMap.top_2],
    bottom: slotMap.bottom,
    slots: slotMap
  };
}

async function updateHomeAdSlot(slot, payload = {}) {
  const slotConfig = getHomeAdSlotConfig(slot);
  if (!slotConfig) return null;

  const safeTitle = sanitizeHomeAdText(payload.title, 240);
  const safeSubtitle = sanitizeHomeAdText(payload.subtitle, 800);
  const uploadedImage = sanitizeHomeAdText(payload.uploadedImage, 2048);
  const imageFromBody = sanitizeHomeAdText(payload.image, 2048);
  const imageFromUrl = sanitizeHomeAdText(payload.imageUrl, 2048);
  const safeImage = uploadedImage || imageFromBody || imageFromUrl || '';
  const safeLink = normalizeHomeAdLinkForStorage(payload.link);

  const updates = [
    ['title', safeTitle],
    ['subtitle', safeSubtitle],
    ['image', safeImage],
    ['link', safeLink]
  ];

  await Promise.all(
    updates.map(([field, value]) => {
      const key = `${slotConfig.keyPrefix}${field}`;
      const title = getHomeAdContentTitle(slotConfig, field);
      return upsertSiteContent(key, title, value);
    })
  );

  return listHomeAdsConfig();
}

async function upsertSiteContent(key, title, content) {
  const result = await query(
    `INSERT INTO site_content (content_key, title, content, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (content_key)
     DO UPDATE SET title = EXCLUDED.title, content = EXCLUDED.content, updated_at = NOW()
     RETURNING *`,
    [String(key || '').trim(), String(title || '').trim(), String(content || '').trim()]
  );
  return {
    id: result.rows[0].id,
    key: result.rows[0].content_key,
    title: result.rows[0].title,
    content: result.rows[0].content,
    updatedAt: result.rows[0].updated_at
  };
}

async function getOrCreateSupportConversation(userId, category = 'general') {
  const existing = await query(
    `SELECT *
     FROM support_conversations
     WHERE requester_user_id = $1 AND status IN ('open', 'pending')
     ORDER BY updated_at DESC, id DESC
     LIMIT 1`,
    [Number(userId)]
  );

  if (existing.rows[0]) return existing.rows[0];

  const created = await query(
    `INSERT INTO support_conversations (
       requester_user_id,
       category,
       status,
       last_message_at,
       created_at,
       updated_at
     )
     VALUES ($1, $2, 'open', NOW(), NOW(), NOW())
     RETURNING *`,
    [Number(userId), String(category || 'general').trim() || 'general']
  );

  return created.rows[0];
}

async function sendSupportMessage({ conversationId, senderUserId, senderRole, messageBody, category }) {
  const safeBody = String(messageBody || '').trim();
  if (!safeBody) return null;

  let conversation;
  if (conversationId) {
    const result = await query(
      `SELECT * FROM support_conversations WHERE id = $1 LIMIT 1`,
      [Number(conversationId)]
    );
    conversation = result.rows[0];
  } else {
    conversation = await getOrCreateSupportConversation(senderUserId, category);
  }

  if (!conversation) return null;

  const insert = await query(
    `INSERT INTO support_messages (conversation_id, sender_user_id, sender_role, message_body, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING *`,
    [conversation.id, senderUserId || null, String(senderRole || 'user').trim() || 'user', safeBody]
  );

  const shouldMarkPending = senderRole === 'admin' ? 'open' : 'pending';
  const firstResponseSet = senderRole === 'admin'
    ? `first_response_at = COALESCE(first_response_at, NOW()),`
    : '';

  await query(
    `UPDATE support_conversations
     SET status = $1,
         ${firstResponseSet}
         last_message_at = NOW(),
         updated_at = NOW()
     WHERE id = $2`,
    [shouldMarkPending, conversation.id]
  );

  return insert.rows[0];
}

async function listSupportConversations({ status = 'all' } = {}) {
  const params = [];
  let where = '';
  if (status && status !== 'all') {
    params.push(status);
    where = `WHERE sc.status = $1`;
  }

  const result = await query(
    `SELECT
       sc.*,
       u.full_name AS requester_name,
       u.phone AS requester_phone,
       admin_user.full_name AS assigned_admin_name,
       COUNT(sm.id)::int AS messages_count,
       MAX(sm.created_at) AS last_message_created_at,
       (
         SELECT sm2.message_body
         FROM support_messages sm2
         WHERE sm2.conversation_id = sc.id
         ORDER BY sm2.created_at DESC, sm2.id DESC
         LIMIT 1
       ) AS last_message_preview
     FROM support_conversations sc
     LEFT JOIN users u ON u.id = sc.requester_user_id
     LEFT JOIN users admin_user ON admin_user.id = sc.assigned_admin_id
     LEFT JOIN support_messages sm ON sm.conversation_id = sc.id
     ${where}
     GROUP BY sc.id, u.full_name, u.phone, admin_user.full_name
     ORDER BY COALESCE(sc.last_message_at, sc.created_at) DESC, sc.id DESC`,
    params
  );

  return result.rows.map((row) => ({
    id: row.id,
    requesterUserId: row.requester_user_id,
    requesterName: row.requester_name,
    requesterPhone: row.requester_phone,
    category: row.category,
    status: row.status,
    assignedAdminId: row.assigned_admin_id,
    assignedAdminName: row.assigned_admin_name,
    messagesCount: Number(row.messages_count || 0),
    lastMessagePreview: row.last_message_preview,
    lastMessageAt: row.last_message_at,
    firstResponseAt: row.first_response_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

async function getSupportConversationDetails(conversationId) {
  const conversationResult = await query(
    `SELECT
       sc.*,
       u.full_name AS requester_name,
       u.phone AS requester_phone,
       u.email AS requester_email,
       admin_user.full_name AS assigned_admin_name
     FROM support_conversations sc
     LEFT JOIN users u ON u.id = sc.requester_user_id
     LEFT JOIN users admin_user ON admin_user.id = sc.assigned_admin_id
     WHERE sc.id = $1
     LIMIT 1`,
    [Number(conversationId)]
  );

  const conversation = conversationResult.rows[0];
  if (!conversation) return null;

  const messagesResult = await query(
    `SELECT
       sm.*,
       u.full_name AS sender_name
     FROM support_messages sm
     LEFT JOIN users u ON u.id = sm.sender_user_id
     WHERE sm.conversation_id = $1
     ORDER BY sm.created_at ASC, sm.id ASC`,
    [Number(conversationId)]
  );

  return {
    id: conversation.id,
    requesterUserId: conversation.requester_user_id,
    requesterName: conversation.requester_name,
    requesterPhone: conversation.requester_phone,
    requesterEmail: conversation.requester_email,
    category: conversation.category,
    status: conversation.status,
    assignedAdminId: conversation.assigned_admin_id,
    assignedAdminName: conversation.assigned_admin_name,
    firstResponseAt: conversation.first_response_at,
    lastMessageAt: conversation.last_message_at,
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
    messages: messagesResult.rows.map((row) => ({
      id: row.id,
      senderUserId: row.sender_user_id,
      senderRole: row.sender_role,
      senderName: row.sender_name || (row.sender_role === 'admin' ? 'الدعم الفني' : 'المستخدم'),
      body: row.message_body,
      createdAt: row.created_at
    }))
  };
}

async function updateSupportConversation(conversationId, payload = {}) {
  const current = await query(
    `SELECT * FROM support_conversations WHERE id = $1 LIMIT 1`,
    [Number(conversationId)]
  );
  if (!current.rows[0]) return null;

  const nextStatus = payload.status || current.rows[0].status;
  const assignedAdminId = payload.assignedAdminId === undefined
    ? current.rows[0].assigned_admin_id
    : payload.assignedAdminId;

  const result = await query(
    `UPDATE support_conversations
     SET status = $1,
         assigned_admin_id = $2,
         closed_at = CASE WHEN $1 = 'closed' THEN COALESCE(closed_at, NOW()) ELSE NULL END,
         updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [nextStatus, assignedAdminId || null, Number(conversationId)]
  );

  return result.rows[0];
}

function getUploadPolicy() {
  return {
    maxFileSizeMb: 4,
    maxFilesPerRequest: 5,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    uploadsDirectory: UPLOADS_DIR,
    imageCompression: 'deferred',
    cleanupPolicy: 'manual review for orphaned uploads',
    backupFrequency: 'daily',
    retentionDays: 7,
    backupScriptPath: BACKUP_SCRIPT_PATH
  };
}

async function collectSystemStatus() {
  const startedAt = global.__appStartedAt || new Date();
  const dbResult = await query('SELECT NOW() AS now');
  const [logsResult, supportResult, reportsResult, notificationsResult, pushMetrics] = await Promise.all([
    query(`SELECT * FROM system_logs WHERE log_level = 'error' ORDER BY created_at DESC LIMIT 10`),
    query(`SELECT COUNT(*)::int AS total FROM support_conversations WHERE status IN ('open', 'pending')`),
    query(`SELECT COUNT(*)::int AS total FROM reports WHERE status = 'open'`),
    query(`SELECT COUNT(*)::int AS total FROM notifications WHERE is_read = FALSE`),
    getPushDeliveryMetrics(PUSH_METRICS_WINDOW_HOURS)
  ]);

  return {
    server: {
      status: 'online',
      uptimeSeconds: Math.round(process.uptime()),
      startedAt
    },
    database: {
      status: 'online',
      databaseTime: dbResult.rows[0].now
    },
    uploads: getUploadPolicy(),
    support: {
      openMessages: Number(supportResult.rows[0]?.total || 0)
    },
    reports: {
      openReports: Number(reportsResult.rows[0]?.total || 0)
    },
    notifications: {
      unreadNotifications: Number(notificationsResult.rows[0]?.total || 0),
      push: pushMetrics
    },
    lastErrors: logsResult.rows.map((row) => ({
      id: row.id,
      level: row.log_level,
      category: row.category,
      message: row.message,
      metadata: row.metadata_json || {},
      createdAt: row.created_at
    }))
  };
}

module.exports = {
  ensurePlatformSupport,
  logSystemEvent,
  createNotification,
  getPushPublicKey,
  upsertPushSubscription,
  removePushSubscription,
  sendPushToUser,
  getPushDeliveryMetrics,
  listNotificationsByUser,
  markNotificationRead,
  markAllNotificationsRead,
  getSiteContentByKey,
  listSiteContent,
  listHomeAdsConfig,
  updateHomeAdSlot,
  upsertSiteContent,
  getOrCreateSupportConversation,
  sendSupportMessage,
  listSupportConversations,
  getSupportConversationDetails,
  updateSupportConversation,
  collectSystemStatus,
  getUploadPolicy
};
