// places.js
// Cleans up place names so that near-duplicates become one place, and so we
// look up as few places online as possible.
//
// Family trees spell the same place many ways, for example:
//   "Springfield, Sangamon, Illinois, USA"
//   "Springfield, Sangamon County, Illinois, United States of America"
//   "Springfield, IL"
// All of these become "Springfield, Illinois, USA".
//
// The original text is still shown in each pin's popup; only the lookup uses
// the cleaned version. Each rule below is a small function, applied in order.

const COUNTRY_NAMES = {
  "usa": "USA", "us": "USA", "u.s.": "USA", "u.s.a.": "USA", "united states": "USA",
  "united states of america": "USA", "america": "USA",
  "uk": "United Kingdom", "u.k.": "United Kingdom", "great britain": "United Kingdom",
  "england": "England", "scotland": "Scotland", "wales": "Wales", "ireland": "Ireland",
  "northern ireland": "Northern Ireland", "canada": "Canada", "australia": "Australia",
  "new zealand": "New Zealand", "germany": "Germany", "deutschland": "Germany", "france": "France"
};
const UK_NATIONS = ["England", "Scotland", "Wales", "Northern Ireland"];

// Common English county abbreviations.
const COUNTY_ABBREVIATIONS = {
  "beds": "Bedfordshire", "berks": "Berkshire", "bucks": "Buckinghamshire", "cambs": "Cambridgeshire",
  "derbys": "Derbyshire", "glos": "Gloucestershire", "gloucs": "Gloucestershire", "hants": "Hampshire",
  "herts": "Hertfordshire", "hunts": "Huntingdonshire", "lancs": "Lancashire", "leics": "Leicestershire",
  "lincs": "Lincolnshire", "northants": "Northamptonshire", "notts": "Nottinghamshire", "oxon": "Oxfordshire",
  "salop": "Shropshire", "staffs": "Staffordshire", "warks": "Warwickshire", "wilts": "Wiltshire",
  "worcs": "Worcestershire", "yorks": "Yorkshire"
};

const US_STATES = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado",
  CT: "Connecticut", DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts",
  MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico",
  NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma",
  OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota",
  TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming"
};
const US_STATE_NAMES = new Set(Object.values(US_STATES).map(s => s.toLowerCase()));

// Historic English counties, so "Townham, Kent" gains its missing ", England".
const ENGLISH_COUNTIES = new Set([
  "bedfordshire", "berkshire", "buckinghamshire", "cambridgeshire", "cheshire", "cornwall",
  "cumberland", "derbyshire", "devon", "dorset", "durham", "essex", "gloucestershire",
  "hampshire", "herefordshire", "hertfordshire", "huntingdonshire", "kent", "lancashire",
  "leicestershire", "lincolnshire", "london", "middlesex", "norfolk", "northamptonshire",
  "northumberland", "nottinghamshire", "oxfordshire", "rutland", "shropshire", "somerset",
  "staffordshire", "suffolk", "surrey", "sussex", "warwickshire", "westmorland", "wiltshire",
  "worcestershire", "yorkshire", "east sussex", "west sussex", "west midlands", "greater london",
  "greater manchester", "merseyside", "north yorkshire", "south yorkshire", "west yorkshire",
  "east riding of yorkshire", "tyne and wear", "isle of wight"
]);

// Church dedications that Ancestry often puts before or inside an English place:
// "Townham, St Mary, Townham, Kent, England".
const CHURCH_NAME = /^(st\.? |saint |all saints|holy trinity|christ church|st$)/i;

