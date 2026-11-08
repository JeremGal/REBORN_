"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Copy, Download, Ellipsis, KeyRound, Plus, RotateCcw, Settings, Trash2, X } from "lucide-react";
import {
  Alert,
  Badge,
  Breadcrumb,
  Button,
  Checkbox,
  ConfirmationDialog,
  DataTable,
  Dialog,
  Drawer,
  EmptyState,
  ErrorState,
  Field,
  FileUpload,
  IconButton,
  Input,
  Menu,
  Pagination,
  PasswordInput,
  Progress,
  RadioGroup,
  SearchInput,
  Select,
  Skeleton,
  StatusBadge,
  Stepper,
  Tabs,
  Textarea,
  Tooltip,
  Wordmark,
  cx,
  formatPercent,
  useToast,
  type Column,
  type SortDirection,
  type StepperStep,
} from "@/components/ds";

/* ======================================================================== */
/* Contrastes calculés en direct à partir des jetons réellement servis        */
/* ======================================================================== */

type RGBA = [number, number, number, number];

function parseColor(s: string): RGBA | null {
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some((n) => Number.isNaN(n))) return null;
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}
const channel = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: RGBA) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const over = (fg: RGBA, bg: RGBA): RGBA => [fg[0] * fg[3] + bg[0] * (1 - fg[3]), fg[1] * fg[3] + bg[1] * (1 - fg[3]), fg[2] * fg[3] + bg[2] * (1 - fg[3]), 1];
function contrast(fg: RGBA, bg: RGBA) {
  const f = luminance(over(fg, bg));
  const b = luminance(bg);
  return (Math.max(f, b) + 0.05) / (Math.min(f, b) + 0.05);
}
const toHex = ([r, g, b, a]: RGBA) =>
  "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("") + (a < 1 ? ` · ${Math.round(a * 100)} %` : "");

/** Lit la valeur calculée d'un jeton via un élément témoin (var() résolues par le navigateur). */
function useTokens(names: string[]) {
  const [values, setValues] = useState<Record<string, RGBA> | null>(null);
  const key = names.join(",");
  useEffect(() => {
    const probe = document.createElement("span");
    probe.style.display = "none";
    document.body.appendChild(probe);
    const out: Record<string, RGBA> = {};
    for (const n of key.split(",")) {
      probe.style.color = n === "white" ? "#fff" : `var(--color-${n})`;
      const c = parseColor(getComputedStyle(probe).color);
      if (c) out[n] = c;
    }
    probe.remove();
    setValues(out);
  }, [key]);
  return values;
}

const fr = (n: number, d = 2) => n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });

type Pair = { id: string; fg: string; bg: string; min: number; usage: string };
const TEXTS = ["ink", "text-2", "text-3", "accent-ink", "warning-ink", "danger-ink"];
const LIGHT = ["canvas", "surface", "surface-sunken", "field"];
const SOFT = ["accent-soft", "warning-soft", "danger-soft"];
const PAIRS: Pair[] = [
  ...TEXTS.flatMap((fg) => [...LIGHT, ...SOFT].map((bg) => ({ id: `${fg}/${bg}`, fg, bg, min: 4.5, usage: "Texte" }))),
  ...[...LIGHT, "accent-soft"].map((bg) => ({ id: `accent/${bg}`, fg: "accent", bg, min: 4.5, usage: "Texte (alias verdigris)" })),
  ...LIGHT.map((bg) => ({ id: `control-border/${bg}`, fg: "control-border", bg, min: 3, usage: "Bordure de champ" })),
  ...LIGHT.map((bg) => ({ id: `focus/${bg}`, fg: "focus", bg, min: 3, usage: "Anneau de focus" })),
  ...[...LIGHT, "warning-soft"].map((bg) => ({ id: `warning/${bg}`, fg: "warning", bg, min: 3, usage: "Icône d'avertissement" })),
  ...[...LIGHT, "danger-soft"].map((bg) => ({ id: `danger/${bg}`, fg: "danger", bg, min: 3, usage: "Icône d'erreur" })),
  ...["ink", "ink-2", "accent", "accent-ink", "danger", "danger-ink"].map((bg) => ({ id: `white/${bg}`, fg: "white", bg, min: 4.5, usage: "Texte de bouton plein" })),
  { id: "accent-bright/ink", fg: "accent-bright", bg: "ink", min: 4.5, usage: "Accent sur fond sombre" },
];

const SWATCHES: { group: string; note: string; tokens: { name: string; role: string }[] }[] = [
  {
    group: "Surfaces",
    note: "Fond d'application chaud, surfaces blanches avec parcimonie, zones encastrées ; les champs ont un encastrement léger.",
    tokens: [
      { name: "canvas", role: "Fond d'application" },
      { name: "surface", role: "Contenu surélevé" },
      { name: "surface-sunken", role: "Zones encastrées, pastilles" },
      { name: "field", role: "Fond des champs" },
    ],
  },
  {
    group: "Texte et filets",
    note: "Anthracite pour le texte et les boutons principaux. Filets décoratifs ; bordure de champ ≥ 3:1.",
    tokens: [
      { name: "ink", role: "Texte principal" },
      { name: "text-2", role: "Texte secondaire" },
      { name: "text-3", role: "Métadonnées" },
      { name: "text-disabled", role: "Désactivé uniquement" },
      { name: "control-border", role: "Bordure de champ" },
      { name: "line-strong", role: "Filet appuyé" },
      { name: "line", role: "Filet" },
    ],
  },
  {
    group: "Vert-de-gris — accent unique",
    note: "Restauré, validé : focus, liens, progression, étape active, validations.",
    tokens: [
      { name: "accent", role: "Accent, focus" },
      { name: "accent-ink", role: "Texte et liens" },
      { name: "accent-soft", role: "Fond" },
      { name: "accent-bright", role: "Accent sur fond sombre" },
    ],
  },
  {
    group: "Ocre et rouille",
    note: "Avertissement (ocre) et erreur (rouille), toujours accompagnés d'une icône et d'un texte.",
    tokens: [
      { name: "warning", role: "Icône d'avertissement" },
      { name: "warning-ink", role: "Texte d'avertissement" },
      { name: "warning-soft", role: "Fond d'avertissement" },
      { name: "danger", role: "Icône, bouton danger" },
      { name: "danger-ink", role: "Texte d'erreur" },
      { name: "danger-soft", role: "Fond d'erreur" },
    ],
  },
];

