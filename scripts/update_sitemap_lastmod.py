#!/usr/bin/env python3
"""Update sitemap <lastmod> using each page's latest Git commit date.

Run after edits to HTML pages. A no-op if the pages have not changed.
No external dependencies or network requests are needed.
"""
from __future__ import annotations

from datetime import date
from pathlib import Path
import re
import subprocess
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
SITEMAP = ROOT / "sitemap.xml"
BASE_URL = "https://www.lilachpavon.co.il"

# Public, indexable pages only; booking/approval/private routes are excluded.
PAGES = {
    "/": "index.html",
    "/privacy": "privacy.html",
    "/terms": "terms.html",
    "/cancellations": "cancellations.html",
    "/accessibility": "accessibility.html",
    "/tipul-rigshi-holon": "tipul-rigshi-holon.html",
    "/cbt-holon": "cbt-holon.html",
    "/nlp-holon": "nlp-holon.html",
    "/tipul-beharada-holon": "tipul-beharada-holon.html",
}


def last_modified(file_path: str) -> str:
    if not (ROOT / file_path).is_file():
        raise FileNotFoundError(file_path)
    result = subprocess.run(
        ["git", "log", "-1", "--format=%cs", "--", file_path],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    value = result.stdout.strip()
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError(f"Missing valid Git commit date for {file_path}: {value!r}")
    date.fromisoformat(value)
    return value


def main() -> None:
    original = SITEMAP.read_text(encoding="utf-8")
    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    root = ET.fromstring(original)
    published_urls = [
        el.text for el in root.findall("./sm:url/sm:loc", namespace)
    ]
    expected_urls = {BASE_URL + path for path in PAGES}

    # Do not silently rewrite or add routes. A sitemap URL list edit needs review.
    if len(published_urls) != len(set(published_urls)) or set(published_urls) != expected_urls:
        raise ValueError("Sitemap URL list does not match PAGES; review new/removed pages")

    updated = original
    changes = 0
    for path, file_path in PAGES.items():
        url = BASE_URL + path
        stamp = last_modified(file_path)
        expression = re.compile(
            r"(<loc>" + re.escape(url) +
            r"</loc>\s*<lastmod>)(\d{4}-\d{2}-\d{2})(</lastmod>)"
        )
        matches = list(expression.finditer(updated))
        if len(matches) != 1:
            raise ValueError(f"Expected exactly one <lastmod> for {url}")
        old = matches[0].group(2)
        if old != stamp:
            updated = expression.sub(lambda m: m.group(1) + stamp + m.group(3), updated, count=1)
            print(f"{file_path}: {old} -> {stamp}")
            changes += 1

    ET.fromstring(updated)
    if changes:
        SITEMAP.write_text(updated, encoding="utf-8")
    print(f"Sitemap complete: {changes} date(s) updated; {len(PAGES)} public pages")


if __name__ == "__main__":
    main()
