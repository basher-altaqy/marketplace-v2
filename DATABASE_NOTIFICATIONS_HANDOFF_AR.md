# مخطط قاعدة البيانات + نظام الإشعارات (تسليم تقني)

تاريخ التحديث: 21 أبريل 2026

## 1) المرجع الكامل للمخطط (Canonical Schema)
- المخطط الكامل 100% موجود في ملف SQL الأساسي:
  - `database.sql`
- نسخة المخطط المعتمدة (Schema Marker):
  - `schema_metadata.metadata_value = '2026-04-03-unified-v2'`

## 2) جميع كائنات قاعدة البيانات في المشروع
- جداول البيانات (22):
  - `schema_metadata`
  - `users`
  - `seller_profiles`
  - `products`
  - `product_images`
  - `conversations`
  - `messages`
  - `ratings`
  - `conversation_deals`
  - `user_favorites`
  - `carts`
  - `cart_items`
  - `orders`
  - `order_items`
  - `notifications`
  - `push_subscriptions`
  - `push_delivery_logs`
  - `reports`
  - `support_conversations`
  - `support_messages`
  - `audit_logs`
  - `site_content`
  - `system_logs`
  - `verification_codes`
- وظائف (Functions):
  - `touch_updated_at()`
  - `hydrate_user_fields()`
- مشغلات (Triggers) لتحديث `updated_at` وتطبيع بيانات المستخدم:
  - `trg_users_hydrate_fields`
  - `trg_users_touch_updated_at`
  - `trg_seller_profiles_touch_updated_at`
  - `trg_products_touch_updated_at`
  - `trg_conversations_touch_updated_at`
  - `trg_conversation_deals_touch_updated_at`
  - `trg_carts_touch_updated_at`
  - `trg_cart_items_touch_updated_at`
  - `trg_orders_touch_updated_at`
  - `trg_notifications_touch_updated_at`
  - `trg_push_subscriptions_touch_updated_at`
  - `trg_reports_touch_updated_at`
  - `trg_support_conversations_touch_updated_at`
  - `trg_site_content_touch_updated_at`
  - `trg_schema_metadata_touch_updated_at`
- View:
  - `seller_public_view`

## 3) العلاقات الأساسية (FK Map)
- `seller_profiles.user_id -> users.id`
- `products.seller_id -> users.id`
- `product_images.product_id -> products.id`
- `conversations.product_id -> products.id`
- `conversations.seller_id -> users.id`
- `conversations.buyer_id -> users.id`
- `messages.conversation_id -> conversations.id`
- `messages.sender_id -> users.id`
- `ratings.conversation_id -> conversations.id`
- `ratings.product_id -> products.id`
- `ratings.seller_id -> users.id`
- `ratings.buyer_id -> users.id`
- `conversation_deals.conversation_id -> conversations.id`
- `conversation_deals.product_id -> products.id`
- `conversation_deals.buyer_id -> users.id`
- `conversation_deals.seller_id -> users.id`
- `user_favorites.user_id -> users.id`
- `user_favorites.product_id -> products.id`
- `carts.user_id -> users.id`
- `cart_items.cart_id -> carts.id`
- `cart_items.product_id -> products.id`
- `cart_items.seller_id -> users.id`
- `orders.buyer_id -> users.id`
- `orders.seller_id -> users.id`
- `orders.conversation_id -> conversations.id`
- `order_items.order_id -> orders.id`
- `order_items.product_id -> products.id`
- `notifications.user_id -> users.id`
- `push_subscriptions.user_id -> users.id`
- `push_delivery_logs.notification_id -> notifications.id`
- `push_delivery_logs.user_id -> users.id`
- `push_delivery_logs.subscription_id -> push_subscriptions.id`
- `reports.reporter_user_id -> users.id`
- `reports.reported_user_id -> users.id`
- `reports.product_id -> products.id`
- `reports.conversation_id -> conversations.id`
- `support_conversations.requester_user_id -> users.id`
- `support_conversations.assigned_admin_id -> users.id`
- `support_messages.conversation_id -> support_conversations.id`
- `support_messages.sender_user_id -> users.id`
- `audit_logs.actor_user_id -> users.id`
- `system_logs.actor_user_id -> users.id`
- `verification_codes.user_id -> users.id`

## 4) جداول الإشعارات (بالتفصيل)
- `notifications`:
  - الأعمدة: `id`, `user_id`, `type`, `title`, `body`, `link_url`, `metadata_json`, `is_read`, `created_at`, `updated_at`
  - فهارس مهمة: `idx_notifications_user_created`, `idx_notifications_user_read`
- `push_subscriptions`:
  - الأعمدة: `id`, `user_id`, `endpoint`, `p256dh`, `auth`, `user_agent`, `created_at`, `updated_at`, `last_success_at`, `last_error_at`
  - فهارس مهمة: `idx_push_subscriptions_user_endpoint_unique`, `idx_push_subscriptions_user_id`, `idx_push_subscriptions_updated_at`
