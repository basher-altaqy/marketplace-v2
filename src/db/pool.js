const { Pool } = require('pg');
const { DATABASE_URL, DB_SSL } = require('../config/env');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DB_SSL ? { rejectUnauthorized: false } : false
});

async function query(text, params = []) {
  return pool.query(text, params);
}

module.exports = { pool, query };
