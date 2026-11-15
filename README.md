# Vantage by Navaark

**See every channel. See what's next.**

One view of sales across Walmart, Amazon, Target, DTC/Shopify and distributors (UNFI/KeHE), with predictions. A one-time setup product for $5M–$100M CPG brands.

Many brands use this framework — your data drops into the same framework, with your channels, SKUs and definitions.

## Run it in 2 minutes

No build step. No npm. No backend. No API keys.

1. Download this folder as a ZIP, unzip it.
2. Serve it locally (opening `index.html` with `file://` blocks `fetch()` for the JSON files):
   ```bash
   cd navaark-vantage
   python3 -m http.server 8000
   ```
   Then open http://localhost:8000/
3. Or deploy it on GitHub Pages — see `docs/deploy.md`.

Try the demo brands with the dropdown, or with a URL:
`index.html?brand=food-beverage` (default, hero — 52 weeks)
`index.html?brand=health-beauty`
`index.html?brand=household`
`index.html?brand=pet`
`index.html?brand=baby`

## What's in here

- `index.html` — the dashboard (one executive page)
- `assets/css/style.css`, `assets/js/app.js` — plain CSS + vanilla JS, Chart.js via CDN
- `brands/<slug>/config.json` — brand name, category, channels, channel colours, products
- `brands/<slug>/data.json` — weekly data in the unified schema, product summary, exceptions, 4-week forecast, "what changed this week"
- `brands/index.json` — the list of demo brands shown in the switcher
- `docs/data-dictionary.md` — unified model, field + KPI definitions, channel mapping
- `docs/deploy.md` — GitHub Pages + local run
- `docs/customize.md` — how to plug in a real client's data

## How to add a new customer

That is the whole deployment model — copy a folder, edit two files, done:

```bash
cp -r brands/food-beverage brands/acme-foods
# edit brands/acme-foods/config.json  — brand name, category, channels, colours, products
# edit brands/acme-foods/data.json    — weekly rows in the same schema
# add {"slug": "acme-foods", "label": "Acme Foods"} to brands/index.json
```

No code changes. No new build. The dashboard reads config + data at load time.

Departments are **views, not folders**: Sales, Inventory & Supply Chain, and Finance (OTIF & Deductions) are tabs in the same dashboard, reading the same unified model. Do not create a folder per department — that would duplicate logic and drift.

## Sample data

Sample data in the Vantage framework — your data drops into the same framework. The demo brands are clearly sample brands (e.g. Golden Hour Snacks for Food & Beverage). No client names, testimonials, or specific client results are shown in this demo.

Demo data is plausible on purpose: seasonality, a promo lift, a stockout, and a deduction spike are built in, so the exceptions and forecast sections have something real to show.

## What Vantage is not

- Not a live portal connector. It does not log into Scintilla, Amazon, Target or distributor portals.
- Not a replacement for those licences. The client keeps their own portal access; Vantage is the consolidated view built on top of the exports.
- See `docs/customize.md` for what to include — and what never to include (portal credentials, licences, passwords).

## Deploy

See `docs/deploy.md`. GitHub Pages: push this folder to a repo, enable Pages from the main branch, done.