- `push_delivery_logs`:
  - الأعمدة: `id`, `notification_id`, `user_id`, `subscription_id`, `event_type`, `status`, `error_code`, `error_message`, `latency_ms`, `created_at`
  - فهارس مهمة: `idx_push_delivery_logs_created_at`, `idx_push_delivery_logs_user_created`, `idx_push_delivery_logs_status_created`

## 5) تدفق الإشعارات من الكود (End-to-End)
- إنشاء إشعار داخلي:
  - `createNotification(...)` في `src/services/platform.service.js`
  - دائمًا يكتب سجلًا في جدول `notifications`.
- إرسال Push:
  - لا يتم لكل الأنواع.
  - الإرسال يحدث فقط عندما:
    - `WEB_PUSH_ENABLED=true`
    - ونوع الإشعار ضمن `PUSH_EVENTS_ENABLED`
- ملاحظة مهمة جدًا لحالتك:
  - الأنواع المفعلة حاليًا للـ Push هي فقط:
    - `message`
    - `order`
  - هذا يعني: `account` و`report` و`support` لا ترسل Push حاليًا، وتظهر فقط داخل التطبيق.

## 6) الملفات المرتبطة مباشرة بخطة الإشعارات
- قاعدة البيانات:
  - `database.sql`
- إعدادات البيئة:
  - `src/config/env.js`
- خدمات الإشعارات/Push:
  - `src/services/platform.service.js`
- APIs:
  - `src/routes/notifications.routes.js`
  - `src/routes/push.routes.js`
  - `src/routes/poll.routes.js`
- مصادر إنشاء الإشعار (Business Events):
  - `src/routes/auth.routes.js`
  - `src/routes/conversations.routes.js`
  - `src/routes/orders.routes.js`
  - `src/routes/admin.routes.js`
- ربط المسارات بالإكسبريس:
  - `src/app.js`
- واجهة العميل:
  - `public/js/legacy-app.js`
  - `public/sw.js`
- جاهزية المخطط وعمليات الإنشاء/التحقق:
  - `src/services/bootstrap.service.js`
  - `scripts/db-bootstrap.js`
  - `scripts/db-reset.js`
  - `src/db/pool.js`

## 7) فحوصات SQL سريعة لحل مشاكل الإشعارات
```sql
-- 1) تأكيد نسخة المخطط
SELECT metadata_key, metadata_value, updated_at
FROM schema_metadata
WHERE metadata_key = 'schema_version';

-- 2) هل توجد اشتراكات Push فعليًا للمستخدم؟
SELECT id, user_id, endpoint, updated_at, last_success_at, last_error_at
FROM push_subscriptions
WHERE user_id = :user_id
ORDER BY updated_at DESC;

-- 3) هل الإشعارات تُنشأ أصلًا؟
SELECT id, user_id, type, title, is_read, created_at
FROM notifications
WHERE user_id = :user_id
ORDER BY created_at DESC
LIMIT 50;

-- 4) سجل تسليم Push (نجاح/فشل)
SELECT id, user_id, notification_id, event_type, status, error_code, error_message, latency_ms, created_at
FROM push_delivery_logs
WHERE user_id = :user_id
ORDER BY created_at DESC
LIMIT 100;

-- 5) مؤشرات عامة (آخر 24 ساعة)
SELECT
  COUNT(*)::int AS total_attempts,
  COUNT(*) FILTER (WHERE status = 'success')::int AS success_count,
  COUNT(*) FILTER (WHERE status = 'failure')::int AS failure_count,
  COUNT(*) FILTER (WHERE error_code = 'invalid_subscription_removed')::int AS invalid_removed
FROM push_delivery_logs
WHERE created_at >= NOW() - INTERVAL '24 hour';
```

## 8) تشخيص المشكلة بسرعة (Decision Tree)
- حالة A: توجد سجلات في `notifications` ولا توجد سجلات في `push_delivery_logs`.
  - السبب المرجح:
    - النوع ليس `message` أو `order`.
    - أو `WEB_PUSH_ENABLED=false`.
    - أو لا يوجد اشتراك في `push_subscriptions`.
- حالة B: توجد سجلات فشل في `push_delivery_logs` مع `404/410` أو `invalid_subscription_removed`.
  - السبب المرجح:
    - اشتراك المتصفح قديم/ملغي ويحتاج إعادة اشتراك.
- حالة C: لا توجد سجلات في `notifications` أصلًا.
  - السبب المرجح:
    - مسار الحدث لا يستدعي `createNotification` للحالة التي تختبرها.

## 9) المخرجات المتوقعة عند التشغيل الصحيح
- كل حدث يخلق إشعارًا يجب أن يظهر في `notifications`.
- أحداث `message` و`order` فقط هي التي تحاول إرسال Web Push في الوضع الحالي.
- صفحة الإشعارات داخل التطبيق تقرأ من `/api/notifications`.
- التحديث اللحظي يمر عبر `/api/poll` باستخدام `serverNow` و`since`.
