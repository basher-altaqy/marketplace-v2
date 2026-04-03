require('dotenv').config();

const { pool } = require('../src/db/pool');
const { runDatabaseBootstrap } = require('../src/services/bootstrap.service');

async function main() {
  const schemaOnly = process.argv.includes('--schema-only');
  await runDatabaseBootstrap({ schemaOnly });
  console.log(schemaOnly ? 'Database schema applied successfully.' : 'Database bootstrap completed successfully.');
}

main()
  .catch((error) => {
    console.error('Database bootstrap failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
