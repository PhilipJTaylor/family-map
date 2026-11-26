// app.js
// Connects the page together: reads the chosen file, looks up places, draws the map.

// 1. Create the map, centred on the Atlantic so Europe and North America both show.
const map = L.map("map").setView([45, -30], 3);
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

  // Gather every event that has a place, and the unique place names.
  const placedEvents = [];
  for (const person of people) {
    for (const ev of person.events) {
      if (ev.place) placedEvents.push({ person, ev });
    }
  }
  const uniquePlaces = [...new Set(placedEvents.map(x => x.ev.place))];
  setStatus(`Loaded ${label}: ${people.length} people, ${uniquePlaces.length} different places. Looking up places...`);

  // Look up each place once, then pin every event at that place.
  const bounds = [];
  let notFound = 0;
  for (let i = 0; i < uniquePlaces.length; i++) {
    const place = uniquePlaces[i];
    let coords = null;
    try {
      coords = await geocodePlace(place, query =>
        setStatus(`Looking up place ${i + 1} of ${uniquePlaces.length}: ${query}`));
    } catch (err) {
      setStatus("Place lookup stopped: " + err.message + ". Try again in a minute.");
      return;
    }
    if (run !== currentRun) return; // a newer file was loaded; stop this one

    if (!coords) { notFound++; continue; }
    for (const { person, ev } of placedEvents.filter(x => x.ev.place === place)) {
      addPin(person, ev, coords);
    }
    bounds.push([coords.lat, coords.lon]);
  }

  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 8 });
  setStatus(`Done: ${people.length} people, ${uniquePlaces.length - notFound} places on the map` +
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
