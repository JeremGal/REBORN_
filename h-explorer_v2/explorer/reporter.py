"""Reverse-engineering report: the H agent studies how an app and each of its features work,
then we assemble a detailed Markdown dossier good enough to rebuild the app.

    from explorer.reporter import report_app
    path = report_app("https://example.com/")            # fresh exploration + deep dives
    path = report_app(url, from_exploration="EXPL_001")   # reuse an existing map

Pipeline:
  1. map      explore_app(url)                    -> pages / features
  2. dives    one H session per feature (cloud, parallel) -> FeatureReport (structured)
  3. report   reports/<host>_<stamp>/REPORT.md + report.json (assembled by code, not by an LLM)
Never raises; failed dives are listed in the report.
"""
from __future__ import annotations

import json
import os
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated, Optional
from urllib.parse import urlparse

from pydantic import BaseModel, BeforeValidator, Field

from explorer.explorer import ARTIFACTS_DIR, ROOT, _agent_session, _get_api_key, _jsonable
from explorer.inspector import controls_for, inspect_site
from explorer.legal import legal_frame, render_legal
from explorer.vault import LOGIN_HINT, vault_for
from explorer.mapper import EXPLORATIONS_DIR, explore_app

REPORTS_DIR = ROOT / "reports"
DIVE_OVERRIDES = {
    "model": os.getenv("REBORN_REPORT_MODEL", "holo4-35b-a3b"),
    "reasoning_effort": os.getenv("REBORN_REPORT_REASONING", "disabled"),
}
DIVE_TIMEOUT_S = float(os.getenv("REBORN_REPORT_TIMEOUT_S", "540"))
DIVE_WORKERS = int(os.getenv("REBORN_REPORT_WORKERS", "3"))
WITH_LEGAL = os.getenv("REBORN_LEGAL", "1") == "1"  # Linkup legal frame at the top of the report
WITH_INSPECT = os.getenv("REBORN_INSPECT", "1") == "1"  # workstation code/site inspector before the dives
MAX_FEATURES = int(os.getenv("REBORN_MAX_FEATURES", "25"))  # cloud: 1 H slot per dive (free plan = 3)

L = lambda t: Annotated[list[t], BeforeValidator(lambda v: v or [])]  # noqa: E731  (null -> [])


class Component(BaseModel):
    kind: str = Field(default="other", description="button, link, input, select, card, carousel, modal, tab, chat, image, video, ...")
    label: str = Field(default="", description="Visible label/text, exact")
    behavior: Optional[str] = Field(default=None, description="What it does when used (observed)")
    states: L(str) = Field(default_factory=list, description="Observed states: hover, active, disabled, loading, ...")


class Interaction(BaseModel):
    action: str = Field(default="", description="What you did, precisely")
    result: str = Field(default="", description="What happened on screen, precisely (texts, navigation, animation, timing)")


class Rule(BaseModel):
    rule: str = Field(description="A behaviour/business rule of the feature, stated precisely")
    evidence: str = Field(default="", description="What you observed that supports it")
    confidence: str = Field(default="unrated", description="confirmed (seen repeatedly / in source) | likely | guess")


class FeatureReport(BaseModel):
    feature: str
    url: Optional[str] = Field(default=None, description="URL/route of the feature")
    purpose: str = Field(default="", description="What it is for, for whom")
    how_to_reach: str = Field(default="", description="Exact navigation path from the home page")
    layout: L(str) = Field(default_factory=list, description="Sections of the screen from top to bottom, each with what it contains")
    components: L(Component)
    content: L(str) = Field(default_factory=list, description="Important texts/data shown, EXACT wording (titles, items, labels, messages)")
    interactions: L(Interaction) = Field(default_factory=list, description="Every interaction you tried and its result")
    rules: L(Rule) = Field(default_factory=list, description="How the feature works: logic, conditions, ordering, validation, variants")
    data_and_tech: L(str) = Field(default_factory=list, description="Static vs dynamic data, APIs/requests, libraries or frameworks "
                                              "noticed (page source allowed), routes, storage")
    visual_style: L(str) = Field(default_factory=list, description="Colors (hex if possible), fonts, spacing, imagery, animations")
    edge_cases: L(str) = Field(default_factory=list, description="Errors, empty states, limits, responsive behaviour, anything odd")
    open_questions: L(str) = Field(default_factory=list, description="What you could not determine and how to test it")
    rebuild_notes: L(str) = Field(default_factory=list, description="Concrete steps/requirements to rebuild this feature identically")


