const config = require('./playwright.config');
module.exports = {
  ...config,
  webServer: {
    ...config.webServer,
    command: 'exec python3 scripts/serve.py --port 8010 --directory _site',
  },
};
