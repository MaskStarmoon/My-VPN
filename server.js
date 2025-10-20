const http = require("http");
const https = require("https");
const net = require("net");
const url = require("url");

const PORT = process.env.PORT || 8080;
const PROXY_TOKEN = process.env.PROXY_TOKEN || "my-secret-token";

// Range IP per negara
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

// convert IP string to number
function ipToNumber(ip) {
  return ip.split(".").reduce((acc, oct) => acc * 256 + parseInt(oct), 0);
}

// convert number to IP string
function numberToIp(num) {
  return [
    (num >> 24) & 255,
    (num >> 16) & 255,
    (num >> 8) & 255,
    num & 255
  ].join(".");
}

// generate IP acak dari range
function randomIpFromRegion(region) {
  const ranges = REGION_RANGES[region];
  if (!ranges || ranges.length === 0) return null;
  const r = ranges[Math.floor(Math.random() * ranges.length)];
  const start = ipToNumber(r[0]);
  const end = ipToNumber(r[1]);
  const random = Math.floor(Math.random() * (end - start + 1)) + start;
  return numberToIp(random);
}

function log(...msg) { console.log(new Date().toISOString(), ...msg); }

const server = http.createServer((req, res) => {
  // token optional
  const clientToken = req.headers["x-proxy-token"];
  if (PROXY_TOKEN && clientToken !== PROXY_TOKEN) {
    res.writeHead(403, {"Content-Type":"text/plain"});
    res.end("Forbidden: invalid proxy token");
    return;
  }

  // ambil region dari query ?region=japan
  const parsedUrl = url.parse(req.url, true);
  let targetHost = parsedUrl.query.region ? randomIpFromRegion(parsedUrl.query.region) : parsedUrl.hostname;
  const targetPort = parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80);
  const targetProtocol = parsedUrl.protocol === "https:" ? https : http;

  const options = {
    hostname: targetHost,
    port: targetPort,
    path: parsedUrl.path,
    method: req.method,
    headers: req.headers
  };
  delete options.headers["x-proxy-token"];

  const proxyReq = targetProtocol.request(options, proxyRes => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", err => {
    res.writeHead(502, {"Content-Type":"text/plain"});
    res.end("Proxy Error: " + err.message);
  });

  req.pipe(proxyReq, { end: true });
});

// HTTPS CONNECT
server.on("connect", (req, clientSocket, head) => {
  const clientToken = req.headers["x-proxy-token"];
  if (PROXY_TOKEN && clientToken !== PROXY_TOKEN) {
    clientSocket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    clientSocket.destroy();
    return;
  }

  const [host, port] = req.url.split(":");
  const serverSocket = net.connect(port || 443, host, () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on("error", err => {
    log("HTTPS Proxy error:", err.message);
    clientSocket.destroy();
  });
});

server.listen(PORT, () => {
  log(`✅ Proxy server berjalan di port ${PORT}`);
  log("Gunakan header x-proxy-token jika diperlukan");
  log("Preset negara: japan / china / korea");
});
