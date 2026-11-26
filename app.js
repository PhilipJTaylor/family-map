// app.js
// Connects the page together: reads the chosen file, looks up places, draws the map.

// 1. Create the map, centred on the Atlantic so Europe and North America both show.
// preferCanvas draws pins on one canvas, which stays fast with tens of thousands of pins.
const map = L.map("map", { preferCanvas: true }).setView([45, -30], 3);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// All the dots live in one group so we can clear them when a new file is loaded.
const pinLayer = L.layerGroup().addTo(map);

// One dot per spot on the map. Several place names can land on the same spot
// (for example two spellings of a town), so dots are keyed by their coordinates.
let dotsBySpot = new Map(); // "lat,lon" -> {marker, coords, entries: [{person, ev}]}

// Order of sections inside a dot's popup.
const EVENT_ORDER = ["Birth", "Christening", "Residence", "Death", "Burial"];
const MAX_NAMES_PER_SECTION = 150;

const statusEl = document.getElementById("status");
const peopleListEl = document.getElementById("peopleList");

function setStatus(message) {
  statusEl.textContent = message;
}

// 2. When the user picks a file, read it as text (this happens on their computer).
document.getElementById("fileInput").addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => showFamily(reader.result, file.name);
  reader.readAsText(file);
});

// The sample button loads sample.ged from this website.
document.getElementById("sampleButton").addEventListener("click", async () => {
  const response = await fetch("sample.ged");
  showFamily(await response.text(), "sample family");
});

// 3. Parse the file, list the people, look up each place, and add pins.
let currentRun = 0; // lets a new file cancel lookups still running for an old one

async function showFamily(text, label) {
  const run = ++currentRun;
  pinLayer.clearLayers();
  dotsBySpot = new Map();

  const people = parseGedcom(text);
  currentPeople = people;
  applySavedCorrections(people);
  setUpFamilyFilter(people);
  setUpTimeline(people);

  // Group every event by its (tidied) place name, so each place is handled once.
  const eventsByPlace = new Map(); // place name -> list of {person, ev}
  for (const person of people) {
    for (const ev of person.events) {
      if (!ev.place) continue;
      const place = normalizePlace(ev.place);
      if (!place) continue;
      if (!eventsByPlace.has(place)) eventsByPlace.set(place, []);
      eventsByPlace.get(place).push({ person, ev });
    }
  }

  // Busiest places first: the places most of your family shares appear on the map early.
  const places = [...eventsByPlace.keys()].sort((a, b) => eventsByPlace.get(b).length - eventsByPlace.get(a).length);

  const bounds = [];
  let pinned = 0, notFound = 0;
  const pinPlace = (place, coords) => {
    if (!coords) { notFound++; return; }
    for (const { ev } of eventsByPlace.get(place)) if (!ev.fixed) ev.coords = coords; // remember where each event is (unless you fixed it)
    redrawSoon();
    bounds.push([coords.lat, coords.lon]);
    pinned++;
  };
  const zoomToPins = () => { if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 }); };

  // Step A: draw every place we already know, from earlier visits or from our own
  // place database (downloaded once per country). This is quick.
  await loadGazetteers(places, code => setStatus(`Loading place data for ${code}...`));
  if (run !== currentRun) return;
  const toLookUp = [], toRefine = [];
  for (const place of places) {
    const saved = lookupSaved(place);
    if (saved !== undefined) { pinPlace(place, saved); continue; }
    const found = gazetteerLookup(place);
    if (found) pinPlace(place, found);
    else toLookUp.push(place);
    // Only the county or country was found: show that now, and ask online for the exact spot later.
    if (found && found.approximate) toRefine.push(place);
  }
  // Places with no pin at all go first; then try to sharpen the approximate ones.
  const refining = new Set(toRefine);
  toLookUp.push(...toRefine);
  redraw();
  zoomToPins();

  // Step B: look up the rest online, one per second, adding pins as each is found.
  for (let i = 0; i < toLookUp.length; i++) {
    const remaining = toLookUp.length - i;
    const minutes = Math.ceil(remaining * 1.6 / 60);
    setStatus(`${people.length} people, ${places.length} places. ${pinned} on the map. ` +
      `Looking up ${remaining} places online (${Math.max(remaining - refining.size, 0)} not yet on the map), about ${minutes} min left. ` +
      `You can explore the map meanwhile. Progress is saved, so closing the page loses nothing.`);
    let coords;
    onLookupWait = (problem, delayMs) => {
      if (run !== currentRun) return;
      const resumeAt = new Date(Date.now() + delayMs).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      setStatus(`${pinned} places on the map. Waiting a moment: ${problem}, which usually means it wants us ` +
        `to slow down. Trying again automatically at ${resumeAt}. You can leave this page open.`);
    };
    try {
      coords = await geocodePlace(toLookUp[i]);
    } catch (err) {
      setStatus("Place lookup stopped: " + err.message + ". Everything found so far is saved. Try again later and it will continue where it stopped.");
      return;
    }
    if (run !== currentRun) return; // a newer file was loaded; stop this one
    if (refining.has(toLookUp[i])) {
      // Already shown approximately; move it only if the online answer is more exact.
      if (coords && !coords.approximate) {
        for (const { ev } of eventsByPlace.get(toLookUp[i])) if (!ev.fixed) ev.coords = coords;
        redrawSoon();
      }
      continue;
    }
    pinPlace(toLookUp[i], coords);
    if (pinned === 25 || i === toLookUp.length - 1) zoomToPins();
  }

  redraw();
  setStatus(`Done: ${people.length} people, ${pinned} places on the map` +
    (notFound ? `, ${notFound} places not found.` : "."));
}

// ---- Drawing the dots ----

let currentPeople = [];

