# Deploy Vantage — no build

## Local

```bash
cd navaark-vantage
python3 -m http.server 8000
# open http://localhost:8000/
```

Do not just double-click `index.html`: browsers block `fetch()` for the JSON files when opened with `file://`. Any static server works — `python3 -m http.server`, `npx serve`, VS Code Live Server, etc.

## GitHub Pages

1. Create a repo (e.g. `navaark-vantage`), push this folder to the `main` branch.
2. In the repo: Settings → Pages → Source: Deploy from a branch → Branch: `main`, Folder: `/ (root)`.
3. Wait a minute, open the Pages URL. The dashboard loads at `/` and brand URLs work as `?brand=food-beverage`.

No build step, no Actions workflow needed. Plain HTML + CSS + JS + JSON.

## Download / ZIP

A customer can download the repo as a ZIP, unzip, and run the local server above. No install, no login, no API keys.

## What to check after deploy

- The brand switcher lists all 5 demo brands.
- The trend chart renders (Chart.js CDN must be reachable — if the customer is offline, the chart will not render; the tables and KPIs still will).
- `?brand=health-beauty` etc. load without a console error.
