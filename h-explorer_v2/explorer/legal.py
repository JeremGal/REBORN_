"""Legal & regulatory frame of an ERP, researched with Linkup, placed at the top of REPORT.md.

    from explorer.legal import legal_frame, render_legal
    frame = legal_frame(app_map)          # profile -> one deep search per domain (parallel)
    md = render_legal(frame)              # "## 0. Cadre légal et normes" section

Rules of use (REBORN): web sources describe what the law requires; they never validate a behaviour
observed in the app. This is an automated synthesis, not legal advice: to be checked by a lawyer /
chartered accountant before relying on it.
"""
from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from typing import Annotated, Optional

from pydantic import BaseModel, BeforeValidator, Field

from explorer.context import _api_key  # also activates truststore (Avast)

L = lambda t: Annotated[list[t], BeforeValidator(lambda v: v or [])]  # noqa: E731  (null -> [])
DEPTH = "deep"
TIMEOUT_S = 240


class DomainRelevance(BaseModel):
    domain: str = Field(default="", description="Generic domain name, exactly as given")
    relevance: str = Field(default="conditional", description="core | conditional | not_relevant")
    reason: str = Field(default="", description="One sentence why")


class Profile(BaseModel):
    sector: str = Field(default="", description="Business sector of the company using the software")
    activities: L(str) = Field(default_factory=list, description="Business activities the software supports")
    country: str = Field(default="France", description="Main jurisdiction")
    data_handled: L(str) = Field(default_factory=list, description="Kinds of data handled (customers, employees, "
                                                                   "vehicles, products, prices, invoices, locations...)")
    specific_topics: L(str) = Field(default_factory=list, description="Sector-specific regulatory topics to research "
                                                                      "(product rules, safety, environment, transport...), "
                                                                      "NOT already covered by the generic domains")
    domain_relevance: L(DomainRelevance) = Field(default_factory=list,
                                                 description="Relevance of EACH generic domain listed in the question")


class Norm(BaseModel):
    name: str = Field(default="", description="Name of the law / regulation / standard")
    reference: str = Field(default="", description="Exact reference: text, article, number, date (e.g. CGI art. 242 nonies A, "
                                                   "Règlement (UE) 2020/740)")
    applies_because: str = Field(default="", description="Why it applies to this company/software")
    obligations: L(str) = Field(default_factory=list, description="Concrete obligations")
    software_impact: L(str) = Field(default_factory=list, description="What the ERP must do concretely: mandatory fields, "
                                                                      "controls, retention, exports, logs, rights...")
    in_force: str = Field(default="", description="In force since / from (dates, upcoming deadlines)")
    penalties: str = Field(default="", description="Sanctions if not respected (if known)")


class Domain(BaseModel):
    applicable: bool = Field(default=True, description="Does this domain apply to this software at all?")
    summary: str = Field(default="", description="2-3 sentence summary for this domain")
    norms: L(Norm) = Field(default_factory=list)


DOMAINS = [
    ("Facturation, devis et TVA", "mentions obligatoires des devis/factures/bons de livraison, numérotation, TVA, "
     "réforme de la facturation électronique B2B (calendrier 2026-2027), logiciels de caisse/gestion certifiés"),
    ("Comptabilité, conservation et archivage", "obligations comptables, durées de conservation, fichier des écritures "
     "comptables (FEC), piste d'audit fiable, inaltérabilité, valeur probante des documents numériques"),
    ("Données personnelles (RGPD)", "RGPD et loi Informatique et Libertés : données clients, salariés, techniciens, "
     "géolocalisation de véhicules/appareils, durée de conservation, droits des personnes, registre, sécurité"),
    ("Réglementation produit du secteur", "règles applicables aux produits gérés par le logiciel : étiquetage, "
     "homologation, sécurité, information du client, traçabilité réglementaire"),
    ("Environnement et fin de vie", "responsabilité élargie du producteur (REP), éco-contribution, collecte et "
     "traçabilité des déchets, registres environnementaux"),
    ("Stock, inventaire et traçabilité", "inventaire physique obligatoire, valorisation des stocks, traçabilité des "
     "mouvements, réserves de propriété, preuves en cas de litige"),
    ("Travail, sécurité et flotte de véhicules", "sécurité des techniciens et habilitations, temps de travail, "
     "véhicules et camions de l'entreprise, obligations liées à la flotte et au transport"),
    ("Sécurité informatique et gestion des accès", "contrôle d'accès et rôles, journalisation, sauvegardes, "
     "cybersécurité (NIS2 si applicable), perte/vol d'appareils mobiles, accessibilité numérique"),
]


