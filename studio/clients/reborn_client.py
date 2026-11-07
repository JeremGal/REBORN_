"""
Client Python REBORN — pour Mouss (Explorer) et Alan (Analyste).
Aucune dépendance : bibliothèque standard uniquement (Python ≥ 3.9).
Documentation : README.md (section « Intégration ») et contracts/ (schémas JSON + exemples).

    from reborn_client import Reborn, RebornError
    rb = Reborn()   # REBORN_URL (défaut http://127.0.0.1:3000) et REBORN_TOKEN (mode réseau) lus dans l'environnement
    rb.health()     # joignable ? jeton valide ? mode courant ?

    # --- Mouss -------------------------------------------------------------
    inv = rb.wait_for_investigation()            # investigation « agents réels » lancée depuis le dashboard
    rb.publish_schema({...}, investigation_id=inv["id"])
    rb.action("Clic sur « Calculer »", screenshot="shot.png", investigation_id=inv["id"])
    rb.observation("EXP_001", {"product": "A", "quantity": 10, "customer_type": "premium"},
                   {"total_price": 810}, investigation_id=inv["id"])
    rb.observation("EXP_002", {"product": "A", "quantity": 0}, {}, status="error",
                   error="QUANTITE INVALIDE (1-999)", investigation_id=inv["id"])     # refus métier affiché
    rb.observation("EXP_003", {"product": "B", "quantity": 5}, {}, status="failed",
                   error="Timeout navigateur", investigation_id=inv["id"])           # échec technique (exclu)
    for req in rb.experiment_requests(investigation_id=inv["id"]):   # demandes d'Alan, sans perte ni doublon
        ... # exécuter req["data"]["inputs"], puis rb.observation(..., request_id=req["id"])
    rb.complete(inv["id"])

    # --- Alan --------------------------------------------------------------
    obs = rb.get_observations(inv["id"])
    rb.hypothesis("Remise volume à partir de 10 unités", "EXP_005 vs EXP_006", confidence=0.8)
    rb.request_experiment({"product": "A", "quantity": 10, "customer_type": "standard"},
                          "Vérifier le seuil exact de la remise volume")
    check = rb.publish_rules(model, dry_run=True)    # valider sans publier
    report = rb.publish_rules(model)                  # RebornError 422 si non exécutable
    print(report["validation"]["equivalence"], report["validation"]["mismatches"])
    rb.compute({"product": "A", "quantity": 10}, model=draft)   # tester un brouillon

Ligne de commande :
    python reborn_client.py health
    python reborn_client.py rules ../contracts/rules.example.json
    python reborn_client.py observations ../contracts/observation.example.json
    python reborn_client.py schema ../platform/scenarios/logistics/schema.v1.json
    python reborn_client.py compare
    python reborn_client.py scenario logistics baseline
"""

from __future__ import annotations

import base64
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

Json = Dict[str, Any]

__version__ = "1.1"


class RebornError(RuntimeError):
    """Erreur renvoyée par REBORN (status HTTP, corps JSON, liste des problèmes)."""

    def __init__(self, message: str, status: Optional[int] = None, payload: Any = None):
        super().__init__(message)
        self.status = status
        self.payload = payload

    @property
    def issues(self) -> List[Json]:
        return (self.payload.get("issues") or []) if isinstance(self.payload, dict) else []


