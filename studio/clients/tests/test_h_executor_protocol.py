"""Protocole de l'exécuteur contre un FAUX Studio local (sans réseau, sans SDK, sans clé H).

Déroule le mode doublure (--replay) : battement → prise → remise unique → rapports de connexion →
carte (évènements + schéma d'écran) → observations → plan d'extraction PROPOSÉ → fin de mission.
Vérifie l'ordre, la conformité des corps et qu'aucun identifiant remis ne fuite.
"""
import json
import os
import shutil
import sys
import tempfile
import unittest

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, HERE)

import h_executor as E  # noqa: E402
from reborn_client import Reborn  # noqa: E402
from fake_studio import FakeStudio, default_mission, FAKE_PASSWORD  # noqa: E402
from fake_hoteldruid import FakeHotelDruid  # noqa: E402

FIXTURE = os.path.join(HERE, "..", "examples", "replay", "hotel")


def run_main(args, studio_url, token="jeton-explorer-test"):
    env = dict(os.environ)
    os.environ.update({"REBORN_URL": studio_url, "REBORN_TOKEN": token, "REBORN_EXECUTOR_ID": "doublure-test"})
    # Pas de clé H en doublure : garantir qu'on ne tente jamais H.
    os.environ.pop("HAI_API_KEY", None)
    try:
        return E.main(args)
    finally:
        os.environ.clear()
        os.environ.update(env)


def run_once(studio_url, replay_dir, token="jeton-explorer-test"):
    return run_main(["--replay", replay_dir], studio_url, token)


