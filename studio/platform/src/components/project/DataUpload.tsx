"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { Ban, CircleCheck, CircleX, Clock, FileUp, TriangleAlert, Upload } from "lucide-react";
import { Button, cx } from "@/components/ui";
import { bytes, FORMAT_LABEL, plural, Spinner, UPLOAD_BY, type SourceMeta } from "./DataKit";

/*
 * Import manuel de fichiers exportés → POST /api/migration/sources { name, content_base64, by }.
 * Progression réelle, fichier par fichier : octets lus par le navigateur (FileReader), puis octets
 * envoyés (XMLHttpRequest.upload) ; l'analyse côté serveur n'a pas de pourcentage (état « en cours »).
 */

/** Extensions lues par REBORN (lib/migration/formats.ts). Un fichier sans extension est identifié par son contenu. */
const ACCEPTED = ["csv", "tsv", "txt", "json", "ndjson", "jsonl", "xlsx", "sql", "db", "sqlite", "sqlite3", "zip"];
const ACCEPT_ATTR = ACCEPTED.map((e) => `.${e}`).join(",");
/** Corps JSON limité à 20 Mo par l'API (lib/http.ts) : ≈ 15 Mo de fichier une fois encodé en base64. */
const MAX_BODY = 20 * 1024 * 1024;
const MAX_FILE_LABEL = "15 Mo";
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
  if (ext === "xls") return "Classeur Excel 97-2003 (.xls) non pris en charge : enregistrez-le au format .xlsx ou CSV, puis déposez-le à nouveau.";
  if (ext && !ACCEPTED.includes(ext)) return `Format .${ext} non pris en charge. Formats lus : CSV (.csv, .tsv, .txt), Excel (.xlsx), JSON (.json, .ndjson), export SQL (.sql), base SQLite (.db, .sqlite), archive ZIP (.zip).`;
  if (file.size === 0) return "Fichier vide : rien à importer.";
  if (bodySize(file.size, name) > MAX_BODY) return `Fichier trop volumineux pour un dépôt depuis le navigateur (${bytes(file.size)} ; ${MAX_FILE_LABEL} au plus). Découpez l'export, ou faites-le récupérer par l'extraction automatique.`;
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
    xhr.onerror = () => reject(new Error("Envoi impossible : la plateforme ne répond pas (réseau coupé ou serveur arrêté)."));
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
            .map((i) => `${i.path ? `${i.path} : ` : ""}${i.message ?? ""}`)
            .join(" · ")
        : "";
      reject(new Error(`${data.error ?? `Erreur HTTP ${xhr.status}`}${issues ? ` — ${issues}` : ""}`));
    };
    xhr.send(body);
  });
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

