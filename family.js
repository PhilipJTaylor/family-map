// family.js
// Choosing a "home" person and showing only part of the family:
//   - Ancestors: "Where did I come from?"
//   - Descendants: "Where did they and their family go?"
// Either can include close relatives, 1 or 2 steps out (spouses, children, brothers and sisters).

const homeInput = document.getElementById("homePerson");
const homeOptions = document.getElementById("homeOptions");
const lineSelect = document.getElementById("lineSelect");
const stepsSelect = document.getElementById("stepsSelect");
const filterNote = document.getElementById("filterNote");

let peopleByLabel = new Map(); // text shown in the search box -> person
let homePerson = null;
let visiblePeople = null; // null = everyone

// A label that tells people with the same name apart: "John Smith (1850 to 1920)".
function personLabel(person) {
  return `${person.name} (${lifeDates(person)})`;
}

// Fill the home-person search box with everyone in the file.
function setUpFamilyFilter(people) {
  peopleByLabel = new Map();
  homeOptions.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (const person of [...people].sort((a, b) => a.name.localeCompare(b.name))) {
    let label = personLabel(person);
    if (peopleByLabel.has(label)) label += ` [${person.id}]`;
    peopleByLabel.set(label, person);
    const option = document.createElement("option");
    option.value = label;
    fragment.appendChild(option);
  }
  homeOptions.appendChild(fragment);
  homePerson = null;
  homeInput.value = "";
  lineSelect.value = "everyone";
  applyFamilyFilter();
}

function setHomePerson(person) {
  homePerson = person;
  homeInput.value = person ? [...peopleByLabel].find(([, p]) => p === person)[0] : "";
  if (person && lineSelect.value === "everyone") lineSelect.value = "ancestors";
  applyFamilyFilter();
}

// Work out who is visible, then redraw the map and the people list.
function applyFamilyFilter() {
  const line = lineSelect.value;
  if (!homePerson || line === "everyone") {
    visiblePeople = null;
    filterNote.textContent = homePerson ? "" : "Choose a home person to follow one family line.";
  } else {
    const direct = line === "ancestors" ? collect(homePerson, p => p.parents) : collect(homePerson, p => p.children);
    visiblePeople = addRelatives(direct, Number(stepsSelect.value));
    const what = line === "ancestors" ? "ancestors" : "descendants";
    filterNote.textContent = `Showing ${homePerson.name}, ${direct.size - 1} ${what}` +
      (visiblePeople.size > direct.size ? ` and ${visiblePeople.size - direct.size} relatives` : "") + ".";
  }
  stepsSelect.disabled = !homePerson || line === "everyone";
  listPeople(visibleList());
  redraw();
}

// Everyone shown on the map right now.
function visibleList() {
  return visiblePeople ? currentPeople.filter(p => visiblePeople.has(p)) : currentPeople;
}

// Follow one kind of link (parents, or children) as far as it goes, including the start person.
function collect(start, next) {
  const found = new Set([start]);
  const queue = [start];
  while (queue.length) {
    for (const p of next(queue.shift())) {
      if (!found.has(p)) { found.add(p); queue.push(p); }
    }
  }
  return found;
}

// Add close family around a group, `steps` times: spouses, children, parents, brothers and sisters.
function addRelatives(group, steps) {
  let result = new Set(group);
  for (let i = 0; i < steps; i++) {
    const next = new Set(result);
    for (const p of result) {
      for (const r of [...p.spouses, ...p.children, ...p.parents]) next.add(r);
      for (const parent of p.parents) for (const sibling of parent.children) next.add(sibling);
    }
    result = next;
  }
  return result;
}

homeInput.addEventListener("change", () => {
  const person = peopleByLabel.get(homeInput.value);
  if (person) setHomePerson(person);
  else if (!homeInput.value) setHomePerson(null);
});
lineSelect.addEventListener("change", applyFamilyFilter);
stepsSelect.addEventListener("change", applyFamilyFilter);