def _dive_instruction(feature: dict, app_summary: str) -> str:
    return f"""You are a software archaeologist. The application: {app_summary}
Your job: understand in depth HOW ONE FEATURE works, so that a developer can rebuild it identically
from your report alone. Feature to study: "{feature.get('name')}" ({feature.get('purpose', '')}),
route: {feature.get('url') or 'unknown'}.

Method:
1. Reach the feature from the home page (wait for intro animations) and note the exact path.
2. Describe the layout top to bottom, every component, and copy important texts EXACTLY.
3. Try every harmless interaction (buttons, tabs, carousels arrows, hover, filters, toggles, back
   navigation, suggested questions...) and note precisely what happens. Repeat an interaction if the
   result looks variable, to tell fixed behaviour from randomness/animation.
4. Deduce the rules (logic, conditions, ordering, variants) and give the evidence for each.
5. You MAY read the source served by THIS site (HTML, JS/CSS bundles, JSON files under {feature.get('_origin')})
   to understand data or logic, but at most 4 source fetches and never read a whole minified bundle:
   look for the parts relevant to this feature. Do NOT use web search and do NOT read third-party repositories or other
   sites: they may describe a different app and would corrupt the report. When the source and the screen
   disagree, report what the SCREEN shows and mention the discrepancy.
6. Note colors, fonts, animations, and what data looks static vs fetched.

{_controls_block(feature)}
Safety (real site): never submit a contact/signup form, never send an email, never type personal
data, never follow links to other domains (just record the target), never download files. For a chatbot
on the site, you may click its suggested questions and ask at most 2 short neutral questions about the
site. {LOGIN_HINT if feature.get('_vault_id') else 'Do not log in.'}
Budget: about {35 if feature.get('_controls') else 25} actions, then answer (a partial but precise report is better than none)."""


def _controls_block(feature: dict) -> str:
    """Controls found in the code/HTML by the inspector: the agent must TEST them, not just describe them."""
    ctrls = feature.get("_controls") or []
    if not ctrls:
        return ""
    lines = ["CONTROLS TO TEST on this page (found in the code by the inspector). For EACH control, try EACH value",
             "(or 6 representative values, including combinations of 2 filters), and record precisely what changes",
             "(counts, items shown/hidden, messages, URL parameters). Put every observed change in `interactions`",
             "and the logic you deduce in `rules`:"]
    for c in ctrls[:15]:
        vals = ", ".join(c.get("values", [])[:12])
        lines.append(f"- {c.get('kind')} \"{c.get('label')}\"" + (f" (param ?{c.get('url_param')}=)" if c.get("url_param") else "")
                     + (f": {vals}" if vals else "") + (f" — hypothesis: {c.get('effect_hypothesis')}" if c.get("effect_hypothesis") else ""))
    return "\n".join(lines) + "\n"


