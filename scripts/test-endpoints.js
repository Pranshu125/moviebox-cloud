const http = require('http');
const { handleRequest } = require('../server.js');

const srv = http.createServer(handleRequest);
srv.listen(0, '127.0.0.1', async () => {
  const port = srv.address().port;
  console.log('Test server listening on port', port);
  const endpoints = ['/manifest.json', '/api/state', '/api/network-info', '/', '/styles.css', '/app.js', '/sw.js'];
  for (const ep of endpoints) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + ep);
      console.log(ep, '=> Status:', res.status, 'Content-Type:', res.headers.get('content-type'));
    } catch (e) {
      console.error(ep, '=> Error:', e.message);
    }
  }
  srv.close(() => {
    process.exit(0);
  });
});
