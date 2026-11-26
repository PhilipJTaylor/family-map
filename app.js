// app.js
// Connects the page together: reads the chosen file, looks up places, draws the map.

// 1. Create the map, centred on the Atlantic so Europe and North America both show.
// preferCanvas draws pins on one canvas, which stays fast with tens of thousands of pins.
const map = L.map("map", { preferCanvas: true }).setView([45, -30], 3);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 18,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// All the pins live in one group so we can clear them when a new file is loaded.
const pinLayer = L.layerGroup().addTo(map);

// Colours for each kind of event.
const EVENT_COLOURS = { Birth: "#2f855a", Christening: "#38a169", Residence: "#d69e2e", Death: "#c53030", Burial: "#9b2c2c" };

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

  const people = parseGedcom(text);
  listPeople(people);

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
    for (const { person, ev } of eventsByPlace.get(place)) addPin(person, ev, coords);
    bounds.push([coords.lat, coords.lon]);
    pinned++;
  };
  const zoomToPins = () => { if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 }); };

  // Step A: draw every place we already know from earlier visits. This is instant.
  const toLookUp = [];
  for (const place of places) {
    const saved = lookupSaved(place);
    if (saved === undefined) toLookUp.push(place);
    else pinPlace(place, saved);
  }
  zoomToPins();

  // Step B: look up the rest online, one per second, adding pins as each is found.
  for (let i = 0; i < toLookUp.length; i++) {
    const remaining = toLookUp.length - i;
    const minutes = Math.ceil(remaining * 1.2 / 60);
    setStatus(`${people.length} people, ${places.length} places. ${pinned} on the map. ` +
      `Looking up ${remaining} new places, about ${minutes} min left. ` +
      `You can explore the map meanwhile. Progress is saved, so closing the page loses nothing.`);
    let coords;
    try {
      coords = await geocodePlace(toLookUp[i]);
    } catch (err) {
      setStatus("Place lookup paused: " + err.message + ". Reload the page in a minute to continue where it stopped.");
      return;
    }
    if (run !== currentRun) return; // a newer file was loaded; stop this one
    pinPlace(toLookUp[i], coords);
    if (pinned === 25 || i === toLookUp.length - 1) zoomToPins();
  }

  setStatus(`Done: ${people.length} people, ${pinned} places on the map` +
    (notFound ? `, ${notFound} places not found.` : "."));
}

function addPin(person, ev, coords) {
  // Approximate places (only the county or country was found) are drawn larger and fainter.
  const marker = L.circleMarker([coords.lat, coords.lon], {
    radius: coords.approximate ? 10 : 6,
    color: EVENT_COLOURS[ev.type] || "#555",
    fillOpacity: coords.approximate ? 0.25 : 0.8,
    weight: 1
  });
  const note = coords.approximate ? `<br><em>Approximate: placed at "${escapeHtml(coords.matched)}"</em>` : "";
  marker.bindPopup(
    `<strong>${escapeHtml(person.name)}</strong><br>` +
    `${ev.type}${ev.year ? " " + ev.year : ""}<br>` +
    `${escapeHtml(ev.place)}${note}`
  );
  marker.addTo(pinLayer);
}

function listPeople(people) {
  peopleListEl.innerHTML = "";
  const sorted = [...people].sort((a, b) => (birthYear(a) || 9999) - (birthYear(b) || 9999));
  for (const person of sorted) {
    const born = birthYear(person);
    const died = person.events.find(e => e.type === "Death");
    const li = document.createElement("li");
    li.innerHTML = `${escapeHtml(person.name)} <span class="dates">${born || "?"} to ${died && died.year ? died.year : "?"}</span>`;
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
