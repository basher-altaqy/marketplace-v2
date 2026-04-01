const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('../db/pool');
const { JWT_SECRET } = require('../config/env');
const { logSystemEvent } = require('./platform.service');

function normalizePhone(phone) {
  return String(phone || '').replace(/\s+/g, '').trim();
}

function whatsappLink(phone) {
  const normalized = normalizePhone(phone).replace(/[^0-9+]/g, '');
  if (normalized.startsWith('963')) return normalized;
  if (normalized.startsWith('0')) return `963${normalized.slice(1)}`;
  return normalized;
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, phone: user.phone },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function publicUser(user) {
  if (!user) return null;
  const verificationStatus = user.is_email_verified || user.is_phone_verified ? 'verified' : 'unverified';
  return {
    id: user.id,
    fullName: user.full_name,
    storeName: user.store_name || user.full_name,
    phone: user.phone,
    phoneNumber: user.phone_number || user.phone,
    email: user.email,
    role: user.role,
    region: user.region,
    address: user.address,
    avatarUrl: user.avatar_url,
    profileDescription: user.profile_description,
    whatsapp: user.whatsapp || user.phone,
    whatsappLink: whatsappLink(user.whatsapp || user.phone),
    isActive: Boolean(user.is_active),
    isEmailVerified: Boolean(user.is_email_verified),
    isPhoneVerified: Boolean(user.is_phone_verified),
    verificationStatus,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastLoginAt: user.last_login_at
  };
}

const PRODUCT_STATUSES = ['draft', 'published', 'hidden', 'sold', 'archived', 'deleted'];