def _search(query: str, schema: type[BaseModel]) -> dict:
    """One Linkup structured search with sources. Never raises."""
    from linkup import LinkupClient

    key = _api_key()
    if not key:
        return {"status": "skipped", "reason": "LINKUP_API_KEY not set"}
    t0 = time.monotonic()
    for attempt in range(2):
        try:
            resp = LinkupClient(api_key=key).search(
                query=query, depth=DEPTH, output_type="structured", structured_output_schema=schema,
                include_sources=True, timeout=TIMEOUT_S)
            data = getattr(resp, "data", None)
            data = data if isinstance(data, dict) else (json.loads(data) if isinstance(data, str) else {})
            sources = [{"name": getattr(s, "name", ""), "url": getattr(s, "url", "")}
                       for s in (getattr(resp, "sources", None) or [])]
            return {"status": "ok", "data": schema.model_validate(data).model_dump(),
                    "sources": [s for s in sources if s["url"]][:12], "duration_s": round(time.monotonic() - t0, 1)}
        except Exception as exc:
            err = f"{type(exc).__name__}: {exc}"[:300]
            if attempt == 1:
                return {"status": "error", "error": err, "duration_s": round(time.monotonic() - t0, 1)}
            time.sleep(3)


def _app_description(app_map: dict) -> str:
    pages = "; ".join(f"{p.get('name')} ({p.get('purpose', '')})" for p in app_map.get("pages", [])[:15])
    flows = "; ".join(app_map.get("workflows", [])[:15])
    return f"{app_map.get('app_summary', '')}\nÉcrans : {pages}\nParcours : {flows}"


def legal_frame(app_map: dict, country_hint: str = "France") -> dict:
    """Profile the business, then research every legal domain in parallel. Never raises."""
    t0 = time.monotonic()
    desc = _app_description(app_map)
    year = date.today().year
    profile_res = _search(
        f"Voici un logiciel de gestion (ERP) utilisé par une entreprise ({country_hint}) :\n{desc}\n\n"
        "Identifie le secteur d'activité exact de l'entreprise, ses activités, le pays, les types de données "
        "manipulées par le logiciel, et la liste des sujets réglementaires SPÉCIFIQUES à ce secteur qu'il faut "
        "étudier (réglementation produit, sécurité, environnement, transport, etc.), SANS reprendre les domaines "
        "génériques ci-dessous. Enfin, pour CHACUN de ces domaines génériques, indique sa pertinence pour cette "
        "entreprise (core / conditional / not_relevant) avec une phrase de justification :\n"
        + "\n".join(f"- {n}" for n, _ in DOMAINS), Profile)
    profile = Profile.model_validate(profile_res.get("data") or {})
    sector = profile.sector or "entreprise utilisatrice de ce logiciel"

    rel = {r.domain.strip().lower(): r for r in profile.domain_relevance}
    skipped, generic = [], []
    for name, scope in DOMAINS:
        r = rel.get(name.lower())
        if r and r.relevance == "not_relevant":
            skipped.append({"domain": name, "reason": r.reason})
        else:
            generic.append((name, scope))
    generic_words = ("rgpd", "données personnelles", "cybersécurité", "sécurité informatique", "facturation", "tva",
                     "comptab", "archivage")
    specific = [t for t in profile.specific_topics
                if not any(w in t.lower().split(":")[0] for w in generic_words)][:8]
    domains = generic + [(t, "sujet réglementaire spécifique au secteur") for t in specific]

    def research(item):
        name, scope = item
        q = (f"Contexte : logiciel de gestion (ERP) d'une entreprise du secteur « {sector} » en {profile.country or country_hint}. "
             f"Activités : {', '.join(profile.activities[:8])}. Données : {', '.join(profile.data_handled[:10])}.\n"
             f"Domaine : {name} ({scope}).\n"
             f"Liste TOUTES les normes légales, réglementaires et standards en vigueur en {year} (et les échéances à venir) "
             "dans ce domaine qui s'appliquent à cette entreprise et à son logiciel. Pour chacune : référence exacte du "
             "texte, pourquoi elle s'applique, obligations concrètes, impact concret sur le logiciel (champs obligatoires, "
             "contrôles, conservation, exports, journaux, droits), date d'entrée en vigueur, sanctions. Si le domaine ne "
             "s'applique pas, indique applicable=false et explique pourquoi. Sources officielles en priorité "
             "(Légifrance, EUR-Lex, impots.gouv, CNIL, economie.gouv, ADEME).")
        return {"domain": name, **_search(q, Domain)}

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(research, domains))
    for r in results:
        rr = rel.get(r["domain"].lower())
        if rr:
            r["relevance"] = rr.relevance
    return {"generated_at": time.strftime("%Y-%m-%d %H:%M"), "depth": DEPTH, "profile": profile.model_dump(),
            "skipped_domains": skipped,
            "profile_sources": profile_res.get("sources", []), "profile_status": profile_res.get("status"),
            "domains": results, "duration_s": round(time.monotonic() - t0, 1)}


