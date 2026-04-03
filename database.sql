CREATE TABLE IF NOT EXISTS schema_metadata (
  metadata_key VARCHAR(100) PRIMARY KEY,
  metadata_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT schema_metadata_key_not_blank CHECK (btrim(metadata_key) <> ''),
  CONSTRAINT schema_metadata_value_not_blank CHECK (btrim(metadata_value) <> '')
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  phone VARCHAR(50) NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'buyer',
  store_name VARCHAR(255),
  region VARCHAR(100) NOT NULL,
  profile_description TEXT,
  address TEXT,
  avatar_url TEXT,
  whatsapp VARCHAR(50) NOT NULL,
  last_login_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
  phone_number VARCHAR(50) NOT NULL,
  verification_status VARCHAR(30) NOT NULL DEFAULT 'unverified',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_role_check CHECK (role IN ('buyer', 'seller', 'admin')),
  CONSTRAINT users_verification_status_check CHECK (verification_status IN ('unverified', 'verified')),
  CONSTRAINT users_full_name_not_blank CHECK (btrim(full_name) <> ''),
  CONSTRAINT users_phone_not_blank CHECK (btrim(phone) <> ''),
  CONSTRAINT users_region_not_blank CHECK (btrim(region) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users (phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users ((LOWER(email))) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users (role, is_active);
CREATE INDEX IF NOT EXISTS idx_users_region ON users (region);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC);

CREATE TABLE IF NOT EXISTS seller_profiles (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_name VARCHAR(255),
  bio TEXT,
  logo_url TEXT,
  cover_url TEXT,
  average_rating NUMERIC(4, 2) NOT NULL DEFAULT 0,
  ratings_count INT NOT NULL DEFAULT 0,
  total_products INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT seller_profiles_average_rating_check CHECK (average_rating >= 0 AND average_rating <= 5),
  CONSTRAINT seller_profiles_ratings_count_check CHECK (ratings_count >= 0),
  CONSTRAINT seller_profiles_total_products_check CHECK (total_products >= 0)
);

CREATE INDEX IF NOT EXISTS idx_seller_profiles_user_id ON seller_profiles (user_id);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  seller_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  currency VARCHAR(20) NOT NULL DEFAULT 'SYP',
  category VARCHAR(120) NOT NULL,
  subcategory VARCHAR(120),
  tags_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  region VARCHAR(100) NOT NULL,
  item_condition VARCHAR(100) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  views_count INT NOT NULL DEFAULT 0,
  has_delivery_service BOOLEAN NOT NULL DEFAULT FALSE,
  custom_fields_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT products_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT products_description_not_blank CHECK (btrim(description) <> ''),
  CONSTRAINT products_category_not_blank CHECK (btrim(category) <> ''),
  CONSTRAINT products_region_not_blank CHECK (btrim(region) <> ''),
  CONSTRAINT products_item_condition_not_blank CHECK (btrim(item_condition) <> ''),
  CONSTRAINT products_price_check CHECK (price >= 0),
  CONSTRAINT products_quantity_check CHECK (quantity >= 0),
  CONSTRAINT products_views_count_check CHECK (views_count >= 0),
  CONSTRAINT products_status_check CHECK (status IN ('draft', 'published', 'hidden', 'sold', 'archived', 'deleted')),
  CONSTRAINT products_tags_json_check CHECK (jsonb_typeof(tags_json) = 'array'),
  CONSTRAINT products_custom_fields_json_check CHECK (jsonb_typeof(custom_fields_json) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_products_seller_id ON products (seller_id);
CREATE INDEX IF NOT EXISTS idx_products_status_created ON products (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_region ON products (region);
CREATE INDEX IF NOT EXISTS idx_products_price ON products (price);
CREATE INDEX IF NOT EXISTS idx_products_views_count ON products (views_count DESC);
CREATE INDEX IF NOT EXISTS idx_products_seller_status ON products (seller_id, status);

CREATE TABLE IF NOT EXISTS product_images (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT product_images_sort_order_check CHECK (sort_order >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_images_product_sort_unique ON product_images (product_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_product_images_product_sort ON product_images (product_id, sort_order, id);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_type VARCHAR(20) NOT NULL DEFAULT 'inquiry',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversations_type_check CHECK (conversation_type IN ('inquiry', 'order')),
  CONSTRAINT conversations_status_check CHECK (status IN ('open', 'closed', 'cancelled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_unique_inquiry
  ON conversations (product_id, seller_id, buyer_id)
  WHERE conversation_type = 'inquiry';
CREATE INDEX IF NOT EXISTS idx_conversations_product_id ON conversations (product_id);
CREATE INDEX IF NOT EXISTS idx_conversations_seller_id ON conversations (seller_id);
CREATE INDEX IF NOT EXISTS idx_conversations_buyer_id ON conversations (buyer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations (status);
CREATE INDEX IF NOT EXISTS idx_conversations_type ON conversations (conversation_type);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations (last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message_body TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT messages_body_not_blank CHECK (btrim(message_body) <> '')
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages (conversation_id, created_at ASC, id ASC);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages (sender_id);

CREATE TABLE IF NOT EXISTS ratings (
  id SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INT NOT NULL,
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ratings_score_check CHECK (score BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS idx_ratings_seller_id ON ratings (seller_id);
CREATE INDEX IF NOT EXISTS idx_ratings_buyer_id ON ratings (buyer_id);
CREATE INDEX IF NOT EXISTS idx_ratings_product_id ON ratings (product_id);

CREATE TABLE IF NOT EXISTS conversation_deals (
  id SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  buyer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1,
  agreed_price NUMERIC(12, 2) NOT NULL,
  note TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT conversation_deals_quantity_check CHECK (quantity > 0),
  CONSTRAINT conversation_deals_agreed_price_check CHECK (agreed_price >= 0),
  CONSTRAINT conversation_deals_status_check CHECK (status IN ('pending', 'agreed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_conversation_deals_conversation_id ON conversation_deals (conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_deals_product_id ON conversation_deals (product_id);
CREATE INDEX IF NOT EXISTS idx_conversation_deals_buyer_id ON conversation_deals (buyer_id);
CREATE INDEX IF NOT EXISTS idx_conversation_deals_seller_id ON conversation_deals (seller_id);
CREATE INDEX IF NOT EXISTS idx_conversation_deals_status ON conversation_deals (status);

CREATE TABLE IF NOT EXISTS user_favorites (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_user_favorites_product_id ON user_favorites (product_id);

CREATE TABLE IF NOT EXISTS carts (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT carts_status_check CHECK (status IN ('active', 'archived'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_unique_active ON carts (user_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_carts_user_status ON carts (user_id, status);
CREATE INDEX IF NOT EXISTS idx_carts_created_at ON carts (created_at DESC);

CREATE TABLE IF NOT EXISTS cart_items (
  id SERIAL PRIMARY KEY,
  cart_id INT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  seller_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1,
  snapshot_price NUMERIC(12, 2) NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT cart_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT cart_items_snapshot_price_check CHECK (snapshot_price >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_cart_product_unique ON cart_items (cart_id, product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items (cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items (product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_seller_id ON cart_items (seller_id);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  buyer_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id INT REFERENCES conversations(id) ON DELETE SET NULL,
  source_type VARCHAR(20) NOT NULL,
  source_ref_id INT NOT NULL,
  total_amount NUMERIC(12, 2) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'submitted',
  payment_method VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orders_source_type_check CHECK (source_type IN ('cart', 'conversation', 'product')),
  CONSTRAINT orders_status_check CHECK (status IN ('submitted', 'seller_confirmed', 'buyer_confirmed', 'in_preparation', 'in_transport', 'completed', 'cancelled')),
  CONSTRAINT orders_total_amount_check CHECK (total_amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer_id ON orders (buyer_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON orders (seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_conversation_id ON orders (conversation_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_source ON orders (source_type, source_ref_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders (created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INT NOT NULL,
  price NUMERIC(12, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
  CONSTRAINT order_items_price_check CHECK (price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items (product_id);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL DEFAULT 'general',
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  link_url TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notifications_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT notifications_body_not_blank CHECK (btrim(body) <> ''),
  CONSTRAINT notifications_metadata_json_check CHECK (jsonb_typeof(metadata_json) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications (user_id, is_read);

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  reporter_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  reported_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  product_id INT REFERENCES products(id) ON DELETE SET NULL,
  conversation_id INT REFERENCES conversations(id) ON DELETE SET NULL,
  reason VARCHAR(255) NOT NULL,
  details TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reports_reason_not_blank CHECK (btrim(reason) <> ''),
  CONSTRAINT reports_status_check CHECK (status IN ('open', 'reviewed', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_product_id ON reports (product_id);
CREATE INDEX IF NOT EXISTS idx_reports_conversation_id ON reports (conversation_id);
CREATE INDEX IF NOT EXISTS idx_reports_reporter_user_id ON reports (reporter_user_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported_user_id ON reports (reported_user_id);

CREATE TABLE IF NOT EXISTS support_conversations (
  id SERIAL PRIMARY KEY,
  requester_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  assigned_admin_id INT REFERENCES users(id) ON DELETE SET NULL,
  first_response_at TIMESTAMPTZ,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT support_conversations_status_check CHECK (status IN ('open', 'pending', 'closed')),
  CONSTRAINT support_conversations_category_not_blank CHECK (btrim(category) <> '')
);

CREATE INDEX IF NOT EXISTS idx_support_conversations_status ON support_conversations (status);
CREATE INDEX IF NOT EXISTS idx_support_conversations_requester ON support_conversations (requester_user_id);
CREATE INDEX IF NOT EXISTS idx_support_conversations_assigned_admin ON support_conversations (assigned_admin_id);
CREATE INDEX IF NOT EXISTS idx_support_conversations_last_message_at ON support_conversations (last_message_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INT NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  sender_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  sender_role VARCHAR(20) NOT NULL DEFAULT 'user',
  message_body TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT support_messages_sender_role_check CHECK (sender_role IN ('user', 'admin')),
  CONSTRAINT support_messages_body_not_blank CHECK (btrim(message_body) <> '')
);

CREATE INDEX IF NOT EXISTS idx_support_messages_conversation ON support_messages (conversation_id, created_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  action_type VARCHAR(120) NOT NULL,
  target_type VARCHAR(120) NOT NULL,
  target_id INT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_logs_action_type_not_blank CHECK (btrim(action_type) <> ''),
  CONSTRAINT audit_logs_target_type_not_blank CHECK (btrim(target_type) <> ''),
  CONSTRAINT audit_logs_metadata_json_check CHECK (jsonb_typeof(metadata_json) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs (target_type, target_id);

CREATE TABLE IF NOT EXISTS site_content (
  id SERIAL PRIMARY KEY,
  content_key VARCHAR(100) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT site_content_key_not_blank CHECK (btrim(content_key) <> ''),
  CONSTRAINT site_content_title_not_blank CHECK (btrim(title) <> ''),
  CONSTRAINT site_content_content_not_blank CHECK (btrim(content) <> '')
);

CREATE INDEX IF NOT EXISTS idx_site_content_key ON site_content (content_key);

CREATE TABLE IF NOT EXISTS system_logs (
  id SERIAL PRIMARY KEY,
  actor_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  log_level VARCHAR(20) NOT NULL DEFAULT 'info',
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT system_logs_level_check CHECK (log_level IN ('debug', 'info', 'warning', 'error')),
  CONSTRAINT system_logs_category_not_blank CHECK (btrim(category) <> ''),
  CONSTRAINT system_logs_message_not_blank CHECK (btrim(message) <> ''),
  CONSTRAINT system_logs_metadata_json_check CHECK (jsonb_typeof(metadata_json) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs (log_level);
CREATE INDEX IF NOT EXISTS idx_system_logs_category ON system_logs (category);

CREATE TABLE IF NOT EXISTS verification_codes (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL,
  destination VARCHAR(255) NOT NULL,
  code_hash TEXT NOT NULL,
  code_hint VARCHAR(12) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT verification_codes_channel_check CHECK (channel IN ('email', 'phone', 'whatsapp')),
  CONSTRAINT verification_codes_status_check CHECK (status IN ('pending', 'verified', 'replaced', 'expired')),
  CONSTRAINT verification_codes_destination_not_blank CHECK (btrim(destination) <> '')
);

CREATE INDEX IF NOT EXISTS idx_verification_codes_user_channel ON verification_codes (user_id, channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_verification_codes_status ON verification_codes (status, expires_at DESC);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION hydrate_user_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.full_name = btrim(NEW.full_name);
  NEW.phone = btrim(NEW.phone);
  NEW.region = btrim(NEW.region);

  IF NEW.email IS NOT NULL THEN
    NEW.email = NULLIF(LOWER(btrim(NEW.email)), '');
  END IF;

  IF NEW.store_name IS NOT NULL THEN
    NEW.store_name = NULLIF(btrim(NEW.store_name), '');
  END IF;

  IF NEW.address IS NOT NULL THEN
    NEW.address = NULLIF(btrim(NEW.address), '');
  END IF;

  IF NEW.profile_description IS NOT NULL THEN
    NEW.profile_description = NULLIF(btrim(NEW.profile_description), '');
  END IF;

  IF NEW.phone_number IS NULL OR btrim(NEW.phone_number) = '' THEN
    NEW.phone_number = NEW.phone;
  ELSE
    NEW.phone_number = btrim(NEW.phone_number);
  END IF;

  IF NEW.whatsapp IS NULL OR btrim(NEW.whatsapp) = '' THEN
    NEW.whatsapp = NEW.phone_number;
  ELSE
    NEW.whatsapp = btrim(NEW.whatsapp);
  END IF;

  IF NEW.role = 'seller' AND (NEW.store_name IS NULL OR btrim(NEW.store_name) = '') THEN
    NEW.store_name = NEW.full_name;
  END IF;

  NEW.verification_status = CASE
    WHEN COALESCE(NEW.is_email_verified, FALSE) OR COALESCE(NEW.is_phone_verified, FALSE) THEN 'verified'
    ELSE 'unverified'
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_hydrate_fields ON users;
CREATE TRIGGER trg_users_hydrate_fields
BEFORE INSERT OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION hydrate_user_fields();

DROP TRIGGER IF EXISTS trg_users_touch_updated_at ON users;
CREATE TRIGGER trg_users_touch_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_seller_profiles_touch_updated_at ON seller_profiles;
CREATE TRIGGER trg_seller_profiles_touch_updated_at
BEFORE UPDATE ON seller_profiles
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_products_touch_updated_at ON products;
CREATE TRIGGER trg_products_touch_updated_at
BEFORE UPDATE ON products
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_conversations_touch_updated_at ON conversations;
CREATE TRIGGER trg_conversations_touch_updated_at
BEFORE UPDATE ON conversations
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_conversation_deals_touch_updated_at ON conversation_deals;
CREATE TRIGGER trg_conversation_deals_touch_updated_at
BEFORE UPDATE ON conversation_deals
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_carts_touch_updated_at ON carts;
CREATE TRIGGER trg_carts_touch_updated_at
BEFORE UPDATE ON carts
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_cart_items_touch_updated_at ON cart_items;
CREATE TRIGGER trg_cart_items_touch_updated_at
BEFORE UPDATE ON cart_items
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_orders_touch_updated_at ON orders;
CREATE TRIGGER trg_orders_touch_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_notifications_touch_updated_at ON notifications;
CREATE TRIGGER trg_notifications_touch_updated_at
BEFORE UPDATE ON notifications
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_reports_touch_updated_at ON reports;
CREATE TRIGGER trg_reports_touch_updated_at
BEFORE UPDATE ON reports
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_support_conversations_touch_updated_at ON support_conversations;
CREATE TRIGGER trg_support_conversations_touch_updated_at
BEFORE UPDATE ON support_conversations
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_site_content_touch_updated_at ON site_content;
CREATE TRIGGER trg_site_content_touch_updated_at
BEFORE UPDATE ON site_content
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_schema_metadata_touch_updated_at ON schema_metadata;
CREATE TRIGGER trg_schema_metadata_touch_updated_at
BEFORE UPDATE ON schema_metadata
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

DROP VIEW IF EXISTS seller_public_view;
CREATE VIEW seller_public_view AS
SELECT
  u.id AS seller_id,
  u.full_name,
  COALESCE(u.store_name, u.full_name) AS store_name,
  u.phone,
  u.email,
  u.role,
  u.region,
  u.address,
  u.avatar_url,
  u.profile_description,
  u.whatsapp,
  u.is_active,
  u.is_email_verified,
  u.is_phone_verified,
  u.verification_status,
  u.created_at,
  u.updated_at,
  sp.display_name,
  sp.bio,
  sp.logo_url,
  sp.cover_url,
  COALESCE(sp.average_rating, 0) AS average_rating,
  COALESCE(sp.ratings_count, 0) AS ratings_count,
  COALESCE(sp.total_products, 0) AS total_products
FROM users u
LEFT JOIN seller_profiles sp ON sp.user_id = u.id
WHERE u.role = 'seller';

INSERT INTO schema_metadata (metadata_key, metadata_value, created_at, updated_at)
VALUES ('schema_version', '2026-04-03-unified-v2', NOW(), NOW())
ON CONFLICT (metadata_key)
DO UPDATE SET
  metadata_value = EXCLUDED.metadata_value,
  updated_at = NOW();
