// corrections.js
// Fixing wrong locations, and keeping a log of every fix.
//
// Click "Fix this place" in a dot's popup to move everyone at that place at once, or the
// pencil in the People list to fix one person's event. Then type the correct place, click
// the map, or choose "Unknown place". Each event changed gets its own line in the log.
// Fixes are saved in this browser, so they're still there when you load the file again.
// The log lists each fix (name, dates, event, before and after) so you can make the same
// corrections in Ancestry. It can be copied or downloaded as a spreadsheet (CSV) file.

const FIX_KEY = "familyMap.corrections.v1";
let corrections = loadCorrections(); // event key -> log entry (one per event; the latest fix wins)
let personById = new Map();

function loadCorrections() {
  try { return JSON.parse(localStorage.getItem(FIX_KEY)) || {}; } catch (e) { return {}; }
}
function saveCorrections() {
  try { localStorage.setItem(FIX_KEY, JSON.stringify(corrections)); } catch (e) { /* storage blocked */ }
  updateLogButton();
}

// A stable name for one event of one person, e.g. "I12|Birth|3 FEB 1825|0".
function eventKey(person, ev) {
  const sameType = person.events.filter(e => e.type === ev.type);
  return `${person.id}|${ev.type}|${ev.date}|${sameType.indexOf(ev)}`;
}

// Called when a file is loaded: put saved fixes back onto the events they belong to.
function applySavedCorrections(people) {
  personById = new Map(people.map(p => [p.id, p]));
  for (const person of people) {
    for (const ev of person.events) {
      const fix = corrections[eventKey(person, ev)];
      if (fix) { ev.fixed = true; ev.coords = fix.afterCoords; }
    }
  }
  updateLogButton();
}

// ---- The "Fix location" window ----

const fixDialog = document.getElementById("fixDialog");
const fixPersonEl = document.getElementById("fixPerson");
const fixEventSelect = document.getElementById("fixEvent");
const fixCurrentEl = document.getElementById("fixCurrent");
const fixPlaceInput = document.getElementById("fixPlace");
const fixMessage = document.getElementById("fixMessage");
const fixEventLabel = fixEventSelect.closest("label");
let fixingPerson = null;
let fixingPlace = null; // when fixing a whole place: {name, entries: [{person, ev}]}

// Every event (of everyone in the file) shown at this spot on the map.
function entriesAtSpot(key) {
  const entries = [];
  for (const person of currentPeople) {
    for (const ev of person.events) if (ev.coords && spotKey(ev.coords) === key) entries.push({ person, ev });
  }
  return entries;
}

function openPlaceFixDialog(key) {
  const entries = entriesAtSpot(key);
  if (!entries.length) return;
  fixingPerson = null;
  fixingPlace = { name: entries[0].ev.place, entries };
  const people = new Set(entries.map(e => e.person)).size;
  fixPersonEl.textContent = `${fixingPlace.name}: ${entries.length} ${entries.length === 1 ? "event" : "events"} ` +
    `for ${people} ${people === 1 ? "person" : "people"}. The fix applies to all of them, and each is logged separately.`;
  fixEventLabel.hidden = true;
  fixCurrentEl.textContent = `Now shown at: ${describeCoords(entries[0].ev)}`;
  fixMessage.textContent = "";
  fixPlaceInput.value = "";
  fixDialog.showModal();
}

function openFixDialog(person, ev) {
  fixingPerson = person;
  fixingPlace = null;
  fixEventLabel.hidden = false;
  fixPersonEl.textContent = `${person.name} (${lifeDates(person)})`;
  fixEventSelect.innerHTML = "";
  person.events.forEach((e, i) => {
    const option = document.createElement("option");
    option.value = i;
    option.textContent = `${e.type}${e.year ? " " + e.year : ""}: ${e.place || "(no place)"}`;
    if (e === ev) option.selected = true;
    fixEventSelect.appendChild(option);
  });
  if (!person.events.length) {
    fixMessage.textContent = "This person has no events with places to fix.";
  } else {
    fixMessage.textContent = "";
  }
  showCurrent();
  fixPlaceInput.value = "";
  fixDialog.showModal();
}