class Reborn:
    def __init__(self, base_url: Optional[str] = None, token: Optional[str] = None, timeout: float = 15.0, retries: int = 2, project: Optional[str] = None):
        self.base = (base_url or os.environ.get("REBORN_URL", "http://127.0.0.1:3000")).rstrip("/")
        self.token = token or os.environ.get("REBORN_TOKEN") or None
        self.timeout = timeout
        self.retries = retries
        # Projet de migration visé par les appels /api/migration/... (sinon : projet courant du Studio)
        self.project = project or os.environ.get("REBORN_PROJECT") or None
        self._after_seq: Optional[int] = None

    # ------------------------------------------------------------------ HTTP
    def _req(self, method: str, path: str, body: Any = None) -> Any:
        if self.project and path.startswith(("/api/migration", "/api/events", "/api/observations", "/api/schema")) and "project=" not in path:
            path += ("&" if "?" in path else "?") + "project=" + urllib.parse.quote(self.project)
        data = json.dumps(body).encode() if body is not None else None
        headers = {"content-type": "application/json", "user-agent": f"reborn-client/{__version__}"} if data else {"user-agent": f"reborn-client/{__version__}"}
        if self.token:
            headers["authorization"] = f"Bearer {self.token}"
        # Les lectures sont réessayées en cas de coupure réseau ; les écritures ne le sont pas
        # automatiquement (un renvoi d'observation identique reste sans effet côté REBORN).
        attempts = 1 + (self.retries if method == "GET" else 0)
        for attempt in range(attempts):
            req = urllib.request.Request(self.base + path, data=data, method=method, headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    return json.loads(r.read() or b"null")
            except urllib.error.HTTPError as e:
                raw = e.read().decode(errors="replace")
                try:
                    payload = json.loads(raw)
                except ValueError:
                    payload = raw
                issues = payload.get("issues") if isinstance(payload, dict) else None
                msg = payload.get("error", raw) if isinstance(payload, dict) else raw
                if issues:
                    msg += "\n" + "\n".join(f"  - {i.get('rule_id') or i.get('path') or ''} {i.get('message')}" for i in issues[:20])
                raise RebornError(f"{method} {path} → HTTP {e.code} : {msg}", e.code, payload) from None
            except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
                if attempt + 1 < attempts:
                    time.sleep(0.5 * (attempt + 1))
                    continue
                reason = getattr(e, "reason", e)
                raise RebornError(f"REBORN injoignable sur {self.base} : {reason}") from None

    # ---------------------------------------------------------- Connexion
    def health(self) -> Json:
        """Plateforme joignable, version des contrats, jeton exigé/valide, mode et investigation actifs."""
        return self._req("GET", "/api/health")

    def revision(self) -> Json:
        """Compteurs légers { revision, event_seq }."""
        return self._req("GET", "/api/revision")

    # ----------------------------------------------------------- Investigation
    def start_investigation(
        self,
        application: str,
        module: str,
        target_url: Optional[str] = None,
        objective: Optional[str] = None,
        mode: str = "live",
        kind: str = "initial",
        project_id: Optional[str] = None,
    ) -> Json:
        """Crée une investigation (normalement lancée depuis le dashboard).
        mode : "live" (agents réels) · "replay" (données de référence / tests) · "simulation"
        (explorateur de répétition intégré à REBORN). project_id : rattache la découverte au projet."""
        body = {"application": application, "module": module, "mode": mode, "kind": kind}
        if project_id or self.project:
            body["project_id"] = project_id or self.project
        if target_url:
            body["target_url"] = target_url
        if objective:
            body["objective"] = objective
        return self._req("POST", "/api/investigations", body)["investigation"]

    def active_investigation(self, live_only: bool = True) -> Optional[Json]:
        """Investigation en cours, ou None. Par défaut, uniquement une investigation « agents réels » :
        un scénario local ou une répétition ne doivent jamais déclencher l'agent H Company."""
        return self._req("GET", "/api/investigations?active=1" + ("&mode=live" if live_only else ""))

    def wait_for_investigation(self, poll: float = 2.0, timeout: Optional[float] = None) -> Json:
        """Attend qu'une investigation « agents réels » soit lancée depuis le dashboard."""
        start = time.monotonic()
        while True:
            inv = self.active_investigation()
            if inv:
                return inv
            if timeout is not None and time.monotonic() - start > timeout:
                raise RebornError("Aucune investigation « agents réels » lancée dans le délai imparti")
            time.sleep(poll)

    def investigations(self) -> List[Json]:
        return self._req("GET", "/api/investigations")

    def complete(self, investigation_id: str, failed: bool = False) -> None:
        self._req("PATCH", "/api/investigations", {"id": investigation_id, "status": "failed" if failed else "completed"})

    # ------------------------------------------------------------- Explorer
    def observation(
        self,
        experiment_id: str,
        inputs: Json,
        observed_output: Json,
        status: str = "success",
        error: Optional[str] = None,
        screenshot: Optional[str] = None,
        request_id: Optional[str] = None,
        investigation_id: Optional[str] = None,
        **extra: Any,
    ) -> Json:
        """Contrat Mouss → Alan/Jerem.
        status : "success" (résultat affiché) · "error" (refus métier affiché par le logiciel,
        comparé) · "failed" (échec technique de l'agent, exclu du score).
        `screenshot` : chemin local ou URL. Réponse : { count, duplicates, investigation_id }."""
        obs: Json = {
            "experiment_id": experiment_id,
            "inputs": inputs,
            "observed_output": observed_output,
            "status": status,
            **extra,
        }
        if error:
            obs["error"] = error
        if request_id:
            obs["request_id"] = request_id
        if investigation_id:
            obs["investigation_id"] = investigation_id
        if screenshot:
            obs["screenshot_url"] = _image(screenshot)
        return self._req("POST", "/api/observations", obs)

    def observations(self, items: List[Json], investigation_id: Optional[str] = None) -> Json:
        """Envoi groupé (2000 max). `investigation_id` complète les éléments qui n'en ont pas."""
        if investigation_id:
            items = [{"investigation_id": investigation_id, **o} for o in items]
        return self._req("POST", "/api/observations", items)

    def action(self, title: str, detail: Optional[str] = None, screenshot: Optional[str] = None, data: Any = None, investigation_id: Optional[str] = None) -> Json:
        """Action de l'agent (clic, saisie, navigation…) affichée en direct."""
        return self._event("explorer", "action", title, detail, data, screenshot, investigation_id)

    def publish_schema(self, schema: Json, source: str = "explorer", investigation_id: Optional[str] = None) -> Json:
        """Description structurée de l'écran (champs, sections, sorties, éléments non repris).
        Crée une nouvelle version : l'application reconstruite se régénère."""
        if investigation_id:
            schema = {**schema, "investigation_id": investigation_id}
        return self._req("POST", f"/api/schema?source={urllib.parse.quote(source)}", schema)

    def form_discovered(self, fields: List[Json], title: Optional[str] = None, investigation_id: Optional[str] = None) -> Json:
        """Raccourci compatible : publie un schéma ne contenant que des champs."""
        return self._event("explorer", "form_discovered", title or f"Écran analysé : {len(fields)} champs", None, {"fields": fields}, None, investigation_id)

    def experiment_requests(self, investigation_id: Optional[str] = None) -> List[Json]:
        """Nouvelles demandes d'expérience depuis le dernier appel (polling par numéro d'ordre,
        sans perte ni doublon). Le premier appel ignore l'historique. `investigation_id` :
        uniquement les demandes de cette investigation (recommandé pour l'agent réel)."""
        if self._after_seq is None:
            self._after_seq = int(self.revision()["event_seq"])
            return []
        server_seq = int(self.revision()["event_seq"])
        if server_seq < self._after_seq:
            # Données de la plateforme effacées (fichier d'état supprimé) : on repart du début
            self._after_seq = 0
        q = {"type": "experiment_request", "after_seq": self._after_seq}
        if investigation_id:
            q["investigation_id"] = investigation_id
        events = self._req("GET", f"/api/events?{urllib.parse.urlencode(q)}")
        if len(events) >= 1000:
            # Page pleine : on poursuit au prochain appel depuis le dernier élément reçu
            self._after_seq = events[-1]["seq"]
        else:
            # Tout ce qui précède server_seq a été lu : le curseur avance même sans demande
            self._after_seq = max([server_seq] + [e["seq"] for e in events])
        return events

    # -------------------------------------------------------------- Analyste
    def get_observations(self, investigation_id: Optional[str] = None) -> List[Json]:
        """Observations reçues (toutes, ou d'une investigation)."""
        q = f"?investigation_id={urllib.parse.quote(investigation_id)}" if investigation_id else ""
        return self._req("GET", f"/api/observations{q}")

    def hypothesis(self, title: str, detail: Optional[str] = None, confidence: Optional[float] = None, investigation_id: Optional[str] = None) -> Json:
        return self._event("analyst", "hypothesis", title, detail, {"confidence": confidence} if confidence is not None else None, None, investigation_id)

    def request_experiment(self, inputs: Json, reason: str, investigation_id: Optional[str] = None) -> Json:
        """Alan → Mouss : expérience à mener pour lever une ambiguïté. Réponse : { ids, seqs }
        (l'observation de réponse portera request_id = ids[0])."""
        title = "Expérience demandée : " + " · ".join(str(v) for v in inputs.values())
        return self._event("analyst", "experiment_request", title, reason, {"inputs": inputs}, None, investigation_id)

    def publish_rules(self, model: Json, dry_run: bool = False) -> Json:
        """Contrat Alan → Jerem. Le modèle est validé avant exécution (RebornError 422 avec la
        liste des erreurs sinon). Renvoie la version créée, les avertissements et la validation
        immédiate (équivalence, construction/validation, écarts, limites)."""
        return self._req("POST", "/api/rules" + ("?dry_run=1" if dry_run else ""), model)

    def rules(self, version: Optional[int] = None) -> Json:
        """Modèle publié courant (ou une version précise)."""
        return self._req("GET", "/api/rules" + (f"?version={int(version)}" if version is not None else ""))

    def rule_history(self) -> List[Json]:
        return self._req("GET", "/api/rules?all=1")

    def schema(self) -> Json:
        """Schéma d'interface courant (publié par l'Explorer)."""
        return self._req("GET", "/api/schema")

    def compute(self, inputs: Json, model: Optional[Json] = None, version: Optional[int] = None) -> Json:
        """Exécute le moteur reconstruit (modèle stocké, ou brouillon passé en `model`, validé avant)."""
        body: Json = {"inputs": inputs}
        if model is not None:
            body["model"] = model
        if version is not None:
            body["version"] = version
        return self._req("POST", "/api/compute", body)

    def compare(self, investigation_id: Optional[str] = None, version: Optional[int] = None) -> Json:
        q = {k: v for k, v in {"investigation_id": investigation_id, "version": version}.items() if v is not None}
        return self._req("GET", "/api/compare" + (f"?{urllib.parse.urlencode(q)}" if q else ""))

    def app(self) -> Json:
        """Application reconstruite résolue (champs, sorties, éléments non repris)."""
        return self._req("GET", "/api/app")

    def contracts(self) -> Json:
        """Contrats d'intégration en JSON Schema."""
        return self._req("GET", "/api/contracts")

    def events(self, after_seq: Optional[int] = None, type: Optional[str] = None, investigation_id: Optional[str] = None, limit: Optional[int] = None) -> List[Json]:
        """Journal ordonné (seq strictement croissant)."""
        q = {k: v for k, v in {"after_seq": after_seq, "type": type, "investigation_id": investigation_id, "limit": limit}.items() if v is not None}
        return self._req("GET", "/api/events" + (f"?{urllib.parse.urlencode(q)}" if q else ""))

    def scenario(self, scenario: str, step: str) -> Json:
        """Rejoue une étape d'un scénario de référence (platform/scenarios) — mode local."""
        return self._req("POST", "/api/scenarios", {"scenario": scenario, "step": step})

    # ------------------------------------------------------------- Migration
    def migration(self) -> Json:
        """Projet de migration : sources, correspondances, points à valider, exécutions, mise en service."""
        return self._req("GET", "/api/migration")

    def migration_upload(self, path: str, mechanism: Optional[str] = None, name: Optional[str] = None) -> Json:
        """Mouss → Jerem : dépose un fichier extrait du logiciel source (CSV, JSON, .xlsx, .sql,
        base SQLite, archive ZIP de pièces jointes). REBORN en calcule l'empreinte SHA-256."""
        with open(path, "rb") as f:
            data = base64.b64encode(f.read()).decode()
        body: Json = {"name": name or os.path.basename(path), "content_base64": data}
        if mechanism:
            body["mechanism"] = mechanism
        return self._req("POST", "/api/migration/sources", body)

    def migration_extract(self, plan: Json, username: str, password: str, base_url: Optional[str] = None) -> Json:
        """Lance l'extraction HTTP autorisée décrite par un plan (contrat extraction_plan).
        Le mot de passe sert uniquement à ouvrir la session ; REBORN ne le conserve pas."""
        body: Json = {"plan": plan, "username": username, "password": password}
        if base_url:
            body["base_url"] = base_url
        return self._req("POST", "/api/migration/extract", body)

    def migration_profile(self) -> Json:
        """Structure lue : tables, colonnes (types, formats, anomalies), clés, relations probables."""
        return self._req("GET", "/api/migration/profile")

    def migration_publish_mapping(self, mapping: Json) -> Json:
        """Alan → Jerem : correspondances ancien → nouveau (contrat migration_mapping).
        Réponse : version, problèmes détectés, points incertains à faire valider."""
        return self._req("POST", "/api/migration/mapping", mapping)

    def migration_report(self, run_id: str) -> Json:
        """Rapport de vérification d'une exécution (volumes, contrôles, écarts, rejets)."""
        return self._req("GET", f"/api/migration/runs/{urllib.parse.quote(run_id)}")

    # ------------------------------------------------------------- Projets
    def projects(self) -> List[Json]:
        """Projets de migration (état, avancement réel, données, anomalies, logiciel livré)."""
        return self._req("GET", "/api/projects")["projects"]

    def project_details(self, project_id: Optional[str] = None) -> Json:
        """Résumé + détails (connexion, autorisation, historique des états). Jamais de secret."""
        return self._req("GET", f"/api/projects/{self._pid(project_id)}")

    def create_project(self, company: str, authorized_by: str, software: Optional[str] = None, legacy_url: Optional[str] = None, software_type: Optional[str] = None, notes: Optional[str] = None, username: Optional[str] = None, password: Optional[str] = None) -> Json:
        """Crée un projet (le propriétaire confirme son autorisation). Les identifiants éventuels
        sont chiffrés côté Studio (24 h) et ne sont jamais renvoyés. Le client utilise ensuite ce projet."""
        body: Json = {"company": company, "authorized": True, "authorized_by": authorized_by}
        for k, v in (("software", software), ("legacy_url", legacy_url), ("software_type", software_type), ("notes", notes)):
            if v:
                body[k] = v
        if username and password:
            body["credentials"] = {"username": username, "password": password}
        p = self._req("POST", "/api/projects", body)["project"]
        self.project = p["id"]
        return p

    def use_project(self, project_id: str) -> None:
        """Les appels suivants visent ce projet (équivaut à ?project=…)."""
        self.project = project_id

    def _pid(self, project_id: Optional[str]) -> str:
        pid = project_id or self.project
        if not pid:
            raise RebornError("Aucun projet : passez project_id, appelez use_project() ou définissez REBORN_PROJECT")
        return urllib.parse.quote(pid)

    # ------------------------------------------------- Mouss : connexion et mission
    def mission(self, project_id: Optional[str] = None) -> Json:
        """Mission de connexion/exploration pour l'agent (sans jeton) : cible, objectifs, contraintes, points de rapport."""
        return self._req("GET", f"/api/projects/{self._pid(project_id)}/mission")

    def take_mission(self, project_id: Optional[str] = None) -> Json:
        """Mission AVEC jeton de remise des identifiants (usage unique, 15 min).
        Le jeton et les identifiants sont destinés au code technique de l'exécuteur : ne jamais
        les transmettre à un modèle de langage ni les journaliser."""
        return self._req("POST", f"/api/projects/{self._pid(project_id)}/mission")

    def redeem_credentials(self, token: str, project_id: Optional[str] = None) -> Json:
        """Échange le jeton de mission contre les identifiants (une seule fois). Ne pas journaliser le résultat."""
        return self._req("POST", f"/api/projects/{self._pid(project_id)}/credentials/redeem", {"token": token})

    def report_connection(self, status: str, detail: Optional[str] = None, project_id: Optional[str] = None, by: str = "Explorer") -> Json:
        """État de connexion : pending · connected · failed · mfa_required · human_needed.
        REBORN ne passe jamais un projet à « Connecté » sans ce rapport (ou un test réel du connecteur)."""
        body: Json = {"status": status, "by": by}
        if detail:
            body["detail"] = detail
        return self._req("POST", f"/api/projects/{self._pid(project_id)}/connection", body)

    # ---------------------------------------------------- Alan : modèle métier
    def publish_business_model(self, model: Json) -> Json:
        """Alan → Jerem : modèle métier exécutable (contrat business_model : modules de règles
        + liaisons aux entités). Crée une version « à valider » ; réponse : version, problèmes."""
        return self._req("POST", "/api/migration/business-model", model)

    def business_models(self) -> List[Json]:
        """Versions reçues : statut (proposed / validated / rejected), problèmes, vérification sur l'historique."""
        return self._req("GET", "/api/migration/business-model")["versions"]

    def check_business_model(self, version: int) -> Json:
        """Rejoue une version sur les documents historiques migrés (lecture seule) et compare aux montants enregistrés."""
        return self._req("POST", "/api/migration/business-model/check", {"version": version})["check"]

    def application_spec(self) -> Json:
        """Aperçu de l'ApplicationSpec du projet (provenance, écrans, règles, éléments non reconstruits)."""
        return self._req("GET", "/api/migration/spec")

    # ---------------------------------------------------------------- Divers
    def log(self, title: str, detail: Optional[str] = None, source: str = "explorer", investigation_id: Optional[str] = None) -> Json:
        return self._event(source, "log", title, detail, None, None, investigation_id)

    def _event(
        self,
        source: str,
        type_: str,
        title: str,
        detail: Optional[str] = None,
        data: Any = None,
        screenshot: Optional[str] = None,
        investigation_id: Optional[str] = None,
    ) -> Json:
        ev: Json = {"source": source, "type": type_, "title": title}
        if detail:
            ev["detail"] = detail
        if data is not None:
            ev["data"] = data
        if screenshot:
            ev["screenshot_url"] = _image(screenshot)
        if investigation_id:
            ev["investigation_id"] = investigation_id
        return self._req("POST", "/api/events", ev)


def _image(path_or_url: str) -> str:
    """Chemin local → data URL base64 (stockée par REBORN, 8 Mo max). URL → inchangée."""
    if path_or_url.startswith(("http://", "https://", "data:")):
        return path_or_url
    mime = mimetypes.guess_type(path_or_url)[0] or "image/png"
    with open(path_or_url, "rb") as f:
        return f"data:{mime};base64,{base64.b64encode(f.read()).decode()}"


if __name__ == "__main__":
    rb = Reborn()
    cmd = sys.argv[1] if len(sys.argv) > 1 else "help"
    try:
        if cmd == "health":
            print(json.dumps(rb.health(), ensure_ascii=False, indent=2))
        elif cmd == "rules" and len(sys.argv) > 2:
            with open(sys.argv[2], encoding="utf-8") as f:
                print(json.dumps(rb.publish_rules(json.load(f)), ensure_ascii=False, indent=2))
        elif cmd == "observations" and len(sys.argv) > 2:
            with open(sys.argv[2], encoding="utf-8") as f:
                payload = json.load(f)
            print(rb.observations(payload if isinstance(payload, list) else [payload]))
        elif cmd == "schema" and len(sys.argv) > 2:
            with open(sys.argv[2], encoding="utf-8") as f:
                print(rb.publish_schema(json.load(f)))
        elif cmd == "scenario" and len(sys.argv) > 3:
            print(rb.scenario(sys.argv[2], sys.argv[3]))
        elif cmd == "compare":
            r = rb.compare()
            print(f"Équivalence : {r['equivalence']}  ({r['matched']}/{r['scored']}) · validation {r['independent_matched']}/{r['independent_total']}")
            for row in r["rows"]:
                if row["status"] == "mismatch":
                    print(f"  ✕ {row['experiment_id']} {row['inputs']} historique={row['observed']} reconstruit={row['computed'].get('total_price')}")
        else:
            print(__doc__)
    except RebornError as e:
        print(e, file=sys.stderr)
        sys.exit(1)
