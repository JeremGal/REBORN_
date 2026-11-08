"""Pure conversions (H Company explorer -> REBORN Studio contracts), for Mouss's executor.

No network, no SDK, no file I/O: stdlib only, so the unit tests run anywhere. The executor
(h_executor.py) calls these to turn what the H agent produced into the Studio's contracts
(event, app_schema, observation) and into a proposed extraction plan (contract extraction_plan 1.1).

What these functions deliberately drop (SPEC / INTEGRATION_MOUSS.md):
- never a login/connection screenshot, never a raw credential, never a local file path;
- the agent's plumbing (agent_view_url, session_id, agent_config, external_context, timings) never
  reaches the Studio;
- lists become text and nested entries are flattened, because an observation value must be a
  primitive (string / number / boolean).
"""
from __future__ import annotations

import json
import re
from typing import Any, Dict, List, Optional

Json = Dict[str, Any]

MISSION_ID_RE = re.compile(r"^MIS_[a-f0-9]{10}$")

# Labels that mark a page / control as an export or backup mechanism (SPEC-1 discovery; several
# languages because the legacy software may be localised — HotelDruid is Italian/French/English).
EXPORT_KEYWORDS = (
    "backup", "sauvegarde", "export", "exporter", "esporta", "esportazione", "salva", "salvataggio",
    "download", "télécharger", "telecharger", "scarica", "dump", "csv", "excel", "xlsx", "sql",
    "archive", "copie de sécurité", "copia di sicurezza",
)

# Keys of an explorer experiment that must NEVER be forwarded to the Studio (plumbing / local paths).
_DROP_EXPERIMENT_KEYS = frozenset({
    "agent_view_url", "session_id", "agent_config", "external_context", "timings", "duration_s",
    "attempts", "attempt_errors", "forced_answer", "runtime", "timestamp", "evidence",
    "observed_output", "inputs", "status", "error", "experiment_id", "app_error",
})

# Element kinds that are not inputs of a form (never become fields of a screen schema).
_NON_INPUT_KINDS = frozenset({"button", "link", "menu", "tab", "other"})


# --------------------------------------------------------------------------- helpers

def _text(v: Any) -> str:
    """Any value as a compact one-line string (lists joined, dicts as compact JSON)."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float, str)):
        return str(v)
    if isinstance(v, list):
        return ", ".join(_text(x) for x in v)
    if isinstance(v, dict):
        return json.dumps(v, ensure_ascii=False, sort_keys=True)
    return str(v)


def flatten_record(rec: Any, _prefix: str = "") -> Json:
    """Flat dict of PRIMITIVES (string/number/boolean): nested dicts become dotted keys, lists become
    text. A non-dict input is wrapped under the key "value". Used for observation inputs/outputs."""
    out: Json = {}
    if not isinstance(rec, dict):
        out[_prefix or "value"] = _text(rec) if not isinstance(rec, (int, float, bool)) or isinstance(rec, bool) else rec
        return out
    for k, v in rec.items():
        key = f"{_prefix}.{k}" if _prefix else str(k)
        if isinstance(v, dict):
            out.update(flatten_record(v, key))
        elif isinstance(v, bool) or isinstance(v, (int, float)):
            out[key] = v
        elif v is None:
            # A null is dropped by the Studio anyway; keep it out so the record stays clean.
            continue
        else:
            out[key] = _text(v)
    return out


def _slug(label: str, used: Optional[set] = None) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", (label or "").strip().lower()).strip("_") or "champ"
    base = base[:60]
    if used is None:
        return base
    name, n = base, 2
    while name in used:
        name = f"{base}_{n}"
        n += 1
    used.add(name)
    return name


def prefixed_experiment_id(experiment_id: str, mission_id: Optional[str]) -> str:
    """experiment_id prefixed by the mission (INTEGRATION_MOUSS §6), capped at the contract's 120 chars."""
    eid = str(experiment_id or "EXP")
    if mission_id and MISSION_ID_RE.match(mission_id):
        eid = f"{mission_id}:{eid}"
    return eid[:120]


# --------------------------------------------------------------------------- app map -> events