function selectedEvent() {
  return fixingPerson.events[Number(fixEventSelect.value)];
}

// The events the current fix will change.
function fixTargets() {
  if (fixingPlace) return fixingPlace.entries;
  const ev = selectedEvent();
  return ev ? [{ person: fixingPerson, ev }] : [];
}

function showCurrent() {
  if (fixingPlace) return;
  const ev = fixingPerson && selectedEvent();
  if (!ev) { fixCurrentEl.textContent = ""; return; }
  fixCurrentEl.textContent = ev.coords
    ? `Now shown at: ${describeCoords(ev)}`
    : "Not on the map yet.";
}

function describeCoords(ev) {
  const c = ev.coords;
  return `${c.matched || ev.place} (${c.lat.toFixed(3)}, ${c.lon.toFixed(3)})${c.approximate ? ", approximate" : ""}`;
}

// Save a fix for the chosen event(s), writing one log line per event.
function saveFix(newCoords, newPlaceText) {
  const targets = fixTargets();
  if (!targets.length) return;
  for (const { person, ev } of targets) saveOneFix(person, ev, newCoords, newPlaceText);
  saveCorrections();
  fixDialog.close();
  redraw();
  const what = fixingPlace
    ? `${fixingPlace.name} (${targets.length} ${targets.length === 1 ? "event" : "events"})`
    : `${targets[0].person.name}, ${targets[0].ev.type}`;
  setStatus(newCoords
    ? `Fixed: ${what}, now at ${newPlaceText}.`
    : `Fixed: ${what}, marked as unknown place and taken off the map.`);
}

function saveOneFix(person, ev, newCoords, newPlaceText) {
  const died = person.events.find(e => e.type === "Death");
  const key = eventKey(person, ev);
  const earlier = corrections[key];
  corrections[key] = {
    when: localTimestamp(),
    name: person.name,
    born: birthYear(person) || "",
    died: died && died.year ? died.year : "",
    event: ev.type,
    eventDate: ev.date || "",
    // "Before" is what the family file says, even if it was fixed more than once.
    beforePlace: earlier ? earlier.beforePlace : ev.place,
    beforeShownAt: earlier ? earlier.beforeShownAt : (ev.coords ? describeCoords(ev) : "not on map"),
    afterPlace: newPlaceText,
    // null = "unknown place": the event is taken off the map.
    afterCoords: newCoords ? { lat: newCoords.lat, lon: newCoords.lon, approximate: false, matched: newPlaceText } : null
  };
  ev.fixed = true;
  ev.coords = corrections[key].afterCoords;
}

// "Find" button: look up the typed place in our database, then online.
document.getElementById("fixFind").addEventListener("click", async () => {
  const typed = fixPlaceInput.value.trim();
  if (!typed) { fixMessage.textContent = "Type a place name first."; return; }
  fixMessage.textContent = "Looking it up...";
  const place = normalizePlace(typed);
  await loadGazetteers([place]);
  let found = gazetteerLookup(place);
  if (!found || found.approximate) {
    try { found = (await geocodePlace(place)) || found; } catch (e) { /* offline: keep what we have */ }
  }
  if (!found) { fixMessage.textContent = "Couldn't find that place. Try adding the county and country, or click the map instead."; return; }
  saveFix(found, typed);
});

// "Click the map" button: close the window, wait for one click on the map.
document.getElementById("fixClickMap").addEventListener("click", () => {
  fixDialog.close();
  const what = fixingPlace ? fixingPlace.name : `${fixingPerson.name}'s ${selectedEvent().type.toLowerCase()}`;
  setStatus(`Click the map where ${what} should be. (Press Esc to cancel.)`);
  document.getElementById("map").classList.add("picking");
  const finish = () => {
    document.getElementById("map").classList.remove("picking");
    document.removeEventListener("keydown", onEsc);
  };
  const onEsc = e => { if (e.key === "Escape") { map.off("click", onClick); finish(); setStatus("Fix cancelled."); } };
  const onClick = e => {
    finish();
    const label = fixPlaceInput.value.trim() || `Map point ${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)}`;
    saveFix({ lat: e.latlng.lat, lon: e.latlng.lng }, label);
  };
  map.once("click", onClick);
  document.addEventListener("keydown", onEsc);
});

