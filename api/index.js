const { handleRequest } = require('../server.js');

module.exports = async (req, res) => {
  try {
    return await handleRequest(req, res);
  } catch (err) {
    console.error('[MovieBox Vercel Serverless Error]:', err?.message || err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        ok: false,
        error: 'Serverless Function Error',
        message: err?.message || String(err)
      }));
    }
  }
};
