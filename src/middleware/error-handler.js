const multer = require('multer');
const { logSystemEvent } = require('../services/platform.service');
const { NODE_ENV } = require('../config/env');

async function errorHandler(err, req, res, _next) {
  console.error(err);
  await logSystemEvent('error', 'server', err.message || 'Internal server error', {
    path: req?.path,
    method: req?.method,
    stack: err?.stack
  }, req?.user?.id || req?.admin?.id || null);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }

  const safeMessage = NODE_ENV === 'production'
    ? 'Internal server error.'
    : (err.message || 'Internal server error.');

  return res.status(500).json({ error: safeMessage });
}

module.exports = { errorHandler };
