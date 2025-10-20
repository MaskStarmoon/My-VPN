// server.js
const http = require("http");
const https = require("https");
const net = require("net");
const url = require("url");

const PORT = process.env.PORT || 20045;

// Range IP per negara (pakai daftar yang kamu berikan)
const REGION_RANGES = {
  japan: [
    ["43.0.0.0", "43.223.255.255"],
    ["60.79.0.0", "60.83.75.255"],
    ["52.196.0.0", "52.199.255.255"],
    ["13.112.0.0", "13.115.255.255"],
    ["202.0.0.0", "202.255.255.255"],
    ["133.0.0.0", "133.255.255.255"],
    ["150.0.0.0", "150.255.255.255"]
  ],
  china: [
    ["101.0.0.0", "101.255.255.255"],
    ["103.0.0.0", "103.255.255.255"],
    ["106.0.0.0", "106.255.255.255"],
    ["110.0.0.0", "110.255.255.255"],
    ["111.0.0.0", "111.255.255.255"],
    ["112.0.0.0", "112.255.255.255"],
    ["113.0.0.0", "113.255.255.255"],
    ["114.0.0.0", "114.255.255.255"],
    ["115.0.0.0", "115.255.255.255"],
    ["116.0.0.0", "116.255.255.255"],
    ["117.0.0.0", "117.255.255.255"],
    ["118.0.0.0", "118.255.255.255"],
    ["119.0.0.0", "119.255.255.255"],
    ["120.0.0.0", "120.255.255.255"],
    ["121.0.0.0", "121.255.255.255"],
    ["122.0.0.0", "122.255.255.255"],
    ["123.0.0.0", "123.255.255.255"],
    ["124.0.0.0", "124.255.255.255"],
    ["125.0.0.0", "125.255.255.255"],
    ["126.0.0.0", "126.255.255.255"],
    ["175.0.0.0", "175.255.255.255"],
    ["180.0.0.0", "180.255.255.255"],
    ["182.0.0.0", "182.255.255.255"],
    ["183.0.0.0", "183.255.255.255"],
    ["202.0.0.0", "202.255.255.255"],
    ["203.0.0.0", "203.255.255.255"],
    ["210.0.0.0", "210.255.255.255"],
    ["211.0.0.0", "211.255.255.255"],
    ["218.0.0.0", "218.255.255.255"],
    ["219.0.0.0", "219.255.255.255"],
    ["220.0.0.0", "220.255.255.255"],
    ["221.0.0.0", "221.255.255.255"],
    ["222.0.0.0", "222.255.255.255"],
    ["223.0.0.0", "223.255.255.255"]
  ],
  korea: [
    ["1.11.0.0","1.11.255.255"],
    ["1.16.0.0","1.19.255.255"],
    ["1.96.0.0","1.111.255.255"],
    ["1.176.0.0","1.177.255.255"],
    ["1.201.0.0","1.201.255.255"],
    ["1.208.0.0","1.223.255.255"],
    ["1.224.0.0","1.255.255.255"],
    ["14.0.32.0","14.0.63.255"],
    ["14.0.64.0","14.0.127.255"],
    ["14.4.0.0","14.7.255.255"]
  ]
};

// helper konversi IP <-> number
function ipToNumber(ip) {
  return ip.split(".").reduce((acc, oct) => acc * 256 + parseInt(oct, 10), 0) >>> 0;
}
function numberToIp(num) {
  return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255].join(".");
}

function randomIpFromRegion(region) {
  const ranges = REGION_RANGES[region];
  if (!ranges || !ranges.length) return null;
  const r = ranges[Math.floor(Math.random() * ranges.length)];
  const start = ipToNumber(r[0]);
  const end = ipToNumber(r[1]);
  const n = Math.floor(Math.random() * (end - start + 1)) + start;
  return numberToIp(n);
}

function log(...s) { console.log(new Date().toISOString(), ...s); }

const server = http.createServer((req, res) => {
  // parse url dan query
  const parsed = url.parse(req.url, true);

  // jika tidak ada host di url (biasanya browser proxy), kita harus ambil target dari req.headers.host
  // namun di forward proxy request, req.url biasanya berisi full URL (http://host/...), jadi parsed.hostname ok.
  // Tujuan: tentukan targetHost & targetPort
  let targetHost = parsed.hostname || parsed.host || req.headers['host'];
  let targetPort = parsed.port || (parsed.protocol === 'https:' ? 443 : 80);

  // jika frontend mengirim ?region=..., kita pilih IP palsu dan sisipkan header
  const region = parsed.query && parsed.query.region;
  let fakeIp = null;
  if (region) {
    fakeIp = randomIpFromRegion(region);
  }

  // Jika parsed.pathname = '/' dan tidak ada targetHost nyata (mis. pemanggilan ke root proxy),
  // kita bisa jadikan server merespon sendiri (diagnostic)
  if (!targetHost || targetHost === `127.0.0.1:${PORT}` || targetHost.includes(`:${PORT}`) ) {
    // untuk akses langsung ke proxy root, tampilkan info
    res.writeHead(200, {'Content-Type':'text/plain'});
    return res.end(`Proxy running. Use as forward proxy or call with ?region=japan\nFake IP example: ${fakeIp||'none'}`);
  }

  // siapkan opsi forward; jika parsed.href berisi full URL, gunakan parsed.protocol
  const protocol = parsed.protocol === 'https:' ? https : http;

  // clone headers, tapi jangan teruskan some hop-by-hop headers
  const headers = Object.assign({}, req.headers);
  delete headers['proxy-connection'];
  delete headers['connection'];
  delete headers['keep-alive'];
  delete headers['transfer-encoding'];
  delete headers['upgrade'];

  // sisipkan header IP palsu kalau ada region
  if (fakeIp) {
    // jika ada X-Forwarded-For yang lama, append, kalau tidak buat baru
    const prev = headers['x-forwarded-for'] || headers['X-Forwarded-For'];
    headers['x-forwarded-for'] = prev ? `${prev}, ${fakeIp}` : fakeIp;
    headers['x-client-ip'] = fakeIp;
    headers['x-geo-region'] = region;
    headers['via'] = (headers['via'] ? headers['via'] + ', ' : '') + `fake-proxy/${PORT}`;
  }

  const options = {
    hostname: targetHost.split(':')[0],
    port: targetPort || (protocol === https ? 443 : 80),
    path: parsed.path || parsed.pathname || '/',
    method: req.method,
    headers: headers
  };

  // buat request ke target
  const proxyReq = protocol.request(options, (proxyRes) => {
    // salin headers balik ke client
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    log('Proxy request error', err.message);
    res.writeHead(502, {'Content-Type':'text/plain'});
    res.end('Proxy Error: ' + err.message);
  });

  req.pipe(proxyReq, { end: true });
});

server.on('connect', (req, clientSocket, head) => {
  // CONNECT: buat tunnel TCP, kita *tidak bisa* menyisip header palsu ke target karena seluruh TLS terenkripsi
  const [host, port] = req.url.split(':');
  const serverSocket = net.connect(port || 443, host, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head && head.length) serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on('error', (err) => {
    log('CONNECT error', err.message);
    clientSocket.end();
  });
});

server.listen(PORT, () => {
  log(`Proxy server berjalan di port ${PORT}`);
  log('Preset region tersedia:', Object.keys(REGION_RANGES).join(', '));
});