// Census sub-districts that aren't real places: "Justice Precinct 1", "Militia District 987", "Ward 3".
const CENSUS_SUFFIX = /\s+(ward|precinct|beat|division|district|assembly district|election district)\s+\d+\w*$/i;
const CENSUS_ONLY = /^(justice precinct|precinct|militia district|election district|division|district|beat|ward|township \d+ range|supervisor'?s district)\b/i;

function normalizePlace(place) {
  let parts = splitWithoutCommas(String(place)
    .replace(/[?]/g, "")                 // "England?" -> "England"
    .replace(/\s+-(\s+|(?=,)|$)|;/g, ",")) // "Townham - Kent -, England" -> "Townham, Kent, England"
    .split(",")
    .map(p => p.trim().replace(/\s+/g, " ").replace(/^[.\s]+|[.\s]+$/g, ""))
    .map(p => p.replace(/^(of|probably|possibly|prob\.?|poss\.?|near|nr\.?|abt\.?|about)\s+/i, "")) // "probably Kent" -> "Kent"
    .map(p => (p.length > 3 && p === p.toUpperCase() && /[A-Z]/.test(p)) ? titleCase(p) : p)        // "NEWPORT" -> "Newport"
    .filter(p => p && !/^\d+$/.test(p)); // drop empty bits and bare numbers like "1852"
  if (parts.length === 0) return "";

  // "Townham Kent, England" -> "Townham, Kent, England" (an English county typed without its comma).
  parts = parts.flatMap(p => {
    const m = p.match(/^(.+?)\s+(\S+)$/);
    return m && (ENGLISH_COUNTIES.has(m[2].toLowerCase()) || COUNTY_ABBREVIATIONS[m[2].toLowerCase()]) ? [m[1], m[2]] : [p];
  });

  // Country names: "United States of America" -> "USA", "England." -> "England".
  parts = parts.map(p => COUNTRY_NAMES[p.toLowerCase()] || p);

  // "..., England, United Kingdom" -> "..., England".
  if (parts.length > 1 && parts[parts.length - 1] === "United Kingdom" && UK_NATIONS.includes(parts[parts.length - 2])) {
    parts.pop();
  }

  // US state abbreviations: "MA" -> "Massachusetts" (only in the last two positions, to avoid towns).
  parts = parts.map((p, i) => (i >= parts.length - 2 && US_STATES[p.toUpperCase()] && p.length === 2) ? US_STATES[p.toUpperCase()] : p);

  // County abbreviations: "Northants" -> "Northamptonshire".
  parts = parts.map(p => COUNTY_ABBREVIATIONS[p.toLowerCase().replace(/\.$/, "")] || p);

  // Add a missing country: "..., Utah" -> "..., Utah, USA"; "..., Kent" -> "..., Kent, England".
  const last = parts[parts.length - 1].toLowerCase();
  if (US_STATE_NAMES.has(last)) parts.push("USA");
  else if (ENGLISH_COUNTIES.has(last)) parts.push("England");

  const country = parts[parts.length - 1];

  // "Garfield County" -> "Garfield", "Co. Cork" -> "Cork". The first part may be a town, or a county
  // on its own ("Ottawa Co, Ohio"), so there "Co" is only spelled out: "Ottawa County, Ohio".
  parts = parts.map((p, i) => i === 0
    ? p.replace(/\s+co\.?$/i, " County")
    : p.replace(/\s+(county|co\.?)$/i, "").replace(/^(county|co\.?)\s+/i, ""));

  // Census sub-districts: "Wheaton Ward 2" -> "Wheaton"; "Justice Precinct 1" is dropped entirely.
  if (parts.length > 2) {
    if (CENSUS_ONLY.test(parts[0])) parts.shift();
    else parts[0] = parts[0].replace(CENSUS_SUFFIX, "");
  }

  // "Howard Twp" / "Howard Township" -> "Howard".
  parts = parts.map(p => p.replace(/\s+(twp\.?|township)$/i, ""));

  // In the UK, a leading church name is detail, not a place: "St Mary, Townham, Kent, England".
  if (parts.length > 3 && UK_NATIONS.includes(country) && CHURCH_NAME.test(parts[0])) parts.shift();

  // Repeated names: "Townham, St Mary, Townham, Kent" or "Lincoln, Lincoln, Monroe" -> keep from the last repeat.
  const firstLower = parts[0].toLowerCase();
  const repeatAt = parts.map(p => p.toLowerCase()).lastIndexOf(firstLower, parts.length - 2);
  if (repeatAt > 0) parts = parts.slice(repeatAt);
  parts = parts.filter((p, i) => i === 0 || p.toLowerCase() !== parts[i - 1].toLowerCase());

  // Middle layers (US counties, English parishes and districts) vary a lot between records
  // and the lookup service doesn't need them: "Town, County, State, USA" -> "Town, State, USA".
  if (parts.length > 3 && (country === "USA" || UK_NATIONS.includes(country))) {
    parts = [parts[0], parts[parts.length - 2], parts[parts.length - 1]];
  }

  return parts.join(", ");
}

function titleCase(text) {
  return text.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// Some places are typed with spaces instead of commas: "Townham Kent England".
// If there are no commas, peel known country, state and county names off the end.
function splitWithoutCommas(text) {
  if (text.includes(",")) return text;
  const words = text.trim().split(/\s+/);
  const tail = [];
  const known = w => {
    const l = w.toLowerCase();
    return COUNTRY_NAMES[l] || ENGLISH_COUNTIES.has(l) || US_STATE_NAMES.has(l) || COUNTY_ABBREVIATIONS[l.replace(/\.$/, "")];
  };
  while (words.length > 1) {
    // Try two-word names first ("New York", "United States"), then one word.
    const two = words.slice(-2).join(" ");
    if (words.length > 2 && known(two)) { tail.unshift(two); words.splice(-2); continue; }
    if (known(words[words.length - 1])) { tail.unshift(words.pop()); continue; }
    break;
  }
  return [words.join(" "), ...tail].join(", ");
}
