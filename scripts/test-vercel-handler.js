const http = require('http');
const vercelHandler = require('../api/index.js');

const srv = http.createServer((req, res) => {
  vercelHandler(req, res);
});

srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  console.log('Testing Vercel serverless handler on port', port);
  const endpoints = ['/api/state', '/api/network-info', '/api/moviebox/home'];
  for (const ep of endpoints) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + ep);
      console.log(ep, '=> Status:', res.status, 'Type:', res.headers.get('content-type'));
    } catch (e) {
      console.error(ep, '=> Error:', e.message);
    }
  }
  srv.close(() => process.exit(0));
});
