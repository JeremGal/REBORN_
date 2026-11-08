"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, CircleCheck, CircleX, Clock, Upload } from "lucide-react";
import { Button } from "@/components/ds/Button";
import { FileUpload } from "@/components/ds/FileUpload";
import { Progress } from "@/components/ds/Progress";
import { cx } from "@/components/ds/cx";
import { bytes, FORMAT_LABEL, plural, Spinner, UPLOAD_BY, type SourceMeta } from "./DataKit";

/*
 * Import manuel de fichiers exportés → POST /api/migration/sources { name, content_base64, by }.
 * Sélection par le composant FileUpload du design system (glisser-déposer + bouton natif), puis
 * envoi fichier par fichier avec une progression RÉELLE : octets lus par le navigateur
 * (FileReader), puis octets envoyés (XMLHttpRequest.upload). L'analyse côté serveur n'a pas de
 * pourcentage : elle est annoncée « en cours », sans chiffre inventé.
 */

/** Extensions lues par REBORN (lib/migration/formats.ts). Un fichier sans extension est identifié par son contenu. */
const ACCEPTED = ["csv", "tsv", "txt", "json", "ndjson", "jsonl", "xlsx", "sql", "db", "sqlite", "sqlite3", "zip"];
const ACCEPT_ATTR = ACCEPTED.map((e) => `.${e}`).join(",");
/** Corps JSON limité à 20 Mo par l'API (lib/http.ts) : ≈ 15 Mo de fichier une fois encodé en base64. */
const MAX_BODY = 20 * 1024 * 1024;
const MAX_FILE = 15 * 1024 * 1024;
const FORMATS_HINT = "CSV, Excel (.xlsx), JSON, export SQL, base SQLite ou archive ZIP de pièces jointes · 15 Mo au plus par fichier";
const bodySize = (size: number, name: string) => 4 * Math.ceil(size / 3) + JSON.stringify({ name, content_base64: "", by: UPLOAD_BY }).length;

type Phase = "queued" | "reading" | "sending" | "analyzing" | "done" | "error" | "cancelled";
interface Item {
  key: string;
  file: File;
  /** Nom envoyé à l'API (adapté si nécessaire). */
  name: string;
  renamed: boolean;
  replaces: boolean;
  phase: Phase;
  /** 0 → 1, mesuré (lecture puis envoi). */
  progress: number;
  error?: string;
  source?: SourceMeta;
}
interface Control {
  cancelled?: boolean;
  abort?: () => void;
}
class Cancelled extends Error {}

const LIGATURES: Record<string, string> = { œ: "oe", Œ: "OE", æ: "ae", Æ: "AE", ß: "ss" };

/** L'API n'accepte que lettres sans accent, chiffres, espace et _ . ( ) - (120 caractères au plus). */
export function apiFileName(raw: string): string {
  const cleaned = raw
    .replace(/[œŒæÆß]/g, (c) => LIGATURES[c] ?? c)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w .()-]/g, "_")
    .replace(/_{2,}/g, "_")
    .trim();
  const m = /^(.*?)(\.[A-Za-z0-9]{1,10})?$/.exec(cleaned);
  const ext = m?.[2] ?? "";
  const base = (m?.[1] || "fichier").slice(0, 120 - ext.length);
  return `${base}${ext}`;
}

/** Contrôles faits avant l'envoi, avec un message lisible (le serveur refait ses propres contrôles). */
function checkFile(file: File, name: string): string | null {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "";
  if (ext === "xls") return "Classeur Excel 97-2003 (.xls) non pris en charge : enregistrez-le au format .xlsx ou CSV, puis importez-le à nouveau.";
  if (ext && !ACCEPTED.includes(ext)) return `Format .${ext} non pris en charge. Formats lus : CSV (.csv, .tsv, .txt), Excel (.xlsx), JSON (.json, .ndjson), export SQL (.sql), base SQLite (.db, .sqlite), archive ZIP (.zip).`;
  if (file.size === 0) return "Fichier vide : rien à importer.";
  if (bodySize(file.size, name) > MAX_BODY) return `Fichier trop volumineux pour un import depuis le navigateur (${bytes(file.size)} ; 15 Mo au plus). Découpez l'export, ou faites-le récupérer par l'agent.`;
  return null;
}

function readBase64(file: File, onProgress: (f: number) => void, ctl: Control): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    ctl.abort = () => r.abort();
    r.onprogress = (e) => {
      if (e.lengthComputable && e.total) onProgress(e.loaded / e.total);
    };
    r.onabort = () => reject(new Cancelled());
    r.onerror = () => reject(new Error(`Lecture du fichier impossible par le navigateur${r.error?.message ? ` (${r.error.message})` : ""}.`));
    r.onload = () => {
      const s = typeof r.result === "string" ? r.result : "";
      const i = s.indexOf(",");
      resolve(i >= 0 ? s.slice(i + 1) : "");
    };
    r.readAsDataURL(file);
  });
}

