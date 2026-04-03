# Database Handoff

## What Changed

- `database.sql` is now the single base schema for a fresh PostgreSQL database.
- `schema_metadata` is now the schema marker that records the expected unified schema version.
- Runtime schema patching is no longer part of app startup.
- Admin creation moved to an explicit bootstrap step driven by environment variables.
- Default site content is seeded during bootstrap with idempotent upserts.
- Legacy or partially compatible databases are rejected by `db:bootstrap` and must be rebuilt with `db:reset`.

## Main Database Objects

- Accounts and seller metadata:
  - `users`
  - `seller_profiles`
- Marketplace data:
  - `products`
  - `product_images`
  - `user_favorites`
  - `carts`
  - `cart_items`
  - `orders`
  - `order_items`
- Messaging and trust:
  - `conversations`
  - `messages`
  - `ratings`
  - `conversation_deals`
- Platform and moderation:
  - `notifications`
  - `reports`
  - `support_conversations`
  - `support_messages`
  - `audit_logs`
  - `site_content`
  - `system_logs`
  - `verification_codes`
- Internal schema state:
  - `schema_metadata`
- Required view:
  - `seller_public_view`

## Unified Decisions

- Product naming is standardized on `products.name`.
- Product condition is standardized on `products.item_condition`.
- Product delivery flag is standardized on `products.has_delivery_service`.
- Product status is standardized on:
  - `draft`
  - `published`
  - `hidden`
  - `sold`
  - `archived`
  - `deleted`
- User runtime fields are part of the base schema from day one:
  - `role`
  - `is_active`
  - `is_email_verified`
  - `is_phone_verified`
  - `phone_number`
  - `verification_status`
  - `store_name`
  - `region`

## Bootstrap Flow

1. Set database and admin environment variables:
   - `DATABASE_URL`
   - `DB_SSL` when required by the host
   - `NODE_ENV`
   - `ADMIN_PHONE`
   - `ADMIN_PASSWORD` (recommended)
   - `ADMIN_PASSWORD_HASH` only if you already have a valid precomputed hash
   - `ADMIN_EMAIL` recommended
   - Optional: `ADMIN_FULL_NAME`, `ADMIN_STORE_NAME`, `ADMIN_REGION`, `ADMIN_ADDRESS`, `ADMIN_PROFILE_DESCRIPTION`, `ADMIN_WHATSAPP`
2. Apply schema and seeds:

```bash
npm run db:bootstrap
```

3. If the target database already contains old marketplace objects without the current schema marker, rebuild it explicitly:

```bash
npm run db:reset
```

4. Start the app:

```bash
npm start
```

The app now checks both required objects and the schema marker version. If the schema is missing it asks for `npm run db:bootstrap`; if the database is legacy or incompatible it asks for `npm run db:reset`.

## Seed Behavior

- Admin bootstrap is idempotent:
  - it updates the matching admin user when phone or email already exists
  - otherwise it inserts a new admin user
- Site content bootstrap is idempotent:
  - it upserts the known content keys into `site_content`
- No demo users, demo products, or demo conversations are inserted

## Deployment Notes

- `database.sql` must remain in the project root because `bootstrap.service.js` reads that exact file path.
- For Railway, use the service-provided `DATABASE_URL` and set:
  - `DB_SSL=true`
  - `NODE_ENV=production`
  - `ADMIN_PHONE`
  - `ADMIN_PASSWORD`
- For Render/Neon, run `npm run db:bootstrap` before the service starts.
- On Railway, the recommended flow is:
  1. attach the Node service to Railway PostgreSQL
  2. confirm `DATABASE_URL` exists automatically
  3. open the Node service console
  4. run `npm run db:bootstrap`
  5. verify tables with `psql "$DATABASE_URL" -c "\dt"` when `psql` is available, or use DBeaver / pgAdmin / Railway SQL shell
  6. redeploy the app
- `npm install` is usually not needed manually on Railway after deployment because dependencies are installed during build.
- Do not run `psql -f database.sql` as the default deployment path when `npm run db:bootstrap` is available; bootstrap applies the schema and completes the required seeds.
- Do not use `npm run db:reset` in routine deployments; it is destructive and intended only for replacing legacy or damaged marketplace schemas.
- Legacy migration files (`migration_unified.sql`, `migration_phase3.sql`, `migration_phase3_hotfix.sql`) should not be used as the base schema for new environments.
