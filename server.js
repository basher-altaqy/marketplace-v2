require('dotenv').config();
const { PORT } = require('./src/config/env');
const { createApp, prepareApp } = require('./src/app');

global.__appStartedAt = new Date();

(async () => {
  try {
    await prepareApp();
    const app = createApp();
    app.listen(PORT, () => {
      console.log(`Marketplace Modular v1 running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start app:', error);
    process.exit(1);
  }
})();
