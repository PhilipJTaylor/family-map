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
      event = null;
      if (tag === "INDI") {
        person = { id: id, name: "(no name)", events: [] };
        people.push(person);
      }
      continue;
    }

    if (!person) continue; // we're inside a family, source, etc. Skip for now.

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
  return people;
}

// Pull a 4-digit year out of a GEDCOM date like "ABT 1850" or "12 MAR 1850".
// Returns null if there is no year.
function extractYear(dateText) {
  const years = dateText.match(/\b(\d{4})\b/g);
  return years ? Number(years[years.length - 1]) : null;
}
