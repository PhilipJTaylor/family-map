// geocode.js
// Turns place names like "Ballina, Mayo, Ireland" into map coordinates.
//
// It uses OpenStreetMap's free Nominatim service. Their rules ask for at most
// one request per second, and that results are saved (cached) rather than
// looked up again. We save results in the browser's localStorage, so a place
// is only ever looked up once on this computer.

const CACHE_KEY = "familyMap.placeCache.v1";
const placeCache = loadCache();

function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || {};
  } catch (e) {
    return {};
  }
}

function saveCache() {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(placeCache));
  } catch (e) {
    // Storage may be full or blocked (private windows). Not fatal.
  }
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Ask Nominatim about one exact search text. Returns {lat, lon} or null.
async function askNominatim(query) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(query);
  const response = await fetch(url, { headers: { "Accept-Language": "en" } });
  if (!response.ok) throw new Error("Lookup failed with status " + response.status);
  const results = await response.json();
  if (results.length === 0) return null;
  return { lat: Number(results[0].lat), lon: Number(results[0].lon) };
}

// Find coordinates for a GEDCOM place.
// If the full name isn't found, try again without the first part:
//   "Kilmore, Ballina, Mayo, Ireland" -> "Ballina, Mayo, Ireland" -> "Mayo, Ireland" ...
// A result found that way is marked approximate.
// Returns {lat, lon, approximate, matched} or null. Calls onLookup() before each online request.
async function geocodePlace(place, onLookup) {
  if (place in placeCache) return placeCache[place];

  const parts = place.split(",").map(p => p.trim()).filter(Boolean);
  let result = null;
  for (let i = 0; i < parts.length && !result; i++) {
    const query = parts.slice(i).join(", ");
    if (onLookup) onLookup(query);
    await wait(1100); // stay under one request per second
    const found = await askNominatim(query);
    if (found) result = { ...found, approximate: i > 0, matched: query };
  }

  placeCache[place] = result; // remember "not found" too, so we don't retry every time
  saveCache();
  return result;
}
