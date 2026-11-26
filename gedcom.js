// gedcom.js
// Reads the text of a GEDCOM file and returns a simple list of people.
//
// A GEDCOM file is plain text. Every line looks like:
//     LEVEL [@ID@] TAG [VALUE]
// for example:
//     0 @I1@ INDI          <- a new person, with id I1
//     1 NAME John /Smith/  <- their name (surname between slashes)
//     1 BIRT               <- a birth event...
//     2 DATE 12 MAR 1850   <- ...its date
//     2 PLAC Cork, Ireland <- ...its place
// The level number says how deeply a line is nested under the one above it.

function parseGedcom(text) {
  const people = [];
  const families = new Map(); // family id -> {husband, wife, children: [ids]}
  let family = null;   // the family record we are currently reading
  let person = null;   // the person we are currently reading
  let event = null;    // the event (birth, death...) we are currently reading

  // Which GEDCOM event tags we care about, and a friendly name for each.
  const EVENT_TAGS = { BIRT: "Birth", CHR: "Christening", DEAT: "Death", BURI: "Burial", RESI: "Residence" };

  const lines = text.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Split the line into its parts: level, optional @ID@, tag, optional value.
    const match = line.match(/^(\d+)\s+(@[^@]+@\s+)?(\S+)\s?(.*)$/);
    if (!match) continue;
    const level = Number(match[1]);
    const id = match[2] ? match[2].trim().replace(/@/g, "") : null;
    const tag = match[3];
    const value = match[4] || "";

    if (level === 0) {
      // A new top-level record starts. Only INDI records are people.
      person = null;
      family = null;
      event = null;
      if (tag === "INDI") {
        person = { id: id, name: "(no name)", events: [] };
        people.push(person);
      } else if (tag === "FAM") {
        family = { husband: null, wife: null, children: [] };
        families.set(id, family);
      }
      continue;
    }

    // Family records say who the parents and children are:
    //   0 @F1@ FAM / 1 HUSB @I1@ / 1 WIFE @I2@ / 1 CHIL @I3@
    if (family && level === 1) {
      const who = value.replace(/@/g, "").trim();
      if (tag === "HUSB") family.husband = who;
      else if (tag === "WIFE") family.wife = who;
      else if (tag === "CHIL") family.children.push(who);
      continue;
    }

    if (!person) continue; // we're inside a source, note, etc. Skip it.

    if (level === 1) {
      event = null;
      if (tag === "NAME" && person.name === "(no name)") {
        person.name = value.replace(/\//g, "").replace(/\s+/g, " ").trim() || "(no name)";
      } else if (EVENT_TAGS[tag]) {
        event = { type: EVENT_TAGS[tag], date: "", year: null, place: "" };
        person.events.push(event);
      }
    } else if (level === 2 && event) {
      if (tag === "DATE") {
        event.date = value;
        event.year = extractYear(value);
      } else if (tag === "PLAC") {
        event.place = value.trim();
      }
    }
  }
  linkFamilies(people, families);
  return people;
}

// Give each person lists of their parents, children and spouses (as person objects).
function linkFamilies(people, families) {
  const byId = new Map(people.map(p => [p.id, p]));
  for (const p of people) { p.parents = []; p.children = []; p.spouses = []; }
  for (const fam of families.values()) {
    const parents = [byId.get(fam.husband), byId.get(fam.wife)].filter(Boolean);
    const children = fam.children.map(id => byId.get(id)).filter(Boolean);
    if (parents.length === 2) {
      parents[0].spouses.push(parents[1]);
      parents[1].spouses.push(parents[0]);
    }
    for (const child of children) {
      for (const parent of parents) {
        child.parents.push(parent);
        parent.children.push(child);
      }
    }
  }
}

// Pull a 4-digit year out of a GEDCOM date like "ABT 1850" or "12 MAR 1850".
// Returns null if there is no year.
function extractYear(dateText) {
  const years = dateText.match(/\b(\d{4})\b/g);
  return years ? Number(years[years.length - 1]) : null;
}
