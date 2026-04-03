require('dotenv').config();
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const DATABASE_URL = process.env.DATABASE_URL;
const DB_SSL = process.env.DB_SSL === 'true';
const VERIFICATION_ENABLED = process.env.VERIFICATION_ENABLED !== 'false';
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required in environment variables.');
}

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

module.exports = {
  ROOT_DIR,
  PORT,
  NODE_ENV,
  JWT_SECRET,
  DATABASE_URL,
  DB_SSL,
  VERIFICATION_ENABLED,
  UPLOADS_DIR,
  PUBLIC_DIR
};
