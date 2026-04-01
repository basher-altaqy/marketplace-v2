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
