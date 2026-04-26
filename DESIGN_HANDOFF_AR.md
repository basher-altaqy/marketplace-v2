# تسليم تصميم - مشروع بضاعة بلدي

تاريخ إعداد هذا المستند: 21 أبريل 2026

## الهدف
هذا المستند مخصص لتسليم نسخة واضحة للمصمم لفهم المنتج الحالي قبل أي إعادة تصميم أو تحسين واجهة.

## نبذة سريعة عن المشروع
- نوع المشروع: منصة Marketplace محلية متعددة البائعين.
- لغة الواجهة: العربية (RTL) بشكل كامل.
- التقنيات: `Node.js + Express + PostgreSQL + Vanilla JS + HTML/CSS`.
- نقطة التشغيل: `server.js`.

## الملفات التي يجب مشاركتها مع المصمم
- `public/index.html`
- `public/styles.css`
- `public/js/main.js`
- `public/js/legacy-app.js`
- `public/admin/admin.html`
- `public/admin/admin.css`
- `public/admin/admin.js`
- `public/admin/legacy-admin.js`
- `public/assets/site/topbar-logo.jpg`
- `public/assets/site/qatna-hero.png`
- `public/assets/site/black-gold-marble-reference.jpg`

## الشاشات الأساسية (واجهة المستخدم)
- `homeView`: الصفحة الرئيسية + Hero + مزايا + بحث + فلاتر + أقسام المنتجات.
- `catalogView`: عرض كل المنتجات.
- `productView`: تفاصيل المنتج + منتجات ذات صلة.
- `authView`: تسجيل الدخول/التسجيل.
- `profileView`: الملف الشخصي.
- `favoritesView`: المفضلة.
- `cartView`: السلة.
- `checkoutView`: إتمام الطلب.
- `ordersView`: الطلبات.
- `dashboardView`: لوحة البائع وإدارة منتجاته.
- `sellerView`: صفحة/ملف البائع.
- `messagesView`: المحادثات.

## شاشات لوحة الإدارة (Admin)
- `overview`: نظرة عامة وإحصائيات.
- `users`: إدارة المستخدمين.
- `products`: إدارة المنتجات.
- `reports`: البلاغات.
- `conversations`: المحادثات.
- `content`: المحتوى الثابت.
- `support`: الدعم الفني.
- `system`: حالة النظام والأخطاء.
- `activity`: النشاط والإعدادات المرتبطة به.

## الهوية البصرية الحالية (ملخص عملي)
- ألوان الواجهة العامة في `public/styles.css`:
  - `--primary: #003366`
  - `--secondary: #95bb3a`
  - `--accent: #d1963c`
  - `--bg: #f7f8fa`
- ألوان لوحة الإدارة في `public/admin/admin.css`:
  - `--primary: #95bb3a`
  - `--secondary: #0f172a`
  - خلفيات متدرجة مع طابع احترافي داكن-فاتح.
- خطوط:
  - الواجهة العامة: `"Segoe UI", Tahoma, sans-serif`
  - لوحة الإدارة: `Tajawal` للنص و`Cairo` للعناوين.

## سلوكيات وتجارب مهمة للمصمم
- الهيدر العلوي ثابت `sticky` مع حالات تسجيل دخول/خروج مختلفة.
- يوجد Overlay بحث كامل (بحث سريع + اقتراحات chips).
- فلاتر المنتجات لها تجربة سطح مكتب وتجربة موبايل منفصلة.
- توجد شارات عداد (`Badges`) للمحادثات والتنبيهات والمفضلة والسلة والطلبات.
- لوحة البائع تحتوي بطاقات منتجات مع حالات كثيرة (إدارة/تعديل/إخفاء/بيع...).
- تجربة RTL يجب الحفاظ عليها في كل شاشة.

## استجابة الشاشات (Responsive)
- الواجهة العامة فيها نقاط كسر متعددة (مثل `1180`, `980`, `900`, `700`, `620`, `479`).
- لوحة الإدارة تعتمد نقاط كسر رئيسية (`1200`, `1100`, `980`, `640`).
- التصميم الجديد مطلوب أن يحافظ على جودة التجربة على الهاتف أولًا ثم سطح المكتب.

## قيود تقنية يجب احترامها أثناء التصميم
- كثير من العناصر مرتبطة مباشرة بـ `id` في JavaScript.
- يفضّل عدم تغيير أسماء `id/class` في المرحلة الأولى بدون تنسيق مع المطور.
- أي Proposal تصميمي يجب أن يحدد بوضوح:
  - ما الذي يمكن تنفيذه كتحسين CSS فقط.
  - ما الذي يحتاج تعديل HTML/JS.

## تشغيل المشروع للمعاينة
1. `npm install`
2. `npm start`
3. افتح: `http://localhost:3000`
4. لوحة الإدارة: `http://localhost:3000/admin/admin.html`

## مخرجات مطلوبة من المصمم
1. خريطة UX مختصرة لتدفق: التصفح -> تفاصيل المنتج -> التواصل/الطلب.
2. اقتراح نظام بصري موحد بين الواجهة العامة ولوحة الإدارة.
3. تحسينات mobile-first لشاشات: الرئيسية، تفاصيل المنتج، المحادثات، لوحة البائع.
4. قائمة أولويات واضحة: تحسينات سريعة مقابل تحسينات تحتاج تعديل بنيوي.

## Order Flow Update - 2026-04-22
- Seller actions on new orders (`submitted`):
  - Accept (`seller_confirmed`)
  - Reject (`cancelled`)
- Buyer actions after seller acceptance (`seller_confirmed`):
  - Receive order (`completed`)
  - Cancel order (`cancelled`)
- Conversation behavior for order-linked chats:
  - `completed` => conversation is finalized as `closed`
  - `cancelled` => conversation is finalized as `cancelled`
  - finalized order conversations are not reopened.
- Rating behavior:
  - rating is still one-time only.
  - rating is allowed after `closed` or `cancelled` status.

## Home Ads Slots Update - 2026-04-24
- The home screen now uses 3 managed ad slots:
  - top slot #1 (horizontal)
  - top slot #2 (horizontal)
  - bottom slot after product cards (horizontal)
- Ad content is managed from Admin > Static Content, without adding a new admin screen.
- Keys used for each ad:
  - `home_top_ad_1_title`, `home_top_ad_1_subtitle`, `home_top_ad_1_image`, `home_top_ad_1_link`
  - `home_top_ad_2_title`, `home_top_ad_2_subtitle`, `home_top_ad_2_image`, `home_top_ad_2_link`
  - `home_bottom_ad_title`, `home_bottom_ad_subtitle`, `home_bottom_ad_image`, `home_bottom_ad_link`
- Visual ratio target for desktop banners is `8:3` (`800x300` recommended).
