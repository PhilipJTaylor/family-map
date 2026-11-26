// gazetteer.js
// Our own place database, built from GeoNames by tools/build_places.py.
// One file per country (data/places/GB.json, ...). The page downloads only the
// countries used in the family file, then looks places up instantly, without
// asking the online service. Anything not found here still goes online.

// Country words in a tidied place name -> GeoNames country code.
const COUNTRY_CODES = {
  "england": "GB", "scotland": "GB", "wales": "GB", "northern ireland": "GB", "united kingdom": "GB",
  "ireland": "IE", "usa": "US", "canada": "CA", "australia": "AU", "new zealand": "NZ",
  "germany": "DE", "france": "FR", "netherlands": "NL", "holland": "NL", "belgium": "BE",
  "switzerland": "CH", "austria": "AT", "poland": "PL", "czech republic": "CZ", "czechia": "CZ",
  "italy": "IT", "norway": "NO", "sweden": "SE", "denmark": "DK", "south africa": "ZA"
};

const gazetteers = new Map(); // country code -> {index: Map(name -> [places]), admin1, admin2}
let availableCountries = null;

function countryCodeOf(place) {
  const parts = place.split(", ");
  return COUNTRY_CODES[parts[parts.length - 1].toLowerCase()] || null;
}

// Download the place files for the countries these places are in. Countries we
// have no file for are skipped; their places simply go to the online lookup.
async function loadGazetteers(places, onProgress) {
  if (!availableCountries) {
    try {
      const response = await fetch("data/places/index.json");
      availableCountries = response.ok ? await response.json() : [];
    } catch (e) {
      availableCountries = [];
    }
  }
  const needed = new Set(places.map(countryCodeOf).filter(c => c && availableCountries.includes(c) && !gazetteers.has(c)));
  for (const code of needed) {
    if (onProgress) onProgress(code);
    try {
      const response = await fetch(`data/places/${code}.json`);
      if (response.ok) gazetteers.set(code, buildIndex(await response.json()));
    } catch (e) {
      // Couldn't load this country: its places will be looked up online instead.
    }
  }
}

// Turn a country file into a quick lookup: lower-case name -> list of places with that name.
function buildIndex(data) {
  const index = new Map();
  for (const [names, a1, a2, lat, lon, population, isArea] of data.places) {
    const place = { lat, lon, population, isArea, admin1: data.admin1[a1].toLowerCase(), admin2: data.admin2[a2].toLowerCase() };
    for (const name of names.split("|")) {
      const key = name.toLowerCase();
      if (!index.has(key)) index.set(key, []);
      index.get(key).push(place);
    }
  }
  return index;
}

// Find a tidied place like "Townham, Kent, England" in our own database.
// Tries the most exact part first, then the next one ("Kent, England"), like the online lookup.
// Returns {lat, lon, approximate, matched} or null.
function gazetteerLookup(place) {
  const code = countryCodeOf(place);
  const index = code && gazetteers.get(code);
  if (!index) return null;

  const parts = place.split(", ");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidates = index.get(parts[i].toLowerCase());
    if (!candidates) continue;
    const context = parts.slice(i + 1, -1).map(p => p.toLowerCase()); // e.g. ["kent"]
    const best = bestCandidate(candidates, context, parts[parts.length - 1]);
    if (best) return { lat: best.lat, lon: best.lon, approximate: i > 0, matched: parts.slice(i).join(", ") };
  }
  return null;
}

// Among places with the same name, prefer the one whose county/state matches the
// rest of the place name, then towns over areas, then the bigger one.
function bestCandidate(candidates, context, countryWord) {
  const nation = countryWord.toLowerCase(); // "england", "scotland"... are GeoNames admin1 names in GB
  const matchesContext = c =>
    (c.admin2 && context.some(w => w === c.admin2 || w.includes(c.admin2) || c.admin2.includes(w))) ||
    context.some(w => w === c.admin1);

  // With a county or state given that matches none of several same-named places,
  // we can't tell which one is meant: leave it to the online lookup.
  if (context.length && candidates.length > 1 && !candidates.some(matchesContext)) return null;

  let best = null, bestScore = -Infinity;
  for (const c of candidates) {
    let score = 0;
    if (matchesContext(c)) score += 4;
    if (c.admin1 === nation) score += 2;
    if (context.length && !c.isArea) score += 1;
    score += Math.log10(c.population + 1) / 4;
    if (score > bestScore) { best = c; bestScore = score; }
  }
  return best;
}
