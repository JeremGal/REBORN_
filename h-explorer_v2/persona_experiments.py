"""Experiments on an app we did NOT write: https://eliasmoussouni.fr/ (portfolio, black box).

Hypothesis from the autonomous exploration (EXPL_001): "the persona changes the background image,
but the text content seems identical". We test it: same path, persona varied, observe the home page.
Usage:  .venv/Scripts/python persona_experiments.py
"""
import json
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Annotated, Optional

from pydantic import BaseModel, BeforeValidator, Field

from explorer.explorer import run_ui_experiment

APP_URL = "https://eliasmoussouni.fr/"
PERSONAS = ["Recruiter", "Developer", "Stalker", "Adventurer"]
StrList = Annotated[list[str], BeforeValidator(lambda v: v or [])]


class Row(BaseModel):
    title: str = Field(description="Row/carousel title exactly as displayed")
    cards: StrList = Field(description="Visible cards in display order: their title/label, or a 3-6 word "
                                       "description of the image if there is no text")


class PersonaObservation(BaseModel):
    profile_url: Optional[str] = Field(description="URL after choosing the persona")
    hero_title: Optional[str] = Field(description="Main hero title, exact text")
    hero_text: Optional[str] = Field(description="Hero description/tagline, exact text")
    hero_buttons: StrList = Field(description="Buttons in the hero, exact labels")
    background_description: Optional[str] = Field(description="Short description of the hero background image")
    rows: Annotated[list[Row], BeforeValidator(lambda v: v or [])] = Field(
        description="All rows/carousels on the home page, top to bottom, scrolling to the bottom")
    nav_items: StrList = Field(description="Top navigation items, in order")


def instruction(persona: str) -> str:
    return (
        f"Open the site. Wait for the intro animation to end (or click it) until the 'Who's Watching?' screen "
        f"appears, then click the '{persona}' profile. On the page that opens, report exactly what is displayed: "
        "hero title and text (exact wording, keep the exact capitalisation), hero buttons, a short description of "
        "the background image, then scroll to the bottom and list every row/carousel with its title and ONLY the "
        "cards visible without interacting with it. Deterministic protocol: NEVER click the carousel arrows, "
        "never click cards, never open external links, never submit anything. "
        "Report only what you see; never guess."
    )


def run(persona: str) -> dict:
    return run_ui_experiment(APP_URL, instruction(persona), PersonaObservation, {"persona": persona},
                             application="eliasmoussouni.fr", module="Profile home", max_attempts=2)


if __name__ == "__main__":
    t0 = time.monotonic()
    with ThreadPoolExecutor(max_workers=3) as pool:  # cloud browser: 1 H slot per experiment
        results = list(pool.map(run, PERSONAS))
    print(f"wall time: {time.monotonic() - t0:.0f}s")
    for r in results:
        print(json.dumps({k: r[k] for k in ("experiment_id", "inputs", "status", "duration_s", "error")},
                         ensure_ascii=False))
        print(json.dumps(r["observed_output"], indent=1, ensure_ascii=False))