def _page_fields(page: Json) -> List[Json]:
    """Form fields a page exposes (its interactive input elements), as event/form_discovered data."""
    fields: List[Json] = []
    used: set = set()
    for el in page.get("elements") or []:
        if not isinstance(el, dict):
            continue
        kind = str(el.get("kind") or "").lower()
        if kind in _NON_INPUT_KINDS:
            continue
        label = str(el.get("label") or "").strip()
        if not label:
            continue
        field: Json = {"name": _slug(label, used), "label": label, "type": _field_type(kind)}
        opts = [str(o) for o in (el.get("options") or []) if str(o).strip()]
        if opts:
            field["options"] = [{"value": o} for o in opts]
        fields.append(field)
    return fields


def page_to_event(page: Json, mission_id: Optional[str] = None, investigation_id: Optional[str] = None) -> Json:
    """One page of the app map -> one event. A page with input fields -> form_discovered (with its
    fields); a page without -> log (its purpose and visible outputs). Never any screenshot."""
    name = str(page.get("name") or page.get("url") or "Écran").strip()
    fields = _page_fields(page)
    outputs = [str(o) for o in (page.get("outputs") or []) if str(o).strip()]
    ev: Json
    if fields:
        ev = {
            "source": "explorer",
            "type": "form_discovered",
            "title": f"Écran « {name} » : {len(fields)} champ(s)"[:500],
            "data": {"page": name, "url": page.get("url"), "fields": fields, "outputs": outputs},
        }
    else:
        ev = {
            "source": "explorer",
            "type": "log",
            "title": f"Écran « {name} » repéré"[:500],
            "data": {"page": name, "url": page.get("url"), "purpose": page.get("purpose"), "outputs": outputs},
        }
    detail = page.get("purpose")
    if detail:
        ev["detail"] = str(detail)[:5000]
    if mission_id:
        ev["data"]["mission_id"] = mission_id
    if investigation_id:
        ev["investigation_id"] = investigation_id
    return ev


def app_map_to_events(exploration: Json, mission_id: Optional[str] = None, investigation_id: Optional[str] = None) -> List[Json]:
    """Carte de l'application -> évènements form_discovered et log (une page par évènement), précédés
    d'un log de synthèse. `exploration` est la sortie de explore_app (clé app_map) ou directement app_map."""
    app_map = exploration.get("app_map") if isinstance(exploration.get("app_map"), dict) else exploration
    app_map = app_map or {}
    events: List[Json] = []
    summary = str(app_map.get("app_summary") or "").strip()
    pages = [p for p in (app_map.get("pages") or []) if isinstance(p, dict)]
    head: Json = {
        "source": "explorer",
        "type": "log",
        "title": f"Carte de l'application : {len(pages)} écran(s)"[:500],
        "detail": summary[:5000] or None,
        "data": {
            "pages": len(pages),
            "workflows": [str(w) for w in (app_map.get("workflows") or [])],
            "oddities": [str(o) for o in (app_map.get("oddities") or [])],
        },
    }
    if head["detail"] is None:
        del head["detail"]
    if mission_id:
        head["data"]["mission_id"] = mission_id
    if investigation_id:
        head["investigation_id"] = investigation_id
    events.append(head)
    for page in pages:
        events.append(page_to_event(page, mission_id, investigation_id))
    return events


# --------------------------------------------------------------------------- app map -> screen schema

def _field_type(kind: str) -> str:
    return {
        "number_input": "number", "slider": "number",
        "select": "enum", "radio": "enum",
        "checkbox": "boolean",
        "text_input": "text", "textarea": "text",
    }.get(kind, "text")


def pick_screen(app_map: Json) -> Optional[Json]:
    """Écran étudié : la page qui porte le plus de champs de saisie (None si aucune n'en a)."""
    best, best_n = None, 0
    for page in app_map.get("pages") or []:
        if not isinstance(page, dict):
            continue
        n = len(_page_fields(page))
        if n > best_n:
            best, best_n = page, n
    return best


