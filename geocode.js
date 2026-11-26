// geocode.js
// Turns place names like "Ballina, Mayo, Ireland" into map coordinates.
//
// It uses OpenStreetMap's free Nominatim service. Their rules allow at most
// one request per second and ask that results are saved (cached) rather than
// looked up again. That one-per-second limit is the main reason a big family
// file takes a while the FIRST time. So this file tries hard to ask as few
// questions as possible:
//   - every answer is saved in the browser (localStorage), so a place is only
//     ever looked up once on this computer, even after closing the page;
//   - answers are saved per search text, so when "Kilmore, Mayo, Ireland" and
//     "Knock, Mayo, Ireland" both fall back to "Mayo, Ireland", the second one
//     re-uses the saved answer instead of asking again.

const CACHE_KEY = "familyMap.placeCache.v2";
const queryCache = loadCache(); // search text (lower case) -> {lat, lon} or null

function loadCache() {
  let cache = {};
  try {
    cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
    // Carry over places saved by the first version of this tool, so nothing is looked up twice.
    const old = JSON.parse(localStorage.getItem("familyMap.placeCache.v1"));
    if (old) {
      for (const [place, result] of Object.entries(old)) {
        if (result) {
          cache[result.matched.toLowerCase()] = { lat: result.lat, lon: result.lon };
        } else {
          for (const s of searchesFor(normalizePlace(place))) cache[s.toLowerCase()] = null;
        }
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      localStorage.removeItem("familyMap.placeCache.v1");
    }
  } catch (e) {
    // Storage blocked or unreadable: start with an empty cache.
  }
  return cache;
}

// Saving a big cache on every lookup is wasteful, so we save at most every few seconds.
let saveTimer = null;
function saveCacheSoon() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(queryCache));
    } catch (e) {
      // Storage may be full or blocked (private windows). Not fatal.
    }
  }, 3000);
}

// Tidy a place name so that spelling variants count as the same place:
// "  Ballina ,, Mayo,Ireland " -> "Ballina, Mayo, Ireland"
function normalizePlace(place) {
  return place.split(",").map(p => p.trim().replace(/\s+/g, " ")).filter(Boolean).join(", ");
}

// The list of searches we would try for a place, most exact first:
// "Kilmore, Mayo, Ireland" -> ["Kilmore, Mayo, Ireland", "Mayo, Ireland", "Ireland"]
function searchesFor(place) {
  const parts = place.split(", ");
  return parts.map((_, i) => parts.slice(i).join(", "));
}

// Can we answer this place from saved results alone, without going online?
// Returns {lat, lon, approximate, matched}, null (known not found), or undefined (not known yet).
function lookupSaved(place) {
  const searches = searchesFor(place);
  for (let i = 0; i < searches.length; i++) {
    const saved = queryCache[searches[i].toLowerCase()];
    if (saved === undefined) return undefined; // haven't asked this one yet
    if (saved) return { ...saved, approximate: i > 0, matched: searches[i] };
  }
  return null; // every search was tried before and nothing was found
}

let lastRequestTime = 0;

// Ask Nominatim about one exact search text, keeping to one request per second.
async function askNominatim(query) {
  const waitMs = lastRequestTime + 1100 - Date.now();
  if (waitMs > 0) await new Promise(resolve => setTimeout(resolve, waitMs));
  lastRequestTime = Date.now();

  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(query);
  const response = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!response.ok) throw new Error("Lookup failed with status " + response.status);
  const results = await response.json();
  const answer = results.length ? { lat: Number(results[0].lat), lon: Number(results[0].lon) } : null;
  queryCache[query.toLowerCase()] = answer;
  saveCacheSoon();
  return answer;
}

// Find coordinates for a place, going online only for searches never asked before.
// If the full name isn't found, a shorter version is tried and the result is marked approximate.
// Returns {lat, lon, approximate, matched} or null.
async function geocodePlace(place) {
  const searches = searchesFor(place);
  for (let i = 0; i < searches.length; i++) {
    const key = searches[i].toLowerCase();
    const answer = key in queryCache ? queryCache[key] : await askNominatim(searches[i]);
    if (answer) return { ...answer, approximate: i > 0, matched: searches[i] };
  }
  return null;
}
