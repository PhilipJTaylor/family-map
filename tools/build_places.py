"""
build_places.py - builds the site's own place database from GeoNames.

GeoNames (https://www.geonames.org) publishes free lists of the world's places
under the Creative Commons Attribution 4.0 licence. This script downloads the
list for each country below, keeps only towns, villages and administrative areas
(counties, states, districts), and writes one small file per country to
data/places/XX.json, where XX is the country code (GB, US, ...).

The website then looks places up in those files first, and only asks the online
lookup service about places it can't find.

Run it with:  python tools/build_places.py            (all countries below)
         or:  python tools/build_places.py GB IE      (just some)
It normally runs automatically on GitHub (see .github/workflows/build-places.yml).
"""

import csv
import io
import json
import os
import sys
import urllib.request
import zipfile

COUNTRIES = ["GB", "IE", "US", "CA", "AU", "NZ", "DE", "FR", "NL", "BE", "CH", "AT",
             "PL", "CZ", "IT", "NO", "SE", "DK", "ZA"]

BASE = "https://download.geonames.org/export/dump/"
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "places")

# Kinds of place we keep. "P" = populated place (city, town, village, hamlet),
# "A" = administrative area. PPLX is a neighbourhood inside a town: too detailed.
KEEP_ADMIN = {"ADM1", "ADM2", "ADM3", "ADM1H", "ADM2H", "ADM3H"}
SKIP_POPULATED = {"PPLX"}

# GeoNames file columns (see https://download.geonames.org/export/dump/readme.txt)
NAME, ASCIINAME, ALTNAMES, LAT, LON, FCLASS, FCODE, COUNTRY, ADMIN1, ADMIN2, POP = 1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 14


def download(name):
    print("Downloading", name)
    with urllib.request.urlopen(BASE + name, timeout=300) as response:
        return response.read()


def read_tsv(text):
    return csv.reader(io.StringIO(text), delimiter="\t", quoting=csv.QUOTE_NONE)


def admin_names():
    """Names for admin codes, e.g. 'GB.ENG' -> 'England', 'GB.ENG.Q4' -> 'Warwickshire'."""
    names = {}
    for file in ["admin1CodesASCII.txt", "admin2Codes.txt"]:
        for row in read_tsv(download(file).decode("utf-8")):
            if len(row) >= 3:
                names[row[0]] = row[2] or row[1]
    return names


def useful_alt_names(row):
    """A few extra spellings written in plain Latin letters (old or local names)."""
    alts = []
    for alt in row[ALTNAMES].split(","):
        alt = alt.strip()
        if (alt and alt != row[NAME] and alt != row[ASCIINAME] and len(alt) < 40
                and all(c.isalpha() or c in " -'." for c in alt) and alt.isascii()):
            alts.append(alt)
    return alts[:4]


def build_country(code, admins):
    data = download(code + ".zip")
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        text = z.read(code + ".txt").decode("utf-8")

    admin1_list, admin2_list = [""], [""]   # index 0 = unknown
    admin1_index, admin2_index = {"": 0}, {"": 0}
    places = []

    for row in read_tsv(text):
        if len(row) < 15:
            continue
        fclass, fcode = row[FCLASS], row[FCODE]
        if fclass == "P" and fcode in SKIP_POPULATED:
            continue
        if not (fclass == "P" or (fclass == "A" and fcode in KEEP_ADMIN)):
            continue

        a1 = admins.get(f"{code}.{row[ADMIN1]}", "")
        a2 = admins.get(f"{code}.{row[ADMIN1]}.{row[ADMIN2]}", "")
        if a1 not in admin1_index:
            admin1_index[a1] = len(admin1_list)
            admin1_list.append(a1)
        if a2 not in admin2_index:
            admin2_index[a2] = len(admin2_list)
            admin2_list.append(a2)

        names = [row[NAME]]
        if row[ASCIINAME] and row[ASCIINAME] != row[NAME]:
            names.append(row[ASCIINAME])
        names += useful_alt_names(row)

        places.append([
            "|".join(names),
            admin1_index[a1],
            admin2_index[a2],
            round(float(row[LAT]), 3),
            round(float(row[LON]), 3),
            int(row[POP] or 0),
            1 if fclass == "A" else 0,      # 1 = an area (county, state...), 0 = a town or village
        ])

    out = {
        "country": code,
        "source": "GeoNames (geonames.org), CC BY 4.0",
        "admin1": admin1_list,
        "admin2": admin2_list,
        "fields": ["names", "admin1", "admin2", "lat", "lon", "population", "isArea"],
        "places": places,
    }
    os.makedirs(OUT_DIR, exist_ok=True)
    path = os.path.join(OUT_DIR, code + ".json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"{code}: {len(places)} places, {os.path.getsize(path) / 1e6:.1f} MB")


def main():
    countries = [c.upper() for c in sys.argv[1:]] or COUNTRIES
    admins = admin_names()
    for code in countries:
        build_country(code, admins)
    # A list of available countries, so the website knows which files exist.
    available = sorted(f[:-5] for f in os.listdir(OUT_DIR) if f.endswith(".json") and f != "index.json")
    with open(os.path.join(OUT_DIR, "index.json"), "w") as f:
        json.dump(available, f)


if __name__ == "__main__":
    main()