def _dive(feature: dict, app_summary: str, report_id: str, idx: int, api_key: str) -> dict:
    exp_dir = ARTIFACTS_DIR / f"{report_id}_F{idx:02d}"
    t0 = time.monotonic()
    stalls = 0
    for _attempt in range(3):  # retry only frozen sessions (see STALL_S); a real failure is reported
        try:
            overrides = {**DIVE_OVERRIDES, **({"vault_id": feature["_vault_id"]} if feature.get("_vault_id") else {})}
            out = _agent_session(feature["_start_url"], _dive_instruction(feature, app_summary), FeatureReport,
                                 exp_dir, DIVE_TIMEOUT_S, api_key, None, agent_overrides=overrides)
        except Exception as exc:
            out = {"error": f"{type(exc).__name__}: {exc}"}
        if not out.get("error"):
            break
        stalls += 1  # any failure (frozen session, answer format, platform error) gets a fresh session
        print(f"[report] {feature.get('name')}: {str(out.get('error'))[:80]} -> retrying ({stalls})", flush=True)
    ans = out.get("answer")
    return {
        "feature": feature.get("name"),
        "status": "success" if not out.get("error") else "failed",
        "error": out.get("error"),
        "report": ans.model_dump() if isinstance(ans, FeatureReport) else (_jsonable(ans) if ans else None),
        "session_id": out.get("session_id"),
        "agent_view_url": out.get("agent_view_url"),
        "screenshots": out.get("screenshots", []),
        "actions": out.get("actions", []),
        "duration_s": round(time.monotonic() - t0, 1),
        "forced_answer": bool(out.get("forced_answer")),
        "stalled_retries": stalls,
    }


# ---------------------------------------------------------------- provenance

def _sources(actions: list[str], site_host: str) -> dict:
    """URLs the agent fetched/visited, split into the site itself vs outside (to flag in the report)."""
    import re

    site, outside, searches = set(), set(), 0
    for a in actions:
        tool = a.split("(")[0]
        if tool == "web_search":
            searches += 1
        if tool not in ("web_fetch", "go_to_web"):
            continue
        for u in re.findall(r"""https?://[^\s"'`)\\]+""", a):
            u = u.split("?")[0].rstrip("/.,")
            host = urlparse(u).netloc.removeprefix("www.")
            (site if host == site_host else outside).add(u)
    return {"site": sorted(site), "outside": sorted(outside), "web_searches": searches}


# ---------------------------------------------------------------- Markdown assembly

def _bullets(items, fmt=lambda x: x) -> str:
    return "\n".join(f"- {fmt(i)}" for i in items) if items else "_(rien relevé)_"


def _rel(path: str, report_dir: Path) -> str:
    return os.path.relpath(ROOT / path, report_dir).replace("\\", "/")


def _template_features(inspection: Optional[dict], pages: list[dict], base: str) -> list[dict]:
    """One extra feature per page template found by the inspector that no mapped page covers."""
    if not inspection:
        return []
    covered = set()
    for p in pages:
        path = urlparse(p.get("url") or "").path or (p.get("url") or "")
        if path.startswith("/"):
            covered.add("/" + path.strip("/").split("/")[0] if path != "/" else "/")
    extra = []
    for t in inspection.get("templates") or []:
        ex = next((u for u in t.get("example_urls") or [] if u), None)
        if not ex:
            continue
        ex_url = ex if ex.startswith("http") else base + ex
        first = "/" + (urlparse(ex_url).path.strip("/").split("/")[0] if urlparse(ex_url).path.strip("/") else "")
        depth = len([x for x in urlparse(ex_url).path.split("/") if x])
        key = first if depth <= 1 else f"{first}#{depth}"  # /subventions vs /subventions/{r}/{d}
        if key in covered:
            continue
        covered.add(key)
        extra.append({"name": f"Modèle {t.get('pattern') or first} ({t.get('count')} pages)",
                      "purpose": t.get("purpose") or "page type found by code inspection", "url": ex_url})
    return extra


