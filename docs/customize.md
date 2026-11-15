# Add a customer — plug real data into Vantage

## The 3-step onboarding

1. Copy a demo brand folder that is closest to the customer's category:
   ```bash
   cp -r brands/food-beverage brands/acme-foods
   ```
2. Edit `brands/acme-foods/config.json`:
   - `brand_name`, `display_name`, `category`, `tagline`
   - `channels` — only the channels the customer actually sells in, with their colours (keep the standard colours: Walmart navy `#0071ce`, Amazon orange `#ff9900`, Target red `#cc0000`, DTC teal `#0e7c7b`, Distributor grey `#6b7280`)
   - `products` — the customer's SKUs, names and prices
   - `date_range`, `data_as_of`
3. Edit `brands/acme-foods/data.json` — replace the sample rows with the customer's data, in the **same schema**. See `docs/data-dictionary.md` for every field.
4. Add the brand to `brands/index.json`:
   ```json
   {"slug": "acme-foods", "label": "Acme Foods"}
   ```

No code changes. Test with `?brand=acme-foods`.

## What to include

- Weekly sales / units / inventory by channel, mapped to the unified model
- Product list with SKU / UPC / ASIN / TCIN mapping
- OTIF and deductions by channel, with reason where available
- The customer's promo calendar, if the forecast should reflect it

## What NOT to include

- **Never** put portal credentials, passwords, API keys, tokens, or licences in this repo — not in config, data, docs, or git history. Vantage reads exports, it does not log into portals.
- Do not include Scintilla / NIQ / Circana licences — the client keeps those; Vantage is the view built on top of their exports.
- Do not include real client names, testimonials, or specific client results in the demo folders. Keep demo data clearly sample, and keep real client data in that client's own folder / repo.
- Do not invent results. If a KPI is not available for a channel, leave it out or show it as not available — do not fill it with a plausible-looking guess.

## Scaling

- One folder per customer / brand. One codebase. If a customer needs a new channel, add it to that brand's `config.json` — the dashboard, scorecard and chart read the channel list from config.
- Departments are views (Sales / Inventory & Supply Chain / Finance tabs), not folders. Do not duplicate the dashboard per department.
- If a brand grows past ~52 weeks × 5 channels × 20 SKUs in `data.json`, split the weekly file by year (`data-2025.json`, `data-2026.json`) and load the latest year by default — the schema stays the same.