// "Unknown place" button: the recorded place is wrong or isn't a place at all (like "Deceased").
document.getElementById("fixUnknown").addEventListener("click", () => saveFix(null, "Unknown (no place)"));

document.getElementById("fixCancel").addEventListener("click", () => fixDialog.close());
fixEventSelect.addEventListener("change", showCurrent);

// "Fix" links inside dot popups and pencils in the People list.
document.addEventListener("click", e => {
  const placeLink = e.target.closest("[data-fix-spot]");
  if (placeLink) {
    e.preventDefault();
    map.closePopup();
    openPlaceFixDialog(placeLink.dataset.fixSpot);
    return;
  }
  const link = e.target.closest("[data-fix-person]");
  if (!link) return;
  e.preventDefault();
  e.stopPropagation();
  const person = personById.get(link.dataset.fixPerson);
  if (!person) return;
  const ev = link.dataset.fixEvent !== undefined ? person.events[Number(link.dataset.fixEvent)] : null;
  openFixDialog(person, ev);
});

// "2026-11-26 09:15" in your own time zone.
function localTimestamp() {
  const d = new Date(), two = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

// ---- The corrections log ----

const logDialog = document.getElementById("logDialog");
const logTable = document.getElementById("logTable");
const LOG_COLUMNS = [
  ["when", "Fixed on"], ["name", "Name"], ["born", "Born"], ["died", "Died"], ["event", "Event"],
  ["eventDate", "Event date"], ["beforePlace", "Place in family file"], ["beforeShownAt", "Was shown at"],
  ["afterPlace", "Corrected place"]
];

function logEntries() {
  return Object.values(corrections).sort((a, b) => a.when.localeCompare(b.when));
}

function updateLogButton() {
  document.getElementById("logButton").textContent = `Corrections log (${Object.keys(corrections).length})`;
}

document.getElementById("logButton").addEventListener("click", () => {
  const rows = logEntries();
  logTable.innerHTML = rows.length
    ? `<thead><tr>${LOG_COLUMNS.map(([, h]) => `<th>${h}</th>`).join("")}</tr></thead><tbody>` +
      rows.map(r => `<tr>${LOG_COLUMNS.map(([k]) => `<td>${escapeHtml(r[k])}</td>`).join("")}</tr>`).join("") + "</tbody>"
    : "<tr><td>No corrections yet. Click a dot, then \"Fix this place\".</td></tr>";
  logDialog.showModal();
});

function logAsCsv() {
  const cell = v => `"${String(v).replace(/"/g, '""')}"`;
  return [LOG_COLUMNS.map(([, h]) => cell(h)).join(","),
    ...logEntries().map(r => LOG_COLUMNS.map(([k]) => cell(r[k])).join(","))].join("\r\n");
}

document.getElementById("logDownload").addEventListener("click", () => {
  const blob = new Blob([logAsCsv()], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "family-map-corrections.csv";
  link.click();
  URL.revokeObjectURL(link.href);
});

document.getElementById("logCopy").addEventListener("click", async () => {
  const text = [LOG_COLUMNS.map(([, h]) => h).join("\t"),
    ...logEntries().map(r => LOG_COLUMNS.map(([k]) => r[k]).join("\t"))].join("\n");
  try { await navigator.clipboard.writeText(text); document.getElementById("logCopy").textContent = "Copied"; }
  catch (e) { document.getElementById("logCopy").textContent = "Copy failed"; }
  setTimeout(() => { document.getElementById("logCopy").textContent = "Copy (paste into a spreadsheet)"; }, 2000);
});

document.getElementById("logClose").addEventListener("click", () => logDialog.close());
updateLogButton();
