const fs = require('fs');
const path = require('path');
const { query } = require('../db/pool');
const { ROOT_DIR, UPLOADS_DIR } = require('../config/env');

const LOGS_DIR = path.join(ROOT_DIR, 'logs');
const APP_LOG_FILE = path.join(LOGS_DIR, 'application.log');
const BACKUP_SCRIPT_PATH = path.join(ROOT_DIR, 'scripts', 'db-backup.ps1');
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
  }
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

async function createNotification(userId, type, title, body, linkUrl = null, metadata = {}) {
  if (!Number.isInteger(Number(userId))) return null;

  const result = await query(
    `INSERT INTO notifications (user_id, type, title, body, link_url, metadata_json, is_read, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, FALSE, NOW(), NOW())
     RETURNING *`,
    [
      Number(userId),
      String(type || 'general').trim() || 'general',
      String(title || 'إشعار جديد').trim() || 'إشعار جديد',
      String(body || '').trim() || 'تم إنشاء إشعار جديد.',
      linkUrl?.trim() || null,
      JSON.stringify(metadata || {})
    ]
  );

  return mapNotificationRow(result.rows[0]);
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

  await query(`CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(log_level)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_site_content_key ON site_content(content_key)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_support_conversations_status ON support_conversations(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_support_conversations_requester ON support_conversations(requester_user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_support_messages_conversation ON support_messages(conversation_id, created_at ASC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_id, created_at DESC)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read)`);

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
  return result.rows.map((row) => ({
    id: row.id,
    key: row.content_key,
    title: row.title,
    content: row.content,
    updatedAt: row.updated_at
  }));
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
  const [logsResult, supportResult, reportsResult, notificationsResult] = await Promise.all([
    query(`SELECT * FROM system_logs WHERE log_level = 'error' ORDER BY created_at DESC LIMIT 10`),
    query(`SELECT COUNT(*)::int AS total FROM support_conversations WHERE status IN ('open', 'pending')`),
    query(`SELECT COUNT(*)::int AS total FROM reports WHERE status = 'open'`),
    query(`SELECT COUNT(*)::int AS total FROM notifications WHERE is_read = FALSE`)
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
      unreadNotifications: Number(notificationsResult.rows[0]?.total || 0)
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
  listNotificationsByUser,
  markNotificationRead,
  markAllNotificationsRead,
  getSiteContentByKey,
  listSiteContent,
  upsertSiteContent,
  getOrCreateSupportConversation,
  sendSupportMessage,
  listSupportConversations,
  getSupportConversationDetails,
  updateSupportConversation,
  collectSystemStatus,
  getUploadPolicy
};
