"use client";

/**
 * Lien d'évitement « Aller au contenu » : premier élément focalisable de chaque page.
 * Cible `#contenu`, posé par les layouts sur leur `<main>` (espace connecté, site public, pages de
 * connexion). Une page sans cet identifiant reste couverte : le premier `<main>` reçoit le focus.
 * Le focus est placé sans anneau (voir globals.css).
 */
export function SkipLink({ label = "Aller au contenu" }: { label?: string }) {
  return (
    <a
      href="#contenu"
      onClick={(e) => {
        const target = document.getElementById("contenu") ?? document.querySelector("main");
        if (!target) return;
        e.preventDefault();
        if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
        target.focus();
        target.scrollIntoView({ block: "start" });
      }}
      className="btn btn-primary ds-skip"
    >
      {label}
    </a>
  );
}
