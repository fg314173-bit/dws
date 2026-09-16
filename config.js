// Central config — later this can move into the database (an admin panel would edit it).
// For now it's a plain JS file so it's easy to read and change by hand.

const LOCATIONS = [
  "Точка А — 1 этаж, главный вход",
  "Точка Б — 3 этаж, у лифтов",
  "Точка В — библиотека",
  "Точка Г — общежитие №2",
];

const MENU = [
  { id: "m1", name: "Круассан", price: 700, desc: "Сливочный, тёплый" },
  { id: "m2", name: "Самса", price: 600, desc: "С мясом, горячая" },
  { id: "m3", name: "Сэндвич с курицей", price: 1200, desc: "Свежий, сытный" },
  { id: "m4", name: "Хот-дог", price: 900, desc: "Классический" },
  { id: "m5", name: "Пирожок с картошкой", price: 500, desc: "Домашний" },
  { id: "m6", name: "Булочка с корицей", price: 650, desc: "С карамелью" },
  { id: "m7", name: "Чай", price: 300, desc: "Чёрный или зелёный" },
  { id: "m8", name: "Кофе американо", price: 600, desc: "Свежесваренный" },
  { id: "m9", name: "Сок", price: 500, desc: "Апельсиновый" },
  { id: "m10", name: "Вода", price: 250, desc: "Негазированная" },
];

const SLOTS = [
  { id: "s1", time: "10:30–10:45" },
  { id: "s2", time: "12:30–12:45" },
  { id: "s3", time: "14:30–14:45" },
];

// Demo staff accounts. In production: move to a `staff` table, store a hashed
// code (bcrypt/argon2), never plain text, and let an admin create/revoke them.
const STAFF_ACCOUNTS = [
  { name: "Алия",    code: "AL7K2XQ9", location: LOCATIONS[0] },
  { name: "Данияр",  code: "DN4P8WZ1", location: LOCATIONS[0] },
  { name: "Ерлан",   code: "ER3M6TC5", location: LOCATIONS[1] },
  { name: "Жанна",   code: "ZH9L2VB7", location: LOCATIONS[1] },
  { name: "Санжар",  code: "SJ5Q1KX8", location: LOCATIONS[2] },
  { name: "Айгерим", code: "AG8R4NP2", location: LOCATIONS[2] },
  { name: "Тимур",   code: "TM2C7YQ4", location: LOCATIONS[3] },
  { name: "Дина",    code: "DN6X3LK9", location: LOCATIONS[3] },
];

const TRAYS = [1, 2, 3];

module.exports = { LOCATIONS, MENU, SLOTS, STAFF_ACCOUNTS, TRAYS };
