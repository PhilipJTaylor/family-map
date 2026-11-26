// arrows.js
// Movement arrows: when a home person and a family line are chosen, draw an arrow
// from each parent's birth place to their child's birth place.
//   - Ancestors view: arrows flow generation by generation towards the home person.
//   - Descendants view: arrows spread outward from the home person to where the family went.
// In the time player, an arrow appears in the year the child was born.

const arrowsBox = document.getElementById("showArrows");
const ARROW_COLOUR = "#c05621";

// Where a person "starts": their birth place, or failing that their earliest placed event.
function startPlace(person) {
  const birth = person.events.find(ev => ev.type === "Birth" && ev.coords);
  if (birth) return birth;
  const placed = person.events.filter(ev => ev.coords).sort((a, b) => (a.year || 9999) - (b.year || 9999));
  return placed[0] || null;
}

// Draw arrows for the visible family into a map layer. `year` is null for "all years".
function drawArrows(layer, visibleSet, year) {
  if (!arrowsBox.checked || !visibleSet) return;
  for (const child of visibleSet) {
    const to = startPlace(child);
    if (!to) continue;
    if (year !== null && (!to.year || to.year > year)) continue; // not born yet in this year
    for (const parent of child.parents) {
      if (!visibleSet.has(parent)) continue;
      const from = startPlace(parent);
      if (!from || spotKey(from.coords) === spotKey(to.coords)) continue; // didn't move
      drawArrow(layer, from.coords, to.coords);
    }
  }
}

// A line with a small arrowhead at the child's end. The arrowhead is worked out in
// screen pixels, so it keeps the same size at every zoom level (redrawn on zoom).
function drawArrow(layer, from, to) {
  const a = L.latLng(from.lat, from.lon), b = L.latLng(to.lat, to.lon);
  L.polyline([a, b], { color: ARROW_COLOUR, weight: 1.5, opacity: 0.6, interactive: false }).addTo(layer);

  const pa = map.latLngToLayerPoint(a), pb = map.latLngToLayerPoint(b);
  const angle = Math.atan2(pb.y - pa.y, pb.x - pa.x);
  const size = 9, spread = 0.45;
  const left = L.point(pb.x - size * Math.cos(angle - spread), pb.y - size * Math.sin(angle - spread));
  const right = L.point(pb.x - size * Math.cos(angle + spread), pb.y - size * Math.sin(angle + spread));
  L.polygon([b, map.layerPointToLatLng(left), map.layerPointToLatLng(right)], {
    color: ARROW_COLOUR, weight: 1, fillOpacity: 0.8, interactive: false
  }).addTo(layer);
}

arrowsBox.addEventListener("change", () => redraw());
map.on("zoomend", () => { if (arrowsBox.checked && visiblePeople) redraw(); });