def _render_inspection(inspection: Optional[dict]) -> list[str]:
    if not inspection:
        return []
    cov = inspection.get("coverage") or {}
    a = inspection.get("auth") or {}
    lines = ["## 0 bis. Inspection technique (agent H workstation : terminal + code)", "",
             f"- **Framework / stack** : {inspection.get('framework') or '-'}",
             f"- **Couverture** : {cov.get('crawled_urls', 0)} pages lues sur {cov.get('sitemap_urls', 0)} du sitemap, "
             f"{cov.get('js_files_read', 0)} fichiers JS lus" + (f" ; ignorées : {', '.join(cov.get('skipped') or [])[:300]}" if cov.get("skipped") else ""),
             f"- **Authentification** : connexion {', '.join(a.get('login_urls') or []) or '-'} ; inscription "
             f"{', '.join(a.get('signup_urls') or []) or '-'} ; routes protégées {', '.join(a.get('protected_routes') or []) or '-'} ; "
             f"fournisseur {a.get('provider') or '-'}", ""]
    if inspection.get("templates"):
        lines += ["### Modèles de pages", "", "| Modèle | Pages | Rôle | Exemples |", "|---|---|---|---|"]
        for t in inspection["templates"]:
            lines.append(f"| `{t.get('pattern')}` | {t.get('count')} | {t.get('purpose', '')} | "
                         f"{', '.join((t.get('example_urls') or [])[:2])} |")
        lines.append("")
    if inspection.get("backend"):
        lines += ["### Backend et services", "", "| Type | Service / endpoint | Usage | Preuve |", "|---|---|---|---|"]
        lines += [f"| {b.get('kind')} | `{b.get('endpoint_or_service')}` | {b.get('usage')} | {str(b.get('evidence'))[:120]} |"
                  for b in inspection["backend"]]
        lines.append("")
    if inspection.get("business_rules_in_code"):
        lines += ["### Règles métier trouvées dans le code", ""]
        lines += [f"- **{r.get('rule')}** — `{r.get('where')}`" + (f" : `{str(r.get('evidence_snippet'))[:160]}`" if r.get("evidence_snippet") else "")
                  for r in inspection["business_rules_in_code"]]
        lines.append("")
    if inspection.get("controls"):
        lines += ["### Contrôles interactifs (testés ensuite par les agents visuels)", "",
                  "| Page | Type | Libellé | Valeurs | Paramètre URL |", "|---|---|---|---|---|"]
        lines += [f"| {c.get('page')} | {c.get('kind')} | {c.get('label')} | {', '.join((c.get('values') or [])[:10])} | {c.get('url_param') or ''} |"
                  for c in inspection["controls"][:60]]
        lines.append("")
    if inspection.get("forms"):
        lines += ["### Formulaires", ""]
        for f in inspection["forms"]:
            flds = ", ".join(f"{x.get('name') or x.get('label')} ({x.get('type')}{', requis' if x.get('required') else ''})"
                             for x in f.get("fields") or [])
            lines.append(f"- **{f.get('page')}** — {f.get('purpose')} → `{f.get('method')} {f.get('action_or_endpoint')}` : {flds}")
        lines.append("")
    if inspection.get("routes_in_code"):
        lines += ["### Routes déclarées dans le code", "", ", ".join(f"`{r}`" for r in inspection["routes_in_code"][:120]), ""]
    if inspection.get("data_sources"):
        lines += ["### Sources de données", ""]
        lines += [f"- {d.get('what')} — `{d.get('where')}` ({d.get('size')})" for d in inspection["data_sources"]]
        lines.append("")
    lines += ["---", ""]
    return lines


