import { cx } from "@/components/ds/cx";

/**
 * Élément graphique de la marque : des strates (carnet de fouille). À gauche, des lignes usées,
 * interrompues, légèrement de travers ; à droite, les mêmes lignes restaurées, continues ; une seule
 * strate est « validée » en vert-de-gris, avec le curseur du mot-symbole au front de restauration.
 * Purement décoratif (aria-hidden), dessiné en SVG, sans animation ni dégradé. La couleur des lignes
 * suit la couleur du texte du conteneur (currentColor) : fond sombre ou clair.
 */

const W = 480;
const ROWS = 8;
const GAP = 30;
const FRONT = 292;
const VALIDATED = 3;

/** Motif de pointillés irrégulier mais déterministe (identique au serveur et au navigateur). */
function wornPattern(row: number): string {
  const out: number[] = [];
  let k = row * 13 + 5;
  let x = 0;
  while (x < FRONT) {
    k = (k * 37 + 11) % 101;
    const dash = 5 + (k % 41);
    k = (k * 37 + 11) % 101;
    const gap = 3 + (k % 11);
    out.push(dash, gap);
    x += dash + gap;
  }
  return out.join(" ");
}

/** Léger affaissement des strates anciennes (quelques dixièmes de pixel, sans hasard). */
const sag = (row: number, x: number) => Math.round(Math.sin((x / 70) * (1 + row * 0.13) + row) * (1.2 + (row % 3) * 0.4) * 10) / 10;

export function Strata({ className, onDark = false }: { className?: string; /** Fond sombre : vert-de-gris clair (contraste). */ onDark?: boolean }) {
  const height = (ROWS - 1) * GAP + 24;
  const accent = onDark ? "stroke-accent-bright" : "stroke-accent";
  return (
    <svg viewBox={`0 0 ${W} ${height}`} aria-hidden focusable="false" className={cx("block h-auto w-full", className)}>
      {Array.from({ length: ROWS }, (_, row) => {
        const y = 12 + row * GAP;
        const worn = Array.from({ length: 13 }, (_, i) => {
          const x = (i / 12) * (FRONT - 14);
          return `${x.toFixed(1)},${(y + sag(row, x)).toFixed(1)}`;
        }).join(" ");
        const validated = row === VALIDATED;
        return (
          <g key={row}>
            <polyline points={worn} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={1.5} strokeDasharray={wornPattern(row)} />
            <line
              x1={FRONT + 14}
              x2={W}
              y1={y}
              y2={y}
              strokeWidth={validated ? 2 : 1.5}
              className={validated ? accent : undefined}
              stroke={validated ? undefined : "currentColor"}
              strokeOpacity={validated ? 1 : 0.62}
            />
          </g>
        );
      })}
      {/* Front de restauration : le curseur « _ » du mot-symbole, posé sur la strate validée */}
      <rect x={FRONT - 6} y={12 + VALIDATED * GAP + 5} width={14} height={3} className={onDark ? "fill-accent-bright" : "fill-accent"} />
      <line x1={FRONT} x2={FRONT} y1={4} y2={height - 4} stroke="currentColor" strokeOpacity={0.18} strokeWidth={1} />
    </svg>
  );
}
