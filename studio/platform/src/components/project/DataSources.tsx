"use client";

import { useState } from "react";
import { ChevronDown, CircleSlash, Database, FileArchive, FileBraces, FileCode, FileSpreadsheet, FileText, Trash2, type LucideIcon } from "lucide-react";
import { StatusBadge } from "@/components/ds/Badge";
import { Button } from "@/components/ds/Button";
import { ConfirmationDialog } from "@/components/ds/Dialog";
import { Callout, Facts, TestBadge } from "./Step";
import { useProject } from "./ProjectProvider";
import { fromTestPlan, sourceOrigin } from "./ConnDiscovery";
import { bytes, Chip, dt, FORMAT_LABEL, plural, type ExtractionSummary, type ManifestExport, type MechanismResult, type SourceMeta } from "./DataKit";

/*
 * Sources reçues (étape Données) : fichiers du coffre, exports refusés au compte ou introuvables,
 * éléments non extractibles. Tout vient de GET /api/migration/sources et de la dernière extraction.
 */

type Row = { kind: "file"; s: SourceMeta; mechanism?: string; manifest?: ManifestExport; fromTest: boolean } | { kind: "failed"; r: MechanismResult } | { kind: "na"; label: string; reason: string };

export function sourceRows(list: SourceMeta[], ex: ExtractionSummary | null): Row[] {
  return [
    ...list.map((s): Row => ({ kind: "file", s, mechanism: ex?.results.find((r) => r.id === s.origin.mechanism)?.label, manifest: ex?.manifest?.exports.find((x) => x.file === s.name), fromTest: fromTestPlan(s, ex) })),
    ...(ex?.results ?? []).filter((r) => r.status !== "ok").map((r): Row => ({ kind: "failed", r })),
    ...(ex?.not_extractable ?? []).map((n): Row => ({ kind: "na", label: n.label, reason: n.reason })),
  ];
}

const FORMAT_ICON: Record<string, LucideIcon> = { csv: FileSpreadsheet, xlsx: FileSpreadsheet, json: FileBraces, sql: FileCode, sqlite: Database, zip: FileArchive };

const RESULT: Record<Exclude<MechanismResult["status"], "ok">, { label: string; tone: "warn" | "bad" }> = {
  forbidden: { label: "Refusé au compte", tone: "warn" },
  unauthorized: { label: "Refusé au compte", tone: "warn" },
  not_found: { label: "Introuvable", tone: "warn" },
  error: { label: "Erreur", tone: "bad" },
};
/** Les refus renvoient parfois une page HTML : on n'en garde que le texte. */
const plainText = (s: string) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function originLabel(s: SourceMeta, mechanism?: string): string {
  const o = sourceOrigin(s);
  if (o === "connector") return `Récupéré par le connecteur de REBORN · ${mechanism ?? s.origin.mechanism ?? "export"}${s.origin.url ? ` (${s.origin.url})` : ""}`;
  if (o === "manual") return "Importé à la main depuis le Studio";
  if (o === "agent") return `Déposé par l'agent d'analyse${s.origin.mechanism ? ` · ${s.origin.mechanism}` : ""}`;
  return `Envoyé par API${s.origin.by && s.origin.by !== "api" ? ` · ${s.origin.by}` : ""}${s.origin.mechanism ? ` · ${s.origin.mechanism}` : ""}`;
}

/** Comparaison du fichier reçu avec ce que le logiciel source a déclaré dans son manifeste (lignes, empreinte). */
function manifestCheck(s: SourceMeta, m: ManifestExport | undefined, rows: number): { text: string; mismatch: boolean } | null {
  if (!m) return null;
  const files = s.archive_entries !== undefined;
  const read = files ? (s.archive_entries ?? 0) : rows;
  const parts: string[] = [];
  let mismatch = false;
  if (m.rows !== undefined) {
    parts.push(files ? `${plural(m.rows, "fichier déclaré", "fichiers déclarés")}, ${plural(read, "lu", "lus")}` : `${plural(m.rows, "ligne déclarée", "lignes déclarées")}, ${plural(read, "lue", "lues")}`);
    if (m.rows !== read) mismatch = true;
  }
  if (m.sha256) {
    parts.push(m.sha256 === s.sha256 ? "empreinte identique" : "empreinte différente");
    if (m.sha256 !== s.sha256) mismatch = true;
  }
  if (m.table) parts.unshift(`table ${m.table}`);
  return parts.length ? { text: parts.join(" · "), mismatch } : null;
}

