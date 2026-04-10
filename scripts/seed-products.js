require('dotenv').config();

const bcrypt = require('bcryptjs');
const { pool } = require('../src/db/pool');
const { assertDatabaseReady } = require('../src/services/bootstrap.service');

// ============================================
// بيانات واقعية للمنتجات والبائعين
// ============================================

const SELLER_COUNT = 3;
const PRODUCTS_PER_SELLER = 14;
const TEST_PASSWORD = 'Seller12345';
const REGION = 'Damascus';
const CURRENCY = 'SYP';

const STORE_NAMES = [
  'متجر التقنية السورية',
  'عالم الإلكترونيات',
  'بيت الأجهزة الذكية',
  'دار الأثاث الحديث',
  'لمسة منزلية',
  'ركن الديكور',
  'شارع الأناقة',
  'موضة اليوم',
  'متجر الستايل'
];

const PRODUCTS_DB = [
  { name: 'هاتف ذكي Samsung Galaxy A54', price: 3250000, category: 'Electronics', condition: 'new', imageSeed: 'phone' },
  { name: 'لابتوب HP Victus 15', price: 8750000, category: 'Electronics', condition: 'new', imageSeed: 'laptop' },
  { name: 'سماعات لاسلكية Sony WH-CH510', price: 425000, category: 'Electronics', condition: 'new', imageSeed: 'headphones' },
  { name: 'ساعة ذكية Apple Watch SE', price: 1850000, category: 'Electronics', condition: 'new', imageSeed: 'watch' },
  { name: 'شاحن سريع 65W Baseus', price: 125000, category: 'Electronics', condition: 'new', imageSeed: 'charger' },
  { name: 'تابلت Samsung Tab S9', price: 4250000, category: 'Electronics', condition: 'new', imageSeed: 'tablet' },
  { name: 'كاميرا رقمية Canon EOS 2000D', price: 6250000, category: 'Electronics', condition: 'new', imageSeed: 'camera' },
  { name: 'مكبر صوت محمول JBL Flip 6', price: 875000, category: 'Electronics', condition: 'new', imageSeed: 'speaker' },
  { name: 'كنبة زاوية 3 قطع', price: 12500000, category: 'Furniture', condition: 'new', imageSeed: 'sofa' },
  { name: 'طاولة طعام 6 كراسي', price: 8750000, category: 'Furniture', condition: 'new', imageSeed: 'dining' },
  { name: 'خزانة ملابس 4 أبواب', price: 14500000, category: 'Furniture', condition: 'used', imageSeed: 'wardrobe' },
  { name: 'سرير مزدوج مع مرتبة', price: 9500000, category: 'Furniture', condition: 'new', imageSeed: 'bed' },
  { name: 'مكتب كمبيوتر أنيق', price: 1850000, category: 'Furniture', condition: 'new', imageSeed: 'desk' },
  { name: 'كرسي مكتب مريح', price: 625000, category: 'Furniture', condition: 'new', imageSeed: 'chair' },
  { name: 'تيشيرت قطني رجالي', price: 125000, category: 'Fashion', condition: 'new', imageSeed: 'tshirt' },
  { name: 'جينز رجالي Slim Fit', price: 325000, category: 'Fashion', condition: 'new', imageSeed: 'jeans' },
  { name: 'فستان نسائي طويل', price: 525000, category: 'Fashion', condition: 'new', imageSeed: 'dress' },
  { name: 'حذاء رياضي نايك', price: 875000, category: 'Fashion', condition: 'used', imageSeed: 'shoes' },
  { name: 'ساعة يد كاجوال', price: 275000, category: 'Fashion', condition: 'new', imageSeed: 'watch' },
  { name: 'نظارة شمسية راي بان', price: 425000, category: 'Fashion', condition: 'new', imageSeed: 'glasses' }
];

const imageMap = {
  phone: 'https://picsum.photos/id/0/300/300',
  laptop: 'https://picsum.photos/id/1/300/300',
  headphones: 'https://picsum.photos/id/2/300/300',
  watch: 'https://picsum.photos/id/3/300/300',
  charger: 'https://picsum.photos/id/4/300/300',
  tablet: 'https://picsum.photos/id/5/300/300',
  camera: 'https://picsum.photos/id/6/300/300',
  speaker: 'https://picsum.photos/id/7/300/300',
  sofa: 'https://picsum.photos/id/8/300/300',
  dining: 'https://picsum.photos/id/9/300/300',
  wardrobe: 'https://picsum.photos/id/10/300/300',
  bed: 'https://picsum.photos/id/11/300/300',
  desk: 'https://picsum.photos/id/12/300/300',
  chair: 'https://picsum.photos/id/13/300/300',
  tshirt: 'https://picsum.photos/id/14/300/300',
  jeans: 'https://picsum.photos/id/15/300/300',
  dress: 'https://picsum.photos/id/16/300/300',
  shoes: 'https://picsum.photos/id/17/300/300',
  glasses: 'https://picsum.photos/id/18/300/300'
};

function generateDescription(name, price, condition) {
  const conditionText = condition === 'new' ? 'جديدة تماماً' : 'ممتازة';
  return `${name} بحالة ${conditionText}. السعر: ${price.toLocaleString()} ليرة سورية. مناسب للاستخدام اليومي. البيع لأعلى سعر.`;
}