export function DataUpload({ projectId, existing, onUploaded }: { projectId: string; existing: SourceMeta[]; onUploaded: (s: SourceMeta) => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const ref = useRef<Item[]>([]);
  const running = useRef(false);
  const controls = useRef(new Map<string, Control>());
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const seq = useRef(0);
  const [over, setOver] = useState(false);
  const active = items.some((i) => i.phase === "queued" || i.phase === "reading" || i.phase === "sending" || i.phase === "analyzing");

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
    ref.current = next;
    setItems(next);
  };
  const patch = (key: string, p: Partial<Item>) => commit(ref.current.map((i) => (i.key === key ? { ...i, ...p } : i)));

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
      const source = await sendSource(
        `/api/migration/sources?project=${encodeURIComponent(projectId)}`,
        body,
        (f) => patch(item.key, { progress: f }),
        () => patch(item.key, { phase: "analyzing" }),
        ctl,
      );
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
      for (let next = ref.current.find((i) => i.phase === "queued"); next; next = ref.current.find((i) => i.phase === "queued")) {
        await uploadOne(next);
      }
    } finally {
      running.current = false;
    }
  }

  function enqueue(files: FileList | File[]) {
    const list = Array.from(files);
    if (!list.length) return;
    // Un nouveau lot remplace l'affichage des envois terminés du lot précédent
    const keep = ref.current.filter((i) => i.phase === "queued" || i.phase === "reading" || i.phase === "sending" || i.phase === "analyzing");
    const taken = new Set([...existing.map((s) => s.name), ...keep.map((i) => i.name)]);
    const fresh = list.map((file): Item => {
      const name = apiFileName(file.name);
      const problem = checkFile(file, name);
      const item: Item = { key: `f${++seq.current}`, file, name, renamed: name !== file.name, replaces: !problem && taken.has(name), phase: problem ? "error" : "queued", progress: 0, error: problem ?? undefined };
      if (!problem) taken.add(name);
      return item;
    });
    commit([...keep, ...fresh]);
    void pump();
  }

  function cancel(key: string) {
    const it = ref.current.find((i) => i.key === key);
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
    <div className="flex flex-col gap-3">
      <div
        onDragEnter={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          depth.current += 1;
          setOver(true);
        }}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => {
          depth.current = Math.max(0, depth.current - 1);
          if (!depth.current) setOver(false);
        }}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          depth.current = 0;
          setOver(false);
          enqueue(e.dataTransfer.files);
        }}
        className={cx(
          "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-7 text-center transition-colors duration-150",
          over ? "border-verdigris bg-verdigris-soft/60" : "border-line-strong bg-chalk/50",
        )}
      >
        <Upload size={20} className={over ? "text-verdigris" : "text-silt"} aria-hidden />
        <p className="text-[13px] font-bold">{over ? "Déposez les fichiers pour les importer" : "Glissez-déposez vos fichiers exportés ici"}</p>
        <p className="max-w-[520px] text-[12px] text-sediment">
          CSV, Excel (.xlsx), JSON, export SQL, base SQLite, archive ZIP de pièces jointes · plusieurs fichiers à la fois · {MAX_FILE_LABEL} au plus par fichier. Un fichier du même nom
          remplace la source existante.
        </p>
        <Button type="button" variant="ghost" size="sm" className="mt-1" onClick={() => input.current?.click()}>
          <FileUp size={13} aria-hidden /> Choisir des fichiers
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            if (e.target.files) enqueue(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2 text-[12px]">
            <span className="font-bold text-sediment">Fichiers déposés pendant cette session</span>
            <span className="text-silt">
              {plural(done, "fichier reçu", "fichiers reçus")}
              {failed ? ` · ${plural(failed, "refusé")}` : ""}
              {active ? " · envoi en cours" : ""}
            </span>
          </div>
          <ul className="flex flex-col divide-y divide-line rounded-md shadow-[0_0_0_1px_var(--color-line)]" aria-live="polite">
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
  return (
    <li className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {Icon ? (
              <Icon size={14} aria-hidden className={cx("shrink-0", item.phase === "done" ? "text-verdigris" : item.phase === "error" ? "text-rust" : "text-silt")} />
            ) : (
              <Spinner className="text-verdigris" />
            )}
            <span className="min-w-0 text-[13px] font-bold break-all">{item.name}</span>
            <span className="tabular text-[12px] text-silt">{bytes(item.file.size)}</span>
          </div>
          {item.renamed && <p className="mt-0.5 text-[11.5px] text-silt">Nom d&apos;origine « {item.file.name} » adapté aux caractères acceptés par l&apos;API.</p>}
          {item.replaces && item.phase !== "cancelled" && item.phase !== "error" && (
            <p className="mt-0.5 text-[11.5px] text-ochre">{item.phase === "done" ? "A remplacé la source du même nom." : "Remplacera la source du même nom."}</p>
          )}
        </div>
        {cancellable && (
          <Button type="button" size="sm" variant="quiet" onClick={onCancel}>
            Annuler
          </Button>
        )}
      </div>

      {item.phase === "queued" && <p className="mt-1 text-[12px] text-silt">En attente : les fichiers sont envoyés un par un.</p>}
      {(item.phase === "reading" || item.phase === "sending") && <Progress value={item.progress} label={item.phase === "reading" ? "Lecture du fichier par le navigateur" : "Envoi à REBORN"} />}
      {item.phase === "analyzing" && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-sediment">
          <Spinner size={12} /> Fichier transmis. Analyse par REBORN : lecture des tables, empreinte SHA-256, rangement dans le coffre…
        </p>
      )}
      {item.phase === "done" && s && (
        <p className="mt-1 text-[12px] text-[#0b6b5f]">
          Reçu · {FORMAT_LABEL[s.format] ?? s.format}
          {s.encoding ? ` (${s.encoding})` : ""} ·{" "}
          {s.archive_entries !== undefined ? `${plural(s.archive_entries, "fichier")} dans l'archive` : `${plural(s.tables.length, "table")} · ${plural(rows, "ligne")}`}
        </p>
      )}
      {item.phase === "done" && s && s.warnings.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5 text-[12px] text-ochre">
          {s.warnings.map((w) => (
            <li key={w} className="flex gap-1.5">
              <TriangleAlert size={12} className="mt-0.5 shrink-0" aria-hidden /> {w}
            </li>
          ))}
        </ul>
      )}
      {item.phase === "error" && <p className="mt-1 text-[12px] break-words text-rust">{item.error}</p>}
      {item.phase === "cancelled" && <p className="mt-1 text-[12px] text-silt">Envoi annulé.</p>}
    </li>
  );
}

function Progress({ value, label }: { value: number; label: string }) {
  // Arrondi inférieur : 100 % n'apparaît qu'une fois tous les octets réellement lus ou envoyés
  const p = Math.max(0, Math.min(100, Math.floor(value * 100)));
  return (
    <div className="mt-1.5">
      <div className="flex justify-between gap-2 text-[11.5px] text-sediment">
        <span>{label}</span>
        <span className="tabular">{p} %</span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-chalk-2" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}>
        <div className="h-full rounded-full bg-verdigris transition-[width] duration-150" style={{ width: `${p}%` }} />
      </div>
    </div>
  );
}
