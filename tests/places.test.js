// Checks that place clean-up rules work. Run with:  node tests/places.test.js
// All examples are made up.
const fs = require("fs");
const path = require("path");
eval(fs.readFileSync(path.join(__dirname, "..", "places.js"), "utf8") + "\nglobalThis.normalizePlace = normalizePlace;");

const cases = [
  ["Springfield, Sangamon, Illinois, USA", "Springfield, Illinois, USA"],
  ["Springfield, Sangamon County, Illinois, United States of America", "Springfield, Illinois, USA"],
  ["Springfield, IL", "Springfield, Illinois, USA"],
  ["Townham, Kent", "Townham, Kent, England"],
  ["Townham, Kent, England, United Kingdom", "Townham, Kent, England"],
  ["Townham, St Mary, Townham, Kent, England", "Townham, Kent, England"],
  ["Townham, Townham, Townham, Kent, England", "Townham, Kent, England"],
  ["Saint Mary, Townham, Riverby, Kent, England", "Townham, Kent, England"],
  ["Riverby Ward 3, Polk, Iowa, USA", "Riverby, Iowa, USA"],
  ["Justice Precinct 2, Polk, Texas, USA", "Polk, Texas, USA"],
  ["Oakdale Twp, Oakdale, Marion, Ohio, USA", "Oakdale, Ohio, USA"],
  ["Marion Co, Ohio", "Marion County, Ohio, USA"],
  ["  England. ", "England"],
  ["England?", "England"],
  ["probably Kent, England", "Kent, England"],
  ["RIVERBY, Kent", "Riverby, Kent, England"],
  ["Lost at Sea", "Lost at Sea"],
  ["", ""]
];

let failed = 0;
for (const [input, expected] of cases) {
  const actual = normalizePlace(input);
  if (actual !== expected) {
    failed++;
    console.log(`FAIL: "${input}"\n  expected "${expected}"\n  got      "${actual}"`);
  }
}
console.log(failed ? `${failed} of ${cases.length} failed` : `All ${cases.length} passed`);
process.exit(failed ? 1 : 0);
