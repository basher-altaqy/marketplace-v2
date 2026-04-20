-- Migration: create_push_tables
-- Created: 2025-07-10
-- Description: Creates push_subscriptions and push_delivery_logs tables
--              for the web push notifications feature.

BEGIN;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_success_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  CONSTRAINT push_subscriptions_endpoint_not_blank CHECK (btrim(endpoint) <> ''),
  CONSTRAINT push_subscriptions_p256dh_not_blank CHECK (btrim(p256dh) <> ''),
  CONSTRAINT push_subscriptions_auth_not_blank CHECK (btrim(auth) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_user_endpoint_unique
  ON push_subscriptions (user_id, endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_updated_at ON push_subscriptions (updated_at DESC);

CREATE TABLE IF NOT EXISTS push_delivery_logs (
  id SERIAL PRIMARY KEY,
  notification_id INT REFERENCES notifications(id) ON DELETE SET NULL,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id INT REFERENCES push_subscriptions(id) ON DELETE SET NULL,
  event_type VARCHAR(50) NOT NULL DEFAULT 'general',
  status VARCHAR(20) NOT NULL,
  error_code VARCHAR(120),
  error_message TEXT,
  latency_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT push_delivery_logs_status_check CHECK (status IN ('success', 'failure'))
);

CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_created_at ON push_delivery_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_user_created ON push_delivery_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_push_delivery_logs_status_created ON push_delivery_logs (status, created_at DESC);

-- Attach updated_at auto-touch trigger to push_subscriptions
DROP TRIGGER IF EXISTS trg_push_subscriptions_touch_updated_at ON push_subscriptions;
CREATE TRIGGER trg_push_subscriptions_touch_updated_at
BEFORE UPDATE ON push_subscriptions
FOR EACH ROW
EXECUTE FUNCTION touch_updated_at();

COMMIT;

-- To roll back this migration, run:
--
-- BEGIN;
-- DROP TABLE IF EXISTS push_delivery_logs CASCADE;
-- DROP TABLE IF EXISTS push_subscriptions CASCADE;
-- COMMIT;
