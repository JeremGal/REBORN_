// Client for a Frappe / ERPNext site through its official REST API, with a user API token.
// Connection values come from the environment (FRAPPE_URL, FRAPPE_API_KEY, FRAPPE_API_SECRET) or from the secrets file
// named in reborn.local.json (secretsEnvFile). They are never printed or written anywhere.
import fs from "node:fs";
import { localConfig } from "./config.mjs";

function fromEnvFile(name) {
  const file = process.env.REBORN_SECRETS_FILE || localConfig().secretsEnvFile;
  if (!file || !fs.existsSync(file)) return undefined;
  const line = fs.readFileSync(file, "utf8").split(/\r?\n/).find((l) => new RegExp(`^\\s*${name}\\s*=`).test(l));
  return line ? line.replace(new RegExp(`^\\s*${name}\\s*=\\s*`), "").replace(/^['"]|['"]\s*$/g, "").trim() : undefined;
}

export function frappeConfig() {
  const get = (k) => process.env[k] || fromEnvFile(k);
  const url = (get("FRAPPE_URL") || "").replace(/\/$/, "");
  const key = get("FRAPPE_API_KEY");
  const secret = get("FRAPPE_API_SECRET");
  if (!url || !key || !secret) throw new Error("Frappe connection not configured: set FRAPPE_URL, FRAPPE_API_KEY, FRAPPE_API_SECRET (environment, or the file named by secretsEnvFile in reborn.local.json)");
  return { url, auth: `token ${key}:${secret}` };
}

export async function frappe(pathAndQuery, { method = "GET", body, timeoutMs = 120000 } = {}) {
  const { url, auth } = frappeConfig();
  const res = await fetch(url + pathAndQuery, {
    method,
    headers: { Authorization: auth, Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  if (!res.ok) {
    const msg = data?.exception || data?._server_messages || data?.message || res.statusText;
    throw new Error(`${method} ${pathAndQuery.split("?")[0]}: ${res.status} ${String(msg).slice(0, 300)}`);
  }
  return data;
}

const enc = encodeURIComponent;
export const list = (doctype, { fields = ["name"], filters, limit = 0 } = {}) =>
  frappe(`/api/resource/${enc(doctype)}?fields=${enc(JSON.stringify(fields))}${filters ? `&filters=${enc(JSON.stringify(filters))}` : ""}&limit_page_length=${limit}`).then((r) => r.data);
export const getDoc = (doctype, name) => frappe(`/api/resource/${enc(doctype)}/${enc(name)}`).then((r) => r.data);
export const insertDoc = (doc) => frappe(`/api/resource/${enc(doc.doctype)}`, { method: "POST", body: doc }).then((r) => r.data);
export const submitDoc = (doc) => frappe(`/api/method/frappe.client.submit`, { method: "POST", body: { doc } }).then((r) => r.message);
export const deleteDoc = (doctype, name) => frappe(`/api/resource/${enc(doctype)}/${enc(name)}`, { method: "DELETE" });
// Full definition of a document type (fields, types, links, mandatory flags, layout), as the site serves it.
export const docMeta = (doctype) => frappe(`/api/method/frappe.desk.form.load.getdoctype?doctype=${enc(doctype)}`).then((r) => r.docs?.find((d) => d.name === doctype) ?? r.docs?.[0]);
