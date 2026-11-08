"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";
import { cx } from "./cx";
import { Button, IconButton } from "./Button";
import { Alert } from "./Alert";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Fenêtre modale native (<dialog> + showModal) : le navigateur rend le reste de la page inerte
 * (piège de focus natif) et gère Échap ; on ajoute le focus initial, le retour du focus à
 * l'élément déclencheur et la fermeture par le fond (optionnelle).
 */
function useModalDialog(open: boolean, onClose: () => void, initialFocus?: RefObject<HTMLElement | null>) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const openRef = useRef(open);
  const onCloseRef = useRef(onClose);
  // Fermetures demandées par ce composant : l'évènement natif « close » correspondant (envoyé
  // de façon asynchrone par le navigateur) est ignoré, il ne doit ni déplacer le focus ni rappeler onClose.
  const ownCloses = useRef(0);

  useLayoutEffect(() => {
    openRef.current = open;
    onCloseRef.current = onClose;
  });

  const restoreFocus = () => {
    const t = returnTo.current;
    returnTo.current = null;
    if (t && t.isConnected) t.focus();
  };

  // Effet de mise en page : le contenu et l'état natif changent dans la même image (pas de cadre vide).
  useLayoutEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      d.showModal();
      const body = d.querySelector<HTMLElement>("[data-dialog-body]");
      const target =
        initialFocus?.current ??
        d.querySelector<HTMLElement>("[data-autofocus]") ??
        body?.querySelector<HTMLElement>(FOCUSABLE) ??
        d.querySelector<HTMLElement>("[data-dialog-footer] button:not([disabled])") ??
        d.querySelector<HTMLElement>("[data-dialog-close]") ??
        d;
      target.focus();
    } else if (!open && d.open) {
      ownCloses.current++;
      d.close();
      restoreFocus(); // retour du focus immédiat, sur l'élément qui a ouvert la fenêtre
    }
  }, [open, initialFocus]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault(); // Échap : c'est l'état React qui ferme
      onCloseRef.current();
    };
    const onNativeClose = () => {
      if (ownCloses.current > 0) {
        ownCloses.current--;
        return;
      }
      // fermeture imposée par le navigateur (ex. Échap répété sans activation) : on se resynchronise
      restoreFocus();
      if (openRef.current) onCloseRef.current();
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("close", onNativeClose);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("close", onNativeClose);
      if (d.open) d.close();
    };
  }, []);

  // Fermeture par le fond : le clic doit commencer ET finir sur le fond (pas une sélection de texte glissée).
  const downOnBackdrop = useRef(false);
  const backdropHandlers = (enabled: boolean) => ({
    onMouseDown: (e: MouseEvent<HTMLDialogElement>) => {
      downOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent<HTMLDialogElement>) => {
      if (enabled && downOnBackdrop.current && e.target === e.currentTarget) onCloseRef.current();
      downOnBackdrop.current = false;
    },
  });

  return { ref, backdropHandlers };
}

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  closeLabel?: string;
  /** Élément à focaliser à l'ouverture (sinon : [data-autofocus], puis le premier champ du contenu). */
  initialFocus?: RefObject<HTMLElement | null>;
  closeOnBackdrop?: boolean;
  className?: string;
};

const WIDTH = { sm: "26rem", md: "35rem", lg: "46rem" } as const;
/**
 * Mouvement réduit : le fond (::backdrop) n'est pas couvert par la règle globale (*, ::before, ::after),
 * son fondu est donc retiré ici.
 */
const NO_BACKDROP_MOTION = "motion-reduce:backdrop:animate-none";

function Frame({
  titleId,
  descId,
  title,
  description,
  children,
  footer,
  closeLabel,
  onClose,
}: {
  titleId: string;
  descId: string;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  onClose: () => void;
}) {
  return (
    <>
      <header className="flex items-start justify-between gap-4 border-b border-line py-4 pr-3 pl-6">
        <div className="min-w-0 pt-1.5">
          <h2 id={titleId} className="text-h3 font-semibold text-ink">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-1 text-body leading-relaxed text-text-2">
              {description}
            </p>
          )}
        </div>
        <IconButton data-dialog-close label={closeLabel} icon={<X size={18} />} onClick={onClose} tooltip={false} />
      </header>
      <div data-dialog-body className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
        {children}
      </div>
      {footer && (
        <footer data-dialog-footer className="flex flex-col-reverse gap-2 border-t border-line bg-canvas px-6 py-4 sm:flex-row sm:justify-end">
          {footer}
        </footer>
      )}
    </>
  );
}

/** Fenêtre modale : titre relié (aria-labelledby), description reliée, bouton Fermer, Échap, fond. */
export function Dialog({ open, onClose, title, description, children, footer, size = "md", closeLabel = "Fermer", initialFocus, closeOnBackdrop = true, className }: DialogProps) {
  const id = useId();
  const { ref, backdropHandlers } = useModalDialog(open, onClose, initialFocus);
  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-t`}
      aria-describedby={description ? `${id}-d` : undefined}
      className={cx("ds-dialog", NO_BACKDROP_MOTION, className)}
      style={{ "--dialog-width": WIDTH[size] } as CSSProperties}
      {...backdropHandlers(closeOnBackdrop)}
    >
      {open && (
        <Frame titleId={`${id}-t`} descId={`${id}-d`} title={title} description={description} footer={footer} closeLabel={closeLabel} onClose={onClose}>
          {children}
        </Frame>
      )}
    </dialog>
  );
}

/** Tiroir latéral (même mécanique que Dialog) : navigation mobile, détails d'un élément. */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = "right",
  closeLabel = "Fermer",
  initialFocus,
  className,
}: Omit<DialogProps, "size" | "closeOnBackdrop"> & { side?: "right" | "left" }) {
  const id = useId();
  const { ref, backdropHandlers } = useModalDialog(open, onClose, initialFocus);
  return (
    <dialog
      ref={ref}
      data-side={side}
      aria-labelledby={`${id}-t`}
      aria-describedby={description ? `${id}-d` : undefined}
      className={cx("ds-dialog ds-drawer", NO_BACKDROP_MOTION, className)}
      {...backdropHandlers(true)}
    >
      {open && (
        <Frame titleId={`${id}-t`} descId={`${id}-d`} title={title} description={description} footer={footer} closeLabel={closeLabel} onClose={onClose}>
          {children}
        </Frame>
      )}
    </dialog>
  );
}

/**
 * Confirmation : focus initial sur « Annuler » (l'action la moins destructrice), pas de fermeture
 * par le fond, bouton de confirmation en chargement pendant l'action (pas de double soumission).
 * Si `onConfirm` échoue, la fenêtre reste ouverte et affiche le message.
 */
export function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel,
  cancelLabel = "Annuler",
  pendingLabel,
  tone = "default",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  pendingLabel?: string;
  tone?: "default" | "danger";
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "L'action n'a pas abouti. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={title}
      size="sm"
      initialFocus={cancel}
      closeOnBackdrop={false}
      footer={
        <>
          <Button ref={cancel} variant="secondary" onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} loading={busy} loadingText={pendingLabel} onClick={confirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children && <div className="text-body leading-relaxed text-text-2">{children}</div>}
      {error && (
        <Alert tone="bad" className="mt-4">
          {error}
        </Alert>
      )}
    </Dialog>
  );
}
