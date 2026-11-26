// Checks the place-database lookup with a tiny made-up country file.
// Run with:  node tests/gazetteer.test.js
const fs = require("fs");
const path = require("path");
eval(fs.readFileSync(path.join(__dirname, "..", "gazetteer.js"), "utf8") +
  "\nglobalThis.gazetteers = gazetteers; globalThis.buildIndex = buildIndex; globalThis.gazetteerLookup = gazetteerLookup;");

gazetteers.set("GB", buildIndex({
  admin1: ["", "England"],
  admin2: ["", "Kent", "Lancashire"],
  places: [
    ["Townham|Old Townham|Tunham", 1, 1, 51.1, 1.1, 5000, 0],
    ["Townham", 1, 2, 53.5, -2.2, 200, 0],
    ["Kent", 1, 1, 51.2, 0.7, 0, 1]
  ]
}));

const cases = [
  ["Townham, Kent, England", "51.1,1.1,exact"],
  ["Townham, Lancashire, England", "53.5,-2.2,exact"],
  ["Tunham, Kent, England", "51.1,1.1,exact"],
  ["Townham, Surrey, England", "none"],          // two Townhams, neither in Surrey: ask online instead
  ["Newville, Kent, England", "51.2,0.7,approximate"],
  ["Kent, England", "51.2,0.7,exact"],
  ["Paris, France", "none"],                      // no file loaded for France
  ["England", "52.6,-1.5,approximate"],            // country only: its rough centre
  ["Tunham", "51.1,1.1,exact"]                     // no country, but only one loaded country has it
];

let failed = 0;
for (const [input, expected] of cases) {
  const r = gazetteerLookup(input);
  const actual = r ? `${r.lat},${r.lon},${r.approximate ? "approximate" : "exact"}` : "none";
  if (actual !== expected) { failed++; console.log(`FAIL: "${input}" expected ${expected}, got ${actual}`); }
}
console.log(failed ? `${failed} of ${cases.length} failed` : `All ${cases.length} passed`);
process.exit(failed ? 1 : 0);