function sendSource(url: string, body: string, onProgress: (f: number) => void, onSent: () => void, ctl: Control): Promise<SourceMeta> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    ctl.abort = () => xhr.abort();
    xhr.open("POST", url);
    xhr.setRequestHeader("content-type", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total) onProgress(e.loaded / e.total);
    };
    xhr.upload.onload = () => onSent();
    xhr.onabort = () => reject(new Cancelled());
    xhr.onerror = () => reject(new Error("Envoi impossible : le Studio ne répond pas (réseau coupé ou serveur arrêté)."));
    xhr.onload = () => {
      let data: { source?: SourceMeta; error?: string; issues?: { path?: string; message?: string }[] } = {};
      try {
        data = JSON.parse(xhr.responseText || "{}");
      } catch {
        /* réponse non JSON : message générique ci-dessous */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.source) return resolve(data.source);
      const issues = Array.isArray(data.issues)
        ? data.issues
            .slice(0, 5)
            .map((i) => i.message ?? "")
            .filter(Boolean)
            .join(" · ")
        : "";
      reject(new Error(`${data.error ?? `Le Studio a refusé le fichier (HTTP ${xhr.status}).`}${issues ? ` — ${issues}` : ""}`));
    };
    xhr.send(body);
  });
}

const ACTIVE: Phase[] = ["queued", "reading", "sending", "analyzing"];

