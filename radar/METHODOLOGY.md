# Methodology — and what this data cannot be used for

This is a shallow scrape of Italian-language retail listings mentioning Bronte pistachio. Read it as that, and only that.

## What it is

- **Shallow.** A single pass over 21 retailer pages, not a market survey. It was not designed to be exhaustive, and there is no reason to believe it is.
- **Italian-language retailers only.** Every retailer in `data/bronte_listings_raw.csv` is an Italian-language storefront. No international, English-language, US, or non-EU retail presence is represented at all. Whatever fraction of global "Bronte"-labeled retail this dataset captures, it is not attempting to capture the whole thing.
- **Pack sizes only.** `weight_kg` (and the `raw_weight_string` it's parsed from) is how large a single listed unit is — 90g, 250g, 1kg — not how many units were sold, not order volume, not revenue. There is no quantity field anywhere in the raw scrape.

## What it is not

- **Not a sales-volume figure.** Pack size cannot be summed into anything resembling tonnes sold. A retailer selling one 90g jar a year and a retailer selling one thousand a day would produce an identical row in this dataset. Nothing here distinguishes them.
- **Not a market estimate.** 16 retailers and 27 listings is a count of *where a Bronte-origin claim appears in this specific scrape*, not an estimate of how many retailers or listings exist. Scaling this number up by any factor — "if we found 16, there are probably X" — is exactly the kind of extrapolation this document exists to rule out.
- **Not a fraud estimate, and not a multiple.** This project does not state a fraud multiple anywhere, in this scrape or elsewhere, because nothing in the data supports computing one. See `../radar/stats.mjs`'s output and the README's framing of "the number nobody can compute."

## Do not extrapolate

Concretely, this data cannot answer, and should never be made to answer:

- How much Bronte-labeled product is sold in a year.
- What fraction of "Bronte" claims are fraudulent.
- How retail volume compares to harvest tonnage.
- Anything about markets, retailers, or languages not in this scrape.

What it *can* say, and all it says: at the time of this scrape, 16 Italian-language retailers had 27 listings naming Bronte origin, with no field in any of them permitting reconciliation against a harvest figure. That absence — not a number — is the point `radar/` exists to make visible.
