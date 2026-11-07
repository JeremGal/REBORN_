"use client";

import { useState } from "react";
import { Eraser, KeyRound, LockKeyhole } from "lucide-react";
import { Button, Field, Panel, cx, inputCls } from "@/components/ui";
import { useProject } from "./ProjectProvider";
import { ConnLoading, ConnNotice, connDate, useConnAction } from "./ConnShared";

/** Durées acceptées par l'API (0,25 h à 168 h) ; 24 h est la valeur par défaut du coffre. */
const TTL = [
  { value: "1", label: "1 heure" },
  { value: "4", label: "4 heures" },
  { value: "8", label: "8 heures" },
  { value: "24", label: "24 heures (recommandé)" },
  { value: "72", label: "3 jours" },
  { value: "168", label: "7 jours (maximum)" },
];

/**
 * Identifiants de l'ancien logiciel : seul l'indice masqué et l'échéance renvoyés par l'API sont
 * affichés. Le mot de passe saisi n'est jamais montré et le champ est vidé après l'envoi.
 */
export function ConnCredentialsPanel() {
  const { id, details, post, del, refresh } = useProject();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [ttl, setTtl] = useState("24");
  const { busy, result, run } = useConnAction();
  const creds = details?.credentials;
  const spaced = username.length > 0 && username.trim() !== username;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    await run(
      "store",
      async () => {
        const r = await post<{ username_hint: string; expires_at: string }>(`/api/projects/${id}/credentials`, { username, password, ttl_hours: Number(ttl) });
        setUsername("");
        setPassword("");
        return { tone: "ok", title: "Identifiants chiffrés et confiés au projet", text: `Compte ${r.username_hint} · effacement automatique le ${connDate(r.expires_at)}.` };
      },
      { errorTitle: "Identifiants non enregistrés", after: refresh },
    );
  }

  async function forget() {
    await run(
      "forget",
      async () => {
        await del(`/api/projects/${id}/credentials`);
        return { tone: "ok", title: "Identifiants effacés", text: "Le fichier chiffré et tout jeton de remise en cours ont été supprimés." };
      },
      { errorTitle: "Effacement impossible", after: refresh },
    );
  }

  return (
    <Panel eyebrow="Accès confié par le propriétaire" title="Identifiants de l'ancien logiciel">
      {!creds ? (
        <ConnLoading label="Lecture de l'état des identifiants…" lines={2} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className={cx("flex flex-wrap items-start justify-between gap-3 rounded-md p-3", creds.stored ? "bg-verdigris-soft" : "bg-chalk")}>
            <div className="flex min-w-0 items-start gap-2.5">
              {creds.stored ? <KeyRound size={16} className="mt-0.5 shrink-0 text-verdigris" aria-hidden /> : <LockKeyhole size={16} className="mt-0.5 shrink-0 text-silt" aria-hidden />}
              <div className="min-w-0">
                <p className={cx("text-[13.5px] font-bold", creds.stored ? "text-[#0b6b5f]" : "text-ink")}>{creds.stored ? "Identifiants confiés" : "Aucun identifiant confié"}</p>
                {creds.stored ? (
                  <p className="mt-0.5 text-[12.5px] text-ink/80">
                    Compte <span className="font-mono text-[12px] text-ink">{creds.username_hint ?? "masqué"}</span> · effacement automatique le {connDate(creds.expires_at)}
                  </p>
                ) : (
                  <p className="mt-0.5 text-[12.5px] text-sediment">Sans compte, l&apos;agent ne peut pas se connecter. Les données peuvent aussi être déposées directement à l&apos;étape Données.</p>
                )}
              </div>
            </div>
            {creds.stored && (
              <Button variant="danger" size="sm" onClick={() => { if (window.confirm("Effacer les identifiants confiés ? Il faudra les confier à nouveau pour toute connexion ou extraction.")) void forget(); }} disabled={!!busy}>
                <Eraser size={13} aria-hidden /> {busy === "forget" ? "Effacement…" : "Effacer les identifiants"}
              </Button>
            )}
          </div>

          <form onSubmit={submit} className="flex flex-col gap-3" autoComplete="off">
            <div className="text-[12.5px] font-bold text-ink">{creds.stored ? "Remplacer les identifiants" : "Confier des identifiants"}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Identifiant">
                <input
                  className={inputCls}
                  name="legacy-account"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={200}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                />
              </Field>
              <Field label="Mot de passe">
                <input
                  className={inputCls}
                  name="legacy-secret"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  maxLength={500}
                  autoComplete="new-password"
                  required
                />
              </Field>
            </div>
            {spaced && <p className="text-[12px] text-ochre">L&apos;identifiant commence ou se termine par une espace : il sera transmis tel quel.</p>}
            <div className="flex flex-col gap-1.5">
              <div className="grid items-end gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Field label="Durée de conservation">
                  <select className={inputCls} value={ttl} onChange={(e) => setTtl(e.target.value)} name="legacy-ttl">
                    {TTL.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Button type="submit" variant="primary" disabled={!username.trim() || !password || !!busy}>
                  <KeyRound size={14} aria-hidden /> {busy === "store" ? "Chiffrement…" : creds.stored ? "Remplacer" : "Chiffrer et confier"}
                </Button>
              </div>
              <p className="text-[11.5px] text-silt">Effacement automatique à l&apos;échéance, ou immédiat avec « Effacer les identifiants ».</p>
            </div>
          </form>

          {result && <ConnNotice live tone={result.tone} title={result.title}>{result.text}</ConnNotice>}

          <ul className="flex flex-col gap-1 border-t border-line pt-3 text-[12px] leading-snug text-sediment">
            <li>• Chiffrés au repos (AES-256-GCM), jamais renvoyés par l&apos;API ni affichés : seul un indice masqué du compte apparaît.</li>
            <li>• Remis à l&apos;exécuteur de l&apos;agent par un jeton à usage unique (15 min), jamais transmis à un modèle de langage.</li>
            <li>• Servent uniquement à l&apos;ancien logiciel ; privilégiez un compte dédié en lecture seule.</li>
            <li className="text-silt">Limite : la clé de chiffrement est conservée sur le même poste que les données du projet.</li>
          </ul>
        </div>
      )}
    </Panel>
  );
}
