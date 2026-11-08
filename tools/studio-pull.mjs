#!/usr/bin/env node
// Bridge Studio -> block 2: what the H Company agent really discovered during a Studio mission (events of a
// project: discovered screens and their field LABELS) becomes a ReBorn run (contracts/run.schema.json) under
// targets/<target>/01-exploration/runs/. Only interface structure is kept (screen titles, field labels and
// types): no value read in a data table, no secret, no personal data. Idempotent: one run per Studio mission.
//
//   REBORN_URL=http://127.0.0.1:3000 REBORN_ANALYST_TOKEN=<analyst token> \
//     node tools/studio-pull.mjs <target> --project MIG_xxxxxxxx --mission M-001 [--studio-mission MIS_x]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const project = opt("--project");
const mission = opt("--mission") ?? "M-001";
const only = opt("--studio-mission");
const target = args[0];
const base = (process.env.REBORN_URL ?? "").replace(/\/$/, "");
const token = process.env.REBORN_ANALYST_TOKEN;
if (!target || !project || !base || !token) {
  console.error("usage: REBORN_URL=… REBORN_ANALYST_TOKEN=… node tools/studio-pull.mjs <target> --project MIG_x [--mission M-001] [--studio-mission MIS_x]");
  process.exit(2);
}
if (!/^M-[0-9]{3,}$/.test(mission)) throw new Error("--mission must look like M-001");
const targetDir = path.join(process.env.REBORN_TARGETS_DIR ?? path.join(ROOT, "targets"), target);
if (!fs.existsSync(path.join(targetDir, "target.yaml"))) throw new Error(`unknown target ${target} (node tools/reborn.mjs init ${target} …)`);

const res = await fetch(`${base}/api/events?project=${encodeURIComponent(project)}`, { headers: { authorization: `Bearer ${token}` } });
if (!res.ok) throw new Error(`Studio refused the read (HTTP ${res.status})`);
const body = await res.json();
const events = (Array.isArray(body) ? body : body.events ?? []).filter((e) => e.project_id === project || !e.project_id);

const missionOf = (e) => e.data?.mission_id ?? e.mission_id ?? null;
const byMission = new Map();
for (const e of events) {
  const m = missionOf(e);
  if (!m || (only && m !== only)) continue;
  if (!["form_discovered", "log"].includes(e.type)) continue;
  if (!byMission.has(m)) byMission.set(m, []);
  byMission.get(m).push(e);
}

const clean = (s, n = 200) => String(s ?? "").replace(/[\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
let written = 0;
for (const [mis, list] of byMission) {
  const screens = list.filter((e) => e.type === "form_discovered" || /^Écran « .+ » repéré$/.test(e.title ?? ""));
  if (!screens.length) continue;
  list.sort((a, b) => String(a.ts).localeCompare(String(b.ts)));
  const started = list[0].ts;
  const ended = list.at(-1).ts;
  const steps = screens.map((e, i) => {
    const fields = (e.data?.fields ?? []).map((f) => clean(f.label ?? f.name, 60)).filter(Boolean);
    const title = clean(/« (.+) »/.exec(e.title ?? "")?.[1] ?? e.title, 80);
    return {
      n: i + 1,
      at: e.ts,
      action: { type: "read", target_desc: `screen « ${title} »` },
      observation: fields.length ? `${fields.length} field label(s) shown: ${fields.join(", ")}`.slice(0, 1000) : "screen reached; no form field listed by the agent",
    };
  });
  const id = `run-${String(started).replace(/[-:]/g, "").replace(/\..+|Z$/, "")}-studio-${mis}`;
  const run = {
    id,
    mission,
    subject: "original",
    agent: { provider: "h-company", product: "agents-api (h-explorer_v2 through the REBORN Studio mission queue)" },
    target: { id: target, environment: "web application (public instance)" },
    started_at: started,
    ended_at: ended,
    outcome: "success",
    steps,
    notes: `Imported from the REBORN Studio: project ${project}, mission ${mis}. Interface structure only (screen titles and field labels), no data values.`,
  };
  const dir = path.join(targetDir, "01-exploration", "runs", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "run.yaml"), YAML.stringify(run));
  written++;
  console.log(`run ${id}: ${steps.length} screen(s) from Studio mission ${mis}`);
}
if (!written) console.log("no discovered screen in the Studio for this project yet");
