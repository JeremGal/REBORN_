import { addEvent, completeInvestigation, getState } from "./store";
import { ingestObservations, publishSchema } from "./service";
import { DEMO_PLAN } from "./fixtures";
import type { AgentEvent, AppSchema, InputField, Inputs, Investigation, Observation } from "./types";

/**
 * Explorateur local (mode « simulation ») — doublure de l'agent Computer Use.
 *
 * Il pilote le logiciel historique uniquement par son interface HTML publique
 * (lecture de l'écran, soumission du formulaire, lecture du résultat affiché),
 * comme le ferait l'agent. Il ne connaît ni les règles cachées ni la console
 * de maintenance (servie sur un autre port, local et protégé).
 */

const DEFAULT_LEGACY_URL = process.env.LEGACY_URL ?? "http://localhost:4000";
const STEP_MS = Number(process.env.SIM_DELAY_MS ?? 220);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isActive(inv: Investigation) {
  const s = getState();
  return s.active_investigation_id === inv.id && s.investigations.find((i) => i.id === inv.id)?.status === "running";
}

function act(inv: Investigation, title: string, detail?: string, data?: unknown): AgentEvent {
  return addEvent({ source: "explorer", type: "action", title, detail, data, investigation_id: inv.id });
}

/* ------------------------------------------------------------------ */
/* Lecture de l'écran                                                   */
/* ------------------------------------------------------------------ */

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();

/** Analyse générique d'un formulaire HTML : champs, libellés, sections (fieldset) et menus. */
export function readForm(html: string): { schema: AppSchema; submitLabel: string | null; action: string } {
  const labels = new Map<string, string>();
  for (const m of html.matchAll(/<label[^>]*for="([^"]+)"[^>]*>([^<]*)<\/label>/g)) labels.set(m[1], decode(m[2]).replace(/\s*:\s*$/, ""));

  // Sections : chaque <fieldset><legend> couvre les champs qu'il contient
  const sections: { id: string; title: string; start: number; end: number }[] = [];
  for (const m of html.matchAll(/<fieldset>\s*<legend>([^<]*)<\/legend>([\s\S]*?)<\/fieldset>/g)) {
    const title = decode(m[1]);
    sections.push({ id: title.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "_"), title, start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
  }
  const sectionAt = (i: number) => sections.find((s) => i >= s.start && i <= s.end)?.id;

  const found: { at: number; field: InputField }[] = [];
  for (const m of html.matchAll(/<select[^>]*id="([^"]+)"[^>]*name="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const options = [...m[3].matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((o) => {
      const value = decode(o[1]);
      const label = decode(o[2]).replace(new RegExp(`^${value}\\s*-\\s*`), "");
      return { value, label };
    });
    found.push({ at: m.index ?? 0, field: { name: m[2], label: labels.get(m[1]) ?? m[2], type: "enum", options, default: options[0]?.value, section: sectionAt(m.index ?? 0) } });
  }
  for (const m of html.matchAll(/<input[^>]*type="(text|number|checkbox)"[^>]*id="([^"]+)"[^>]*name="([^"]+)"[^>]*>/g)) {
    // Un champ texte saisi avec des chiffres est typé « number » ; aucune contrainte n'est inventée
    const value = /value="([^"]*)"/.exec(m[0])?.[1] ?? "";
    const type = m[1] === "checkbox" ? "boolean" : m[1] === "number" || /^\d+([.,]\d+)?$/.test(value) ? "number" : "text";
    found.push({ at: m.index ?? 0, field: { name: m[3], label: labels.get(m[2]) ?? m[3], type, section: sectionAt(m.index ?? 0) } });
  }
  const fields = found.sort((a, b) => a.at - b.at).map((f) => f.field);
  const usedSections = sections.filter((s) => fields.some((f) => f.section === s.id)).map(({ id, title }) => ({ id, title }));

  // Menus visibles mais non explorés : signalés comme non reconstruits
  const menu = /<div class="menu">([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
  const menuItems = [...menu.matchAll(/<span>([\s\S]*?)<\/span>/g)].map((m) => decode(m[1].replace(/<[^>]+>/g, ""))).filter(Boolean);

  const submit = /<button[^>]*type="submit"[^>]*>([^<]*)<\/button>/.exec(html);
  const action = /<form[^>]*action="([^"]+)"/.exec(html)?.[1] ?? "/";
  const resultLabel = /TOTAL[^<:]*/i.exec(html)?.[0]?.trim();
  return {
    schema: {
      title: /<title>([^<]*)<\/title>/.exec(html)?.[1],
      fields,
      sections: usedSections,
      outputs: [{ name: "total_price", label: resultLabel ? resultLabel.charAt(0) + resultLabel.slice(1).toLowerCase() : "Total", format: "currency", primary: true }],
      unsupported: menuItems.length ? [{ label: `Menus ${menuItems.join(", ")}`, reason: "Visibles à l'écran, non explorés par l'explorateur" }] : undefined,
    },
    submitLabel: submit ? decode(submit[1]) : null,
    action,
  };
}