/** Import de fichiers : sélection (FileUpload), puis envoi un par un avec progression réelle. */
export function DataUpload({ projectId, existing, onUploaded }: { projectId: string; existing: SourceMeta[]; onUploaded: (s: SourceMeta) => void }) {
  const [picked, setPicked] = useState<File[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const list = useRef<Item[]>([]);
  const running = useRef(false);
  const controls = useRef(new Map<string, Control>());
  const seq = useRef(0);
  const active = items.some((i) => ACTIVE.includes(i.phase));

  // Fermer l'onglet interromprait un envoi en cours : le navigateur demande confirmation
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "Des fichiers sont en cours d'envoi.";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  const commit = (next: Item[]) => {
    list.current = next;
    setItems(next);
  };
  const patch = (key: string, p: Partial<Item>) => commit(list.current.map((i) => (i.key === key ? { ...i, ...p } : i)));

  async function uploadOne(item: Item) {
    const ctl: Control = {};
    controls.current.set(item.key, ctl);
    try {
      patch(item.key, { phase: "reading", progress: 0 });
      const b64 = await readBase64(item.file, (f) => patch(item.key, { progress: f }), ctl);
      if (ctl.cancelled) throw new Cancelled();
      if (!b64) throw new Error("Fichier vide : rien à importer.");
      const body = JSON.stringify({ name: item.name, content_base64: b64, by: UPLOAD_BY });
      patch(item.key, { phase: "sending", progress: 0 });
      const source = await sendSource(`/api/migration/sources?project=${encodeURIComponent(projectId)}`, body, (f) => patch(item.key, { progress: f }), () => patch(item.key, { phase: "analyzing" }), ctl);
      patch(item.key, { phase: "done", source });
      onUploaded(source);
    } catch (e) {
      if (e instanceof Cancelled) patch(item.key, { phase: "cancelled" });
      else patch(item.key, { phase: "error", error: (e as Error).message });
    } finally {
      controls.current.delete(item.key);
    }
  }

  async function pump() {
    if (running.current) return;
    running.current = true;
    try {
      // Un fichier à la fois : progression lisible, et le serveur traite chaque fichier en entier
      for (let next = list.current.find((i) => i.phase === "queued"); next; next = list.current.find((i) => i.phase === "queued")) await uploadOne(next);
    } finally {
      running.current = false;
    }
  }

  function start() {
    if (!picked.length) return;
    // Un nouveau lot remplace l'affichage des envois terminés du lot précédent
    const keep = list.current.filter((i) => ACTIVE.includes(i.phase));
    const taken = new Set([...existing.map((s) => s.name), ...keep.map((i) => i.name)]);
    const fresh = picked.map((file): Item => {
      const name = apiFileName(file.name);
      const problem = checkFile(file, name);
      const item: Item = { key: `f${++seq.current}`, file, name, renamed: name !== file.name, replaces: !problem && taken.has(name), phase: problem ? "error" : "queued", progress: 0, error: problem ?? undefined };
      if (!problem) taken.add(name);
      return item;
    });
    setPicked([]);
    commit([...keep, ...fresh]);
    void pump();
  }

  function cancel(key: string) {
    const it = list.current.find((i) => i.key === key);
    if (!it) return;
    if (it.phase === "queued") return patch(key, { phase: "cancelled" });
    const ctl = controls.current.get(key);
    if (ctl) {
      ctl.cancelled = true;
      ctl.abort?.();
    }
  }

  const done = items.filter((i) => i.phase === "done").length;
  const failed = items.filter((i) => i.phase === "error").length;

  return (
    <div className="flex flex-col gap-4">
      <FileUpload label="Fichiers exportés de votre logiciel" hint={FORMATS_HINT} accept={ACCEPT_ATTR} maxSizeBytes={MAX_FILE} files={picked} onFilesChange={setPicked} />
      {picked.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={<Upload size={16} />} onClick={start}>
            {picked.length > 1 ? `Importer les ${picked.length} fichiers` : "Importer le fichier"}
          </Button>
          <span className="text-small text-text-3">Un fichier du même nom remplace la source existante.</span>
        </div>
      )}

      {items.length > 0 && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-small">
            <span className="font-semibold text-text-2">Imports de cette session</span>
            <span className="tabular text-text-3">
              {plural(done, "fichier reçu", "fichiers reçus")}
              {failed ? ` · ${plural(failed, "refusé")}` : ""}
              {active ? " · envoi en cours" : ""}
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-line rounded-panel ring-1 ring-line" aria-live="polite">
            {items.map((i) => (
              <UploadRow key={i.key} item={i} onCancel={() => cancel(i.key)} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function UploadRow({ item, onCancel }: { item: Item; onCancel: () => void }) {
  const s = item.source;
  const rows = s?.tables.reduce((n, t) => n + t.rows, 0) ?? 0;
  const cancellable = item.phase === "queued" || item.phase === "reading" || item.phase === "sending";
  const Icon = item.phase === "done" ? CircleCheck : item.phase === "error" ? CircleX : item.phase === "cancelled" ? Ban : item.phase === "queued" ? Clock : null;
  // Arrondi inférieur : 100 % n'apparaît qu'une fois tous les octets réellement lus ou envoyés
  const pct = Math.floor(item.progress * 1000) / 10;
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          {Icon ? <Icon size={16} aria-hidden className={cx("mt-0.5 shrink-0", item.phase === "done" ? "text-accent" : item.phase === "error" ? "text-danger" : "text-text-3")} /> : <Spinner size={16} className="mt-0.5 text-accent" />}
          <div className="min-w-0">
            <p className="text-body font-semibold break-all text-ink">
              {item.name} <span className="tabular font-normal text-text-3">· {bytes(item.file.size)}</span>
            </p>
            {item.renamed && <p className="text-small text-text-3">Renommé depuis « {item.file.name} » (caractères non acceptés).</p>}
            {item.replaces && item.phase !== "cancelled" && item.phase !== "error" && <p className="text-small text-warning-ink">{item.phase === "done" ? "A remplacé la source du même nom." : "Remplacera la source du même nom."}</p>}
          </div>
        </div>
        {cancellable && (
          <Button size="sm" variant="ghost" onClick={onCancel} aria-label={`Annuler l'import de ${item.name}`}>
            Annuler
          </Button>
        )}
      </div>
      <div className="pl-[26px]">
        {item.phase === "queued" && <p className="mt-1 text-small text-text-3">En attente : un fichier à la fois.</p>}
        {(item.phase === "reading" || item.phase === "sending") && <Progress className="mt-2 max-w-[420px]" label={item.phase === "reading" ? "Lecture du fichier" : "Envoi au Studio"} value={pct} max={100} />}
        {item.phase === "analyzing" && <Progress className="mt-2 max-w-[420px]" label="Fichier transmis : lecture des tables en cours…" value={null} />}
        {item.phase === "done" && s && (
          <p className="mt-1 text-small text-accent-ink">
            Reçu · {FORMAT_LABEL[s.format] ?? s.format}
            {s.encoding ? ` (${s.encoding})` : ""} · {s.archive_entries !== undefined ? `${plural(s.archive_entries, "fichier")} dans l'archive` : `${plural(s.tables.length, "table")} · ${plural(rows, "ligne")}`}
          </p>
        )}
        {item.phase === "done" && s && s.warnings.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5 text-small text-warning-ink">
            {s.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
        {item.phase === "error" && <p className="mt-1 text-small break-words text-danger-ink">{item.error}</p>}
        {item.phase === "cancelled" && <p className="mt-1 text-small text-text-3">Import annulé.</p>}
      </div>
    </li>
  );
}