function sellerSeed(index) {
  const padded = String(index + 1).padStart(2, '0');
  const phone = `0933${String(index + 1).padStart(7, '0')}`;
  const storeName = `${STORE_NAMES[index % STORE_NAMES.length]} ${padded}`;

  return {
    fullName: `تاجر ${padded}`,
    storeName,
    email: `tajer${padded}@marketplace.com`,
    phone,
    phoneNumber: phone,
    whatsapp: phone,
    region: REGION,
    profileDescription: `متجر ${storeName} يقدم أفضل المنتجات في ${REGION}.`
  };
}

function getProductImage(imageSeed) {
  return imageMap[imageSeed] || imageMap.phone;
}

function getRandomProduct(sellerId, sellerIndex, productIndex) {
  const productTemplate = PRODUCTS_DB[(sellerIndex * PRODUCTS_PER_SELLER + productIndex) % PRODUCTS_DB.length];
  const priceVariation = 0.8 + Math.random() * 0.6;
  const finalPrice = Math.floor((productTemplate.price * priceVariation) / 1000) * 1000;

  return {
    sellerId,
    name: productTemplate.name,
    description: generateDescription(productTemplate.name, finalPrice, productTemplate.condition),
    price: finalPrice,
    currency: CURRENCY,
    category: productTemplate.category,
    subcategory: null,
    tagsJson: JSON.stringify(['new', productTemplate.category.toLowerCase(), `seller-${sellerIndex + 1}`]),
    region: REGION,
    itemCondition: productTemplate.condition,
    quantity: 2 + Math.floor(Math.random() * 8),
    status: 'published',
    hasDeliveryService: Math.random() > 0.5,
    customFieldsJson: JSON.stringify({}),
    imageUrl: getProductImage(productTemplate.imageSeed)
  };
}

async function ensureNoExistingSeed(client) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM users
     WHERE full_name LIKE 'تاجر %'`
  );

  if ((result.rows[0]?.total || 0) > 0) {
    throw new Error('البيانات التجريبية موجودة مسبقًا. احذف بيانات التجار التجريبية أو أعد تهيئة القاعدة قبل إعادة التشغيل.');
  }
}

async function createSeller(client, seller, passwordHash) {
  const insertedUser = await client.query(
    `INSERT INTO users (
       full_name,
       email,
       phone,
       password_hash,
       role,
       store_name,
       region,
       profile_description,
       whatsapp,
       is_active,
       phone_number,
       verification_status
     )
     VALUES ($1, $2, $3, $4, 'seller', $5, $6, $7, $8, TRUE, $9, 'unverified')
     RETURNING id`,
    [
      seller.fullName,
      seller.email,
      seller.phone,
      passwordHash,
      seller.storeName,
      seller.region,
      seller.profileDescription,
      seller.whatsapp,
      seller.phoneNumber
    ]
  );

  const sellerId = insertedUser.rows[0].id;

  await client.query(
    `INSERT INTO seller_profiles (
       user_id,
       display_name,
       bio,
       total_products
     )
     VALUES ($1, $2, $3, $4)`,
    [sellerId, seller.storeName, seller.profileDescription, PRODUCTS_PER_SELLER]
  );

  return sellerId;
}

async function createProductsForSeller(client, sellerId, sellerIndex) {
  for (let productIndex = 0; productIndex < PRODUCTS_PER_SELLER; productIndex += 1) {
    const product = getRandomProduct(sellerId, sellerIndex, productIndex);

    const insertedProduct = await client.query(
      `INSERT INTO products (
         seller_id,
         name,
         description,
         price,
         currency,
         category,
         subcategory,
         tags_json,
         region,
         item_condition,
         quantity,
         status,
         has_delivery_service,
         custom_fields_json
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14::jsonb
       )
       RETURNING id`,
      [
        product.sellerId,
        product.name,
        product.description,
        product.price,
        product.currency,
        product.category,
        product.subcategory,
        product.tagsJson,
        product.region,
        product.itemCondition,
        product.quantity,
        product.status,
        product.hasDeliveryService,
        product.customFieldsJson
      ]
    );

    await client.query(
      `INSERT INTO product_images (
         product_id,
         image_url,
         sort_order
       )
       VALUES ($1, $2, 0)`,
      [insertedProduct.rows[0].id, product.imageUrl]
    );
  }
}

async function main() {
  await assertDatabaseReady();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await ensureNoExistingSeed(client);

    const passwordHash = bcrypt.hashSync(TEST_PASSWORD, 10);

    for (let sellerIndex = 0; sellerIndex < SELLER_COUNT; sellerIndex += 1) {
      const seller = sellerSeed(sellerIndex);
      const sellerId = await createSeller(client, seller, passwordHash);
      await createProductsForSeller(client, sellerId, sellerIndex);
    }

    await client.query('COMMIT');
    console.log(`تمت إضافة ${SELLER_COUNT} بائع و${SELLER_COUNT * PRODUCTS_PER_SELLER} منتج بنجاح.`);
    console.log(`كلمة المرور المشتركة للتجار: ${TEST_PASSWORD}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('فشل إدخال البيانات التجريبية:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
