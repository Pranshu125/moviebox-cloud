const { handleRequest } = require('../server.js');

module.exports = async (req, res) => {
  // Polyfill writeHead and status for serverless compatibility
  if (res && typeof res.writeHead !== 'function') {
    res.writeHead = function(statusCode, headers) {
      res.statusCode = statusCode;
      if (headers && typeof headers === 'object') {
        for (const [k, v] of Object.entries(headers)) {
          try { res.setHeader(k, v); } catch {}
        }
      }
      return res;
    };
  }
  if (res && typeof res.status !== 'function') {
    res.status = function(code) {
      res.statusCode = code;
      return res;
    };
  }

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