// Redraw every dot for the current view: either all events, or who was where in the
// timeline's chosen year. Called while places load, and whenever the year changes.
function redraw() {
  pinLayer.clearLayers();
  dotsBySpot = new Map();
  const year = timelineYear(); // null means "all years"
  drawArrows(pinLayer, visiblePeople, year); // arrows first, so dots sit on top
  const groups = new Map(); // spot -> entries
  for (const person of visibleList()) {
    const entries = year === null
      ? person.events.filter(ev => ev.coords).map(ev => ({ person, ev }))
      : whereInYear(person, year);
    for (const entry of entries) {
      const key = spotKey(entry.ev.coords);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }
  }
  for (const entries of groups.values()) addToDot(entries[0].ev.coords, entries, year);
}

// While places are loading, redraw at most every 2 seconds rather than after every place.
let redrawTimer = null;
function redrawSoon() {
  if (redrawTimer) return;
  redrawTimer = setTimeout(() => { redrawTimer = null; redraw(); }, 2000);
}

function spotKey(coords) {
  return coords.lat.toFixed(4) + "," + coords.lon.toFixed(4);
}

// Add events to the dot at these coordinates, creating the dot if it's the first.
function addToDot(coords, entries, year = null) {
  const key = spotKey(coords);
  let dot = dotsBySpot.get(key);
  if (!dot) {
    // Approximate places (only the county or country was found) are drawn fainter.
    const marker = L.circleMarker([coords.lat, coords.lon], {
      color: "#2b6cb0",
      fillOpacity: coords.approximate ? 0.2 : 0.7,
      weight: 1
    }).addTo(pinLayer);
    dot = { marker, coords, entries: [], year };
    dotsBySpot.set(key, dot);
    // The popup text is only built when someone clicks, which keeps big trees fast.
    marker.bindPopup(() => dotPopup(dot), { maxWidth: 320 });
  }
  dot.entries.push(...entries);
  // Busier places get bigger dots.
  dot.marker.setRadius(Math.min(4 + Math.sqrt(dot.entries.length) * 1.5, 22));
}

// A small "Fix" link that opens the fix-location window for this person (and event).
function fixLink(person, ev) {
  const eventAttr = ev ? ` data-fix-event="${person.events.indexOf(ev)}"` : "";
  return `<a href="#" class="fix" data-fix-person="${escapeHtml(person.id)}"${eventAttr} title="Fix this location">Fix</a>`;
}

// The popup for a dot: everyone at that place, grouped by event and sorted by year.
function dotPopup(dot) {
  const people = new Set(dot.entries.map(e => e.person));
  const names = [...new Set(dot.entries.map(e => e.ev.place))];
  let html = `<div class="popup"><strong>${escapeHtml(names[0])}</strong>`;
  if (names.length > 1) html += `<div class="also">Also written: ${names.slice(1, 6).map(escapeHtml).join("; ")}${names.length > 6 ? "; ..." : ""}</div>`;
  if (dot.coords.approximate) html += `<div class="also"><em>Approximate: placed at "${escapeHtml(dot.coords.matched)}"</em></div>`;
  html += `<div class="count">${people.size} ${people.size === 1 ? "person" : "people"}</div>`;

  if (dot.year !== null) {
    // Timeline view: who was living here in the chosen year.
    const rows = [...people].sort((a, b) => (birthYear(a) || 9999) - (birthYear(b) || 9999));
    html += `<div class="section">Living here in ${dot.year}</div><ul>`;
    for (const person of rows.slice(0, MAX_NAMES_PER_SECTION)) {
      html += `<li>${escapeHtml(person.name)} <span class="dates">${lifeDates(person)}</span> ${fixLink(person)}</li>`;
    }
    if (rows.length > MAX_NAMES_PER_SECTION) html += `<li><em>and ${rows.length - MAX_NAMES_PER_SECTION} more</em></li>`;
    return html + "</ul></div>";
  }

  for (const type of EVENT_ORDER) {
    const rows = dot.entries.filter(e => e.ev.type === type)
      .sort((a, b) => (a.ev.year || 9999) - (b.ev.year || 9999));
    if (!rows.length) continue;
    html += `<div class="section">${type}s (${rows.length})</div><ul>`;
    for (const { person, ev } of rows.slice(0, MAX_NAMES_PER_SECTION)) {
      html += `<li>${escapeHtml(person.name)} <span class="dates">${ev.year || "?"}</span> ${fixLink(person, ev)}</li>`;
    }
    if (rows.length > MAX_NAMES_PER_SECTION) html += `<li><em>and ${rows.length - MAX_NAMES_PER_SECTION} more</em></li>`;
    html += "</ul>";
  }
  return html + "</div>";
}

function listPeople(people) {
  peopleListEl.innerHTML = "";
  const sorted = [...people].sort((a, b) => (birthYear(a) || 9999) - (birthYear(b) || 9999));
  for (const person of sorted) {
    const li = document.createElement("li");
    li.innerHTML = `${escapeHtml(person.name)} <span class="dates">${lifeDates(person)}</span>`;
    li.title = "Make this the home person";
    li.addEventListener("click", e => { if (!e.target.closest(".fix")) setHomePerson(person); });
    li.insertAdjacentHTML("beforeend", ` <a href="#" class="fix" data-fix-person="${escapeHtml(person.id)}" title="Fix a location">&#9998;</a>`);
    peopleListEl.appendChild(li);
  }
}

function birthYear(person) {
  const birth = person.events.find(e => e.type === "Birth");
  return birth ? birth.year : null;
}

// Makes text from the file safe to show inside the page.
function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function lifeDates(person) {
  const born = birthYear(person);
  const died = person.events.find(e => e.type === "Death");
  return `${born || "?"} to ${died && died.year ? died.year : "?"}`;
}
