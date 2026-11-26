// timeline.js
// The time player: a slider of years with play/pause and speed controls.
// At a chosen year, each person who was alive then is shown at the latest place
// we know they were by that year (birth place, then residences, and so on).

const yearSlider = document.getElementById("yearSlider");
const yearLabel = document.getElementById("yearLabel");
const playButton = document.getElementById("playButton");
const speedSelect = document.getElementById("speedSelect");
const allYearsBox = document.getElementById("allYears");

// People with no death date are assumed to live at most this long.
const ASSUMED_LIFESPAN = 90;

let playTimer = null;

// Returns the chosen year, or null when "All years" is ticked.
function timelineYear() {
  return allYearsBox.checked ? null : Number(yearSlider.value);
}

// Set the slider's range from the earliest to the latest year in the file.
function setUpTimeline(people) {
  stopPlaying();
  const years = [];
  for (const person of people) for (const ev of person.events) if (ev.year) years.push(ev.year);
  if (!years.length) return;
  const sensible = years.filter(y => y > 1000);
  if (!sensible.length) return;
  const first = Math.min(...sensible), last = Math.min(Math.max(...years), new Date().getFullYear());
  yearSlider.min = first;
  yearSlider.max = last;
  yearSlider.value = first;
  allYearsBox.checked = true;
  showYear();
}

function showYear() {
  yearLabel.textContent = allYearsBox.checked ? "All years" : yearSlider.value;
  yearSlider.disabled = false;
}

// Where was this person in a given year? Returns [] if they weren't alive then,
// or [{person, ev}] where ev is the latest event with a known place up to that year.
function whereInYear(person, year) {
  const dated = person.events.filter(ev => ev.year);
  if (!dated.length) return [];
  const born = (person.events.find(ev => ev.type === "Birth" && ev.year) || {}).year
    || Math.min(...dated.map(ev => ev.year));
  const deathEvent = person.events.find(ev => (ev.type === "Death" || ev.type === "Burial") && ev.year);
  const died = deathEvent ? deathEvent.year : born + ASSUMED_LIFESPAN;
  if (year < born || year > died) return [];

  let best = null;
  for (const ev of dated) {
    if (!ev.coords || ev.year > year) continue;
    if (!best || ev.year >= best.year) best = ev;
  }
  // Nothing placed yet by this year: fall back to their birth place if we know it.
  if (!best) best = person.events.find(ev => ev.type === "Birth" && ev.coords);
  return best ? [{ person, ev: best }] : [];
}

// ---- Controls ----

yearSlider.addEventListener("input", () => {
  allYearsBox.checked = false;
  showYear();
  redraw();
});

allYearsBox.addEventListener("change", () => {
  if (allYearsBox.checked) stopPlaying();
  showYear();
  redraw();
});

playButton.addEventListener("click", () => {
  if (playTimer) stopPlaying();
  else startPlaying();
});

speedSelect.addEventListener("change", () => {
  if (playTimer) { stopPlaying(); startPlaying(); }
});

function startPlaying() {
  if (allYearsBox.checked) {
    allYearsBox.checked = false;
    if (Number(yearSlider.value) >= Number(yearSlider.max)) yearSlider.value = yearSlider.min;
  }
  playButton.textContent = "Pause";
  // Speed is in years per second; we move one year per step.
  const yearsPerSecond = Number(speedSelect.value);
  playTimer = setInterval(() => {
    const next = Number(yearSlider.value) + 1;
    if (next > Number(yearSlider.max)) { stopPlaying(); return; }
    yearSlider.value = next;
    showYear();
    redraw();
  }, 1000 / yearsPerSecond);
  showYear();
  redraw();
}

function stopPlaying() {
  if (playTimer) clearInterval(playTimer);
  playTimer = null;
  playButton.textContent = "Play";
}
