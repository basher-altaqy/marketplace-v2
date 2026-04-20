# Marketplace Modular v1

هذه نسخة مقسمة Modular بدون حذف الميزات السابقة، مبنية فوق النسخة الموحدة الأخيرة.

## ما الذي تغير؟
- `server.js` أصبح bootstrap صغير فقط
- الخادم قُسم إلى:
  - `src/config`
  - `src/db`
  - `src/services`
  - `src/routes`
  - `src/middleware`
- الواجهة العامة أصبحت:
  - `public/app.js` = loader
  - `public/js/main.js`
  - `public/js/legacy-app.js` (يحافظ على كل السلوك الحالي)
- لوحة الأدمن أصبحت:
  - `public/admin/admin.js` = loader
  - `public/admin/modules/main.js`
  - `public/admin/legacy-admin.js`

## لماذا هذا مهم؟
هذا يمنع مشكلة أن ملفًا واحدًا كبيرًا يتم استبداله فيضيع معه كل شيء.
الآن صار عندك فصل أولي حقيقي، ويمكننا في المرحلة التالية تفكيك `legacy-app.js` و `legacy-admin.js` داخليًا بدون كسر المشروع.

## التشغيل
1. انسخ الملفات إلى مجلد مشروع جديد أو فوق مشروعك الحالي.
2. انسخ `.env.example` إلى `.env` وعدّل بيانات الاتصال بقاعدة البيانات.
3. نفّذ:
   npm install
4. ثم:
   npm start

## ملاحظات
- يجب تشغيل `migration_unified.sql` مرة واحدة إذا لم تكن قد شغّلته سابقًا.
- ملف `dragon.effect.js` هو نقطة ربط خفيفة للمؤثر المستقبلي ولا يضيف حملاً فعليًا الآن.
- جميع مسارات API الحالية محفوظة كما هي لتجنّب كسر الواجهة أو الأدمن.

## Adaptive Poll API
- New endpoint: `GET /api/poll?since=<ISO_DATE>&conversationId=<id>`
- Auth: `Authorization: Bearer <token>`
- Response includes:
  - `conversations`
  - `messages` (for active conversation only when `conversationId` is provided)
  - `notifications`
  - `serverNow` (must be reused as next `since`)
- `since` rules:
  - Invalid/future values are ignored.
  - Old values are clamped using `POLL_SINCE_MAX_DAYS` (default: 30 days).
  - Client should send the last `serverNow` received from server (not local `Date.now()`).
- Cache headers:
  - `Cache-Control: no-cache, no-store, must-revalidate`
  - `Pragma: no-cache`
- Optional pressure hint:
  - Server may return `Retry-After` (seconds) and client should delay next poll accordingly.

## Web Push (Service Worker)
- Feature flags/env:
  - `WEB_PUSH_ENABLED=true|false`
  - `VAPID_PUBLIC_KEY`
  - `VAPID_PRIVATE_KEY`
  - `VAPID_SUBJECT`
  - `PUSH_METRICS_WINDOW_HOURS` (default: `24`)
- New APIs:
  - `GET /api/push/vapid-public-key`
  - `POST /api/push/subscribe`
  - `POST /api/push/unsubscribe`
  - `POST /api/push/client-event` (operational telemetry from browser: requested/granted/denied)
- Client behavior:
  - In-app notifications + adaptive polling remain active as fallback.
  - Push permission is requested contextually on first message send or first order creation.
  - Service worker path: `public/sw.js`.
- Delivery logging:
  - `push_delivery_logs` stores per-attempt success/failure with latency and error details.
  - Invalid subscriptions (`404/410`) are removed automatically and counted.
- Admin status:
  - `/api/admin/system/status` now includes `status.notifications.push` metrics:
    `totalAttempts`, `successCount`, `failureCount`, `successRate`, `invalidRemoved`, `windowHours`.

## Production Runbook (Web Push)
- Prerequisites:
  - HTTPS must be enabled on production.
  - Apply latest schema changes before restart (tables: `push_subscriptions`, `push_delivery_logs`).
- Required production env:
  - `WEB_PUSH_ENABLED=true`
  - `VAPID_PUBLIC_KEY=<generated>`
  - `VAPID_PRIVATE_KEY=<generated>`
  - `VAPID_SUBJECT=mailto:<ops-email>`
  - `PUSH_METRICS_WINDOW_HOURS=24`
- Generate VAPID keys (one-time):
  - `npx web-push generate-vapid-keys`
- Key rotation:
  - Generate new key pair.
  - Update env values and restart the app.
  - Existing device subscriptions may need re-subscription after rotation.
- Fast rollback:
  - Set `WEB_PUSH_ENABLED=false` and restart.
  - In-app notifications + polling continue to work as fallback.

## Rollout Decision Rule (24h)
- Keep Web Push enabled if:
  - `successRate >= 90%`
  - no invalid-subscription spike (`invalidRemoved < 25`)
  - failures do not exceed successes
- If metrics are degraded:
  - disable Web Push by env (`WEB_PUSH_ENABLED=false`)
  - investigate logs and subscription churn, then re-enable after fix.
