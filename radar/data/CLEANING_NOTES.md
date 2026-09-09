# What was removed from the raw scrape, and why

`bronte_listings_raw.csv` is the scrape output, unchanged. `bronte_listings_cleaned.csv` is produced from it by `../clean.mjs`, which removes rows in four named categories — never silently, and never a blanket "looks wrong" judgment call. Every removed row is preserved, with its reason, in `bronte_listings_removed.csv`.

Raw: **46 rows, 21 retailers**. Cleaned: **27 rows, 16 retailers**.

## The four removal categories

1. **Page furniture (3 rows)** — the scraper captured UI chrome, not a listing: a cookie-consent banner (`"Configurazione dei cookies"`), a Facebook share button (`"Facebook"`, on a `facebook.com/sharer.php` URL, not a retailer's own page), and a "skip to product info" anchor link (`"Passa alle informazioni sul prodotto"`). None of these describe a product.
2. **Wrong product (3 rows)** — the scrape picked up real listings on pistachio-adjacent retailers that are not pistachio at all: flax seeds (`SEMI DI LINO`), roasted hazelnuts (`Nocciole Premium in guscio tostate`), and candied ginger strips (`Filetti di Zenzero candito`).
3. **Generic / non-product title (12 rows)** — the scraper captured a bare category breadcrumb or brand label instead of an actual product description: `"PISTACCHIO"` (9 rows, mostly on `www.enotecailbarocco.it` and one on `www.terramadre.it`), `"DOLCI E BISCOTTI, PISTACCHIO"` (1 row), and `"DON TANU"` (a brand name with no product description, 1 row) — 11 named instances, plus one more `"PISTACCHIO"` duplicate, 12 total. These identify nothing about what's for sale, let alone that it's Bronte-origin — kept only when a title actually describes a product, even one that doesn't literally contain the word "Bronte" (e.g. `www.pistasta.it`'s `"Crema di pistacchio artigianale"`, whose URL and retailer context make the origin unambiguous even though the scraped title alone doesn't say it).
4. **Duplicate scrape (1 row)** — the exact same retailer + URL captured twice (`shop.pistacchioevergreen.it`'s sgusciato listing), once with a weight and once without. Counted once, not zero — this is a repeat scrape of a real listing, not junk.

## Retailers that disappear entirely after cleaning

Five of the raw scrape's 21 retailers have zero rows left once the above is applied — every row they contributed was junk, wrong-product, or (for one) entirely generic-titled:

- `neronatura.it` — its one row was flax seeds.
- `www.dattilofruttasecca.it` — its one row was hazelnuts.
- `pariani.org` — its one row was candied ginger.
- `www.barrili.it` — its one row was the "skip to product info" link text.
- `www.enotecailbarocco.it` — all ten of its rows (five real product pages, each scraped twice) had only the generic `"PISTACCHIO"` / `"DOLCI E BISCOTTI, PISTACCHIO"` breadcrumb as a title, never an actual product name.

## An honest note on this methodology's own edge

This cleaning still keeps two rows worth naming explicitly, because excluding them would be just as much a judgment call as keeping them:

- `www.insicilia.com`'s row is a supplier directory entry (`"Vendita online pistacchio di Bronte Siciliano DOP Evergreen"`), not a specific product page — it names Bronte and describes a real thing, but it isn't a single listing the way the others are.
- `www.lacascina1899.it`'s row's URL is a direct link to an image file (`.../CREMA-PISTACCHIO.jpg`), not a product page — almost certainly a scraping artifact, but the title itself is a real, specific product description.

Both are kept because they pass the four stated rules. A stricter rule ("must be a product-specific page, not a directory or an image link") would drop `www.insicilia.com` alone to 26 listings across 15 retailers, `www.lacascina1899.it` alone to the same 26/15, or both together to 25 listings across 14 retailers. That fifth rule was considered and not applied here, specifically to avoid inventing an extra removal category after the fact to hit a particular number — the four rules above are the ones this dataset can defend, applied the same way regardless of where they land.
