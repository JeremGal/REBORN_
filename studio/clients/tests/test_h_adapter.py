"""Tests unitaires des conversions pures (h_adapter) — sans réseau, sans SDK, sans fichier."""
import json
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import h_adapter as A  # noqa: E402

HERE = os.path.dirname(__file__)
FIXTURE = os.path.join(HERE, "..", "examples", "replay", "hotel")


def load(name):
    with open(os.path.join(FIXTURE, name), encoding="utf-8") as f:
        return json.load(f)


class FlattenTest(unittest.TestCase):
    def test_lists_become_text_and_nested_flattened(self):
        rec = {"a": [1, 2, 3], "b": {"c": {"d": "x"}}, "n": 4, "ok": True, "skip": None}
        out = A.flatten_record(rec)
        self.assertEqual(out["a"], "1, 2, 3")
        self.assertEqual(out["b.c.d"], "x")
        self.assertEqual(out["n"], 4)
        self.assertIs(out["ok"], True)
        self.assertNotIn("skip", out)  # null retiré

    def test_values_are_primitives_only(self):
        out = A.flatten_record({"x": {"y": [1, {"z": 2}]}})
        for v in out.values():
            self.assertIsInstance(v, (str, int, float, bool))


class ObservationTest(unittest.TestCase):
    def setUp(self):
        self.exps = load("experiments.json")

    def test_success_strips_plumbing_and_prefixes_id(self):
        obs = A.experiment_to_observation(self.exps[0], "MIS_0123456789", "INV_1")
        self.assertEqual(obs["experiment_id"], "MIS_0123456789:EXP_001")
        self.assertEqual(obs["status"], "success")
        self.assertEqual(obs["investigation_id"], "INV_1")
        self.assertEqual(obs["observed_output"]["lignes"], "Nuit 1, Nuit 2, Nuit 3")  # liste -> texte
        self.assertEqual(obs["observed_output"]["total_sejour"], "255,00")
        for forbidden in ("agent_view_url", "session_id", "agent_config", "external_context", "evidence", "error"):
            self.assertNotIn(forbidden, obs)  # plomberie / chemins locaux / error null retirés

    def test_app_error_becomes_status_error(self):
        obs = A.experiment_to_observation(self.exps[1], "MIS_0123456789")
        self.assertEqual(obs["status"], "error")
        self.assertIn("app_error", obs["observed_output"])
        self.assertEqual(obs["error"], "Date de départ antérieure à la date d'arrivée.")

    def test_null_output_becomes_empty_and_failed(self):
        obs = A.experiment_to_observation(self.exps[2], "MIS_0123456789")
        self.assertEqual(obs["status"], "failed")
        self.assertEqual(obs["observed_output"], {})
        self.assertEqual(obs["error"], "Délai de session dépassé")

    def test_final_screenshot_only_when_resolved_url(self):
        obs = A.experiment_to_observation(self.exps[0], "MIS_0123456789", final_screenshot_url="data:image/png;base64,AAAA")
        self.assertEqual(obs["screenshot_url"], "data:image/png;base64,AAAA")
        obs2 = A.experiment_to_observation(self.exps[0], "MIS_0123456789", final_screenshot_url="artifacts/EXP_001/step_05.png")
        self.assertNotIn("screenshot_url", obs2)  # chemin local jamais transmis


class MapTest(unittest.TestCase):
    def setUp(self):
        self.expl = load("map.json")

    def test_one_event_per_page_plus_summary(self):
        events = A.app_map_to_events(self.expl, "MIS_0123456789", "INV_1")
        pages = self.expl["app_map"]["pages"]
        self.assertEqual(len(events), len(pages) + 1)  # synthèse + une page par évènement
        self.assertEqual(events[0]["type"], "log")
        kinds = {e["type"] for e in events[1:]}
        self.assertIn("form_discovered", kinds)
        for e in events:
            self.assertEqual(e["investigation_id"], "INV_1")

    def test_screen_schema_from_richest_page(self):
        screen = A.pick_screen(self.expl["app_map"])
        self.assertEqual(screen["name"], "Nouvelle réservation")
        schema = A.screen_to_app_schema(screen, self.expl["app_map"], "MIS_0123456789", "INV_1")
        names = {f["name"] for f in schema["fields"]}
        self.assertNotIn("enregistrer", names)  # un bouton n'est pas un champ
        chambre = next(f for f in schema["fields"] if f["label"] == "Chambre")
        self.assertEqual(chambre["type"], "enum")
        self.assertEqual([o["value"] for o in chambre["options"]], ["101", "102", "201"])
        acompte = next(f for f in schema["fields"] if f["label"] == "Acompte reçu")
        self.assertEqual(acompte["type"], "boolean")
        self.assertGreaterEqual(len(schema["fields"]), 1)

    def test_find_export_pages(self):
        pages = A.find_export_pages(self.expl["app_map"])
        self.assertTrue(any(p["url"] == "/crea_backup.php" for p in pages))


class ExtractionPlanTest(unittest.TestCase):
    def test_build_plan_1_1_from_meta(self):
        meta = load("meta.json")
        plan = A.build_extraction_plan(meta["system"], "http://x.exemple.test", meta["plan_mechanisms"], "Agent H — jeu de test", mission_id="MIS_0123456789")
        self.assertEqual(plan["contract_version"], "1.1")
        self.assertEqual(plan["proposed_by"], "Agent H — jeu de test")
        self.assertEqual(plan["mission_id"], "MIS_0123456789")
        m = plan["mechanisms"][0]
        self.assertEqual(m["method"], "POST")
        self.assertEqual(m["form"]["compresso"], "SI")
        self.assertEqual(m["format"], "tagged-dump")
        self.assertEqual(m["compression"], "gzip")
        self.assertIn("utenti", m["exclude_tables"])
        self.assertEqual(m["prepare"][0]["form"]["crea_backup"], "1")

    def test_plan_backward_compatible_without_1_1_fields(self):
        plan = A.build_extraction_plan("Sys", "http://x.test", [{"id": "clients", "url": "/exports/clients.csv"}], "Agent")
        m = plan["mechanisms"][0]
        self.assertEqual(m["method"], "GET")
        for k in ("prepare", "format", "compression", "exclude_tables"):
            self.assertNotIn(k, m)


if __name__ == "__main__":
    unittest.main()


class TestFormDiscoveredOutputs(unittest.TestCase):
    """Un écran découvert est lu par le Studio comme un schéma d'écran : sorties en objets (contrat OutputFieldSchema)."""

    def test_outputs_are_objects(self):
        page = {"name": "Liste (jeu de test)", "url": "https://exemple.test/liste", "elements": [{"kind": "select", "label": "Année", "options": ["2025", "2026"]}], "outputs": ["Tableau des réservations", "Total"]}
        ev = A.page_to_event(page, "MIS_test")
        self.assertEqual(ev["type"], "form_discovered")
        for o in ev["data"]["outputs"]:
            self.assertIsInstance(o, dict)
            self.assertTrue(o["name"] and o["label"])
