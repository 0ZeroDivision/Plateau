
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT ? Number(process.env.PORT) : 5173;
const ROOT = path.resolve(__dirname, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3":  "audio/mpeg",
  ".wav":  "audio/wav",
  ".ogg":  "audio/ogg",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
  ".txt":  "text/plain; charset=utf-8",
};

const safeJoin = (root, requested) => {
  const decoded = decodeURIComponent(requested.split("?")[0]);
  const resolved = path.resolve(root, "." + decoded);
  if (!resolved.startsWith(root)) return null;
  return resolved;
};

const server = http.createServer((req, res) => {
  let urlPath = req.url;
  if (urlPath === "/" || urlPath === "") urlPath = "/index.html";

  const filePath = safeJoin(ROOT, urlPath);
  if (!filePath) { res.writeHead(403); return res.end("Forbidden"); }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      return res.end("Not found: " + urlPath);
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    const total = stat.size;
    const range = req.headers.range;

    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        const start = m[1] ? parseInt(m[1], 10) : 0;
        const end   = m[2] ? parseInt(m[2], 10) : total - 1;
        if (start >= total || end >= total || start > end) {
          res.writeHead(416, { "Content-Range": `bytes */${total}` });
          return res.end();
        }
        res.writeHead(206, {
          "Content-Type": type,
          "Content-Length": end - start + 1,
          "Content-Range": `bytes ${start}-${end}/${total}`,
          "Accept-Ranges": "bytes",
          "Cache-Control": "no-cache",
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }

    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": total,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Local Plateau Player: http://localhost:${PORT}`);
  console.log(`Serving files from:        ${ROOT}`);
});
