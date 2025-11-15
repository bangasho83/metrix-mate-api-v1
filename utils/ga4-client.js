const { BetaAnalyticsDataClient } = require('@google-analytics/data');

function initializeGa4Client() {
  const client = new BetaAnalyticsDataClient({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }
  });

  return client;
}

module.exports = {
  initializeGa4Client
};
