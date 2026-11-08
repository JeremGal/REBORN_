"""Récupération automatique d'un export officiel (h_exports) contre un FAUX logiciel et un FAUX Studio locaux.

Aucun appel réseau externe : le faux logiciel (fake_hoteldruid) sert une sauvegarde « tagged-dump » INVENTÉE,
le faux Studio (fake_studio) reçoit le dépôt. Vérifie : détection, préparation, téléchargement gzip,
conversion réelle (node scripts/tagged-dump-to-sqlite.mjs), dépôt, comptes exacts, table sensible jamais
déposée, aucune donnée dans le journal, refus des redirections / d'une autre origine / des plafonds.
"""
import base64
import os
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, HERE)

import h_exports as HX  # noqa: E402
from reborn_client import Reborn  # noqa: E402
from fake_studio import FakeStudio, default_mission  # noqa: E402
from fake_hoteldruid import FakeHotelDruid  # noqa: E402

PROJECT = "MIG_00000001"
MISSION = "MIS_0123456789"


def client(studio_url):
    return Reborn(base_url=studio_url, token="jeton-explorer-test", project=PROJECT, executor_id="test")


def deposited_tables(source_b64):
    """Tables de la base SQLite déposée (décodée du corps base64 reçu par le faux Studio)."""
    data = base64.b64decode(source_b64)
    with tempfile.TemporaryDirectory() as d:
        p = Path(d) / "dep.db"
        p.write_bytes(data)
        con = sqlite3.connect(str(p))
        try:
            names = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")]
            rows = {n: con.execute(f'SELECT COUNT(*) FROM "{n}"').fetchone()[0] for n in names}
            blob = data  # pour la recherche de secrets
            return names, rows, blob
        finally:
            con.close()


class RecoveryHappyPath(unittest.TestCase):
    def test_detect_prepare_download_convert_deposit(self):
        with FakeHotelDruid(mode="ok") as hotel, FakeStudio(mission=default_mission()) as studio:
            res = HX.recover(client(studio.url), base_url=hotel.url, mission_id=MISSION, project_id=PROJECT, investigation_id="INV_TEST")
        self.assertTrue(res["recovered"], res)
        self.assertEqual(res["mechanism"], "Sauvegarde officielle du logiciel")
        # Le logiciel a bien reçu la préparation (crea_backup=1) PUIS le téléchargement (salva_backup=1).
        posts = [r for r in hotel.requests if r["method"] == "POST"]
        self.assertTrue(any(r["form"].get("crea_backup") == "1" for r in posts), "préparation déclenchée")
        dl = [r for r in posts if r["form"].get("salva_backup") == "1"]
        self.assertTrue(dl, "téléchargement déclenché")
        self.assertEqual(dl[0]["form"].get("compresso"), "SI")
        self.assertEqual(dl[0]["form"].get("anno"), "2026", "année lue dans le formulaire (option sélectionnée)")
        # Une seule source déposée, avec le libellé de mécanisme attendu (mission citée).
        self.assertEqual(len(studio.sources), 1)
        src = studio.sources[0]
        self.assertTrue(src["mechanism"].startswith("Sauvegarde officielle du logiciel, récupérée par l'agent d'exploration (mission MIS_0123456789)"), src["mechanism"])

    def test_exact_counts_and_sensitive_table_never_deposited(self):
        with FakeHotelDruid(mode="ok") as hotel, FakeStudio(mission=default_mission()) as studio:
            res = HX.recover(client(studio.url), base_url=hotel.url, mission_id=MISSION, project_id=PROJECT)
        names, rows, blob = deposited_tables(studio.sources[0]["content_base64"])
        self.assertEqual(sorted(names), ["appartamenti", "clienti", "prenota"])
        self.assertNotIn("utenti", names, "table sensible jamais déposée")
        self.assertEqual(rows["prenota"], 3)
        self.assertEqual(rows["clienti"], 2)
        self.assertEqual(rows["appartamenti"], 2)
        # Comptes exacts dans le résumé et l'évènement de suivi.
        self.assertEqual(res["counts"]["rows_written"], 7)
        self.assertEqual(res["counts"]["tables"], 3)
        counts_ev = [r for r in studio.posted("/api/events") if "excluded_tables" in (r["raw"] or "")]
        self.assertTrue(counts_ev, "évènement de comptes envoyé")
        self.assertIn("utenti", counts_ev[0]["raw"], "la table exclue est nommée dans les comptes")
        # Le mot de passe d'un compte (table utenti) n'entre JAMAIS dans la base déposée.
        self.assertNotIn(b"secret-fictif", blob)

    def test_no_customer_data_in_journal(self):
        with FakeHotelDruid(mode="ok") as hotel, FakeStudio(mission=default_mission()) as studio:
            HX.recover(client(studio.url), base_url=hotel.url, mission_id=MISSION, project_id=PROJECT)
        # Les noms de clients fictifs figurent dans la base déposée (données migrées), jamais dans le journal.
        for r in studio.posted("/api/events"):
            self.assertNotIn("Client A", r["raw"] or "")
            self.assertNotIn("secret-fictif", r["raw"] or "")


