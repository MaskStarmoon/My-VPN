// server.js (versi CommonJS)

const http = require("http");
const https = require("https");
const net = require("net");
const url = require("url");

const PORT = process.env.PORT || 8080;
const PROXY_TOKEN = process.env.PROXY_TOKEN || "my-secret-token";

function log(...msg) {
  console.log(new Date().toISOString(), ...msg);
}

const server = http.createServer((req, res) => {
  const clientToken = req.headers["x-proxy-token"];
  if (clientToken !== PROXY_TOKEN) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("Forbidden: invalid proxy token");
    return;
  }

  const parsedUrl = url.parse(req.url);
  const targetProtocol = parsedUrl.protocol === "https:" ? https : http;

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
    path: parsedUrl.path,
    method: req.method,
    headers: req.headers,
  };

  delete options.headers["x-proxy-token"];

  const proxyReq = targetProtocol.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on("error", (err) => {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("Proxy Error: " + err.message);
  });

  req.pipe(proxyReq, { end: true });
});

server.on("connect", (req, clientSocket, head) => {
  const clientToken = req.headers["x-proxy-token"];
  if (clientToken !== PROXY_TOKEN) {
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

  serverSocket.on("error", (err) => {
    log("HTTPS Proxy error:", err.message);
    clientSocket.destroy();
  });
});

server.listen(PORT, () => {
  log(`✅ Proxy server berjalan di port ${PORT}`);
  log(`Gunakan header: x-proxy-token: ${PROXY_TOKEN}`);
});