async function ensureAdminSupport() {
  await query(`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS conversation_type VARCHAR(20) NOT NULL DEFAULT 'inquiry'`);
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'conversations_conversation_type_check'
          AND conrelid = 'conversations'::regclass
      ) THEN
        ALTER TABLE conversations DROP CONSTRAINT conversations_conversation_type_check;
      END IF;
    END $$;
  `);
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'conversations_conversation_type_check'
          AND conrelid = 'conversations'::regclass
      ) THEN
        ALTER TABLE conversations
          ADD CONSTRAINT conversations_conversation_type_check
          CHECK (conversation_type IN ('inquiry', 'order'));
      END IF;
    END $$;
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations(conversation_type)`);
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS has_delivery_service BOOLEAN NOT NULL DEFAULT FALSE`);
  await query(`
    CREATE TABLE IF NOT EXISTS carts (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id SERIAL PRIMARY KEY,
      cart_id INT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
      product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      seller_id INT NOT NULL REFERENCES users(id),
      quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
      snapshot_price DECIMAL(10,2) NOT NULL CHECK (snapshot_price >= 0),
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS conversation_deals (
      id SERIAL PRIMARY KEY,
      conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      buyer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seller_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
      agreed_price DECIMAL(10,2) NOT NULL CHECK (agreed_price >= 0),
      note TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT conversation_deals_status_check CHECK (status IN ('pending', 'agreed', 'cancelled'))
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      buyer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      seller_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source_type VARCHAR(20) NOT NULL,
      source_ref_id INT NOT NULL,
      total_amount DECIMAL(10,2) NOT NULL CHECK (total_amount >= 0),
      status VARCHAR(20) NOT NULL DEFAULT 'submitted',
      payment_method VARCHAR(50),
      notes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT orders_source_type_check CHECK (source_type IN ('cart', 'conversation', 'product')),
      CONSTRAINT orders_status_check CHECK (status IN ('submitted', 'seller_confirmed', 'buyer_confirmed', 'in_preparation', 'in_transport', 'completed', 'cancelled'))
    )
  `);
  await query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id SERIAL PRIMARY KEY,
      order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      quantity INT NOT NULL CHECK (quantity > 0),
      price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await query(`CREATE INDEX IF NOT EXISTS idx_carts_user_id ON carts(user_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_carts_user_status ON carts(user_id, status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items(product_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_cart_items_seller_id ON cart_items(seller_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_conversation_deals_conversation_id ON conversation_deals(conversation_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_conversation_deals_product_id ON conversation_deals(product_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_conversation_deals_buyer_id ON conversation_deals(buyer_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_conversation_deals_seller_id ON conversation_deals(seller_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_conversation_deals_status ON conversation_deals(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders(buyer_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON orders(seller_id)`);
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS conversation_id INT REFERENCES conversations(id) ON DELETE SET NULL`);
  await query(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_orders_source ON orders(source_type, source_ref_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_orders_conversation_id ON orders(conversation_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id)`);
  await query(`CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id)`);
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'orders_source_type_check'
          AND conrelid = 'orders'::regclass
      ) THEN
        ALTER TABLE orders DROP CONSTRAINT orders_source_type_check;
      END IF;
    END $$;
  `);
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'orders_source_type_check'
          AND conrelid = 'orders'::regclass
      ) THEN
        ALTER TABLE orders
          ADD CONSTRAINT orders_source_type_check
          CHECK (source_type IN ('cart', 'conversation', 'product'));
      END IF;
    END $$;
  `);
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'orders_status_check'
          AND conrelid = 'orders'::regclass
      ) THEN
        ALTER TABLE orders DROP CONSTRAINT orders_status_check;
      END IF;
    END $$;
  `);
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'orders_status_check'
          AND conrelid = 'orders'::regclass
      ) THEN
        ALTER TABLE orders
          ADD CONSTRAINT orders_status_check
          CHECK (status IN ('submitted', 'seller_confirmed', 'buyer_confirmed', 'in_preparation', 'in_transport', 'completed', 'cancelled'));
      END IF;
    END $$;
  `);
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS admin_notes TEXT`);
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS details TEXT`);
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS conversation_id INT REFERENCES conversations(id)`);
  await query(`ALTER TABLE reports ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'open'`);
  await query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'products_status_check'
          AND conrelid = 'products'::regclass
      ) THEN
        ALTER TABLE products DROP CONSTRAINT products_status_check;
      END IF;
    END $$;
  `);
  await query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'products_status_check'
          AND conrelid = 'products'::regclass
      ) THEN
        ALTER TABLE products
          ADD CONSTRAINT products_status_check
          CHECK (status IN ('draft', 'published', 'hidden', 'sold', 'archived', 'deleted'));
      END IF;
    END $$;
  `);
}

async function logAudit(actorUserId, actionType, targetType, targetId, metadata = {}) {
  try {
    await query(
      `INSERT INTO audit_logs (actor_user_id, action_type, target_type, target_id, metadata_json)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [actorUserId || null, actionType, targetType, targetId || null, JSON.stringify(metadata || {})]
    );
    await logSystemEvent('info', 'admin_action', actionType, {
      targetType,
      targetId,
      ...metadata
    }, actorUserId || null);
  } catch (error) {
    console.error('Failed to write audit log:', error);
  }
}


async function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const result = await query(
      `SELECT * FROM users WHERE id = $1 AND is_active = TRUE LIMIT 1`,
      [payload.id]
    );

    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: 'User not found or inactive.' });
    }

    req.user = user;
    next();
  } catch (_error) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function roleRequired(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden.' });
    }
    next();
  };
}

async function mapProductRow(row) {
  if (!row) return null;

  const imagesResult = await query(
    `SELECT image_url FROM product_images WHERE product_id = $1 ORDER BY sort_order ASC, id ASC`,
    [row.id]
  );
  const images = imagesResult.rows.map(item => item.image_url);

  return {
    id: row.id,
    sellerId: row.seller_id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    currency: row.currency,
    category: row.category,
    subcategory: row.subcategory,
    tags: Array.isArray(row.tags_json) ? row.tags_json : [],
    region: row.region,
    condition: row.item_condition,
    quantity: row.quantity,
    hasDeliveryService: Boolean(row.has_delivery_service),
    customFields: row.custom_fields_json || {},
    status: row.status,
    viewsCount: row.views_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    image: images[0] || null,
    images,
    seller: {
      id: row.seller_id,
      fullName: row.seller_full_name,
      storeName: row.seller_store_name || row.seller_full_name,
      phone: row.seller_phone,
      whatsapp: row.seller_whatsapp || row.seller_phone,
      whatsappLink: whatsappLink(row.seller_whatsapp || row.seller_phone),
      region: row.seller_region,
      avatarUrl: row.seller_avatar_url,
      profileDescription: row.seller_profile_description,
      averageRating: row.seller_average_rating ? Number(row.seller_average_rating) : 0,
      ratingsCount: row.seller_ratings_count ? Number(row.seller_ratings_count) : 0,
      totalProducts: row.seller_total_products ? Number(row.seller_total_products) : 0
    }
  };
}

async function getProductById(productId) {
  const result = await query(
    `SELECT
       p.*,
       u.full_name AS seller_full_name,
       u.store_name AS seller_store_name,
       u.phone AS seller_phone,
       u.whatsapp AS seller_whatsapp,
       u.region AS seller_region,
       u.avatar_url AS seller_avatar_url,
       u.profile_description AS seller_profile_description,
       sp.average_rating AS seller_average_rating,
       sp.ratings_count AS seller_ratings_count,
       sp.total_products AS seller_total_products
     FROM products p
     JOIN users u ON u.id = p.seller_id
     LEFT JOIN seller_profiles sp ON sp.user_id = u.id
     WHERE p.id = $1
     LIMIT 1`,
    [productId]
  );
  return mapProductRow(result.rows[0]);
}

async function refreshSellerStats(sellerId) {
  const result = await query(
    `SELECT
       COUNT(DISTINCT p.id) FILTER (WHERE p.status = 'published') AS published_products,
       COALESCE(AVG(r.score), 0) AS average_rating,
       COUNT(DISTINCT r.id) AS ratings_count
     FROM users u
     LEFT JOIN products p ON p.seller_id = u.id
     LEFT JOIN ratings r ON r.seller_id = u.id
     WHERE u.id = $1
     GROUP BY u.id`,
    [sellerId]
  );

  const row = result.rows[0] || {
    published_products: 0,
    average_rating: 0,
    ratings_count: 0
  };

  await query(
    `INSERT INTO seller_profiles (user_id, average_rating, ratings_count, total_products)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id)
     DO UPDATE SET
       average_rating = EXCLUDED.average_rating,
       ratings_count = EXCLUDED.ratings_count,
       total_products = EXCLUDED.total_products,
       updated_at = NOW()`,
    [
      sellerId,
      Number(row.average_rating || 0),
      Number(row.ratings_count || 0),
      Number(row.published_products || 0)
    ]
  );
}

async function seedDatabase() {
  const passwordHash = bcrypt.hashSync('12345678', 10);
  const adminExists = await query(`SELECT id FROM users WHERE role = 'admin' LIMIT 1`);
  if (!adminExists.rows[0]) {
    await query(
      `INSERT INTO users (
        full_name, store_name, phone, email, password_hash, role, region, profile_description, whatsapp
      )
      VALUES ($1,$2,$3,$4,$5,'admin',$6,$7,$8)`,
      [
        'المشرف العام',
        'إدارة السوق',
        '0900000000',
        'admin@example.com',
        passwordHash,
        'دمشق',
        'إدارة المنصة',
        '0900000000'
      ]
    );
  }

  const usersCount = await query(`SELECT COUNT(*)::int AS count FROM users`);
  if (usersCount.rows[0].count > 0) return;

  const sellerResult = await query(
    `INSERT INTO users (
      full_name, store_name, phone, email, password_hash, role, region, profile_description, whatsapp
    )
    VALUES ($1,$2,$3,$4,$5,'seller',$6,$7,$8)
    RETURNING *`,
    [
      'رنا أحمد',
      'بيت الحلويات الشامية',
      '0999123456',
      'rana@example.com',
      passwordHash,
      'دمشق',
      'حلويات منزلية وتجهيز حسب الطلب.',
      '0999123456'
    ]
  );
  const seller = sellerResult.rows[0];

  await query(
    `INSERT INTO seller_profiles (user_id, display_name, bio)
     VALUES ($1, $2, $3)`,
    [seller.id, seller.store_name, seller.profile_description]
  );

  const buyerResult = await query(
    `INSERT INTO users (
      full_name, phone, email, password_hash, role, region, profile_description, whatsapp
    )
    VALUES ($1,$2,$3,$4,'buyer',$5,$6,$7)
    RETURNING *`,
    [
      'مشتري تجريبي',
      '0999000001',
      'buyer@example.com',
      passwordHash,
      'دمشق',
      'حساب مشتري تجريبي',
      '0999000001'
    ]
  );
  const buyer = buyerResult.rows[0];

  await query(
    `INSERT INTO users (
      full_name, store_name, phone, email, password_hash, role, region, profile_description, whatsapp
    )
    VALUES ($1,$2,$3,$4,$5,'admin',$6,$7,$8)`,
    [
      'المشرف العام',
      'إدارة السوق',
      '0900000000',
      'admin@example.com',
      passwordHash,
      'دمشق',
      'إدارة المنصة',
      '0900000000'
    ]
  );

  const p1 = await query(
    `INSERT INTO products (
      seller_id, name, description, price, currency, category, tags_json, region, item_condition, quantity, status, views_count
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,'published',$11)
    RETURNING id`,
    [
      seller.id,
      'معمول فاخر بالفستق',
      'معمول منزلي محشو بالفستق الحلبي، تجهيز يومي، مناسب للهدايا والضيافة.',
      18000,
      'ل.س',
      'حلويات',
      JSON.stringify(['منزلي', 'ضيافة', 'هدايا']),
      'دمشق',
      'جديد',
      10,
      540
    ]
  );

  await query(
    `INSERT INTO product_images (product_id, image_url, sort_order)
     VALUES ($1,$2,0),($1,$3,1)`,
    [
      p1.rows[0].id,
      'https://images.unsplash.com/photo-1519864600265-abb23847ef2c?auto=format&fit=crop&w=1200&q=80',
      'https://images.unsplash.com/photo-1541976076758-347942db1978?auto=format&fit=crop&w=1200&q=80'
    ]
  );

  const p2 = await query(
    `INSERT INTO products (
      seller_id, name, description, price, currency, category, tags_json, region, item_condition, quantity, status, views_count
    ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,'published',$11)
    RETURNING id`,
    [
      seller.id,
      'مربى تين منزلي',
      'مربى تين منزلي بمكونات طبيعية وتحضير نظيف.',
      22000,
      'ل.س',
      'مأكولات',
      JSON.stringify(['بيتي', 'طبيعي', 'فطور']),
      'اللاذقية',
      'جديد',
      6,
      210
    ]
  );

  await query(
    `INSERT INTO product_images (product_id, image_url, sort_order)
     VALUES ($1,$2,0)`,
    [
      p2.rows[0].id,
      'https://images.unsplash.com/photo-1514996937319-344454492b37?auto=format&fit=crop&w=1200&q=80'
    ]
  );

  // sample closed conversation + rating
  const conv = await query(
    `INSERT INTO conversations (product_id, seller_id, buyer_id, conversation_type, status, last_message_at)
     VALUES ($1,$2,$3,'inquiry','closed',NOW())
     RETURNING id`,
    [p1.rows[0].id, seller.id, buyer.id]
  );

  await query(
    `INSERT INTO messages (conversation_id, sender_id, message_body, is_read)
     VALUES ($1,$2,$3,TRUE),($1,$4,$5,TRUE)`,
    [
      conv.rows[0].id,
      buyer.id,
      'مرحبا، هل المنتج متوفر اليوم؟',
      seller.id,
      'نعم، متوفر ويمكن التواصل عبر واتساب.'
    ]
  );

  await query(
    `INSERT INTO ratings (conversation_id, product_id, seller_id, buyer_id, score, comment)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [conv.rows[0].id, p1.rows[0].id, seller.id, buyer.id, 5, 'تاجر متعاون وسريع بالرد']
  );

  await refreshSellerStats(seller.id);
}

async function ensureDefaultAdminAccess() {
  const passwordHash = bcrypt.hashSync('12345678', 10);
  const result = await query(
    `SELECT id
     FROM users
     WHERE role = 'admin'
        OR email = 'admin@example.com'
        OR phone = '0900000000'
     ORDER BY id ASC
     LIMIT 1`
  );

  if (result.rows[0]) {
    await query(
      `UPDATE users
       SET role = 'admin',
           full_name = COALESCE(NULLIF(full_name, ''), 'المشرف العام'),
           store_name = COALESCE(store_name, 'إدارة السوق'),
           email = COALESCE(email, 'admin@example.com'),
           phone = COALESCE(phone, '0900000000'),
           password_hash = $2,
           is_active = TRUE,
           updated_at = NOW()
       WHERE id = $1`,
      [result.rows[0].id, passwordHash]
    );
    return;
  }

  await query(
    `INSERT INTO users (
      full_name, store_name, phone, email, password_hash, role, region, profile_description, whatsapp, is_active
    )
    VALUES ($1,$2,$3,$4,$5,'admin',$6,$7,$8,TRUE)`,
    [
      'المشرف العام',
      'إدارة السوق',
      '0900000000',
      'admin@example.com',
      passwordHash,
      'دمشق',
      'إدارة المنصة',
      '0900000000'
    ]
  );
}

async function getConversationById(conversationId, viewerId) {
  const convoResult = await query(
    `SELECT
       c.*,
       c.conversation_type,
       p.name AS product_name,
       p.status AS product_status,
       p.price AS product_price,
       p.currency AS product_currency,
       p.has_delivery_service AS product_has_delivery_service,
       p.region AS product_region,
       s.full_name AS seller_full_name,
       s.store_name AS seller_store_name,
       s.avatar_url AS seller_avatar_url,
       b.full_name AS buyer_full_name,
       b.avatar_url AS buyer_avatar_url
     FROM conversations c
     JOIN products p ON p.id = c.product_id
     JOIN users s ON s.id = c.seller_id
     JOIN users b ON b.id = c.buyer_id
     WHERE c.id = $1
       AND ($2 = c.seller_id OR $2 = c.buyer_id OR EXISTS (SELECT 1 FROM users u WHERE u.id = $2 AND u.role = 'admin'))
     LIMIT 1`,
    [conversationId, viewerId]
  );
  const convo = convoResult.rows[0];
  if (!convo) return null;

  const messagesResult = await query(
    `SELECT
       m.id,
       m.conversation_id,
       m.sender_id,
       m.message_body,
       m.is_read,
       m.created_at,
       u.full_name AS sender_name,
       u.role AS sender_role
     FROM messages m
     JOIN users u ON u.id = m.sender_id
     WHERE m.conversation_id = $1
     ORDER BY m.created_at ASC, m.id ASC`,
    [conversationId]
  );

  const ratingResult = await query(
    `SELECT id, score, comment, created_at FROM ratings WHERE conversation_id = $1 LIMIT 1`,
    [conversationId]
  );

  const linkedOrders = await getConversationOrders(conversationId);

  return {
    id: convo.id,
    productId: convo.product_id,
    product: {
      id: convo.product_id,
      name: convo.product_name,
      status: convo.product_status,
      price: Number(convo.product_price),
      currency: convo.product_currency,
      region: convo.product_region
    },
    sellerId: convo.seller_id,
    buyerId: convo.buyer_id,
    conversationType: convo.conversation_type || 'inquiry',
    status: convo.status,
    lastMessageAt: convo.last_message_at,
    createdAt: convo.created_at,
    updatedAt: convo.updated_at,
    seller: {
      id: convo.seller_id,
      fullName: convo.seller_full_name,
      storeName: convo.seller_store_name || convo.seller_full_name,
      avatarUrl: convo.seller_avatar_url
    },
    buyer: {
      id: convo.buyer_id,
      fullName: convo.buyer_full_name,
      avatarUrl: convo.buyer_avatar_url
    },
    messages: messagesResult.rows.map(m => ({
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      senderName: m.sender_name,
      senderRole: m.sender_role,
      body: m.message_body,
      isRead: m.is_read,
      createdAt: m.created_at
    })),
    rating: ratingResult.rows[0] ? {
      id: ratingResult.rows[0].id,
      score: Number(ratingResult.rows[0].score),
      comment: ratingResult.rows[0].comment,
      createdAt: ratingResult.rows[0].created_at
    } : null,
    linkedOrders
  };
}

async function getOrCreateActiveCart(userId) {
  const existing = await query(
    `SELECT * FROM carts WHERE user_id = $1 AND status = 'active' ORDER BY id DESC LIMIT 1`,
    [userId]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const created = await query(
    `INSERT INTO carts (user_id, status, created_at, updated_at)
     VALUES ($1, 'active', NOW(), NOW())
     RETURNING *`,
    [userId]
  );

  return created.rows[0];
}

async function getCartSummaryByUserId(userId) {
  const cart = await getOrCreateActiveCart(userId);
  const itemsResult = await query(
    `SELECT
       ci.*,
       p.name AS product_name,
       p.status AS product_status,
       p.currency AS product_currency,
       p.region AS product_region,
       p.item_condition AS product_condition,
       u.full_name AS seller_full_name,
       u.store_name AS seller_store_name,
       (
         SELECT image_url
         FROM product_images
         WHERE product_id = p.id
         ORDER BY sort_order ASC, id ASC
         LIMIT 1
       ) AS product_image
     FROM cart_items ci
     JOIN products p ON p.id = ci.product_id
     JOIN users u ON u.id = ci.seller_id
     WHERE ci.cart_id = $1
     ORDER BY ci.id DESC`,
    [cart.id]
  );

  const items = itemsResult.rows.map((row) => ({
    id: row.id,
    cartItemId: row.id,
    cartId: row.cart_id,
    productId: row.product_id,
    sellerId: row.seller_id,
    quantity: Number(row.quantity || 0),
    snapshotPrice: Number(row.snapshot_price || 0),
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lineTotal: Number(row.snapshot_price || 0) * Number(row.quantity || 0),
    product: {
      id: row.product_id,
      name: row.product_name,
      status: row.product_status,
      currency: row.product_currency,
      region: row.product_region,
      condition: row.product_condition,
      hasDeliveryService: Boolean(row.product_has_delivery_service),
      image: row.product_image
    },
    seller: {
      id: row.seller_id,
      fullName: row.seller_full_name,
      storeName: row.seller_store_name || row.seller_full_name
    }
  }));

  return {
    id: cart.id,
    userId: cart.user_id,
    status: cart.status,
    createdAt: cart.created_at,
    updatedAt: cart.updated_at,
    items,
    totals: {
      itemsCount: items.length,
      quantity: items.reduce((sum, item) => sum + item.quantity, 0),
      amount: items.reduce((sum, item) => sum + item.lineTotal, 0)
    }
  };
}

function mapReportRow(row) {
  return {
    id: row.id,
    reason: row.reason,
    details: row.details,
    status: row.status,
    adminNotes: row.admin_notes,
    createdAt: row.created_at,
    conversationId: row.conversation_id,
    productId: row.product_id,
    productName: row.product_name,
    reportedUserId: row.reported_user_id,
    reportedUserName: row.reported_user_name,
    reporterUserId: row.reporter_user_id,
    reporterName: row.reporter_name
  };
}

function mapConversationDealRow(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    productId: row.product_id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    quantity: Number(row.quantity || 0),
    agreedPrice: Number(row.agreed_price || 0),
    note: row.note,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    product: {
      id: row.product_id,
      name: row.product_name,
      image: row.product_image,
      currency: row.product_currency
    },
    buyerName: row.buyer_name,
    sellerName: row.seller_name
  };
}

async function getConversationDeals(conversationId) {
  const result = await query(
    `SELECT
       d.*,
       p.name AS product_name,
       p.currency AS product_currency,
       buyer.full_name AS buyer_name,
       seller.full_name AS seller_name,
       (
         SELECT image_url
         FROM product_images
         WHERE product_id = p.id
         ORDER BY sort_order ASC, id ASC
         LIMIT 1
       ) AS product_image
     FROM conversation_deals d
     JOIN products p ON p.id = d.product_id
     JOIN users buyer ON buyer.id = d.buyer_id
     JOIN users seller ON seller.id = d.seller_id
     WHERE d.conversation_id = $1
     ORDER BY d.created_at DESC, d.id DESC`,
    [conversationId]
  );

  return result.rows.map(mapConversationDealRow);
}

async function getConversationOrders(conversationId) {
  const result = await query(
    `SELECT
       o.id,
       o.buyer_id,
       o.seller_id,
       o.status,
       o.source_type,
       o.total_amount,
       o.created_at,
       o.updated_at,
       COUNT(oi.id)::int AS items_count
     FROM orders o
     LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE o.conversation_id = $1
     GROUP BY o.id
     ORDER BY o.created_at DESC, o.id DESC`,
    [conversationId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    status: row.status,
    sourceType: row.source_type,
    totalAmount: Number(row.total_amount || 0),
    itemsCount: Number(row.items_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

async function getOrdersSummaryForUser(user) {
  const params = [user.id];
  const where = [`(o.buyer_id = $1 OR o.seller_id = $1)`];

  if (user.role === 'admin') {
    where.length = 0;
  }

  const result = await query(
    `SELECT
       o.*,
       buyer.full_name AS buyer_name,
       seller.full_name AS seller_name,
       COUNT(oi.id)::int AS items_count
     FROM orders o
     JOIN users buyer ON buyer.id = o.buyer_id
     JOIN users seller ON seller.id = o.seller_id
     LEFT JOIN order_items oi ON oi.order_id = o.id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY o.id, buyer.full_name, seller.full_name
     ORDER BY o.created_at DESC, o.id DESC`,
    params
  );

  return result.rows.map((row) => ({
    id: row.id,
    buyerId: row.buyer_id,
    buyerName: row.buyer_name,
    sellerId: row.seller_id,
    sellerName: row.seller_name,
    conversationId: row.conversation_id,
    sourceType: row.source_type,
    sourceRefId: row.source_ref_id,
    totalAmount: Number(row.total_amount || 0),
    status: row.status,
    paymentMethod: row.payment_method,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    itemsCount: Number(row.items_count || 0)
  }));
}

async function getOrderById(orderId, user) {
  const params = [orderId];
  const accessChecks = [];

  if (user.role !== 'admin') {
    params.push(user.id);
    accessChecks.push(`(o.buyer_id = $2 OR o.seller_id = $2)`);
  }

  const orderResult = await query(
    `SELECT
       o.*,
       buyer.full_name AS buyer_name,
       seller.full_name AS seller_name
     FROM orders o
     JOIN users buyer ON buyer.id = o.buyer_id
     JOIN users seller ON seller.id = o.seller_id
     WHERE o.id = $1
       ${accessChecks.length ? `AND ${accessChecks.join(' AND ')}` : ''}
     LIMIT 1`,
    params
  );

  const order = orderResult.rows[0];
  if (!order) return null;

  const itemsResult = await query(
    `SELECT
       oi.*,
       p.name AS product_name,
       p.currency AS product_currency,
       p.has_delivery_service AS product_has_delivery_service,
       (
         SELECT image_url
         FROM product_images
         WHERE product_id = p.id
         ORDER BY sort_order ASC, id ASC
         LIMIT 1
       ) AS product_image
     FROM order_items oi
     JOIN products p ON p.id = oi.product_id
     WHERE oi.order_id = $1
     ORDER BY oi.id ASC`,
    [orderId]
  );

  return {
    id: order.id,
    buyerId: order.buyer_id,
    buyerName: order.buyer_name,
    sellerId: order.seller_id,
    sellerName: order.seller_name,
    conversationId: order.conversation_id,
    sourceType: order.source_type,
    sourceRefId: order.source_ref_id,
    totalAmount: Number(order.total_amount || 0),
    status: order.status,
    paymentMethod: order.payment_method,
    notes: order.notes,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
    items: itemsResult.rows.map((row) => ({
      id: row.id,
      productId: row.product_id,
      quantity: Number(row.quantity || 0),
      price: Number(row.price || 0),
      createdAt: row.created_at,
      lineTotal: Number(row.quantity || 0) * Number(row.price || 0),
      product: {
        id: row.product_id,
        name: row.product_name,
        currency: row.product_currency,
        hasDeliveryService: Boolean(row.product_has_delivery_service),
        image: row.product_image
      }
    }))
  };
}

module.exports = {
  PRODUCT_STATUSES,
  normalizePhone,
  whatsappLink,
  signToken,
  publicUser,
  query,
  ensureAdminSupport,
  logAudit,
  authRequired,
  roleRequired,
  mapProductRow,
  mapReportRow,
  mapConversationDealRow,
  getProductById,
  getOrCreateActiveCart,
  getCartSummaryByUserId,
  getConversationDeals,
  getOrdersSummaryForUser,
  getOrderById,
  refreshSellerStats,
  ensureDefaultAdminAccess,
  seedDatabase,
  getConversationById
};
