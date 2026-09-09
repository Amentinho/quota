# radar

A shallow retail scrape, cleaned honestly, computing only what the data actually supports. See [`METHODOLOGY.md`](METHODOLOGY.md) before reading anything below as more than it is.

```
node clean.mjs   # data/bronte_listings_raw.csv -> data/bronte_listings_cleaned.csv (+ data/bronte_listings_removed.csv)
node stats.mjs   # prints retailer count, listing count, and the reconciliation gap
```

## What's here

- `data/bronte_listings_raw.csv` — the scrape output, unchanged.
- `data/bronte_listings_cleaned.csv` — the same data with junk removed (see [`data/CLEANING_NOTES.md`](data/CLEANING_NOTES.md) for exactly what and why: page furniture, wrong products, generic/non-product titles, one duplicate scrape).
- `data/bronte_listings_removed.csv` — every removed row, kept, with its reason. Nothing is silently dropped.
- `clean.mjs` — produces the cleaned CSV from the raw one, by the four named rules in `CLEANING_NOTES.md`.
- `stats.mjs` — reads the cleaned CSV and prints exactly two numbers and one observation: how many retailers, how many listings, and that no field in this data permits reconciling either against a harvest tonnage figure.

## The numbers

**16 retailers, 27 listings**, all Italian-language, all naming Bronte origin, as of this scrape. That's it — no sales volume, no market share, no fraud multiple. `weight_kg` is pack size, not units sold; there is no quantity field anywhere in the raw scrape to build one from.

What this *can* support, and the only thing it's used for elsewhere in this project: the observation that no aggregate record exists of how much product currently claims Bronte origin, anywhere — not in this scrape, not at the consortium, not anywhere public. `radar/` doesn't estimate that number. It demonstrates that nobody can, today, without a system like QUOTA.
