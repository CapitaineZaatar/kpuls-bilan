#!/usr/bin/env python3
"""Reprend la carte anatomique de l'appli KPULS pour la page web.

Lit dans le dossier de l'appli (TcholakDemo) :
  - CorpsAnatomique.swift   le catalogue des muscles (noms, régions, centres)
  - MasquesMuscles.swift    le contour de chaque muscle sur la planche
  - Assets.xcassets         les deux images de la planche (face et dos)

Écrit dans ce dépôt :
  - donnees.js              le catalogue et les contours
  - img/anatomie-*.png      les images de la planche

À relancer si la carte change dans l'appli, pour que le site reste identique.
Usage : python3 outils/generer_depuis_appli.py [chemin/vers/TcholakDemo]
"""

import json
import re
import shutil
import sys
import unicodedata
from pathlib import Path

ici = Path(__file__).resolve().parent.parent
appli = Path(sys.argv[1]) if len(sys.argv) > 1 else ici.parent / "TcholakDemo"
sources = appli / "TcholakDemo"

# ---------------------------------------------------------------------------
# Catalogue
# ---------------------------------------------------------------------------

swift = (sources / "CorpsAnatomique.swift").read_text(encoding="utf-8")

regions = dict(re.findall(r'case \.(\w+):\s+"([^"]+)"', swift.split("enum RegionCorps")[1].split("struct Muscle")[0]))

def slug(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower().replace("'", "").replace(" ", "-")

# Noms au pluriel, pour accorder « gauches » / « droits » comme dans l'appli.
pluriels = set(re.findall(r'"([^"]+)"', swift.split("nomsAuPluriel: Set<String> = [")[1].split("]")[0]))

definitions = re.findall(
    r'Def\(base: "([^"]+)",\s*court: "([^"]+)",\s*vue: \.(\w+),\s*region: \.(\w+),\s*'
    r'centre: CGPoint\(x: ([\d.]+), y: ([\d.]+)\)(, axial: true)?\)',
    swift,
)

def capitaliser(s: str) -> str:
    return s[:1].upper() + s[1:]

muscles = []
for base, court, vue, region, x, y, axial in definitions:
    x, y = float(x), float(y)
    racine = f"{slug(base)}-{vue}"
    if axial:
        muscles.append(dict(id=f"{racine}-a", nomBase=base, nom=base, vue=vue, region=region,
                            cote="axial", centre=[x, y]))
        continue
    # Sur la vue de face, la moitié gauche de l'image est le côté droit du patient ;
    # sur la vue de dos, c'est l'inverse.
    cote_image_gauche = "droite" if vue == "face" else "gauche"
    cote_image_droite = "gauche" if vue == "face" else "droite"
    for cote, cx in ((cote_image_gauche, x), (cote_image_droite, round(1 - x, 4))):
        accord = {
            ("gauche", False): "gauche", ("gauche", True): "gauches",
            ("droite", False): "droit", ("droite", True): "droits",
        }[(cote, base in pluriels)]
        muscles.append(dict(id=f"{racine}-{'g' if cote == 'gauche' else 'd'}", nomBase=base,
                            nom=f"{base} {accord}", vue=vue, region=region, cote=cote, centre=[cx, y]))

for m in muscles:
    m["nomAffiche"] = capitaliser(m["nom"])
    m["nomBaseAffiche"] = capitaliser(m["nomBase"])

# ---------------------------------------------------------------------------
# Contours
# ---------------------------------------------------------------------------

masques_swift = (sources / "MasquesMuscles.swift").read_text(encoding="utf-8")
masques = {}
for identifiant, valeur in re.findall(r'^\s+"([^"]+)": (\[\[.*\]\]),?\s*$', masques_swift, flags=re.M):
    masques[identifiant] = json.loads(valeur)

manquants = [m["id"] for m in muscles if m["id"] not in masques]

# ---------------------------------------------------------------------------
# Écriture
# ---------------------------------------------------------------------------

sortie = ici / "donnees.js"
sortie.write_text(
    "// Généré par outils/generer_depuis_appli.py à partir de l'appli KPULS.\n"
    "// Ne pas modifier à la main : relancer le script.\n\n"
    f"export const REGIONS = {json.dumps(regions, ensure_ascii=False)};\n\n"
    f"export const MUSCLES = {json.dumps(muscles, ensure_ascii=False)};\n\n"
    f"export const MASQUES = {json.dumps(masques)};\n",
    encoding="utf-8",
)

(ici / "img").mkdir(exist_ok=True)
for nom in ("face", "dos"):
    shutil.copy(sources / "Assets.xcassets" / f"anatomie-{nom}.imageset" / f"anatomie-{nom}.png",
                ici / "img" / f"anatomie-{nom}.png")

print(f"{len(muscles)} muscles, {len(masques)} contours, {sortie.stat().st_size // 1024} Ko")
if manquants:
    print("Sans contour (ellipse de repli) :", ", ".join(manquants))
