require('dotenv').config();

const { seedDatabase } = require('../src/services/marketplace.service');
const { assertDatabaseReady } = require('../src/services/bootstrap.service');
const { pool } = require('../src/db/pool');

async function main() {
  try {
    await assertDatabaseReady();
    await seedDatabase();
    console.log('تم تفعيل المنتجات التجريبية العربية بنجاح.');
  } catch (error) {
    console.error('فشل تفعيل المنتجات التجريبية العربية:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