def make_replay(export_base=None):
    """Dossier de doublure temporaire (jeu de test) : map/experiments copiés de la référence, meta minimal.
    `export_base` branche un faux logiciel local pour éprouver la récupération d'export pendant la mission."""
    d = tempfile.mkdtemp(prefix="reborn-replay-")
    shutil.copy(os.path.join(FIXTURE, "map.json"), os.path.join(d, "map.json"))
    if os.path.exists(os.path.join(FIXTURE, "experiments.json")):
        shutil.copy(os.path.join(FIXTURE, "experiments.json"), os.path.join(d, "experiments.json"))
    meta = {"connection": "connected", "system": "Logiciel hôtelier (jeu de test)"}
    if export_base:
        meta["export_base"] = export_base
    with open(os.path.join(d, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f)
    return d


class ProtocolTest(unittest.TestCase):
    def test_full_replay_with_credentials_and_plan_fallback(self):
        with FakeStudio(mission=default_mission(with_credentials=True), plan_route=False) as studio:
            code = run_once(studio.url, FIXTURE)
        self.assertEqual(code, 0, "mission menée (code 0)")
        self.assertGreaterEqual(studio.heartbeats, 1)
        self.assertEqual(studio.redeemed, 1, "remise unique des identifiants")
        self.assertEqual(studio.connection_reports, ["pending", "connected"])
        self.assertIsNotNone(studio.completed)
        self.assertEqual(studio.completed["outcome"], "completed")
        self.assertEqual(studio.completed["disposal"]["local_artifacts_purged"], True)
        # Carte : au moins un form_discovered + un schéma d'écran + des observations.
        self.assertTrue(studio.posted("/api/events"))
        self.assertTrue(studio.posted("/api/schema"))
        obs = studio.posted("/api/observations")
        self.assertTrue(obs)
        # Plan d'extraction proposé : route absente (404) -> repli sur le journal (évènement log).
        # (Le client encode en JSON ascii : « proposé » s'écrit « propos\\u00e9 » dans le corps brut.)
        self.assertEqual(studio.plan_posts, 1)
        logged_plan = any("Plan d'extraction propos" in (r["raw"] or "") for r in studio.posted("/api/events"))
        self.assertTrue(logged_plan, "plan consigné au journal quand la route n'existe pas")

    def test_plan_route_used_when_available(self):
        with FakeStudio(mission=default_mission(with_credentials=True), plan_route=True) as studio:
            code = run_once(studio.url, FIXTURE)
        self.assertEqual(code, 0)
        self.assertEqual(studio.plan_posts, 1)
        self.assertFalse(any("Plan d'extraction propos" in (r["raw"] or "") for r in studio.posted("/api/events")))

    def test_no_credential_leak_anywhere(self):
        with FakeStudio(mission=default_mission(with_credentials=True)) as studio:
            run_once(studio.url, FIXTURE)
        self.assertEqual(studio.leaked_secrets(), [], "aucun identifiant remis dans les corps envoyés")
        # Le mot de passe ne figure dans aucune observation / évènement / schéma / rapport.
        for r in studio.requests:
            if not r["path"].endswith("/credentials/redeem"):
                self.assertNotIn(FAKE_PASSWORD, r["raw"] or "")

    def test_reports_announce_test_double(self):
        with FakeStudio(mission=default_mission(with_credentials=True)) as studio:
            run_once(studio.url, FIXTURE)
        # Chaque rapport de connexion et la fin portent la mention « jeu de test ».
        conns = [r for r in studio.requests if r["path"].endswith("/connection")]
        self.assertTrue(all("jeu de test" in (r["raw"] or "") for r in conns))
        self.assertIn("jeu de test", studio.posted("/complete")[0]["raw"])

    def test_no_mission_in_queue_exits_3(self):
        studio = FakeStudio(mission=default_mission())
        studio.start()
        try:
            studio.claimed = True  # file vide : /claim renvoie 204
            code = run_once(studio.url, FIXTURE)
        finally:
            studio.stop()
        self.assertEqual(code, 3)

    def test_missing_token_refuses_to_start(self):
        env = dict(os.environ)
        os.environ.pop("REBORN_TOKEN", None)
        os.environ["REBORN_URL"] = "http://127.0.0.1:1"
        try:
            self.assertEqual(E.main(["--replay", FIXTURE]), 2)
        finally:
            os.environ.clear()
            os.environ.update(env)

    def test_replay_without_credentials(self):
        with FakeStudio(mission=default_mission(with_credentials=False)) as studio:
            code = run_once(studio.url, FIXTURE)
        self.assertEqual(code, 0)
        self.assertEqual(studio.redeemed, 0, "aucune remise sans identifiants")
        self.assertEqual(studio.connection_reports, ["pending", "connected"])


class PermanentModeTest(unittest.TestCase):
    def test_loop_runs_two_missions_in_a_row(self):
        m1 = default_mission(with_credentials=False)
        m2 = default_mission(with_credentials=False)
        m1["mission_id"], m2["mission_id"] = "MIS_1111111111", "MIS_2222222222"
        with FakeStudio(mission=m1, missions=[m1, m2]) as studio:
            code = run_main(["--loop", "--replay", FIXTURE, "--max-missions", "2"], studio.url)
        self.assertEqual(code, 0)
        self.assertEqual(len(studio.completions), 2, "deux missions menées à la suite")
        self.assertTrue(all(c["outcome"] == "completed" for c in studio.completions))
        self.assertGreaterEqual(studio.heartbeats, 1)

    def test_loop_empty_queue_then_bounded_stop(self):
        # File vide dès le départ : la boucle attend sans planter, puis s'arrête à la borne (ici 0 mission possible).
        studio = FakeStudio(mission=default_mission(with_credentials=False), missions=[])
        studio.start()
        try:
            # --max-missions 1 mais file vide : on borne le temps avec une mission factice servie une fois.
            studio.mission_queue.append(default_mission(with_credentials=False))
            code = run_main(["--loop", "--replay", FIXTURE, "--max-missions", "1"], studio.url)
        finally:
            studio.stop()
        self.assertEqual(code, 0)
        self.assertEqual(len(studio.completions), 1)


class AutoExportRecoveryTest(unittest.TestCase):
    def test_executor_recovers_export_before_completing(self):
        d = make_replay()
        try:
            with FakeHotelDruid(mode="ok") as hotel, FakeStudio(mission=default_mission(with_credentials=False)) as studio:
                # export_base connu seulement après le démarrage du faux logiciel.
                meta_path = os.path.join(d, "meta.json")
                meta = json.load(open(meta_path, encoding="utf-8"))
                meta["export_base"] = hotel.url
                json.dump(meta, open(meta_path, "w", encoding="utf-8"))
                code = run_once(studio.url, d)
        finally:
            shutil.rmtree(d, ignore_errors=True)
        self.assertEqual(code, 0)
        # La sauvegarde officielle a été récupérée et déposée AVANT la fin de mission.
        self.assertEqual(len(studio.sources), 1)
        self.assertTrue(studio.sources[0]["mechanism"].startswith("Sauvegarde officielle du logiciel, récupérée par l'agent d'exploration (mission MIS_0123456789)"))
        self.assertIsNotNone(studio.completed)
        self.assertIn("sauvegarde officielle récupérée", (studio.completed["detail"] or "").lower())

    def test_executor_reports_when_no_export(self):
        d = make_replay()  # pas d'export_base : aucune récupération tentée
        try:
            with FakeStudio(mission=default_mission(with_credentials=False)) as studio:
                code = run_once(studio.url, d)
        finally:
            shutil.rmtree(d, ignore_errors=True)
        self.assertEqual(code, 0)
        self.assertEqual(studio.sources, [], "aucun export sans faux logiciel branché (pas d'appel réseau)")


if __name__ == "__main__":
    unittest.main()
