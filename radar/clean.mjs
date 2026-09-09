import { readFileSync, writeFileSync } from "node:fs";

// Minimal RFC4180 parser -- the raw scrape has quoted fields with embedded
// newlines and commas (pistacchioverde.com's price-range titles), so a
// naive line-split would silently miscount rows. No dependency added for
// this: the file is small and the quoting is standard.
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
      // skip, \n handles the row break
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

function toCsvField(s) {
  if (s == null) return "";
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Four named, separately-justified removal categories -- not lumped
// together, because they're different kinds of problems and a reader
// should be able to tell which is which.
const PAGE_FURNITURE_TITLES = new Set(["Configurazione dei cookies", "Facebook", "Passa alle informazioni sul prodotto"]);

const WRONG_PRODUCT_TITLES = new Set(["SEMI DI LINO", "Nocciole Premium in guscio tostate", "Filetti di Zenzero candito"]);

// A bare category breadcrumb or brand label the scraper captured instead
// of an actual product title -- these identify nothing about what's for
// sale, let alone that it's Bronte in origin. Distinct from "wrong
// product": the underlying page is still real and still pistachio, the
// scraped text just isn't a listing description. A title that names an
// actual product (e.g. "Crema di pistacchio artigianale") is kept even
// without the literal word "Bronte", since it still identifies a real,
// specific product -- only the content-free labels below are dropped.
const GENERIC_NONPRODUCT_TITLES = new Set(["PISTACCHIO", "DOLCI E BISCOTTI, PISTACCHIO", "DON TANU"]);

const raw = readFileSync(new URL("./data/bronte_listings_raw.csv", import.meta.url), "utf-8");
const table = parseCsv(raw).filter((r) => r.some((v) => v.trim() !== ""));
const header = table[0];
const dataRows = table.slice(1);

const seenUrls = new Set();
const kept = [];
const removed = [];

for (const r of dataRows) {
  const [channel, url, product_title] = r;
  const key = `${channel}|${url}`;

  const title = product_title.trim();
  if (PAGE_FURNITURE_TITLES.has(title)) {
    removed.push({ row: r, reason: "page_furniture" });
    continue;
  }
  if (WRONG_PRODUCT_TITLES.has(title)) {
    removed.push({ row: r, reason: "wrong_product" });
    continue;
  }
  if (GENERIC_NONPRODUCT_TITLES.has(title)) {
    removed.push({ row: r, reason: "generic_nonproduct_title" });
    continue;
  }
  // Checked last, deliberately: a row with a generic/non-product title is
  // excluded for that reason even on its first occurrence, not relabeled
  // "duplicate" just because a later repeat of the same URL happens to
  // exist. This category catches only a real, distinct listing scraped
  // twice.
  if (seenUrls.has(key)) {
    removed.push({ row: r, reason: "duplicate_scrape" });
    continue;
  }
  seenUrls.add(key);
  kept.push(r);
}

const cleanedCsv = [header, ...kept].map((r) => r.map(toCsvField).join(",")).join("\n") + "\n";
writeFileSync(new URL("./data/bronte_listings_cleaned.csv", import.meta.url), cleanedCsv);

const removedLog = [
  ["channel", "url", "product_title", "raw_weight_string", "reason"],
  ...removed.map((x) => [...x.row, x.reason]),
]
  .map((r) => r.map(toCsvField).join(","))
  .join("\n") + "\n";
writeFileSync(new URL("./data/bronte_listings_removed.csv", import.meta.url), removedLog);

const rawRetailers = new Set(dataRows.map((r) => r[0]));
const cleanedRetailers = new Set(kept.map((r) => r[0]));

const byReason = { page_furniture: 0, wrong_product: 0, generic_nonproduct_title: 0, duplicate_scrape: 0 };
for (const x of removed) byReason[x.reason]++;

console.log(`Raw:     ${dataRows.length} rows, ${rawRetailers.size} retailers`);
console.log(`Removed: ${removed.length} rows total`);
console.log(`  page furniture:          ${byReason.page_furniture}`);
console.log(`  wrong product:           ${byReason.wrong_product}`);
console.log(`  generic/non-product title: ${byReason.generic_nonproduct_title}`);
console.log(`  duplicate scrape:        ${byReason.duplicate_scrape}`);
console.log(`Cleaned: ${kept.length} rows, ${cleanedRetailers.size} retailers`);

const droppedRetailers = [...rawRetailers].filter((r) => !cleanedRetailers.has(r));
console.log(`Retailers with zero rows remaining after cleaning: ${droppedRetailers.join(", ") || "(none)"}`);