const ALIASES = [
  ["paper", "surface"],
  ["chalk", "canvas"],
  ["chalk-2", "surface-sunken"],
  ["sediment", "text-2"],
  ["silt", "text-3"],
  ["dust", "text-disabled"],
  ["verdigris", "accent"],
  ["verdigris-soft", "accent-soft"],
  ["verdigris-bright", "accent-bright"],
  ["ochre", "warning-ink"],
  ["ochre-soft", "warning-soft"],
  ["rust", "danger-ink"],
  ["rust-soft", "danger-soft"],
];

const ALL_TOKENS = Array.from(
  new Set([...PAIRS.flatMap((p) => [p.fg, p.bg]), ...SWATCHES.flatMap((g) => g.tokens.map((t) => t.name)), ...ALIASES.flat(), "ink-2", "ink-3"]),
);

/* ======================================================================== */
/* Mise en page de la page                                                    */
/* ======================================================================== */

const SECTIONS = [
  ["couleurs", "Couleurs et contrastes"],
  ["typographie", "Typographie"],
  ["formes", "Formes, hauteurs, ombres, mouvement"],
  ["boutons", "Boutons"],
  ["formulaires", "Formulaires"],
  ["etats", "Badges et états"],
  ["retours", "Retours et chargement"],
  ["superpositions", "Fenêtres, menus, info-bulles"],
  ["navigation", "Navigation"],
  ["donnees", "Données"],
  ["marque", "Mot-symbole"],
] as const;

