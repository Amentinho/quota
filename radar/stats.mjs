import { readFileSync } from "node:fs";

// Same minimal RFC4180 parser as clean.mjs -- kept duplicated rather than
// shared, since this is two small scripts, not a package.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c === "\r") {
      // skip
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const raw = readFileSync(new URL("./data/bronte_listings_cleaned.csv", import.meta.url), "utf-8");
const table = parseCsv(raw).filter((r) => r.some((v) => v.trim() !== ""));
const [header, ...rows] = table;
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

const retailers = new Set(rows.map((r) => r[idx.channel]));

// This is deliberately everything the script computes. weight_kg is pack
// size (how big the jar is), not units sold -- there is no quantity,
// units-sold, or revenue field anywhere in this data, scraped or
// otherwise. A listing count and a retailer count say a claim of Bronte
// origin exists at that many storefronts; they say nothing about how much
// product moved, so they cannot be compared against a harvest tonnage.
// See METHODOLOGY.md.
console.log(`Listings (cleaned):     ${rows.length}`);
console.log(`Distinct retailers:     ${retailers.size}`);
console.log(`Retailers:              ${[...retailers].sort().join(", ")}`);
console.log("");
console.log(
  "No field in this dataset (or in the raw scrape it comes from) records units sold, order volume, or revenue.",
);
console.log(
  "weight_kg is pack size -- how large a single listed unit is, not how many were sold. It cannot be summed into a",
);
console.log("volume figure, and no such figure is computed or implied anywhere in this output.");
console.log("");
console.log(
  `This dataset cannot be reconciled against any harvest tonnage figure. It can only say: at the time of this`,
);
console.log(
  `shallow scrape, ${retailers.size} Italian-language retailers had ${rows.length} listings naming Bronte origin.`,
);
