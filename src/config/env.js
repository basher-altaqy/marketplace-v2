require('dotenv').config();
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'development';
const JWT_SECRET = String(process.env.JWT_SECRET || '').trim();
const DATABASE_URL = process.env.DATABASE_URL;
const DB_SSL = process.env.DB_SSL === 'true';
const VERIFICATION_ENABLED = process.env.VERIFICATION_ENABLED !== 'false';
const POLL_SINCE_MAX_DAYS = Math.max(1, Number.parseInt(process.env.POLL_SINCE_MAX_DAYS || '30', 10) || 30);
const POLL_RETRY_AFTER_SECONDS = Math.max(0, Number.parseInt(process.env.POLL_RETRY_AFTER_SECONDS || '0', 10) || 0);
const POLL_DEBUG_LOGS = process.env.POLL_DEBUG_LOGS === 'true';
const WEB_PUSH_ENABLED = process.env.WEB_PUSH_ENABLED === 'true';
const VAPID_PUBLIC_KEY = String(process.env.VAPID_PUBLIC_KEY || '').trim();
const VAPID_PRIVATE_KEY = String(process.env.VAPID_PRIVATE_KEY || '').trim();
const VAPID_SUBJECT = String(process.env.VAPID_SUBJECT || '').trim();
const PUSH_METRICS_WINDOW_HOURS = Math.max(1, Number.parseInt(process.env.PUSH_METRICS_WINDOW_HOURS || '24', 10) || 24);
const UPLOADS_DIR = path.join(ROOT_DIR, 'uploads');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is required in environment variables.');
}

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET is required and must be at least 32 characters.');
}

if (['change-this-secret-in-production', 'fallback-secret-do-not-use', 'changeme', '123456'].includes(JWT_SECRET.toLowerCase())) {
  throw new Error('JWT_SECRET is insecure. Please set a strong random secret.');
}

if (WEB_PUSH_ENABLED && (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT)) {
  throw new Error('WEB_PUSH_ENABLED is true but VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, or VAPID_SUBJECT is missing.');
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
  POLL_SINCE_MAX_DAYS,
  POLL_RETRY_AFTER_SECONDS,
  POLL_DEBUG_LOGS,
  WEB_PUSH_ENABLED,
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT,
  PUSH_METRICS_WINDOW_HOURS,
  UPLOADS_DIR,
  PUBLIC_DIR
};
