const config = require('./playwright.config');
module.exports = {
  ...config,
  webServer: {
    ...config.webServer,
    command: 'exec python3 -m http.server 8010 --directory _site',
  },
};
