# family-map
Visualization Tool for Genealogical History

A free web page that shows where your ancestors were born, lived and died on a map.
You choose a GEDCOM file exported from Ancestry, MyHeritage or similar. The file is read
inside your own browser and is never uploaded anywhere. Only place names are sent to
OpenStreetMap's Nominatim service to find their coordinates.

## Try it on your computer

1. Download this repository (in GitHub Desktop: File > Clone repository).
2. Open a terminal in the folder and run `python -m http.server 8000`.
3. Visit http://localhost:8000 in your browser.
4. Click "Or try the sample family", or choose your own .ged file.

(Opening `index.html` by double-clicking works for your own file, but the sample button
needs the small local web server from step 2.)

## What each file does

| File | Purpose |
| --- | --- |
| `index.html` | The page itself: buttons, map area, people list. |
| `style.css` | Colours, sizes and layout. |
| `gedcom.js` | Reads a GEDCOM file into a list of people and their events. |
| `places.js` | Cleans up place names so near-duplicates ("Co.", "USA" vs "United States", church names, census wards) count as one place. |
| `geocode.js` | Looks up coordinates for place names, one per second, and remembers them. |
| `app.js` | Connects everything and draws pins on the map. |
| `sample.ged` | A small made-up family for testing. |

Real family files (`*.ged`) are blocked from being committed by `.gitignore`.

## Checking the place clean-up rules

Run `node tests/places.test.js`. It checks made-up examples and prints any that fail.

## Version number

The page title shows a version like `v0.4` (in `index.html`). Increase it with every change, so you can tell which version the live site is showing.