class RecoveryRefusals(unittest.TestCase):
    def test_other_origin_refused(self):
        http = HX.Http("http://127.0.0.1:1")
        with self.assertRaises(HX.ExportError) as cm:
            http.get("http://127.0.0.1:2/crea_backup.php", timeout=1, cap=1000)
        self.assertEqual(cm.exception.reason, "origin")

    def test_redirect_never_followed(self):
        with FakeHotelDruid(mode="redirect") as hotel:
            http = HX.Http(hotel.url)
            with self.assertRaises(HX.ExportError) as cm:
                http.get(f"{hotel.url}/crea_backup.php", timeout=5, cap=1000)
            self.assertEqual(cm.exception.reason, "redirect")

    def test_redirect_recovery_deposits_nothing(self):
        with FakeHotelDruid(mode="redirect") as hotel, FakeStudio(mission=default_mission()) as studio:
            res = HX.recover(client(studio.url), base_url=hotel.url, mission_id=MISSION, project_id=PROJECT)
        self.assertFalse(res["recovered"])
        self.assertEqual(studio.sources, [])

    def test_login_required_not_attempted(self):
        with FakeHotelDruid(mode="login") as hotel, FakeStudio(mission=default_mission()) as studio:
            res = HX.recover(client(studio.url), base_url=hotel.url, mission_id=MISSION, project_id=PROJECT)
        self.assertEqual(res["reason"], "needs_login")
        self.assertEqual(studio.sources, [], "aucune tentative, aucun dépôt")
        # Jamais de POST vers le logiciel : on ne tente rien quand une connexion est demandée.
        self.assertFalse(any(r["method"] == "POST" for r in hotel.requests))
        ev = [r for r in studio.posted("/api/events") if "connexion" in (r["raw"] or "").lower()]
        self.assertTrue(ev, "le propriétaire est informé que la connexion est requise")

    def test_no_mechanism_recognized(self):
        with FakeHotelDruid(mode="blank") as hotel, FakeStudio(mission=default_mission()) as studio:
            res = HX.recover(client(studio.url), base_url=hotel.url, mission_id=MISSION, project_id=PROJECT)
        self.assertEqual(res["reason"], "unrecognized")
        self.assertEqual(studio.sources, [])
        ev = [r for r in studio.posted("/api/events") if "Aucun export automatique reconnu" in (r["raw"] or "")]
        self.assertTrue(ev)

    def test_compressed_cap_refused(self):
        saved = HX.MAX_COMPRESSED
        HX.MAX_COMPRESSED = 64  # plafond compressé minuscule : la sauvegarde le dépasse
        try:
            with FakeHotelDruid(mode="ok") as hotel, FakeStudio(mission=default_mission()) as studio:
                res = HX.recover(client(studio.url), base_url=hotel.url, mission_id=MISSION, project_id=PROJECT)
        finally:
            HX.MAX_COMPRESSED = saved
        self.assertEqual(res["reason"], "too_large")
        self.assertEqual(studio.sources, [])

    def test_decompressed_cap_refused(self):
        saved = HX.MAX_DECOMPRESSED
        HX.MAX_DECOMPRESSED = 64  # plafond décompressé minuscule : la sauvegarde le dépasse une fois décompressée
        try:
            with FakeHotelDruid(mode="ok") as hotel, FakeStudio(mission=default_mission()) as studio:
                res = HX.recover(client(studio.url), base_url=hotel.url, mission_id=MISSION, project_id=PROJECT)
        finally:
            HX.MAX_DECOMPRESSED = saved
        self.assertEqual(res["reason"], "too_large")
        self.assertEqual(studio.sources, [])


if __name__ == "__main__":
    unittest.main()