# ---------------------------------------------------------------- Markdown

def _cell(x) -> str:
    if isinstance(x, list):
        x = " ; ".join(str(i) for i in x if i)
    return str(x or "").replace("|", "/").replace("\n", " ").strip()


def render_legal(frame: Optional[dict]) -> list[str]:
    if not frame:
        return []
    p = frame.get("profile") or {}
    ok = [d for d in frame.get("domains", []) if d.get("status") == "ok"]
    lines = [
        "## 0. Cadre légal et normes applicables (recherche Linkup)",
        "",
        "> ⚖️ Synthèse automatique de sources web (Linkup, recherche approfondie) générée le "
        f"{frame.get('generated_at')}. **Ce n'est pas un avis juridique** : à faire valider par un juriste / "
        "expert-comptable avant reconstruction. Ces normes décrivent ce que la loi exige ; elles ne valident "
        "jamais un comportement observé dans l'application (seule l'expérience fait foi).",
        "",
        f"- **Secteur identifié** : {p.get('sector') or '-'} ({p.get('country') or '-'})",
        f"- **Activités** : {_cell(p.get('activities'))}",
        f"- **Données manipulées** : {_cell(p.get('data_handled'))}",
        f"- **Domaines étudiés** : {len(frame.get('domains', []))} ({len(ok)} avec résultat), "
        f"en {frame.get('duration_s', 0):.0f} s",
        "",
    ]
    if frame.get("skipped_domains"):
        lines += ["**Domaines jugés non pertinents (non approfondis)** :", ""]
        lines += [f"- {x['domain']} — {x['reason']}" for x in frame["skipped_domains"]]
        lines.append("")
    checklist = []
    for n, d in enumerate(frame.get("domains", []), 1):
        title = d["domain"].split(" : ")[0].split(" ; ")[0].strip().rstrip(".")
        lines += [f"### 0.{n} {title[:90]}", ""]
        if d.get("relevance") == "conditional":
            lines += ["_Pertinence : conditionnelle (dépend de l'activité réelle de l'entreprise)_", ""]
        if title != d["domain"]:
            lines += [f"_Périmètre : {d['domain']}_", ""]
        if d.get("status") != "ok":
            lines += [f"_Recherche indisponible : {d.get('error') or d.get('reason')}_", ""]
            continue
        data = d.get("data") or {}
        if not data.get("applicable", True):
            lines += [f"_Non applicable_ — {data.get('summary', '')}", ""]
        elif data.get("summary"):
            lines += [data["summary"], ""]
        norms = data.get("norms") or []
        if norms:
            lines += ["| Norme | Référence | Obligations | Impact sur l'ERP | En vigueur | Sanctions |",
                      "|---|---|---|---|---|---|"]
            for nm in norms:
                lines.append(f"| {_cell(nm.get('name'))} | {_cell(nm.get('reference'))} | {_cell(nm.get('obligations'))} | "
                             f"{_cell(nm.get('software_impact'))} | {_cell(nm.get('in_force'))} | {_cell(nm.get('penalties'))} |")
                checklist += [(d["domain"], nm.get("name", ""), x) for x in (nm.get("software_impact") or [])]
            lines.append("")
        if d.get("sources"):
            lines += ["Sources : " + " · ".join(f"[{_cell(s['name'])[:60] or s['url']}]({s['url']})"
                                                for s in d["sources"][:8]), ""]
    if checklist:
        lines += ["### 0.x Checklist de conformité pour la reconstruction", ""]
        lines += [f"- [ ] **{dom}** — {name} : {item}" for dom, name, item in checklist]
        lines.append("")
    lines += ["---", ""]
    return lines


if __name__ == "__main__":
    import sys
    from pathlib import Path

    expl = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    f = legal_frame(expl.get("app_map") or expl)
    print("\n".join(render_legal(f)))
