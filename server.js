const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");

const { LOCATIONS, MENU, SLOTS, STAFF_ACCOUNTS } = require("./config");
const db = require("./database");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

// ---------- tiny helpers ----------
function genOrderId() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const l = letters[Math.floor(Math.random() * letters.length)];
  const n = Math.floor(100 + Math.random() * 900);
  return l + n;
}
function genSecureToken() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy(); // 1MB guard
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);
  // prevent path traversal outside /public
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Не найдено: " + pathname);
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  });
}

// ---------- request handler ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;
  const method = req.method;

  // CORS: needed whenever the frontend is hosted on a different origin than
  // this server (e.g. index.html on GitHub Pages, this server on Render).
  // "*" is fine here since there are no cookies/credentials involved — every
  // request carries its own staff code or order id instead of a session.
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  try {
    // ---- config (menu/locations/slots for the frontend) ----
    if (pathname === "/api/config" && method === "GET") {
      return sendJson(res, 200, { locations: LOCATIONS, menu: MENU, slots: SLOTS });
    }

    // ---- staff login ----
    if (pathname === "/api/staff/login" && method === "POST") {
      const body = await readBody(req);
      const code = (body.code || "").trim().toUpperCase();
      const account = STAFF_ACCOUNTS.find((a) => a.code === code);
      if (!account) return sendJson(res, 401, { error: "Код не найден" });
      return sendJson(res, 200, { name: account.name, location: account.location });
    }

    // ---- create order ----
    if (pathname === "/api/orders" && method === "POST") {
      const body = await readBody(req);
      if (!Array.isArray(body.items) || body.items.length === 0) {
        return sendJson(res, 400, { error: "Пустой заказ" });
      }
      if (!LOCATIONS.includes(body.location)) {
        return sendJson(res, 400, { error: "Неизвестная точка" });
      }
      const order = db.createOrder({
        id: genOrderId(),
        token: genSecureToken(),
        items: body.items,
        total: body.total,
        location: body.location,
        slotTime: body.slotTime,
        createdAt: Date.now(),
      });
      return sendJson(res, 201, order);
    }

    // ---- list orders (?location=...) ----
    if (pathname === "/api/orders" && method === "GET") {
      const location = url.searchParams.get("location") || undefined;
      return sendJson(res, 200, db.listOrders({ location }));
    }

    // ---- order actions: /api/orders/:id[/action] ----
    const m = pathname.match(/^\/api\/orders\/([A-Z0-9]+)(?:\/(accept|load|verify|deliver|force-deliver))?$/i);
    if (m) {
      const id = m[1].toUpperCase();
      const action = m[2];

      if (!action && method === "GET") {
        const order = db.getOrder(id);
        if (!order) return sendJson(res, 404, { error: "Заказ не найден" });
        return sendJson(res, 200, order);
      }

      if (action === "accept" && method === "POST") {
        const body = await readBody(req);
        const order = db.acceptOrder(id, { minutes: Number(body.minutes) || 10, staffName: body.staffName || "—" });
        return sendJson(res, 200, order);
      }

      if (action === "load" && method === "POST") {
        const body = await readBody(req);
        const order = db.loadIntoLocker(id, { zone: body.zone, tray: body.tray, staffName: body.staffName || "—" });
        return sendJson(res, 200, order);
      }

      // Read-only check — does NOT redeem the order. Lets staff preview what
      // a scanned QR resolves to before committing to hand the food over.
      if (action === "verify" && method === "POST") {
        const body = await readBody(req);
        const result = db.verifyQrToken(id, body.token || "");
        return sendJson(res, 200, result); // { ok: true, order } or { ok: false, error }
      }

      // The real redemption. Token is required and checked atomically inside
      // the UPDATE itself — this is the actual trust boundary, not /verify.
      if (action === "deliver" && method === "POST") {
        const body = await readBody(req);
        if (!body.token) return sendJson(res, 400, { error: "Нужен token" });
        const result = db.deliverOrder(id, { by: body.by || "—", token: body.token });
        if (!result.ok) return sendJson(res, 409, { error: result.error });
        return sendJson(res, 200, result.order);
      }

      // Supervised bypass for staff — no token needed, only reachable from
      // the logged-in staff dashboard's manual-override button.
      if (action === "force-deliver" && method === "POST") {
        const body = await readBody(req);
        const { changed, order } = db.forceDeliverOrder(id, { by: body.by || "—" });
        if (!changed) return sendJson(res, 409, { error: "Уже выдан — второй раз получить нельзя" });
        return sendJson(res, 200, order);
      }
    }

    // ---- static frontend ----
    if (method === "GET") {
      return serveStatic(req, res, pathname);
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: "Server error", detail: String(err.message || err) });
  }
});

server.listen(PORT, () => {
  console.log(`Bite&Go server running: http://localhost:${PORT}`);
});
