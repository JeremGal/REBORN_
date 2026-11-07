"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { Button, Field, Panel, inputCls } from "@/components/ui";

/**
 * Mode réseau (npm run dev:lan) : ouvre la session d'écriture du navigateur.
 * Le jeton est lu depuis le fragment (#token=…, jamais envoyé au serveur dans l'URL)
 * ou saisi, puis transmis par POST. `npm run connect` ouvre cette page pré-remplie.
 */
export default function Connexion() {
  const [token, setToken] = useState("");
  const [state, setState] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const auto = useRef(false);

  async function login(value: string) {
    setBusy(true);
    setState(null);
    try {
      const r = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: value }) });
      if (!r.ok) throw new Error(r.status === 401 ? "Jeton invalide." : `Erreur HTTP ${r.status}`);
      setState({ ok: true, text: "Session ouverte : les actions du dashboard sont autorisées pendant 12 h." });
      setTimeout(() => window.location.assign("/"), 700);
    } catch (e) {
      setState({ ok: false, text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const m = /(?:^#|&)token=([^&]+)/.exec(window.location.hash);
    // Le fragment est effacé de la barre d'adresse et de l'historique immédiatement
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
    if (m && !auto.current) {
      auto.current = true;
      void login(decodeURIComponent(m[1]));
    }
  }, []);

  async function logout() {
    await fetch("/api/session", { method: "DELETE" });
    setState({ ok: true, text: "Session fermée." });
  }

  return (
    <div className="mx-auto max-w-lg py-10">
      <Panel eyebrow="Mode réseau" title="Autoriser ce navigateur">
        <p className="mb-4 text-[13px] text-sediment">
          En mode réseau (<code className="font-mono text-[12px]">npm run dev:lan</code>), les actions du dashboard exigent le jeton d&apos;API. Sur le poste qui lance la
          plateforme, <code className="font-mono text-[12px]">npm run connect</code> ouvre cette page déjà authentifiée ; ailleurs, collez le jeton transmis par Jerem.
        </p>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void login(token.trim());
          }}
        >
          <Field label="Jeton d'API">
            <input name="token" type="password" autoComplete="off" className={inputCls} value={token} onChange={(e) => setToken(e.target.value)} />
          </Field>
          <div className="flex items-center justify-between gap-3">
            <button type="button" onClick={logout} className="text-[12px] font-bold text-sediment hover:text-ink">
              Fermer la session
            </button>
            <Button type="submit" disabled={busy || !token.trim()}>
              <KeyRound size={14} /> {busy ? "Vérification…" : "Ouvrir la session"}
            </Button>
          </div>
        </form>
        {state && <p className={`mt-3 text-[12.5px] ${state.ok ? "text-verdigris" : "text-rust"}`}>{state.text}</p>}
      </Panel>
    </div>
  );
}
