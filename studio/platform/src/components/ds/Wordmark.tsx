import { cx } from "./cx";

/** Tailles prises dans l'échelle typographique : 16 · 22 · 28 · 36 px. */
const SIZE = {
  sm: "text-lead",
  md: "text-h2",
  lg: "text-h1",
  xl: "text-display",
} as const;

/**
 * Mot-symbole « Reborn_ » : « Reborn » en sans-serif graissé, « _ » en IBM Plex Mono couleur
 * d'accent (curseur fixe, sans clignotement). Nom accessible : « REBORN ».
 * Aucun fichier de logo n'existe encore : quand le SVG officiel sera fourni, passer `logoSrc`
 * (et ses dimensions) ; aucun pictogramme n'est dessiné ici.
 */
export function Wordmark({
  size = "md",
  onDark = false,
  className,
  logoSrc,
  logoWidth,
  logoHeight,
}: {
  size?: keyof typeof SIZE;
  /** Sur fond sombre : texte blanc, curseur vert-de-gris clair. */
  onDark?: boolean;
  className?: string;
  logoSrc?: string;
  logoWidth?: number;
  logoHeight?: number;
}) {
  if (logoSrc) {
    // eslint-disable-next-line @next/next/no-img-element -- SVG officiel servi tel quel
    return <img src={logoSrc} alt="REBORN" width={logoWidth} height={logoHeight} className={className} />;
  }
  return (
    <span role="img" aria-label="REBORN" className={cx("inline-flex items-baseline leading-none whitespace-nowrap select-none", SIZE[size], onDark ? "text-white" : "text-ink", className)}>
      <span aria-hidden className="font-sans font-bold tracking-[-0.03em]">
        Reborn
      </span>
      <span aria-hidden className={cx("font-mono font-medium", onDark ? "text-accent-bright" : "text-accent")}>
        _
      </span>
    </span>
  );
}
