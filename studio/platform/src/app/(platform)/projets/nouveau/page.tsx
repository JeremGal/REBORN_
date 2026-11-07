"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Button, Field, inputCls } from "@/components/ui";

const TYPES = ["CRM", "ERP", "Facturation / devis", "Gestion commerciale", "Comptabilité", "Logiciel métier spécifique", "Autre"];
const AUTHORIZATION = "Je confirme être autorisé(e) par le propriétaire des données à faire analyser ce logiciel et à en migrer les données, dans la limite des accès fournis.";

export default function NewProject() {
  const router = useRouter();
  const [f, setF] = useState({ company: "", software: "", legacy_url: "", software_type: "", notes: "", username: "", password: "", authorized: false, authorized_by: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const canSubmit = f.company.trim() && f.authorized && f.authorized_by.trim() && !busy && (!f.username || f.password);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          company: f.company,
          software: f.software || undefined,
          legacy_url: f.legacy_url || undefined,
          software_type: f.software_type || undefined,
          notes: f.notes || undefined,
          authorized: f.authorized,
          authorized_by: f.authorized_by,
          credentials: f.username && f.password ? { username: f.username, password: f.password } : undefined,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error([d.error, ...(d.issues ?? []).map((i: { message: string }) => i.message)].filter(Boolean).join(" — "));
      setF((x) => ({ ...x, password: "" }));
      router.push(`/projets/${d.project.id}/connexion`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <Link href="/" className="text-[12px] font-bold text-silt hover:text-ink">
        ← Projets
      </Link>
      <h1 className="mt-1 text-[26px] leading-tight font-black tracking-[-0.03em]">Nouvelle migration</h1>
      <p className="mt-1 text-[13.5px] text-sediment">Décrivez l'ancien logiciel et l'accès autorisé. Rien n'est lancé tant que vous ne le demandez pas.</p>

      <form onSubmit={submit} className="card mt-5 flex flex-col gap-6 p-5" autoComplete="off">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="eyebrow mb-2 sm:col-span-2">Entreprise et ancien logiciel</legend>
          <Field label="Nom de l'entreprise *">
            <input className={inputCls} value={f.company} onChange={set("company")} required maxLength={120} placeholder="Ex. Morel Équipements" />
          </Field>
          <Field label="Nom du logiciel">
            <input className={inputCls} value={f.software} onChange={set("software")} maxLength={120} placeholder="Ex. Relatio 2004" />
          </Field>
          <Field label="Adresse (URL) de l'ancien logiciel" hint="http(s)://… — laissez vide si vous déposerez seulement des exports">
            <input className={inputCls} value={f.legacy_url} onChange={set("legacy_url")} maxLength={500} placeholder="http://127.0.0.1:4100" inputMode="url" />
          </Field>
          <Field label="Type de logiciel">
            <select className={inputCls} value={f.software_type} onChange={set("software_type")}>
              <option value="">Je ne sais pas</option>
              {TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Informations complémentaires" hint="Modules utilisés, particularités, personnes à contacter… (pas de mot de passe ici)">
              <textarea className={`${inputCls} min-h-20 py-2`} value={f.notes} onChange={set("notes")} maxLength={2000} />
            </Field>
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="eyebrow mb-1 sm:col-span-2">Accès à l'ancien logiciel (facultatif)</legend>
          <p className="flex gap-2 rounded-sm bg-chalk p-3 text-[12.5px] leading-relaxed text-sediment sm:col-span-2">
            <KeyRound size={15} className="mt-0.5 shrink-0 text-verdigris" />
            Les identifiants sont chiffrés, conservés 24 h au plus, jamais affichés ni journalisés, et ne servent qu'à se connecter à l'ancien logiciel. Ils ne sont pas réutilisés pour le nouveau logiciel. Privilégiez un compte dédié, en lecture seule.
          </p>
          <Field label="Identifiant">
            <input className={inputCls} value={f.username} onChange={set("username")} maxLength={200} autoComplete="off" />
          </Field>
          <Field label="Mot de passe">
            <input className={inputCls} type="password" value={f.password} onChange={set("password")} maxLength={500} autoComplete="new-password" />
          </Field>
        </fieldset>

        <fieldset className="flex flex-col gap-3">
          <legend className="eyebrow mb-1">Autorisation</legend>
          <label className="flex cursor-pointer gap-2.5 rounded-sm p-3 text-[13px] leading-relaxed shadow-[0_0_0_1px_var(--color-line-strong)] has-[:checked]:bg-verdigris-soft/60">
            <input type="checkbox" className="mt-1 accent-[var(--color-verdigris)]" checked={f.authorized} onChange={set("authorized")} />
            <span>{AUTHORIZATION}</span>
          </label>
          <Field label="Nom de la personne qui confirme *">
            <input className={inputCls} value={f.authorized_by} onChange={set("authorized_by")} maxLength={120} />
          </Field>
        </fieldset>

        {error && <p className="rounded-sm bg-rust-soft p-3 text-[13px] text-rust">{error}</p>}

        <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
          <span className="flex items-center gap-1.5 text-[12px] text-silt">
            <ShieldCheck size={14} /> L'analyse respecte les droits du compte fourni : aucun contournement.
          </span>
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            {busy ? "Création…" : "Créer le projet"}
          </Button>
        </div>
      </form>
    </div>
  );
}
