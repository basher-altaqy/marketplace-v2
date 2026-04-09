require('dotenv').config();

const bcrypt = require('bcryptjs');
const { pool } = require('../src/db/pool');
const { assertDatabaseReady } = require('../src/services/bootstrap.service');

const SELLER_COUNT = 3;
const PRODUCTS_PER_SELLER = 15;
const TEST_PASSWORD = 'Seller12345';
const REGION = 'Damascus';
const CURRENCY = 'SYP';
const CATEGORIES = ['Electronics', 'Furniture', 'Fashion'];
const CONDITIONS = ['new', 'used'];

function sellerSeed(index) {
  const padded = String(index + 1).padStart(2, '0');
  const phone = `9665500000${index + 1}`;

  return {
    fullName: `Test Seller ${padded}`,
    storeName: `Test Store ${padded}`,
    email: `testseller${padded}@example.com`,
    phone,
    phoneNumber: phone,
    whatsapp: phone,
    region: REGION,
    profileDescription: `Demo seller profile ${padded} for marketplace testing.`
  };
}

function productSeed(sellerId, sellerIndex, productIndex) {
  const number = sellerIndex * PRODUCTS_PER_SELLER + productIndex + 1;
  const padded = String(number).padStart(3, '0');

  return {
    sellerId,
    name: `Test Product ${padded}`,
    description: `Demo description for product ${padded}.`,
    price: Number((25000 + number * 1750).toFixed(2)),
    currency: CURRENCY,
    category: CATEGORIES[(number - 1) % CATEGORIES.length],
    subcategory: null,
    tagsJson: JSON.stringify(['test', 'seed', `seller-${sellerIndex + 1}`]),
    region: REGION,
    itemCondition: CONDITIONS[(number - 1) % CONDITIONS.length],
    quantity: 3 + ((number - 1) % 5),
    status: 'published',
    hasDeliveryService: number % 2 === 0,
    customFieldsJson: JSON.stringify({})
  };
}

async function ensureNoExistingSeed(client) {
  const result = await client.query(
    `SELECT COUNT(*)::int AS total
     FROM users
     WHERE full_name LIKE 'Test Seller %'`
  );

  if ((result.rows[0]?.total || 0) > 0) {
    throw new Error('Seed data already exists. Reset the database or remove test sellers before re-running.');
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
    const product = productSeed(sellerId, sellerIndex, productIndex);

    await client.query(
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
       )`,
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
    console.log(`Seeded ${SELLER_COUNT} sellers and ${SELLER_COUNT * PRODUCTS_PER_SELLER} published products successfully.`);
    console.log(`Shared test password: ${TEST_PASSWORD}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Product seed failed:', error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
