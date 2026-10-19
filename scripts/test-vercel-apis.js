const http = require('http');
const { handleRequest } = require('../server.js');

async function testEndpoint(urlStr, headers = {}) {
  return new Promise((resolve) => {
    const req = new http.IncomingMessage();
    req.url = urlStr;
    req.method = 'GET';
    req.headers = { host: 'moviebox.vercel.app', 'x-forwarded-proto': 'https', ...headers };

    let statusCode = 200;
    let responseHeaders = {};
    let body = '';

    const res = {
      statusCode: 200,
      setHeader: (k, v) => { responseHeaders[k.toLowerCase()] = v; },
      writeHead: (code, hdrs) => {
        statusCode = code;
        if (hdrs) Object.assign(responseHeaders, hdrs);
      },
      write: (chunk) => { body += chunk; },
      end: (chunk) => {
        if (chunk) body += chunk;
        resolve({ statusCode, headers: responseHeaders, body });
      }
    };

    handleRequest(req, res).catch(err => {
      resolve({ statusCode: 500, error: err.message, body });
    });
  });
}

(async () => {
  console.log('Testing Vercel simulated requests...\n');
  
  // Test 1: Vercel rewrite with __api_path for /api/moviebox/home
  const resHome = await testEndpoint('/api/index.js?__api_path=moviebox/home');
  console.log('1. /api/moviebox/home:', resHome.statusCode, 'Body length:', resHome.body?.length);
  try {
    const json = JSON.parse(resHome.body);
    console.log('   Home parsed ok. Featured count:', json.featured?.length || 0, 'Rails count:', json.rails?.length || 0);
  } catch (e) {
    console.log('   Home parse error:', e.message, resHome.body?.slice(0, 200));
  }

  // Test 2: Gaiaflix channels
  const resGaia = await testEndpoint('/api/index.js?__api_path=gaiaflix/channels');
  console.log('2. /api/gaiaflix/channels:', resGaia.statusCode, 'Body length:', resGaia.body?.length);
  try {
    const json = JSON.parse(resGaia.body);
    console.log('   Gaia parsed ok. Channels count:', json.channels?.length || 0);
  } catch (e) {
    console.log('   Gaia parse error:', e.message, resGaia.body?.slice(0, 200));
  }

  // Test 3: NetMirror catalog
  const resNet = await testEndpoint('/api/index.js?__api_path=netmirror/catalog');
  console.log('3. /api/netmirror/catalog:', resNet.statusCode, 'Body length:', resNet.body?.length);
  try {
    const json = JSON.parse(resNet.body);
    console.log('   NetMirror parsed ok. Items count:', json.items?.length || 0);
  } catch (e) {
    console.log('   NetMirror parse error:', e.message, resNet.body?.slice(0, 200));
  }

  // Test 4: MovieBox search
  const resSearch = await testEndpoint('/api/index.js?__api_path=moviebox/search&q=batman');
  console.log('4. /api/moviebox/search?q=batman:', resSearch.statusCode, 'Body length:', resSearch.body?.length);
  try {
    const json = JSON.parse(resSearch.body);
    console.log('   Search parsed ok. Results:', json.results?.length || 0);
  } catch (e) {
    console.log('   Search parse error:', e.message, resSearch.body?.slice(0, 200));
  }

  // Test 5: Gaiaflix player embed
  const resPlayer = await testEndpoint('/api/index.js?__api_path=gaiaflix/player&stream=' + encodeURIComponent('https://example.com/stream'));
  console.log('5. /api/gaiaflix/player:', resPlayer.statusCode, 'Body length:', resPlayer.body?.length);

  process.exit(0);
})();
