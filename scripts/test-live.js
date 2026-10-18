async function test() {
  const urls = [
    'http://localhost:3456/',
    'http://localhost:3456/manifest.json',
    'http://localhost:3456/sw.js',
    'http://localhost:3456/api/state',
    'http://localhost:3456/api/network-info',
    'http://localhost:3456/api/moviebox/home'
  ];
  for (const u of urls) {
    try {
      const res = await fetch(u);
      console.log(u, '=> Status:', res.status);
    } catch (err) {
      console.error(u, '=> Error:', err.message);
    }
  }
}
test();