def screen_to_app_schema(page: Json, app_map: Json, mission_id: Optional[str] = None, investigation_id: Optional[str] = None) -> Optional[Json]:
    """Un écran de la carte -> UN schéma d'écran (contrat app_schema). None si l'écran n'a aucun champ
    (le contrat exige au moins un champ). `name`/outputs repris tels quels ; aucune capture."""
    fields = _page_fields(page)
    if not fields:
        return None
    for f in fields:  # app_schema fields: enum needs options; a select with none is demoted to text
        if f["type"] == "enum" and not f.get("options"):
            f["type"] = "text"
    name = str(page.get("name") or "Écran").strip()
    outputs: List[Json] = []
    used: set = set()
    for o in page.get("outputs") or []:
        label = str(o).strip()
        if label:
            outputs.append({"name": _slug(label, used), "label": label, "format": "text"})
    schema: Json = {
        "application": str(app_map.get("app_summary") or "Logiciel exploré")[:120],
        "module": name[:120],
        "title": name,
        "fields": fields,
    }
    if outputs:
        schema["outputs"] = outputs
    if investigation_id:
        schema["investigation_id"] = investigation_id
    return schema


# --------------------------------------------------------------------------- experiment -> observation

def experiment_to_observation(
    exp: Json,
    mission_id: Optional[str] = None,
    investigation_id: Optional[str] = None,
    final_screenshot_url: Optional[str] = None,
    request_id: Optional[str] = None,
) -> Json:
    """Une expérience EXP de l'explorateur -> une observation conforme (contrat observation).

    - observed_output null -> {} et status "failed" ;
    - app_error (erreur AFFICHÉE par le logiciel) -> status "error", message conservé ;
    - error null supprimé ; listes aplaties en texte ; entrées imbriquées aplaties ;
    - experiment_id préfixé par la mission ; agent_view_url/session_id/agent_config/external_context et
      chemins locaux retirés ;
    - `final_screenshot_url` : SEULEMENT une capture finale déjà résolue (data URL ou http), jamais une
      capture de connexion ; l'appelant garantit que ce n'est pas une étape de connexion.
    """
    exp = exp or {}
    raw_status = str(exp.get("status") or "success")
    observed = exp.get("observed_output")
    app_error = exp.get("app_error")
    error = exp.get("error")

    if observed is None:
        observed, status = {}, "failed"
    elif app_error:
        status = "error"
    elif raw_status in ("success", "error", "failed"):
        status = raw_status
    else:
        status = "success" if not error else "failed"

    obs: Json = {
        "experiment_id": prefixed_experiment_id(exp.get("experiment_id", "EXP"), mission_id),
        "inputs": flatten_record(exp.get("inputs") or {}),
        "observed_output": flatten_record(observed or {}),
        "status": status,
    }
    if app_error and "app_error" not in obs["observed_output"]:
        obs["observed_output"]["app_error"] = _text(app_error)
    err = error if error not in (None, "") else (app_error if app_error else None)
    if err:
        obs["error"] = _text(err)[:1000]
    for k in ("application", "module"):
        if exp.get(k):
            obs[k] = str(exp[k])
    if investigation_id:
        obs["investigation_id"] = investigation_id
    if request_id:
        obs["request_id"] = request_id
    if final_screenshot_url and str(final_screenshot_url).startswith(("http://", "https://", "data:")):
        obs["screenshot_url"] = final_screenshot_url
    return obs


# --------------------------------------------------------------------------- extraction plan (SPEC-1 1.1)