function DocSection({ id, title, lead, children }: { id: string; title: string; lead: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titre`} className="scroll-mt-20 border-t border-line pt-10 first:border-t-0 first:pt-0">
      <h2 id={`${id}-titre`} className="text-h2 font-semibold text-ink">
        {title}
      </h2>
      <p className="mt-1.5 max-w-[68ch] text-body leading-relaxed text-text-2">{lead}</p>
      <div className="mt-6 flex flex-col gap-6">{children}</div>
    </section>
  );
}

function Demo({ title, note, children, surface = "surface" }: { title: string; note?: ReactNode; children: ReactNode; surface?: "surface" | "canvas" | "dark" }) {
  return (
    <div className="min-w-0">
      <h3 className="text-body font-semibold text-ink">{title}</h3>
      {note && <p className="mt-0.5 text-small leading-relaxed text-text-3">{note}</p>}
      <div
        className={cx(
          "mt-3 min-w-0 rounded-panel p-5 max-sm:p-4",
          surface === "surface" && "bg-surface ring-1 ring-line",
          surface === "canvas" && "bg-canvas ring-1 ring-line",
          surface === "dark" && "on-dark bg-ink",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <span className="text-meta font-medium text-text-3">{children}</span>;
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-xs bg-surface-sunken px-1.5 py-0.5 font-mono text-meta break-all text-ink-2">{children}</code>;
}

/* ======================================================================== */

const STEP_NAMES = ["Connexion", "Découverte", "Données", "Correspondances", "Migration", "Validation", "Reconstruction", "Livraison"];
const EXAMPLE_STATUS: StepperStep["status"][] = ["done", "done", "attention", "current", "upcoming", "upcoming", "upcoming", "upcoming"];

const BUTTON_VARIANTS = [
  ["primary", "Principal", "Action principale de la page (une seule)."],
  ["secondary", "Secondaire", "Actions secondaires."],
  ["ghost", "Discret", "Actions tertiaires, barres d'outils."],
  ["accent", "Validation", "Réservé aux validations (vert-de-gris)."],
  ["danger", "Danger", "Action destructive décisive (confirmation)."],
  ["danger-subtle", "Danger discret", "Action destructive dans le contenu."],
] as const;

const STATES = [
  ["default", "Défaut"],
  ["hover", "Survol"],
  ["focus", "Focus clavier"],
  ["active", "Appui"],
  ["disabled", "Désactivé"],
  ["loading", "Chargement"],
] as const;

export default function DesignSystemPage() {
  const { toast } = useToast();
  const tokens = useTokens(ALL_TOKENS);

  // ----- contrastes (données réelles : jetons servis par la page) -----
  const pairs = useMemo(
    () =>
      tokens
        ? PAIRS.flatMap((p) => {
            const fg = tokens[p.fg];
            const bg = tokens[p.bg];
            return fg && bg ? [{ ...p, ratio: contrast(fg, bg) }] : [];
          })
        : [],
    [tokens],
  );
  const passing = pairs.filter((p) => p.ratio >= p.min).length;
  const [sort, setSort] = useState<{ key: string; direction: SortDirection } | null>({ key: "ratio", direction: "ascending" });
  const [page, setPage] = useState(1);
  const PER_PAGE = 12;
  const sortedPairs = useMemo(() => {
    if (!sort) return pairs;
    const dir = sort.direction === "ascending" ? 1 : -1;
    const val = (p: (typeof pairs)[number]) => (sort.key === "ratio" ? p.ratio : sort.key === "min" ? p.min : sort.key === "fg" ? p.fg : sort.key === "bg" ? p.bg : p.usage);
    return [...pairs].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "fr")) * dir;
    });
  }, [pairs, sort]);
  const pageCount = Math.max(1, Math.ceil(sortedPairs.length / PER_PAGE));
  const pageRows = sortedPairs.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  type PairRow = (typeof pairs)[number];
  const swatch = (name: string) => <span aria-hidden className="inline-block size-3.5 shrink-0 rounded-xs ring-1 ring-line-strong" style={{ background: name === "white" ? "#fff" : `var(--color-${name})` }} />;
  const pairColumns: Column<PairRow>[] = [
    {
      key: "fg",
      header: "Premier plan",
      rowHeader: true,
      sortValue: (r) => r.fg,
      cell: (r) => (
        <span className="inline-flex items-center gap-2 font-mono text-small font-medium">
          {swatch(r.fg)}
          {r.fg === "white" ? "blanc" : r.fg}
        </span>
      ),
    },
    {
      key: "bg",
      header: "Fond",
      sortValue: (r) => r.bg,
      cell: (r) => (
        <span className="inline-flex items-center gap-2 font-mono text-small">
          {swatch(r.bg)}
          {r.bg}
        </span>
      ),
    },
    { key: "ratio", header: "Ratio", align: "end", sortValue: (r) => r.ratio, cell: (r) => <span className="font-semibold">{fr(r.ratio)}:1</span> },
    { key: "min", header: "Seuil", align: "end", sortValue: (r) => r.min, cell: (r) => `${fr(r.min, 1)}:1` },
    { key: "usage", header: "Usage", sortValue: (r) => r.usage, cell: (r) => r.usage },
    { key: "res", header: "Résultat", cell: (r) => (r.ratio >= r.min ? <StatusBadge tone="ok">Conforme</StatusBadge> : <StatusBadge tone="bad">Insuffisant</StatusBadge>) },
  ];

  // ----- démonstrations interactives -----
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [dialogName, setDialogName] = useState("");
  const [search, setSearch] = useState("");
  const [radio, setRadio] = useState<string | null>("lecture");
  const [radioH, setRadioH] = useState<string | null>(null);
  const [checks, setChecks] = useState({ a: false, b: true });
  const [files, setFiles] = useState<File[]>([]);
  const [recovered, setRecovered] = useState(false);
  const [tab, setTab] = useState("apercu");
  const [form, setForm] = useState({ email: "", company: "", terms: false });
  const [formErrors, setFormErrors] = useState<{ email?: string; company?: string; terms?: string }>({});
  const emailRef = useRef<HTMLInputElement>(null);
  const companyRef = useRef<HTMLInputElement>(null);
  const termsRef = useRef<HTMLInputElement>(null);

  const filteredAliases = ALIASES.filter(([a, b]) => !search || `${a} ${b}`.toLowerCase().includes(search.toLowerCase()));

  function submitExample(e: React.FormEvent) {
    e.preventDefault();
    const errs: typeof formErrors = {};
    if (!form.email.trim()) errs.email = "Indiquez une adresse e-mail, par exemple prenom.nom@entreprise.fr.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = "Cette adresse n'est pas valide : vérifiez le « @ » et le nom de domaine.";
    if (!form.company.trim()) errs.company = "Indiquez le nom de l'entreprise.";
    if (!form.terms) errs.terms = "Cochez la case pour continuer.";
    setFormErrors(errs);
    if (errs.email) emailRef.current?.focus();
    else if (errs.company) companyRef.current?.focus();
    else if (errs.terms) termsRef.current?.focus();
    else toast({ tone: "ok", title: "Formulaire valide", description: "Démonstration : rien n'a été envoyé." });
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <Breadcrumb items={[{ label: "Mes projets", href: "/projets" }, { label: "Design system" }]} />
      <header className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[68ch] min-w-0">
          <p className="eyebrow">Équipe REBORN · référence</p>
          <h1 className="mt-1.5 text-h1 font-semibold text-ink">Design system</h1>
          <p className="mt-2 text-lead leading-relaxed text-text-2">
            Les jetons et composants de l&apos;atelier de restauration : sobres, précis, accessibles. Chaque composant est montré avec ses états ; les ratios de contraste sont calculés en direct à partir des
            couleurs réellement servies.
          </p>
        </div>
        <Wordmark size="lg" />
      </header>

      <nav aria-label="Sommaire du design system" className="mt-6 rounded-panel bg-surface px-4 py-3 ring-1 ring-line">
        <ul className="grid grid-cols-2 gap-x-4 sm:flex sm:flex-wrap sm:gap-y-1">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="ds-link inline-flex min-h-8 items-center text-small max-sm:min-h-11">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-10 flex flex-col gap-12">
        {/* ------------------------------------------------------------ */}
        <DocSection
          id="couleurs"
          title="Couleurs et contrastes"
          lead={
            <>
              Une seule couleur d&apos;accent, le vert-de-gris. Texte courant ≥ 4,5:1 sur toutes les surfaces où il apparaît ; bordures de champ et anneau de focus ≥ 3:1. Jetons dans <Code>app/globals.css</Code>{" "}
              (<Code>@theme</Code>), utilitaires Tailwind : <Code>bg-canvas</Code>, <Code>text-text-2</Code>, <Code>border-control-border</Code>…
            </>
          }
        >
          {SWATCHES.map((g) => (
            <Demo key={g.group} title={g.group} note={g.note}>
              <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {g.tokens.map((t) => {
                  const v = tokens?.[t.name];
                  const onCanvas = v && tokens?.canvas ? contrast(v, tokens.canvas) : null;
                  const onSurface = v && tokens?.surface ? contrast(v, tokens.surface) : null;
                  return (
                    <li key={t.name} className="min-w-0">
                      <span aria-hidden className="block h-12 rounded-control ring-1 ring-line-strong ring-inset" style={{ background: `var(--color-${t.name})` }} />
                      <p className="mt-2 font-mono text-small font-medium break-all text-ink">{t.name}</p>
                      <p className="text-meta text-text-3">{t.role}</p>
                      <p className="tabular mt-0.5 text-meta text-text-2">
                        {v ? toHex(v) : "calcul…"}
                        {onCanvas && onSurface && (
                          <>
                            {" "}
                            · {fr(onCanvas)}:1 canvas · {fr(onSurface)}:1 surface
                          </>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </Demo>
          ))}

          <Demo
            title="Couples texte/fond vérifiés"
            note={
              tokens
                ? `${passing} couples conformes sur ${pairs.length} (seuils WCAG 2.x : 4,5:1 pour le texte, 3:1 pour les composants). Tableau triable, paginé.`
                : "Calcul des contrastes…"
            }
          >
            <div className="flex flex-col gap-4">
              <Progress label="Couples conformes" value={tokens ? passing : null} max={Math.max(1, pairs.length)} detail={tokens ? `${passing} sur ${pairs.length}` : undefined} />
              <DataTable
                caption="Ratios de contraste des jetons"
                columns={pairColumns}
                rows={pageRows}
                rowKey={(r) => r.id}
                sort={sort}
                onSortChange={(s) => {
                  setSort(s);
                  setPage(1);
                }}
                manualSort
                empty="Calcul en cours…"
              />
              <Pagination label="Pages du tableau des contrastes" page={page} pageCount={pageCount} onPageChange={setPage} />
            </div>
          </Demo>

          <Demo title="Alias historiques" note="Les anciens noms restent valides et pointent vers les nouveaux jetons : les pages existantes adoptent le nouveau rendu sans changement.">
            <div className="flex flex-col gap-4">
              <div className="max-w-sm">
                <SearchInput label="Filtrer les alias" labelVisible value={search} onValueChange={setSearch} placeholder="Ex. silt, verdigris…" />
              </div>
              {filteredAliases.length ? (
                <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredAliases.map(([alias, target]) => (
                    <li key={alias} className="flex min-w-0 items-center gap-2 text-small">
                      {swatch(alias)}
                      <span className="font-mono break-all text-ink">{alias}</span>
                      <ArrowRight size={13} aria-hidden className="shrink-0 text-text-3" />
                      <span className="font-mono break-all text-text-2">{target}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="Aucun alias ne correspond" action={<Button size="sm" variant="secondary" onClick={() => setSearch("")}>Effacer le filtre</Button>}>
                  Essayez « silt » ou « verdigris ».
                </EmptyState>
              )}
            </div>
          </Demo>
        </DocSection>

        {/* ------------------------------------------------------------ */}
        <DocSection
          id="typographie"
          title="Typographie"
          lead={
            <>
              Instrument Sans pour l&apos;interface, IBM Plex Mono pour les identifiants et valeurs techniques. Échelle ≈ 1,25 depuis 14 px ; 12 px est le minimum. Hiérarchie par la graisse et la couleur autant que
              par la taille ; chiffres tabulaires (<Code>tabular</Code>).
            </>
          }
        >
          <Demo title="Échelle">
            <ul className="flex flex-col divide-y divide-line">
              {(
                [
                  ["text-display", "36 / 42", "Accueil uniquement", "text-display font-semibold"],
                  ["text-h1", "28 / 34", "Titre de page", "text-h1 font-semibold"],
                  ["text-h2", "22 / 28", "Titre de section", "text-h2 font-semibold"],
                  ["text-h3", "18 / 24", "Sous-section, fenêtre", "text-h3 font-semibold"],
                  ["text-lead", "16 / 24", "Chapeau, titre de bloc", "text-lead"],
                  ["text-body", "14 / 20", "Corps de texte", "text-body"],
                  ["text-small", "13 / 18", "Libellés, aides", "text-small"],
                  ["text-meta", "12 / 16", "Métadonnées (minimum)", "text-meta"],
                ] as const
              ).map(([token, size, use, cls]) => (
                <li key={token} className="grid gap-1 py-3 first:pt-0 last:pb-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:items-baseline sm:gap-6">
                  <div>
                    <p className="font-mono text-small text-ink">{token}</p>
                    <p className="text-meta text-text-3">
                      {size} px · {use}
                    </p>
                  </div>
                  <p className={cx("min-w-0 text-ink", cls)}>Restaurer un logiciel métier sans perdre son histoire.</p>
                </li>
              ))}
            </ul>
          </Demo>
          <div className="grid gap-6 lg:grid-cols-2">
            <Demo title="Graisses et couleurs">
              <ul className="flex flex-col gap-1.5 text-lead">
                <li className="font-normal text-ink">Normal 400 — texte courant</li>
                <li className="font-medium text-ink">Moyen 500 — valeurs, liens</li>
                <li className="font-semibold text-ink">Semi-gras 600 — titres, boutons</li>
                <li className="font-bold text-ink">Gras 700 — mot-symbole</li>
                <li className="text-text-2">Texte secondaire (text-2)</li>
                <li className="text-text-3">Métadonnées (text-3)</li>
              </ul>
            </Demo>
            <Demo title="Mono et chiffres">
              <ul className="flex flex-col gap-2 text-body">
                <li>
                  <Code>MIG_a743f759</Code> <Caption>identifiant de projet</Caption>
                </li>
                <li className="font-mono text-small text-ink-2">https://ancien-logiciel.exemple/clients</li>
                <li className="tabular text-lead text-ink">
                  1 234 567,89 € <span className="text-text-3">· tabulaires</span>
                </li>
                <li className="text-body text-text-2">
                  Pourcentages : {formatPercent(0.9996)} reste {formatPercent(0.9996)} (jamais arrondi à 100 %), {formatPercent(0.00004)} n&apos;est pas « 0 % ».
                </li>
              </ul>
            </Demo>
          </div>
        </DocSection>

        {/* ------------------------------------------------------------ */}
        <DocSection id="formes" title="Formes, hauteurs, ombres, mouvement" lead="Base 4 px. Rayons 6 (contrôles), 8 (panneaux), 12 (fenêtres). Contrôles de 36, 40 ou 44 px ; 44 px systématiquement sur mobile. Deux ombres, rares et douces ; transitions de 120 à 200 ms, supprimées si le système demande moins de mouvement.">
          <div className="grid gap-6 lg:grid-cols-2">
            <Demo title="Rayons">
              <div className="flex flex-wrap gap-4">
                {(
                  [
                    ["rounded-control", "6 px · contrôles"],
                    ["rounded-panel", "8 px · panneaux"],
                    ["rounded-dialog", "12 px · fenêtres"],
                  ] as const
                ).map(([cls, label]) => (
                  <div key={cls} className="flex flex-col items-start gap-2">
                    <span aria-hidden className={cx("block size-16 bg-surface-sunken ring-1 ring-control-border ring-inset", cls)} />
                    <span className="font-mono text-meta text-ink">{cls}</span>
                    <Caption>{label}</Caption>
                  </div>
                ))}
              </div>
            </Demo>
            <Demo title="Hauteurs de contrôle">
              <div className="flex flex-col gap-3">
                {(
                  [
                    ["h-control-sm", "36 px · compact"],
                    ["h-control-md", "40 px · par défaut"],
                    ["h-control-lg", "44 px · tactile"],
                  ] as const
                ).map(([cls, label]) => (
                  <div key={cls} className="flex items-center gap-3">
                    <span aria-hidden className={cx("block w-24 shrink-0 rounded-control bg-accent-soft ring-1 ring-accent/40 ring-inset", cls)} />
                    <span className="min-w-0">
                      <span className="block font-mono text-meta text-ink">{cls}</span>
                      <Caption>{label}</Caption>
                    </span>
                  </div>
                ))}
              </div>
            </Demo>
            <Demo title="Ombres" surface="canvas">
              <div className="flex flex-wrap gap-6">
                <div className="flex flex-col gap-2">
                  <span aria-hidden className="block h-16 w-28 rounded-panel bg-surface shadow-raised" />
                  <span className="font-mono text-meta text-ink">shadow-raised</span>
                </div>
                <div className="flex flex-col gap-2">
                  <span aria-hidden className="block h-16 w-28 rounded-panel bg-surface shadow-overlay" />
                  <span className="font-mono text-meta text-ink">shadow-overlay</span>
                </div>
              </div>
            </Demo>
            <Demo title="Focus et mouvement">
              <div className="flex flex-col gap-3 text-body text-text-2">
                <p className="flex flex-wrap items-center gap-3">
                  <Button variant="secondary" data-force="focus" tabIndex={-1}>
                    Anneau de focus
                  </Button>
                  <span>2 px, décalé de 2 px, vert-de-gris (clair sur fond sombre).</span>
                </p>
                <p>
                  Durées : <Code>--duration-fast</Code> 120 ms, <Code>--duration-base</Code> 160 ms, <Code>--duration-slow</Code> 200 ms ; courbe <Code>ease-standard</Code>.
                </p>
              </div>
            </Demo>
          </div>
        </DocSection>

        {/* ------------------------------------------------------------ */}
        <DocSection
          id="boutons"
          title="Boutons"
          lead={
            <>
              <Code>Button</Code> rend un vrai <Code>&lt;button type=&quot;button&quot;&gt;</Code>, ou un lien avec <Code>href</Code>. En chargement : <Code>aria-busy</Code>, indicateur, clics ignorés (pas de double
              soumission) et le focus reste en place. Si <Code>onClick</Code> renvoie une promesse, le chargement est automatique.
            </>
          }
        >
          <Demo title="Variantes et états" note="Survol, focus et appui sont forcés ici pour la revue visuelle.">
            <div className="flex flex-col divide-y divide-line">
              {BUTTON_VARIANTS.map(([variant, name, use]) => (
                <div key={variant} className="grid gap-3 py-4 first:pt-0 last:pb-0 lg:grid-cols-[11rem_minmax(0,1fr)]">
                  <div>
                    <p className="text-body font-semibold text-ink">{name}</p>
                    <p className="text-meta text-text-3">{use}</p>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-3">
                    {STATES.map(([state, label]) => (
                      <div key={state} className="flex flex-col items-start gap-1.5">
                        <Caption>{label}</Caption>
                        <Button
                          variant={variant}
                          size="sm"
                          disabled={state === "disabled"}
                          loading={state === "loading"}
                          data-force={state === "hover" || state === "focus" || state === "active" ? state : undefined}
                          tabIndex={state === "default" ? undefined : -1}
                        >
                          {variant === "danger" || variant === "danger-subtle" ? "Supprimer" : variant === "accent" ? "Valider" : "Continuer"}
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Demo>
          <div className="grid gap-6 lg:grid-cols-2">
            <Demo title="Tailles et icônes">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Button size="sm">Compact 36</Button>
                  <Button>Par défaut 40</Button>
                  <Button size="lg">Tactile 44</Button>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button icon={<Plus size={16} />}>Nouvelle migration</Button>
                  <Button variant="secondary" iconEnd={<ArrowRight size={16} />}>
                    Étape suivante
                  </Button>
                  <Button variant="secondary" href="/projets" iconEnd={<ArrowRight size={16} />}>
                    Lien vers les projets
                  </Button>
                </div>
                <Button variant="secondary" block icon={<Download size={16} />}>
                  Pleine largeur
                </Button>
              </div>
            </Demo>
            <Demo title="Bouton icône et chargement réel" note="Le nom accessible est obligatoire ; il s'affiche aussi en info-bulle au survol et au focus.">
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <IconButton label="Paramètres" icon={<Settings size={18} />} />
                  <IconButton label="Copier" icon={<Copy size={18} />} variant="secondary" />
                  <IconButton label="Supprimer" icon={<Trash2 size={18} />} variant="danger-subtle" />
                  <IconButton label="Fermer" icon={<X size={18} />} size="sm" />
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="primary"
                    loadingText="Enregistrement…"
                    onClick={async () => {
                      await new Promise((r) => setTimeout(r, 1500));
                      toast({ tone: "ok", title: "Enregistré", description: "Démonstration : la promesse a duré 1,5 s, aucun envoi." });
                    }}
                  >
                    Enregistrer (démonstration)
                  </Button>
                  <Caption>Cliquez deux fois de suite : le second clic est ignoré.</Caption>
                </div>
              </div>
            </Demo>
          </div>
        </DocSection>

        {/* ------------------------------------------------------------ */}
        <DocSection
          id="formulaires"
          title="Formulaires"
          lead={
            <>
              <Code>Field</Code> relie libellé, aide et message (<Code>aria-describedby</Code>, <Code>aria-invalid</Code>, <Code>required</Code>) au champ qu&apos;il contient. Contrôles natifs, bordure ≥ 3:1, 44 px de
              haut sur mobile. Un message d&apos;erreur dit ce qui s&apos;est passé et quoi faire.
            </>
          }
        >
          <Demo title="Champs et états">
            <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Nom de l'entreprise">
                <Input placeholder="Ex. Morel Équipements" />
              </Field>
              <Field label="Survol (forcé)">
                <Input data-force="hover" defaultValue="Morel Équipements" />
              </Field>
              <Field label="Focus (forcé)">
                <Input data-force="focus" defaultValue="Morel Équipements" tabIndex={-1} />
              </Field>
              <Field label="Adresse de l'ancien logiciel" hint="Laissez vide si vous déposez seulement des exports." required>
                <Input type="url" inputMode="url" placeholder="https://…" />
              </Field>
              <Field label="E-mail professionnel" error="Cette adresse n'est pas valide : vérifiez le « @ » et le nom de domaine." required>
                <Input type="email" defaultValue="jeanne.morel@" />
              </Field>
              <Field label="Identifiant de connexion" success="Identifiant enregistré.">
                <Input defaultValue="analyse-lecture" />
              </Field>
              <Field label="Champ désactivé" hint="Modifiable après la connexion.">
                <Input disabled defaultValue="Relatio 2004" />
              </Field>
              <Field label="Lecture seule">
                <Input readOnly defaultValue="MIG_a743f759" className="font-mono" />
              </Field>
              <Field label="Compact (36 px)">
                <Input size="sm" placeholder="Filtre rapide" />
              </Field>
            </div>
          </Demo>
          <div className="grid gap-6 lg:grid-cols-2">
            <Demo title="Mot de passe, liste, texte libre">
              <div className="flex flex-col gap-5">
                <Field label="Mot de passe" hint="10 caractères au moins.">
                  <PasswordInput autoComplete="new-password" />
                </Field>
                <Field label="Type de logiciel">
                  <Select defaultValue="">
                    <option value="">Je ne sais pas</option>
                    <option>CRM</option>
                    <option>ERP</option>
                    <option>Facturation / devis</option>
                  </Select>
                </Field>
                <Field label="Informations complémentaires" hint="Modules utilisés, particularités… Pas de mot de passe ici.">
                  <Textarea rows={3} />
                </Field>
              </div>
            </Demo>
            <Demo title="Cases et choix">
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-1">
                  <Checkbox label="Case non cochée" checked={checks.a} onChange={(e) => setChecks((c) => ({ ...c, a: e.target.checked }))} />
                  <Checkbox label="Case cochée" checked={checks.b} onChange={(e) => setChecks((c) => ({ ...c, b: e.target.checked }))} />
                  <Checkbox label="État mixte (partiellement coché)" indeterminate checked={false} onChange={() => undefined} />
                  <Checkbox label="Case désactivée" disabled />
                  <Checkbox label="J'ai lu la notice sur les identifiants" hint="Version 1 du 7 novembre 2026." error="Cochez cette case pour continuer." />
                </div>
                <RadioGroup
                  legend="Type d'accès confié"
                  name="acces"
                  value={radio}
                  onChange={setRadio}
                  hint="Un compte en lecture seule suffit pour l'analyse."
                  options={[
                    { value: "lecture", label: "Lecture seule", hint: "Recommandé." },
                    { value: "complet", label: "Accès complet" },
                    { value: "aucun", label: "Aucun accès (exports seulement)" },
                  ]}
                />
                <RadioGroup
                  legend="Fréquence (horizontal, avec erreur)"
                  name="frequence"
                  orientation="horizontal"
                  value={radioH}
                  onChange={setRadioH}
                  error={radioH ? undefined : "Choisissez une fréquence."}
                  options={[
                    { value: "jour", label: "Chaque jour" },
                    { value: "semaine", label: "Chaque semaine" },
                    { value: "jamais", label: "Jamais", disabled: true },
                  ]}
                />
              </div>
            </Demo>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Demo title="Validation à l'envoi" note="Erreurs reliées aux champs ; le focus va au premier champ en erreur.">
              <form noValidate onSubmit={submitExample} className="flex flex-col gap-4">
                <Field label="E-mail professionnel" required error={formErrors.email}>
                  <Input ref={emailRef} type="email" autoComplete="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                </Field>
                <Field label="Entreprise" required error={formErrors.company}>
                  <Input ref={companyRef} autoComplete="organization" value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
                </Field>
                <Checkbox
                  ref={termsRef}
                  label="J'accepte les conditions d'utilisation (exemple)"
                  checked={form.terms}
                  error={formErrors.terms}
                  onChange={(e) => setForm((f) => ({ ...f, terms: e.target.checked }))}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit">Valider le formulaire</Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setForm({ email: "", company: "", terms: false });
                      setFormErrors({});
                    }}
                  >
                    Réinitialiser
                  </Button>
                </div>
              </form>
            </Demo>
            <Demo title="Dépôt de fichiers" note="Démonstration locale : les fichiers ne quittent pas votre navigateur.">
              <FileUpload label="Exports de l'ancien logiciel" hint="CSV, XLSX ou JSON, 5 Mo au plus par fichier." accept=".csv,.xlsx,.json" maxSizeBytes={5 * 1024 * 1024} files={files} onFilesChange={setFiles} />
            </Demo>
          </div>
        </DocSection>

        {/* ------------------------------------------------------------ */}
        <DocSection id="etats" title="Badges et états" lead="Un état est toujours porté par une icône ET un texte, jamais par la couleur seule. Le vert-de-gris dit « validé », l'ocre « à vérifier », la rouille « en échec ».">
          <div className="grid gap-6 lg:grid-cols-2">
            <Demo title="StatusBadge">
              <div className="flex flex-wrap gap-2">
                <StatusBadge tone="ok">Validé</StatusBadge>
                <StatusBadge tone="running">En cours</StatusBadge>
                <StatusBadge tone="warn">À vérifier</StatusBadge>
                <StatusBadge tone="bad">Échec</StatusBadge>
                <StatusBadge tone="info">Information</StatusBadge>
                <StatusBadge tone="neutral">Brouillon</StatusBadge>
              </div>
            </Demo>
            <Demo title="Badge">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>v1.1</Badge>
                <Badge tone="ok">Restauré</Badge>
                <Badge tone="warn" icon={<KeyRound size={12} />}>
                  Identifiants : 24 h max.
                </Badge>
                <Badge tone="bad">3 rejets</Badge>
                <span className="specimen">RULE_005</span>
              </div>
            </Demo>
          </div>
        </DocSection>

        {/* ------------------------------------------------------------ */}
        <DocSection
          id="retours"
          title="Retours et chargement"
          lead="Messages courts : ce qui s'est passé, quoi faire. Les notifications d'erreur restent affichées jusqu'à leur fermeture ; les autres s'effacent après 6 s (en pause au survol et au focus)."
        >
          <Demo title="Alertes">
            <div className="flex flex-col gap-3">
              <Alert tone="info" title="Analyse en file d'attente" live="off">
                Elle démarrera dès que l&apos;agent d&apos;analyse sera disponible.
              </Alert>
              <Alert tone="ok" title="Connexion établie" live="off">
                L&apos;ancien logiciel répond ; les identifiants seront effacés au plus tard dans 24 h.
              </Alert>
              <Alert tone="warn" title="Intervention nécessaire" live="off" action={<Button size="sm" variant="secondary">Voir les points</Button>}>
                Trois correspondances demandent une validation humaine.
              </Alert>
              <Alert tone="bad" title="Connexion impossible" live="off">
                L&apos;adresse ne répond pas. Vérifiez qu&apos;elle est accessible depuis Internet, puis réessayez.
              </Alert>
            </div>
          </Demo>
          <div className="grid gap-6 lg:grid-cols-2">
            <Demo title="Notifications">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => toast({ tone: "info", title: "Information", description: "Notification de démonstration." })}>
                  Information
                </Button>
                <Button variant="secondary" size="sm" onClick={() => toast({ tone: "ok", title: "Projet enregistré", description: "Démonstration : rien n'a été modifié." })}>
                  Succès
                </Button>
                <Button variant="secondary" size="sm" onClick={() => toast({ tone: "warn", title: "Avertissement", description: "Démonstration d'un avertissement." })}>
                  Avertissement
                </Button>
                <Button variant="secondary" size="sm" onClick={() => toast({ tone: "bad", title: "Erreur", description: "Démonstration : une erreur reste affichée jusqu'à sa fermeture." })}>
                  Erreur
                </Button>
              </div>
            </Demo>
            <Demo title="Progression">
              <div className="flex flex-col gap-5">
                <Progress label="Exemple de formatage" value={9996} max={10000} detail="9 996 sur 10 000" />
                <Progress label="Exemple : attente sans durée connue (indéterminée)" />
                <Progress label="Ton avertissement" value={2} max={8} tone="warn" detail="2 sur 8" />
              </div>
            </Demo>
            <Demo title="Squelette de chargement">
              <Skeleton label="Chargement de l'exemple…" lines={4} />
            </Demo>
            <Demo title="État vide et état d'erreur">
              <div className="flex flex-col gap-4">
                <EmptyState title="Aucun export déposé pour l'instant" action={<Button size="sm" variant="secondary" icon={<Plus size={14} />}>Déposer un fichier</Button>}>
                  Les fichiers reçus apparaîtront ici avec leurs tables.
                </EmptyState>
                {recovered ? (
                  <Alert tone="ok" title="Rechargé" live="polite" action={<Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setRecovered(false)}>Revoir l&apos;erreur</Button>}>
                    Démonstration de reprise réussie.
                  </Alert>
                ) : (
                  <ErrorState
                    title="Chargement impossible (exemple)"
                    message="Le Studio n'a pas répondu. Vérifiez votre connexion, puis réessayez."
                    onRetry={async () => {
                      await new Promise((r) => setTimeout(r, 600));
                      setRecovered(true);
                    }}
                  />
                )}
              </div>
            </Demo>
          </div>
        </DocSection>

        {/* ------------------------------------------------------------ */}
        <DocSection
          id="superpositions"
          title="Fenêtres, menus, info-bulles"
          lead={
            <>
              Fenêtres sur <Code>&lt;dialog&gt;</Code> natif : focus initial, reste de la page inerte, <span className="ds-kbd">Échap</span> pour fermer, retour du focus sur l&apos;élément déclencheur. Menus : flèches,{" "}
              <span className="ds-kbd">Échap</span>, première lettre. Info-bulles au survol et au focus clavier.
            </>
          }
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <Demo title="Fenêtre, confirmation, tiroir">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setDialog(true)}>
                  Ouvrir la fenêtre
                </Button>
                <Button variant="danger-subtle" icon={<Trash2 size={16} />} onClick={() => setConfirm(true)}>
                  Supprimer l&apos;exemple…
                </Button>
                <Button variant="secondary" onClick={() => setDrawer(true)}>
                  Ouvrir le tiroir
                </Button>
              </div>
            </Demo>
            <Demo title="Menu et info-bulles">
              <div className="flex flex-wrap items-center gap-3">
                <Menu
                  label="Actions"
                  items={[
                    { label: "Afficher une notification", onSelect: () => toast({ tone: "info", title: "Choisi dans le menu", description: "Notification de démonstration." }) },
                    {
                      label: "Copier la valeur de l'accent",
                      icon: <Copy size={15} />,
                      onSelect: async () => {
                        const v = tokens?.accent ? toHex(tokens.accent) : "";
                        try {
                          await navigator.clipboard.writeText(v);
                          toast({ tone: "ok", title: `Copié : ${v}` });
                        } catch {
                          toast({ tone: "bad", title: "Copie impossible", description: "Le navigateur a refusé l'accès au presse-papiers." });
                        }
                      },
                    },
                    { separator: true },
                    { label: "Action indisponible", disabled: true },
                    { label: "Réinitialiser les exemples", danger: true, icon: <RotateCcw size={15} />, onSelect: () => { setFiles([]); setRecovered(false); setSearch(""); setPage(1); } },
                  ]}
                />
                <Menu label="Plus d'actions" iconOnly icon={<Ellipsis size={18} />} variant="ghost" align="end" items={[{ label: "Aller aux projets", href: "/" }, { label: "Aller à l'atelier", href: "/atelier" }]} />
                <Tooltip content="Les identifiants de l'ancien logiciel sont effacés au plus tard 24 h après leur dépôt.">
                  <Button variant="ghost" size="sm">
                    Pourquoi 24 h ?
                  </Button>
                </Tooltip>
              </div>
            </Demo>
          </div>
          <Demo title="Onglets">
            <Tabs
              label="Documentation des onglets"
              value={tab}
              onChange={setTab}
              tabs={[
                { id: "apercu", label: "Aperçu", content: <p className="text-body leading-relaxed text-text-2">Un seul onglet est dans l&apos;ordre de tabulation ; les flèches passent d&apos;un onglet à l&apos;autre et l&apos;affichent.</p> },
                { id: "clavier", label: "Clavier", content: <p className="text-body leading-relaxed text-text-2"><span className="ds-kbd">←</span> <span className="ds-kbd">→</span> changent d&apos;onglet, <span className="ds-kbd">Origine</span> et <span className="ds-kbd">Fin</span> vont au premier et au dernier, <span className="ds-kbd">Tab</span> entre dans le panneau.</p> },
                { id: "aria", label: "ARIA", badge: <Badge>3</Badge>, content: <p className="text-body leading-relaxed text-text-2"><Code>role=tablist</Code>, <Code>role=tab</Code> avec <Code>aria-selected</Code> et <Code>aria-controls</Code>, <Code>role=tabpanel</Code> nommé par son onglet.</p> },
              ]}
            />
          </Demo>
        </DocSection>

        {/* ------------------------------------------------------------ */}
        <DocSection id="navigation" title="Navigation" lead="Fil d'Ariane, parcours par étapes (statut textuel pour chaque étape, étape active marquée aria-current) et pagination.">
          <div className="grid gap-6 lg:grid-cols-2">
            <Demo title="Parcours vertical" note="Exemple d'états, sans lien avec un projet réel.">
              <Stepper label="Exemple de parcours" steps={STEP_NAMES.map((label, i) => ({ label, status: EXAMPLE_STATUS[i] }))} />
            </Demo>
            <div className="flex flex-col gap-6">
              <Demo title="Fil d'Ariane">
                <Breadcrumb label="Fil d'Ariane (exemple)" items={[{ label: "Mes projets", href: "/projets" }, { label: "Morel Équipements", href: "/projets" }, { label: "Correspondances" }]} />
              </Demo>
              <Demo title="Parcours horizontal" note="Statut lu par les lecteurs d'écran, discret à l'écran.">
                <Stepper label="Exemple de parcours compact" orientation="horizontal" steps={STEP_NAMES.slice(0, 4).map((label, i) => ({ label, status: EXAMPLE_STATUS[i] }))} />
              </Demo>
              <Demo title="Pagination">
                <Pagination label="Pagination (exemple)" page={page} pageCount={pageCount} onPageChange={setPage} />
              </Demo>
            </div>
          </div>
        </DocSection>

        {/* ------------------------------------------------------------ */}
        <DocSection
          id="donnees"
          title="Données"
          lead="DataTable : légende, en-têtes de colonne et de ligne, tri par boutons (aria-sort, annonce), défilement horizontal signalé et focalisable quand il est nécessaire, fiches empilées sous 640 px, état vide."
        >
          <Demo title="Tableau étroit (défilement signalé)" note="Le même tableau des contrastes, contraint à 520 px pour montrer le défilement.">
            <div className="max-w-[520px]">
              <DataTable caption="Contrastes (vue étroite)" columns={pairColumns} rows={pairs.slice(0, 5)} rowKey={(r) => r.id} initialSort={{ key: "ratio", direction: "descending" }} />
            </div>
          </Demo>
          <Demo title="Tableau vide">
            <DataTable caption="Rejets de la dernière migration (exemple vide)" columns={pairColumns} rows={[]} rowKey={(r) => r.id} empty="Aucun rejet : toutes les lignes ont été importées." />
          </Demo>
        </DocSection>

        {/* ------------------------------------------------------------ */}
        <DocSection
          id="marque"
          title="Mot-symbole"
          lead="« Reborn » en Instrument Sans graissé, « _ » en IBM Plex Mono vert-de-gris : un curseur fixe, sans clignotement. Aucun pictogramme n'est dessiné ; le composant accepte le SVG officiel dès qu'il existera (logoSrc)."
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <Demo title="Sur fond clair">
              <div className="flex flex-wrap items-end gap-8">
                <Wordmark size="sm" />
                <Wordmark size="md" />
                <Wordmark size="lg" />
                <Wordmark size="xl" />
              </div>
            </Demo>
            <Demo title="Sur fond sombre" surface="dark">
              <div className="flex flex-wrap items-end gap-8">
                <Wordmark size="md" onDark />
                <Wordmark size="xl" onDark />
                <a href="#marque" className="inline-flex min-h-6 items-center text-small font-medium text-white underline underline-offset-4 max-sm:min-h-11">
                  Lien sur fond sombre
                </a>
              </div>
            </Demo>
          </div>
        </DocSection>
      </div>

      {/* Fenêtres de démonstration */}
      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Renommer le projet (exemple)"
        description="Le focus est placé dans le champ ; Échap ou « Annuler » ferment la fenêtre et le focus revient sur le bouton d'ouverture."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(false)}>
              Annuler
            </Button>
            <Button
              onClick={() => {
                setDialog(false);
                toast({ tone: "ok", title: "Nom enregistré (démonstration)", description: dialogName ? `« ${dialogName} » — rien n'a été envoyé.` : "Rien n'a été envoyé." });
              }}
            >
              Enregistrer
            </Button>
          </>
        }
      >
        <Field label="Nom du projet" hint="Visible par les membres de votre entreprise.">
          <Input value={dialogName} onChange={(e) => setDialogName(e.target.value)} placeholder="Ex. Migration Relatio" data-autofocus />
        </Field>
      </Dialog>

      <ConfirmationDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        tone="danger"
        title="Supprimer l'exemple ?"
        confirmLabel="Supprimer"
        pendingLabel="Suppression…"
        onConfirm={async () => {
          await new Promise((r) => setTimeout(r, 900));
          toast({ tone: "ok", title: "Exemple supprimé (démonstration)", description: "Aucune donnée n'a été touchée." });
        }}
      >
        Le focus est sur « Annuler », l&apos;action la moins destructrice. Le fond ne ferme pas cette fenêtre.
      </ConfirmationDialog>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Détails (exemple)" description="Un tiroir sert aux détails d'un élément et à la navigation sur mobile.">
        <div className="flex flex-col gap-4">
          <Field label="Commentaire">
            <Textarea rows={4} />
          </Field>
          <Button variant="secondary" onClick={() => setDrawer(false)}>
            Fermer le tiroir
          </Button>
        </div>
      </Drawer>
    </div>
  );
}
