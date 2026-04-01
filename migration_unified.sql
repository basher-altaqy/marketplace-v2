BEGIN;

ALTER TABLE reports ADD COLUMN IF NOT EXISTS admin_notes TEXT;

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

ALTER TABLE products
  ADD CONSTRAINT products_status_check
  CHECK (status IN ('draft', 'published', 'hidden', 'sold', 'archived', 'deleted'));

COMMIT;
