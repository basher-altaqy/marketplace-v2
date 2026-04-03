require('dotenv').config();

const { pool } = require('../src/db/pool');
const { runDatabaseReset } = require('../src/services/bootstrap.service');

async function main() {
  const schemaOnly = process.argv.includes('--schema-only');
  await runDatabaseReset({ schemaOnly });
  console.log(
    schemaOnly
      ? 'Database reset and schema rebuild completed successfully.'
      : 'Database reset and bootstrap completed successfully.'
  );
}

main()
  .catch((error) => {
    console.error('Database reset failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