def _render(url: str, app_map: dict, dives: list[dict], report_dir: Path, meta: dict, legal: Optional[dict] = None,
            inspection: Optional[dict] = None) -> str:
    site_host = urlparse(url).netloc.removeprefix("www.")
    lines = [
        f"# Rapport de rétro-ingénierie — {urlparse(url).netloc}",
        "",
        f"> Généré par REBORN Explorer (agent H Company) le {meta['generated_at']}. URL : {url}",
        f"> {len(dives)} fonctionnalités analysées ({sum(d['status'] == 'success' for d in dives)} réussies), "
        f"durée totale {meta['duration_s']:.0f} s. Les observations viennent de l'agent : les points marqués "
        "`likely`/`guess` et les questions ouvertes sont à vérifier par expérience avant reconstruction.",
        "",
        "## 1. Vue d'ensemble",
        "",
        app_map.get("app_summary", "_(non disponible)_"),
        "",
        "### Plan du site",
        "",
        "| Vue | Route | Rôle |",
        "|---|---|---|",
    ]
    for p in app_map.get("pages", []):
        lines.append(f"| {p.get('name')} | `{p.get('url') or '-'}` | {p.get('purpose', '')} |")
    lines += ["", "### Parcours utilisateur", "", _bullets(app_map.get("workflows", [])), ""]
    at = lines.index("## 1. Vue d'ensemble")
    lines[at:at] = render_legal(legal) + _render_inspection(inspection)  # legal frame first, then the code view

    lines += ["## 2. Fonctionnalités en détail", ""]
    for n, d in enumerate(dives, 1):
        r = d.get("report") or {}
        src = _sources(d.get("actions") or [], site_host)
        lines += [f"### 2.{n} {d['feature']}", ""]
        if d.get("forced_answer"):
            lines += ["> ⏱️ **Analyse partielle** : budget de temps dépassé, l'agent a dû répondre avec ce qu'il avait.", ""]
        if src["outside"] or src["web_searches"]:
            lines += [f"> ⚠️ **Fiabilité** : l'agent a consulté {len(src['outside'])} source(s) hors du site "
                      f"et fait {src['web_searches']} recherche(s) web. Les points tirés de ces sources peuvent "
                      f"décrire une autre application : {', '.join(f'`{u}`' for u in src['outside'][:8])}", ""]
        if d["status"] != "success" or not isinstance(r, dict) or "purpose" not in r:
            lines += [f"**Analyse échouée** : {d.get('error')}", ""]
            if d.get("agent_view_url"):
                lines += [f"Replay : {d['agent_view_url']}", ""]
            continue
        lines += [
            f"- **Rôle** : {r.get('purpose')}",
            f"- **Route** : `{r.get('url') or '-'}`",
            f"- **Accès** : {r.get('how_to_reach')}",
            f"- **Replay agent** : {d.get('agent_view_url')} ({d['duration_s']:.0f} s, {len(d['actions'])} actions)",
            f"- **Sources lues sur le site** : {', '.join(f'`{u}`' for u in src['site']) or 'aucune (écran seul)'}",
            "",
            "**Mise en page (haut → bas)**", "", _bullets(r.get("layout")), "",
            "**Composants**", "",
            "| Type | Libellé | Comportement | États |", "|---|---|---|---|",
        ]
        for c in r.get("components") or []:
            lines.append(f"| {c.get('kind')} | {c.get('label')} | {c.get('behavior') or ''} | "
                         f"{', '.join(c.get('states') or [])} |")
        lines += ["", "**Contenu (textes exacts)**", "", _bullets(r.get("content")), "",
                  "**Interactions testées**", "",
                  _bullets(r.get("interactions"), lambda i: f"{i.get('action')} → {i.get('result')}"), "",
                  "**Règles de fonctionnement**", "",
                  _bullets(r.get("rules"), lambda x: f"[{x.get('confidence')}] {x.get('rule')} — _preuve : "
                                                     f"{x.get('evidence')}_"), "",
                  "**Données & technique**", "", _bullets(r.get("data_and_tech")), "",
                  "**Style visuel**", "", _bullets(r.get("visual_style")), "",
                  "**Cas limites / anomalies**", "", _bullets(r.get("edge_cases")), "",
                  "**Questions ouvertes**", "", _bullets(r.get("open_questions")), "",
                  "**Pour la reconstruire**", "", _bullets(r.get("rebuild_notes")), ""]
        shots = d.get("screenshots") or []
        if shots:
            picks = [shots[0], shots[len(shots) // 2], shots[-1]] if len(shots) >= 3 else shots
            lines += ["**Captures**", ""] + [f"![{d['feature']} {i}]({_rel(s, report_dir)})"
                                              for i, s in enumerate(dict.fromkeys(picks), 1)] + [""]

    lines += ["## 3. Checklist de reconstruction", ""]
    for d in dives:
        notes = ((d.get("report") or {}) if isinstance(d.get("report"), dict) else {}).get("rebuild_notes") or []
        lines += [f"**{d['feature']}**", ""] + [f"- [ ] {x}" for x in notes] + [""]
    oq = [(d["feature"], q) for d in dives if isinstance(d.get("report"), dict)
          for q in (d["report"].get("open_questions") or [])]
    lines += ["## 4. À vérifier par expérience", "", _bullets(oq, lambda t: f"**{t[0]}** — {t[1]}"), ""]
    if app_map.get("oddities"):
        lines += ["## 5. Anomalies relevées pendant la cartographie", "", _bullets(app_map["oddities"]), ""]
    return "\n".join(lines)


# ---------------------------------------------------------------- public API

def report_app(url: str, *, from_exploration: Optional[str] = None, features: Optional[list[str]] = None,
               from_inspection: Optional[str] = None) -> Path:
    """Build the reverse-engineering report for `url`. Returns the path of REPORT.md."""
    t0 = time.monotonic()
    api_key = _get_api_key()
    stamp = time.strftime("%Y%m%d_%H%M%S")
    report_id = f"RPT_{stamp}"
    report_dir = REPORTS_DIR / f"{urlparse(url).netloc.replace(':', '_')}_{stamp}"
    report_dir.mkdir(parents=True, exist_ok=True)

    vault_id = None
    try:
        vault_id = vault_for(url)  # credentials (login_report.py / credentials.json) -> H vault
    except Exception as exc:
        print(f"[report] vault unavailable: {exc}", flush=True)
    if vault_id:
        print("[report] credentials found: the map and dives will sign in via the vault (read-only).", flush=True)

    # 1. map (visual cloud browser, signed in if a vault exists) + code inspection (workstation), in parallel
    with ThreadPoolExecutor(max_workers=2) as pool:
        if from_inspection:
            insp_future = pool.submit(lambda: json.loads((ROOT / "inspections" / f"{from_inspection}.json").read_text(encoding="utf-8")))
        else:
            insp_future = pool.submit(inspect_site, url) if WITH_INSPECT else None
        if from_exploration:
            expl = json.loads((EXPLORATIONS_DIR / f"{from_exploration}.json").read_text(encoding="utf-8"))
        else:
            expl = explore_app(url, vault_id=vault_id)
        insp = insp_future.result() if insp_future else None
    inspection = (insp or {}).get("inspection")
    print(f"[report] inspection: {(insp or {}).get('status')} {(insp or {}).get('error') or ''}", flush=True)
    app_map = expl.get("app_map") or {"app_summary": "", "pages": []}
    pages = app_map.get("pages") or []
    if features:
        pages = [p for p in pages if p.get("name") in features]
    base = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    pages += _template_features(inspection, pages, base)  # page types the visual map missed
    pages = pages[:MAX_FEATURES]
    for p in pages:  # start each dive on the feature's route when known (saves steps)
        route = p.get("url") or ""
        if route.startswith("http"):
            p["_start_url"] = route
        else:
            p["_start_url"] = (base + route) if route.startswith("/") and "[" not in route else url
        p["_origin"] = base
        p["_controls"] = controls_for(inspection, p["_start_url"])
        p["_vault_id"] = vault_id
    print(f"[report] {len(pages)} features to analyse: {[p.get('name') for p in pages]}", flush=True)

    # 2. deep dives (parallel)
    def run_one(ip):
        d = _dive(ip[1], app_map.get("app_summary", ""), report_id, ip[0], api_key)
        print(f"[report] {d['feature']}: {d['status']} ({d['duration_s']}s) {d.get('error') or ''}", flush=True)
        return d

    legal_pool = ThreadPoolExecutor(max_workers=1)  # Linkup legal research runs while the H agents work
    legal_future = legal_pool.submit(legal_frame, app_map) if WITH_LEGAL else None
    with ThreadPoolExecutor(max_workers=max(1, DIVE_WORKERS)) as pool:
        dives = list(pool.map(run_one, enumerate(pages, 1)))
    legal = None
    if legal_future is not None:
        try:
            legal = legal_future.result(timeout=900)
        except Exception as exc:
            legal = {"domains": [], "error": str(exc)}
    legal_pool.shutdown(wait=False)

    # 3. assemble
    meta = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "duration_s": time.monotonic() - t0, "exploration_id": expl.get("exploration_id"),
            "inspection_id": (insp or {}).get("inspection_id"), "authenticated": bool(vault_id),
            "agent_config": DIVE_OVERRIDES}
    (report_dir / "report.json").write_text(json.dumps({"url": url, "meta": meta, "app_map": app_map, "legal": legal,
                                                        "inspection": inspection, "features": dives},
                                                       indent=2, ensure_ascii=False), encoding="utf-8")
    md = _render(url, app_map, dives, report_dir, meta, legal, inspection)
    (report_dir / "REPORT.md").write_text(md, encoding="utf-8")
    return report_dir / "REPORT.md"


def repair_report(report_dir: str | Path) -> Path:
    """Re-run only the failed features of an existing report, then re-render REPORT.md in place."""
    report_dir = Path(report_dir)
    data = json.loads((report_dir / "report.json").read_text(encoding="utf-8"))
    url, app_map, dives = data["url"], data["app_map"], data["features"]
    pages = {p.get("name"): p for p in app_map.get("pages", [])}
    base = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
    api_key = _get_api_key()
    todo = [i for i, d in enumerate(dives) if d["status"] != "success"]
    print(f"[repair] {len(todo)} failed feature(s): {[dives[i]['feature'] for i in todo]}", flush=True)

    def fix(i):
        p = dict(pages.get(dives[i]["feature"], {"name": dives[i]["feature"]}))
        route = p.get("url") or ""
        p["_start_url"] = (base + route) if route.startswith("/") and "[" not in route else url
        p["_origin"] = base
        d = _dive(p, app_map.get("app_summary", ""), f"REPAIR_{time.strftime('%H%M%S')}", i + 1, api_key)
        print(f"[repair] {d['feature']}: {d['status']} ({d['duration_s']}s) {d.get('error') or ''}", flush=True)
        return i, d

    with ThreadPoolExecutor(max_workers=max(1, DIVE_WORKERS)) as pool:
        for i, d in pool.map(fix, todo):
            dives[i] = d
    data["features"] = dives
    (report_dir / "report.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    (report_dir / "REPORT.md").write_text(_render(url, app_map, dives, report_dir, data["meta"], data.get("legal"), data.get("inspection")),
                                          encoding="utf-8")
    return report_dir / "REPORT.md"


def add_legal(report_dir: str | Path) -> Path:
    """Research the legal frame for an existing report (no H agent re-run) and re-render REPORT.md."""
    report_dir = Path(report_dir)
    data = json.loads((report_dir / "report.json").read_text(encoding="utf-8"))
    data["legal"] = legal_frame(data["app_map"])
    (report_dir / "report.json").write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    (report_dir / "REPORT.md").write_text(_render(data["url"], data["app_map"], data["features"], report_dir,
                                                  data["meta"], data["legal"], data.get("inspection")), encoding="utf-8")
    return report_dir / "REPORT.md"


if __name__ == "__main__":
    import sys

    args = sys.argv[1:]
    if args and args[0] == "--legal":
        print(add_legal(args[1]))
        raise SystemExit
    if args and args[0] == "--repair":
        print(repair_report(args[1]))
        raise SystemExit
    u = args[0] if args else "https://eliasmoussouni.fr/"
    expl_id = args[1] if len(args) > 1 and args[1] != "-" else None
    insp_id = args[2] if len(args) > 2 else None
    print(report_app(u, from_exploration=expl_id, from_inspection=insp_id))
