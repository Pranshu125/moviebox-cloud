const requestHandler = require('../server.js');

module.exports = async (req, res) => {
  try {
    return await requestHandler(req, res);
  } catch (err) {
    console.error('[MovieBox API Error]:', err?.message || err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: false, error: err?.message || String(err) }));
    }
  }
};
