// Ancien CRM SYNTHÉTIQUE pour les tests d'acceptation : une vraie base SQLite, structure différente
// de Relatio 2004 (tables et colonnes en anglais, montants en nombres flottants, vraies clés
// étrangères, valeurs vides). Données fictives, générées de façon déterministe.
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";

export const COUNTS = { customers: 100, leads: 50, products: 30, quotes: 40, invoices: 20 };

export function makeLegacyCrm(file) {
  fs.rmSync(file, { force: true });
  const db = new DatabaseSync(file);
  let seed = 42;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const r2 = (x) => Math.round(x * 100) / 100;
  const day = (i) => new Date(Date.UTC(2019, 0, 1) + i * 86400000 * 7).toISOString().slice(0, 10);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE customers (customer_id INTEGER PRIMARY KEY, company TEXT NOT NULL, contact_name TEXT, email TEXT, phone TEXT, city TEXT, segment TEXT, created_on TEXT);
    CREATE TABLE leads (lead_id INTEGER PRIMARY KEY, company TEXT NOT NULL, contact_name TEXT, email TEXT, stage TEXT, source TEXT, created_on TEXT);
    CREATE TABLE products (product_id INTEGER PRIMARY KEY, sku TEXT UNIQUE NOT NULL, label TEXT NOT NULL, unit_price REAL NOT NULL, vat_rate REAL NOT NULL, active INTEGER NOT NULL);
    CREATE TABLE quotes (quote_id INTEGER PRIMARY KEY, quote_number TEXT UNIQUE NOT NULL, customer_id INTEGER NOT NULL REFERENCES customers(customer_id), quote_date TEXT, status TEXT, total_excl_tax REAL);
    CREATE TABLE quote_lines (line_id INTEGER PRIMARY KEY, quote_id INTEGER NOT NULL REFERENCES quotes(quote_id), product_id INTEGER NOT NULL REFERENCES products(product_id), quantity INTEGER NOT NULL, unit_price REAL NOT NULL, line_total REAL NOT NULL);
    CREATE TABLE invoices (invoice_id INTEGER PRIMARY KEY, invoice_number TEXT UNIQUE NOT NULL, customer_id INTEGER NOT NULL REFERENCES customers(customer_id), quote_id INTEGER REFERENCES quotes(quote_id), invoice_date TEXT, amount_excl_tax REAL, vat_amount REAL, amount_incl_tax REAL, paid INTEGER);
  `);
  const NAMES = ["Martin", "Bernard", "Petit", "Durand", "Leroy", "Moreau", "Simon", "Laurent", "Michel", "Garcia"];
  db.exec("BEGIN");
  const c = db.prepare("INSERT INTO customers VALUES (?,?,?,?,?,?,?,?)");
  for (let i = 1; i <= COUNTS.customers; i++) c.run(i, `Société ${NAMES[i % 10]} ${i}`, `${pick(["Anne", "Paul", "Léa", "Hugo"])} ${NAMES[(i * 3) % 10]}`, i % 9 === 0 ? null : `contact${i}@client${i}.fr`, `04 7${i % 10} 00 ${String(i).padStart(2, "0")} 00`, pick(["Lyon", "Nantes", "Lille", "Rennes"]), pick(["SMB", "ENT", "PUB"]), day(i));
  const l = db.prepare("INSERT INTO leads VALUES (?,?,?,?,?,?,?)");
  for (let i = 1; i <= COUNTS.leads; i++) l.run(i, `Prospect ${NAMES[i % 10]} ${i}`, `Contact ${i}`, i % 7 === 0 ? null : `lead${i}@prospect${i}.fr`, pick(["new", "contacted", "qualified", "lost"]), pick(["salon", "web", "parrainage"]), day(200 + i));
  const p = db.prepare("INSERT INTO products VALUES (?,?,?,?,?,?)");
  const prices = [];
  for (let i = 1; i <= COUNTS.products; i++) {
    prices[i] = r2(5 + rnd() * 400);
    p.run(i, `SKU-${String(i).padStart(4, "0")}`, `Produit ${i}`, prices[i], i % 6 === 0 ? 5.5 : 20, i % 10 === 0 ? 0 : 1);
  }
  const q = db.prepare("INSERT INTO quotes VALUES (?,?,?,?,?,?)");
  const ql = db.prepare("INSERT INTO quote_lines VALUES (?,?,?,?,?,?)");
  const totals = [];
  const owner = [];
  let line = 0;
  for (let i = 1; i <= COUNTS.quotes; i++) {
    owner[i] = 1 + Math.floor(rnd() * COUNTS.customers);
    q.run(i, `Q-2020-${String(i).padStart(3, "0")}`, owner[i], day(300 + i), pick(["draft", "sent", "accepted", "declined"]), 0);
    let total = 0;
    for (let k = 0, n = 1 + Math.floor(rnd() * 4); k < n; k++) {
      const prod = 1 + Math.floor(rnd() * COUNTS.products);
      const qty = 1 + Math.floor(rnd() * 9);
      const lt = r2(qty * prices[prod]);
      total = r2(total + lt);
      ql.run(++line, i, prod, qty, prices[prod], lt);
    }
    totals[i] = total;
    db.prepare("UPDATE quotes SET total_excl_tax = ? WHERE quote_id = ?").run(total, i);
  }
  const inv = db.prepare("INSERT INTO invoices VALUES (?,?,?,?,?,?,?,?,?)");
  for (let i = 1; i <= COUNTS.invoices; i++) {
    const from = i <= 15 ? i * 2 : null;
    const ht = from ? totals[from] : r2(50 + rnd() * 900);
    const tva = r2(ht * 0.2);
    inv.run(i, `F-2021-${String(i).padStart(3, "0")}`, from ? owner[from] : 1 + Math.floor(rnd() * COUNTS.customers), from, day(400 + i), ht, tva, r2(ht + tva), i % 3 === 0 ? 0 : 1);
  }
  db.exec("COMMIT");
  const out = Object.fromEntries(["customers", "leads", "products", "quotes", "quote_lines", "invoices"].map((t) => [t, db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n]));
  out.invoice_total_incl_tax = db.prepare("SELECT ROUND(SUM(amount_incl_tax), 2) AS v FROM invoices").get().v;
  db.close();
  return out;
}
