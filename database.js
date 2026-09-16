const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const db = new DatabaseSync(path.join(__dirname, "bitego.db"));

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id            TEXT PRIMARY KEY,
    token         TEXT NOT NULL,
    items_json    TEXT NOT NULL,
    total         INTEGER NOT NULL,
    location      TEXT NOT NULL,
    slot          TEXT NOT NULL,
    status        TEXT NOT NULL DEFAULT 'paid',
    created_at    INTEGER NOT NULL,
    prep_minutes  INTEGER,
    ready_at      INTEGER,
    accepted_by   TEXT,
    zone          TEXT,
    tray          INTEGER,
    loaded_by     TEXT,
    delivered_by  TEXT
  )
`);

// ---- row <-> API object mapping (snake_case in SQL, camelCase in JS/JSON) ----
function rowToOrder(row) {
  if (!row) return null;
  return {
    id: row.id,
    token: row.token,
    items: JSON.parse(row.items_json),
    total: row.total,
    location: row.location,
    slotTime: row.slot,
    status: row.status,
    createdAt: row.created_at,
    prepMinutes: row.prep_minutes,
    readyAt: row.ready_at,
    acceptedBy: row.accepted_by,
    zone: row.zone,
    tray: row.tray,
    loadedBy: row.loaded_by,
    deliveredBy: row.delivered_by,
  };
}

function createOrder(order) {
  const stmt = db.prepare(`
    INSERT INTO orders (id, token, items_json, total, location, slot, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'paid', ?)
  `);
  stmt.run(
    order.id,
    order.token,
    JSON.stringify(order.items),
    order.total,
    order.location,
    order.slotTime,
    order.createdAt
  );
  return getOrder(order.id);
}

function listOrders({ location } = {}) {
  const rows = location
    ? db.prepare(`SELECT * FROM orders WHERE location = ? ORDER BY created_at ASC`).all(location)
    : db.prepare(`SELECT * FROM orders ORDER BY created_at ASC`).all();
  return rows.map(rowToOrder);
}

function getOrder(id) {
  const row = db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id);
  return rowToOrder(row);
}

function acceptOrder(id, { minutes, staffName }) {
  const readyAt = Date.now() + minutes * 60000;
  db.prepare(`
    UPDATE orders SET status='accepted', prep_minutes=?, ready_at=?, accepted_by=?
    WHERE id=? AND status='paid'
  `).run(minutes, readyAt, staffName, id);
  return getOrder(id);
}

function loadIntoLocker(id, { zone, tray, staffName }) {
  db.prepare(`
    UPDATE orders SET status='ready', zone=?, tray=?, loaded_by=?
    WHERE id=? AND status='accepted'
  `).run(zone, tray, staffName, id);
  return getOrder(id);
}

// Read-only check: is this (id, token) pair a valid, not-yet-redeemed order?
// Used by the staff "scan" step to preview an order before handing it over.
function verifyQrToken(id, token) {
  const order = getOrder(id);
  if (!order) return { ok: false, error: "Заказ не найден" };
  if (order.token !== token) return { ok: false, error: "Неверный QR-код" };
  if (order.status === "delivered") return { ok: false, error: "QR уже использован" };
  if (order.status !== "ready") return { ok: false, error: "Заказ ещё не готов к выдаче" };
  return { ok: true, order };
}

// The real security boundary: token + status are checked INSIDE the WHERE
// clause, atomically with the write. No separate "check, then act" — two
// simultaneous requests for the same order can't both succeed.
function deliverOrder(id, { by, token }) {
  const result = db.prepare(`
    UPDATE orders SET status='delivered', delivered_by=?
    WHERE id=? AND token=? AND status='ready'
  `).run(by, id, token);

  if (result.changes === 0) {
    // Nothing updated — figure out *why*, so the caller gets a precise error.
    const order = getOrder(id);
    if (!order) return { ok: false, error: "Заказ не найден" };
    if (order.token !== token) return { ok: false, error: "Неверный QR-код" };
    if (order.status === "delivered") return { ok: false, error: "QR уже использован" };
    return { ok: false, error: "Заказ ещё не готов к выдаче" };
  }
  return { ok: true, order: getOrder(id) };
}

// Supervised bypass for when the QR/token flow can't complete (dead phone,
// camera won't scan, etc). Deliberately does NOT check the token — the
// safeguard here is that only a logged-in staff member reaches this button.
function forceDeliverOrder(id, { by }) {
  const result = db.prepare(`
    UPDATE orders SET status='delivered', delivered_by=?
    WHERE id=? AND status != 'delivered'
  `).run(by, id);
  return { changed: result.changes > 0, order: getOrder(id) };
}

module.exports = {
  createOrder,
  listOrders,
  getOrder,
  acceptOrder,
  loadIntoLocker,
  verifyQrToken,
  deliverOrder,
  forceDeliverOrder,
};
