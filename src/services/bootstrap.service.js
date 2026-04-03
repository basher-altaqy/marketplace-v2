const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('../db/pool');
const { ROOT_DIR } = require('../config/env');

const DATABASE_SQL_PATH = path.join(ROOT_DIR, 'database.sql');
const SCHEMA_VERSION = '2026-04-03-unified-v2';
const SCHEMA_VERSION_KEY = 'schema_version';
const DEFAULT_SITE_CONTENT = [
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
const MANAGED_TABLES_IN_RESET_ORDER = [
  'verification_codes',
  'system_logs',
  'audit_logs',
  'support_messages',
  'support_conversations',
  'reports',
  'notifications',
  'order_items',
  'orders',
  'cart_items',
  'carts',
  'user_favorites',
  'conversation_deals',
  'ratings',
  'messages',
  'conversations',
  'product_images',
  'products',
  'seller_profiles',
  'site_content',
  'users',
  'schema_metadata'
];
const MANAGED_OBJECT_NAMES = [...MANAGED_TABLES_IN_RESET_ORDER, 'seller_public_view'];
const REQUIRED_OBJECT_NAMES = [
  'schema_metadata',
  'users',
  'products',
  'orders',
  'site_content',
  'verification_codes',
  'seller_public_view'
];

function normalizePhone(phone) {
  return String(phone || '').replace(/\s+/g, '').trim();
}

function resolveAdminSeedConfig() {
  const phone = normalizePhone(process.env.ADMIN_PHONE || '');
  const email = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase() || null;
  const plainPassword = String(process.env.ADMIN_PASSWORD || '').trim();
  const passwordHash = String(process.env.ADMIN_PASSWORD_HASH || '').trim();

  if (!phone) {
    throw new Error('ADMIN_PHONE is required for db bootstrap.');
  }

  const finalPasswordHash = passwordHash || (() => {
    if (!plainPassword) {
      throw new Error('ADMIN_PASSWORD_HASH or ADMIN_PASSWORD is required for db bootstrap.');
    }
    if (plainPassword.length < 8) {
      throw new Error('ADMIN_PASSWORD must be at least 8 characters.');
    }
    return bcrypt.hashSync(plainPassword, 10);
  })();

  return {
    fullName: String(process.env.ADMIN_FULL_NAME || '').trim() || 'Marketplace Admin',
    storeName: String(process.env.ADMIN_STORE_NAME || '').trim() || 'Marketplace Management',
    phone,
    phoneNumber: phone,
    email,
    passwordHash: finalPasswordHash,
    role: 'admin',
    region: String(process.env.ADMIN_REGION || '').trim() || 'Default',
    address: String(process.env.ADMIN_ADDRESS || '').trim() || null,
    profileDescription: String(process.env.ADMIN_PROFILE_DESCRIPTION || '').trim() || 'Platform administration account',
    whatsapp: normalizePhone(process.env.ADMIN_WHATSAPP || '') || phone,
    verificationStatus: 'unverified'
  };
}

async function applyDatabaseSchema(client) {
  const schemaSql = fs.readFileSync(DATABASE_SQL_PATH, 'utf8');
  if (!schemaSql.trim()) {
    throw new Error('database.sql is empty.');
  }

  await client.query(schemaSql);
}

async function seedDefaultSiteContent(client) {
  for (const item of DEFAULT_SITE_CONTENT) {
    await client.query(
      `INSERT INTO site_content (content_key, title, content, created_at, updated_at)
       VALUES ($1, $2, $3, NOW(), NOW())
       ON CONFLICT (content_key)
       DO UPDATE SET
         title = EXCLUDED.title,
         content = EXCLUDED.content,
         updated_at = NOW()`,
      [item.key, item.title, item.content]
    );
  }
}

async function seedDefaultAdmin(client) {
  const admin = resolveAdminSeedConfig();
  const existing = await client.query(
    `SELECT id
     FROM users
     WHERE phone = $1
        OR phone_number = $1
        OR ($2::text IS NOT NULL AND LOWER(email) = LOWER($2))
     ORDER BY id ASC
     LIMIT 1`,
    [admin.phone, admin.email]
  );

  if (existing.rows[0]) {
    await client.query(
      `UPDATE users
       SET full_name = $2,
           store_name = $3,
           phone = $4,
           phone_number = $5,
           email = $6,
           password_hash = $7,
           role = 'admin',
           region = $8,
           address = $9,
           profile_description = $10,
           whatsapp = $11,
           is_active = TRUE,
           verification_status = $12
       WHERE id = $1`,
      [
        existing.rows[0].id,
        admin.fullName,
        admin.storeName,
        admin.phone,
        admin.phoneNumber,
        admin.email,
        admin.passwordHash,
        admin.region,
        admin.address,
        admin.profileDescription,
        admin.whatsapp,
        admin.verificationStatus
      ]
    );
    return existing.rows[0].id;
  }

  const inserted = await client.query(
    `INSERT INTO users (
       full_name,
       store_name,
       phone,
       phone_number,
       email,
       password_hash,
       role,
       region,
       address,
       profile_description,
       whatsapp,
       is_active,
       verification_status
     )
     VALUES ($1, $2, $3, $4, $5, $6, 'admin', $7, $8, $9, $10, TRUE, $11)
     RETURNING id`,
    [
      admin.fullName,
      admin.storeName,
      admin.phone,
      admin.phoneNumber,
      admin.email,
      admin.passwordHash,
      admin.region,
      admin.address,
      admin.profileDescription,
      admin.whatsapp,
      admin.verificationStatus
    ]
  );

  return inserted.rows[0].id;
}

async function listExistingManagedObjects(client) {
  const result = await client.query(
    `SELECT c.relname
     FROM pg_class c
     INNER JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = ANY($1::text[])
       AND c.relkind IN ('r', 'p', 'v', 'm')
     ORDER BY c.relname ASC`,
    [MANAGED_OBJECT_NAMES]
  );

  return result.rows.map((row) => row.relname);
}

async function listMissingRequiredObjects(client) {
  const result = await client.query(
    `SELECT
       to_regclass('public.schema_metadata') AS schema_metadata,
       to_regclass('public.users') AS users,
       to_regclass('public.products') AS products,
       to_regclass('public.orders') AS orders,
       to_regclass('public.site_content') AS site_content,
       to_regclass('public.verification_codes') AS verification_codes,
       to_regclass('public.seller_public_view') AS seller_public_view`
  );

  const row = result.rows[0] || {};
  return REQUIRED_OBJECT_NAMES.filter((name) => !row[name]);
}

async function readSchemaVersion(client) {
  const result = await client.query(
    `SELECT metadata_value
     FROM schema_metadata
     WHERE metadata_key = $1
     LIMIT 1`,
    [SCHEMA_VERSION_KEY]
  );

  return result.rows[0]?.metadata_value || null;
}

async function getSchemaStatus(client) {
  const existingManagedObjects = await listExistingManagedObjects(client);
  const hasMetadataTable = existingManagedObjects.includes('schema_metadata');

  if (!hasMetadataTable) {
    return {
      kind: existingManagedObjects.length ? 'legacy' : 'empty',
      currentVersion: null,
      existingManagedObjects,
      missingRequiredObjects: [],
      reason: existingManagedObjects.length
        ? 'Managed database objects already exist without schema metadata.'
        : null
    };
  }

  let currentVersion = null;
  try {
    currentVersion = await readSchemaVersion(client);
  } catch (error) {
    return {
      kind: 'incompatible',
      currentVersion: null,
      existingManagedObjects,
      missingRequiredObjects: [],
      reason: `schema_metadata could not be read: ${error.message}`
    };
  }

  if (!currentVersion) {
    return {
      kind: 'incompatible',
      currentVersion: null,
      existingManagedObjects,
      missingRequiredObjects: [],
      reason: 'schema_metadata exists but the schema_version marker is missing.'
    };
  }

  if (currentVersion !== SCHEMA_VERSION) {
    return {
      kind: 'incompatible',
      currentVersion,
      existingManagedObjects,
      missingRequiredObjects: [],
      reason: `schema_version is ${currentVersion}, expected ${SCHEMA_VERSION}.`
    };
  }

  const missingRequiredObjects = await listMissingRequiredObjects(client);
  if (missingRequiredObjects.length) {
    return {
      kind: 'damaged',
      currentVersion,
      existingManagedObjects,
      missingRequiredObjects,
      reason: `Required schema objects are missing: ${missingRequiredObjects.join(', ')}.`
    };
  }

  return {
    kind: 'matching',
    currentVersion,
    existingManagedObjects,
    missingRequiredObjects: [],
    reason: null
  };
}

function formatSchemaIssueDetails(status) {
  const details = [];

  if (status.reason) {
    details.push(status.reason);
  }

  if (status.currentVersion) {
    details.push(`Detected schema version: ${status.currentVersion}.`);
  }

  if (status.existingManagedObjects?.length) {
    details.push(`Existing managed objects: ${status.existingManagedObjects.join(', ')}.`);
  }

  return details.join(' ');
}

function createLegacySchemaError(status, actionCommand = 'npm run db:reset') {
  return new Error(
    `Legacy or incompatible schema detected. Run "${actionCommand}" before continuing. ${formatSchemaIssueDetails(status)}`.trim()
  );
}

function createSchemaBootstrapError(status) {
  return new Error(
    `Database bootstrap did not produce the expected schema. ${formatSchemaIssueDetails(status)}`.trim()
  );
}

async function ensureSchemaReadyForBootstrap(client) {
  const status = await getSchemaStatus(client);

  if (status.kind === 'empty') {
    await applyDatabaseSchema(client);
    const refreshedStatus = await getSchemaStatus(client);
    if (refreshedStatus.kind !== 'matching') {
      throw createSchemaBootstrapError(refreshedStatus);
    }
    return refreshedStatus;
  }

  if (status.kind !== 'matching') {
    throw createLegacySchemaError(status);
  }

  return status;
}

async function dropManagedSchema(client) {
  const statements = [
    'DROP VIEW IF EXISTS seller_public_view;',
    ...MANAGED_TABLES_IN_RESET_ORDER.map((tableName) => `DROP TABLE IF EXISTS ${tableName} CASCADE;`),
    'DROP FUNCTION IF EXISTS hydrate_user_fields();',
    'DROP FUNCTION IF EXISTS touch_updated_at();'
  ];

  await client.query(statements.join('\n'));
}

async function runDatabaseBootstrap({ schemaOnly = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureSchemaReadyForBootstrap(client);

    if (!schemaOnly) {
      await seedDefaultSiteContent(client);
      await seedDefaultAdmin(client);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function runDatabaseReset({ schemaOnly = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await dropManagedSchema(client);
    await applyDatabaseSchema(client);

    const status = await getSchemaStatus(client);
    if (status.kind !== 'matching') {
      throw createSchemaBootstrapError(status);
    }

    if (!schemaOnly) {
      await seedDefaultSiteContent(client);
      await seedDefaultAdmin(client);
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function assertDatabaseReady() {
  const status = await getSchemaStatus(pool);

  if (status.kind === 'empty') {
    throw new Error('Database schema is missing. Run "npm run db:bootstrap" before starting the app.');
  }

  if (status.kind !== 'matching') {
    throw createLegacySchemaError(status);
  }
}

module.exports = {
  DATABASE_SQL_PATH,
  DEFAULT_SITE_CONTENT,
  SCHEMA_VERSION,
  runDatabaseBootstrap,
  runDatabaseReset,
  assertDatabaseReady
};