def find_export_pages(app_map: Json, inspection: Optional[Json] = None) -> List[Json]:
    """Pages ou contrôles qui ressemblent à un export / une sauvegarde (par libellé). Repérage seulement :
    aucune action n'est déclenchée ici. Renvoie [{ name, url, labels }]."""
    found: List[Json] = []

    def hit(*texts: Any) -> List[str]:
        labels = []
        for t in texts:
            s = str(t or "").lower()
            if any(k in s for k in EXPORT_KEYWORDS):
                labels.append(str(t))
        return labels

    for page in (app_map or {}).get("pages") or []:
        if not isinstance(page, dict):
            continue
        labels = hit(page.get("name"), page.get("purpose"), page.get("url"))
        for el in page.get("elements") or []:
            if isinstance(el, dict):
                labels += hit(el.get("label"))
        if labels:
            found.append({"name": str(page.get("name") or "Écran"), "url": page.get("url"), "labels": sorted(set(labels))})

    for form in (inspection or {}).get("forms") or []:
        if isinstance(form, dict) and hit(form.get("purpose"), form.get("submit_label"), form.get("action_or_endpoint")):
            found.append({"name": str(form.get("purpose") or "Formulaire"), "url": form.get("action_or_endpoint"), "labels": ["(code)"]})
    return found


def _form_fields(form: Any) -> Json:
    """{ champ: valeur } d'un formulaire décrit par l'agent (liste de {name,value} ou dict)."""
    out: Json = {}
    if isinstance(form, dict):
        items = form.items()
    elif isinstance(form, list):
        items = [((f.get("name") if isinstance(f, dict) else None), (f.get("value") if isinstance(f, dict) else None)) for f in form]
    else:
        return out
    for name, value in items:
        if name:
            out[str(name)] = "" if value is None else _text(value)
    return out


def build_extraction_plan(
    system: str,
    base_url: Optional[str],
    mechanisms: List[Json],
    proposed_by: str,
    mission_id: Optional[str] = None,
    login: Optional[Json] = None,
    not_extractable: Optional[List[Json]] = None,
) -> Json:
    """Plan d'extraction 1.1 (SPEC-1) PROPOSÉ, à valider dans le Studio. Rétrocompatible 1.0 : un
    mécanisme n'ajoute method/form/prepare/format/compression/exclude_tables que s'ils sont fournis.

    Chaque `mechanisms[i]` accepté : { id, url, label?, kind?, method?, form?, prepare?, format?,
    compression?, exclude_tables?, requires?, note?, file? }. Les formulaires sont décrits par l'agent
    (lecture des champs), jamais déclenchés par un clic."""
    mech_out: List[Json] = []
    for i, m in enumerate(mechanisms or []):
        mid = str(m.get("id") or f"m{i + 1}")
        url = m.get("url")
        if not url:
            continue
        item: Json = {"id": mid, "url": str(url), "kind": str(m.get("kind") or "export")}
        if m.get("label"):
            item["label"] = str(m["label"])
        method = str(m.get("method") or "GET").upper()
        if method in ("GET", "POST"):
            item["method"] = method
        form = _form_fields(m.get("form"))
        if form:
            item["form"] = form
        prepare = []
        for step in m.get("prepare") or []:
            if isinstance(step, dict) and step.get("url"):
                pstep: Json = {"url": str(step["url"]), "method": str(step.get("method") or "POST").upper()}
                pform = _form_fields(step.get("form"))
                if pform:
                    pstep["form"] = pform
                prepare.append(pstep)
        if prepare:
            item["prepare"] = prepare
        for k in ("format", "compression"):
            if m.get(k):
                item[k] = str(m[k])
        if m.get("exclude_tables"):
            item["exclude_tables"] = [str(t) for t in m["exclude_tables"]]
        for k in ("requires", "note"):
            if m.get(k):
                item[k] = str(m[k])
        if m.get("file"):
            item["file"] = str(m["file"])
        mech_out.append(item)

    plan: Json = {
        "contract_version": "1.1",
        "system": str(system or "Logiciel exploré"),
        "discovered_by": proposed_by,
        "proposed_by": proposed_by,
        "mechanisms": mech_out,
    }
    if base_url:
        plan["base_url"] = str(base_url)
    if mission_id and MISSION_ID_RE.match(mission_id):
        plan["mission_id"] = mission_id
    if login and isinstance(login, dict) and login.get("url"):
        plan["login"] = {k: login[k] for k in ("url", "username_field", "password_field", "session_cookie") if login.get(k)}
    if not_extractable:
        plan["not_extractable"] = [{"label": str(x.get("label", "")), "reason": str(x.get("reason", ""))} for x in not_extractable if isinstance(x, dict)]
    return plan