/**
 * Liste des sources : fichiers reçus (dépliables), exports non récupérés, éléments non extractibles.
 * L'étiquette « jeu de test » est posée sur chaque fichier seulement si la liste mélange des
 * fichiers de test et d'autres fichiers ; sinon elle figure une fois, dans le titre de la section.
 */
export function DataSourcesList({ rows, mapping, onRemoved }: { rows: Row[]; mapping: { version: number } | null; onRemoved: () => void }) {
  const files = rows.filter((r): r is Extract<Row, { kind: "file" }> => r.kind === "file");
  const mixed = files.some((r) => r.fromTest) && files.some((r) => !r.fromTest);
  return (
    <ul className="flex flex-col divide-y divide-line overflow-hidden rounded-panel ring-1 ring-line">
      {rows.map((r) => (r.kind === "file" ? <FileRow key={r.s.id} row={r} mapping={mapping} onRemoved={onRemoved} testBadge={mixed && r.fromTest} /> : r.kind === "failed" ? <FailedRow key={`r-${r.r.id}`} r={r.r} /> : <NotExtractableRow key={`n-${r.label}`} label={r.label} reason={r.reason} />))}
    </ul>
  );
}

function FileRow({ row, mapping, onRemoved, testBadge }: { row: Extract<Row, { kind: "file" }>; mapping: { version: number } | null; onRemoved: () => void; testBadge: boolean }) {
  const { s, mechanism, manifest } = row;
  const rows = s.tables.reduce((n, t) => n + t.rows, 0);
  const Icon = FORMAT_ICON[s.format] ?? FileText;
  const check = manifestCheck(s, manifest, rows);
  const toCheck = s.warnings.length > 0 || !!check?.mismatch;
  const count = s.archive_entries !== undefined ? plural(s.archive_entries, "fichier") : s.tables.length === 1 ? plural(rows, "ligne") : `${plural(s.tables.length, "table")} · ${plural(rows, "ligne")}`;
  const sub = [manifest?.table, FORMAT_LABEL[s.format] ?? s.format, bytes(s.size), sourceOrigin(s) === "manual" ? "importé à la main" : null].filter(Boolean).join(" · ");
  return (
    <li>
      <details className="group/row">
        <summary className="flex min-h-11 cursor-pointer list-none items-start gap-3 px-4 py-3 transition-colors duration-(--duration-fast) select-none hover:bg-canvas focus-visible:-outline-offset-2 sm:items-center [&::-webkit-details-marker]:hidden">
          <Icon size={18} className="hidden shrink-0 text-text-3 sm:block" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-body font-semibold break-words text-ink">{s.name}</span>
              {testBadge && <TestBadge className="h-auto! min-h-[1.375rem] py-0.5 whitespace-normal!" />}
            </span>
            <span className="block text-small break-words text-text-3">{sub}</span>
            {/* Téléphone : volume et état sous le nom, sur toute la largeur */}
            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 sm:hidden">
              <StatusBadge tone={toCheck ? "warn" : "ok"}>{toCheck ? "À vérifier" : "Reçu"}</StatusBadge>
              <span className="tabular text-small text-text-2">{count}</span>
            </span>
          </span>
          <span className="hidden shrink-0 items-center gap-4 sm:flex">
            <span className="tabular text-small text-text-2">{count}</span>
            <StatusBadge tone={toCheck ? "warn" : "ok"}>{toCheck ? "À vérifier" : "Reçu"}</StatusBadge>
          </span>
          <ChevronDown size={16} className="mt-0.5 shrink-0 text-text-3 transition-transform duration-(--duration-base) group-open/row:rotate-180 sm:mt-0" aria-hidden />
        </summary>
        <div className="flex flex-col gap-4 border-t border-line bg-canvas px-4 py-4 sm:pl-12">
          <Facts
            items={[
              { label: "Origine", value: <span className="break-all">{originLabel(s, mechanism)}</span> },
              { label: "Reçu le", value: dt(s.received_at) },
              { label: "Format", value: `${FORMAT_LABEL[s.format] ?? s.format}${s.encoding ? ` · encodage ${s.encoding}` : ""} · ${bytes(s.size)}` },
              ...(check ? [{ label: "Manifeste du logiciel source", value: <span className={check.mismatch ? "font-semibold text-warning-ink" : undefined}>{check.text}</span> }] : []),
              { label: "Empreinte (SHA-256)", value: <span className="font-mono text-meta break-all">{s.sha256}</span> },
            ]}
          />
          {s.tables.length > 1 && (
            <ul className="flex flex-wrap gap-1.5" aria-label="Tables du fichier">
              {s.tables.map((t) => (
                <li key={t.name}>
                  <Chip>
                    <span className="font-mono">{t.name}</span> · {plural(t.rows, "ligne")}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
          {s.warnings.length > 0 && (
            <Callout tone="warn" title={s.warnings.length > 1 ? `${s.warnings.length} avertissements de lecture` : "Avertissement de lecture"}>
              {s.warnings.length === 1 ? (
                s.warnings[0]
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {s.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </Callout>
          )}
          <RemoveSource s={s} mapping={mapping} onRemoved={onRemoved} />
        </div>
      </details>
    </li>
  );
}

function FailedRow({ r }: { r: MechanismResult }) {
  const s = RESULT[r.status as Exclude<MechanismResult["status"], "ok">] ?? RESULT.error;
  const msg = r.message ? plainText(r.message) : "";
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
      <CircleSlash size={18} className="hidden shrink-0 text-text-3 sm:block" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold break-words text-ink">{r.label ?? r.id}</span>
        <span className="block text-small break-words text-text-3">{msg || (s.label === "Refusé au compte" ? "Le compte confié n'a pas ce droit : rien n'a été contourné." : r.url)}</span>
      </span>
      <StatusBadge tone={s.tone} className="self-start sm:self-center">
        {s.label}
      </StatusBadge>
    </li>
  );
}

function NotExtractableRow({ label, reason }: { label: string; reason: string }) {
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
      <CircleSlash size={18} className="hidden shrink-0 text-text-3 sm:block" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold break-words text-ink">{label}</span>
        <span className="block text-small break-words text-text-3">{reason}</span>
      </span>
      <StatusBadge tone="neutral" className="self-start sm:self-center">
        Non extractible
      </StatusBadge>
    </li>
  );
}

function RemoveSource({ s, mapping, onRemoved }: { s: SourceMeta; mapping: { version: number } | null; onRemoved: () => void }) {
  const { del } = useProject();
  const [open, setOpen] = useState(false);
  return (
    <div>
      {/* Nom accessible qui commence par le texte visible (WCAG 2.5.3), précisé par le fichier concerné. */}
      <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => setOpen(true)} aria-label={`Retirer du projet : ${s.name}`}>
        Retirer du projet
      </Button>
      <ConfirmationDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Retirer ${s.name} du projet ?`}
        confirmLabel="Retirer"
        pendingLabel="Retrait…"
        tone="danger"
        onConfirm={async () => {
          await del(`/api/migration/sources?id=${encodeURIComponent(s.id)}`);
          onRemoved();
        }}
      >
        Le fichier reste dans le coffre du projet mais ne sera plus lu par la migration.{mapping ? ` Les correspondances v${mapping.version} ne seront pas recalculées.` : ""}
      </ConfirmationDialog>
    </div>
  );
}
