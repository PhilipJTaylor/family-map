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

// (normalizePlace, which tidies place names, lives in places.js.)

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
const NORMAL_GAP_MS = 1500; // a little slower than the 1-per-second limit, to be a good neighbour

// app.js can set this to show a message while we wait after a failed lookup.
let onLookupWait = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Ask Nominatim about one exact search text.
// If the service refuses or can't be reached (it does this when it's busy, or when one
// computer has asked a lot of questions), wait and try again instead of giving up:
// 1 minute, then 2, 4, 8, and then every 15 minutes, for up to about 2 hours.
async function askNominatim(query) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=en&q=" + encodeURIComponent(query);
  const MAX_TRIES = 12;
  for (let attempt = 1; ; attempt++) {
    const waitMs = lastRequestTime + NORMAL_GAP_MS - Date.now();
    if (waitMs > 0) await sleep(waitMs);
    lastRequestTime = Date.now();

    let problem;
    try {
      const response = await fetch(url);
      if (response.ok) {
        const results = await response.json();
        const answer = results.length ? { lat: Number(results[0].lat), lon: Number(results[0].lon) } : null;
        queryCache[query.toLowerCase()] = answer;
        saveCacheSoon();
        return answer;
      }
      problem = "the lookup service answered with error " + response.status;
    } catch (err) {
      // "Failed to fetch": no answer at all. Usually the service is limiting us, or the internet dropped.
      problem = "the lookup service didn't answer";
    }

    if (attempt >= MAX_TRIES) throw new Error(problem + " for over 2 hours");
    const delayMs = Math.min(60000 * 2 ** (attempt - 1), 15 * 60000);
    if (onLookupWait) onLookupWait(problem, delayMs);
    await sleep(delayMs);
  }
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