export function readResult(html: string): { total?: number; raw: string; error?: string } {
  const block = /<div id="resultat"[^>]*>([\s\S]*?)<\/div>/.exec(html)?.[1] ?? "";
  const text = decode(block.replace(/<[^>]+>/g, ""));
  if (/ERREUR/i.test(text)) return { raw: text, error: text };
  const m = /TOTAL[^:]*:\s*([\d\s.,]+)/i.exec(text);
  if (!m) return { raw: text, error: "Résultat illisible" };
  const total = Number(m[1].replace(/[\s  ]/g, "").replace(/\./g, "").replace(",", "."));
  return { raw: text, total };
}

/* ------------------------------------------------------------------ */
/* Exécution d'une expérience                                           */
/* ------------------------------------------------------------------ */

async function runExperiment(base: string, formAction: string, inv: Investigation, id: string, inputs: Inputs, verbose: boolean, requestId?: string): Promise<Observation | null> {
  if (verbose) {
    for (const [k, v] of Object.entries(inputs)) {
      act(inv, `Saisie ${k} = ${v}`, undefined, { action: "fill", target: k, value: v });
      await sleep(STEP_MS);
    }
    act(inv, "Clic sur « Calculer »", undefined, { action: "click", target: "Calculer" });
  }
  const body = new URLSearchParams(Object.entries(inputs).map(([k, v]) => [k, String(v)]));
  const res = await fetch(new URL(formAction, base), { method: "POST", body, signal: AbortSignal.timeout(8000) });
  const r = readResult(await res.text());
  await sleep(STEP_MS);
  const [saved] = ingestObservations({
    experiment_id: id,
    application: inv.application,
    module: inv.module,
    inputs,
    observed_output: r.total !== undefined ? { total_price: r.total } : {},
    // Un message d'erreur affiché est un refus métier ; un écran illisible est un échec technique
    status: r.error ? (r.error === "Résultat illisible" ? "failed" : "error") : "success",
    error: r.error,
    investigation_id: inv.id,
    request_id: requestId,
  });
  return saved ?? null;
}

/* ------------------------------------------------------------------ */
/* Investigation complète                                               */
/* ------------------------------------------------------------------ */

export async function runSimulation(inv: Investigation) {
  const base = inv.target_url || DEFAULT_LEGACY_URL;
  try {
    act(inv, `Ouverture de ${inv.application}`, base, { action: "navigate", url: base });
    await sleep(STEP_MS * 2);
    const res = await fetch(base, { signal: AbortSignal.timeout(5000) });
    const { schema, submitLabel, action } = readForm(await res.text());

    addEvent({
      source: "explorer",
      type: "form_discovered",
      title: `Écran analysé : ${schema.fields.length} champs, ${schema.sections?.length ?? 0} sections, action « ${submitLabel ?? "?"} »`,
      detail: schema.fields.map((f) => `${f.label}${f.options ? ` (${f.options.length} valeurs)` : ""}`).join(" · "),
      investigation_id: inv.id,
    });
    publishSchema({ ...schema, application: inv.application, module: inv.module }, "explorer", inv.id);
    await sleep(STEP_MS * 2);

    const offset = (inv.number - 1) * 100;
    let phase = "";
    for (const [i, exp] of DEMO_PLAN.entries()) {
      if (!isActive(inv)) return;
      if (exp.phase !== phase) {
        phase = exp.phase;
        addEvent({ source: "explorer", type: "log", title: `Phase d'exploration : ${phase}`, investigation_id: inv.id });
      }
      const id = `EXP_${String(offset + exp.n).padStart(3, "0")}`;
      // Détail clic par clic sur les premières expériences, puis cadence accélérée
      await runExperiment(base, action, inv, id, exp.inputs, i < 3);
    }
    completeInvestigation(inv.id);
  } catch (e) {
    addEvent({
      source: "explorer",
      type: "error",
      title: "Logiciel historique injoignable",
      detail: `${base} : ${(e as Error).message}. Lancez-le avec « npm run dev » à la racine du projet.`,
      investigation_id: inv.id,
    });
    completeInvestigation(inv.id, "failed");
  }
}

/** Exécute une demande d'expérience quand l'Explorer est simulé. */
export async function runRequestedExperiment(event: AgentEvent) {
  const s = getState();
  const inv = s.investigations.find((i) => i.id === s.active_investigation_id);
  const inputs = (event.data as { inputs?: Inputs } | undefined)?.inputs;
  if (!inv || inv.mode !== "simulation" || !inputs) return;
  const base = inv.target_url || DEFAULT_LEGACY_URL;
  const n = s.observations.filter((o) => o.investigation_id === inv.id).length;
  const id = `REQ_${String(inv.number).padStart(2, "0")}_${String(n + 1).padStart(3, "0")}`;
  try {
    act(inv, `Expérience demandée : ${Object.values(inputs).join(" · ")}`, event.detail);
    await runExperiment(base, "/devis", inv, id, inputs, false, event.id);
  } catch (e) {
    addEvent({ source: "explorer", type: "error", title: "Expérience impossible", detail: (e as Error).message, investigation_id: inv.id });
  }
}
