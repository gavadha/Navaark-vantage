# Vantage data dictionary — unified model

One model for every channel, every brand. Map each source to this model first, then generate / load data to it. Never load each channel in its own format.

## Grain

**Store × item × Walmart week** for Walmart. For other channels, the equivalent is **channel × item × week**. Weekly rows in `data.json` are one row per channel per week; product rows are the product summary for the whole period.

## Fields — `weekly[]`

| Field | Type | Definition |
|---|---|---|
| `week` | int | 1..52, sequential in the brand's date range |
| `walmart_week` | string | e.g. `FY26-W32` — Walmart fiscal week label |
| `week_start` | date (ISO) | First day of that week |
| `channel` | string | Walmart, Amazon, Target, Whole Foods, Sprouts, DTC, Distributor |
| `sales` | $ | Net sales in that week, that channel |
| `prior_year_sales` | $ | Same week, prior year — for YoY |
| `units` | int | Units sold |
| `inventory_on_hand` | int | Units on hand at end of week |
| `in_stock_pct` | % | Share of expected facings / listings in stock |
| `velocity_upsw` | number | Units per store per week. For Walmart / Target: units ÷ stores carrying the item ÷ weeks. For Amazon / DTC (no stores): units per 100 orders, labelled as such in the dashboard — do not compare it directly to store velocity without that note |
| `weeks_of_supply` | number | Inventory on hand ÷ average weekly units |
| `otif_pct` | % | On-time, in-full orders ÷ all orders |
| `deductions` | $ | Deductions in that week, that channel |

## Fields — `products[]`

`sku`, `name`, `price`, `sales`, `units`, `variance_vs_plan_pct`, `velocity_upsw`, `in_stock_pct`, `weeks_of_supply`.

SKU / UPC / ASIN / TCIN: the product identifier differs by channel. Keep one canonical SKU in `config.json` / `products[]`, and map it per channel when loading real data:

- Walmart: UPC / item number (Scintilla / Retail Link)
- Amazon: ASIN (SP-API Business Reports)
- Target: TCIN (Partners Online)
- DTC / Shopify: SKU / variant SKU (orders export)
- Distributor: distributor item number

## Channel mapping — where the data comes from

### Walmart — Scintilla / Retail Link
Store Sales & Inventory Enhanced Report Builder. Grain store × item × Walmart week. This is the anchor — Geetha's `scintilla-data-automation` repo already documents this dimensional model. Fields include store, item hierarchy, velocity, inventory, receipts, returns, sales, vendor.

### Amazon — Selling Partner API, Business Reports / Sales and Traffic
Fields: (Parent) ASIN, (Child) ASIN, Title, Sessions, Page Views, Buy Box %, Units Ordered, Unit Session %, Ordered Product Sales, Total Order Items.

### Shopify / DTC — Orders export
Fields: Order number, Email, Financial Status, Fulfillment Status, Created At, Lineitem Name / SKU / Quantity / Price, Billing / Shipping, Discount Code, Shipping, Taxes, Total, Tags, Source. Products: Handle, Title, Vendor, Variant SKU / Price / Inventory Qty / Barcode / Cost.

### Target — Partners Online (portal-gated, partial)
Dataset `Aggdata.Day_Item_Loc_Sales_Inventory`: Date, Location, TCIN, Item Description, Barcode (UPC), Location State, Primary FDC/RDC, Store Market, Zip, Lat/Long; metrics Sales $ and Sales U. Also Greenfield / Vendor IQ for sales, inventory, in-stock.

### Distributors — UNFI / KeHE (myUNFI / KeHE CONNECT)
Movement (units / cases shipped by item / period), Inventory / ordering, Deductions / chargebacks, Authorizations.

> **Critical distinction: distributor movement = shipments out of the distributor, NOT register sales.** Never mix distributor shipments with Walmart / Target sell-through in the same total without labelling it. In the dashboard, Distributor is a separate channel for exactly this reason.

## KPI definitions

- **Total sales $** — net sales in the period, by channel, in the brand currency.
- **Units** — units sold in the period.
- **Velocity (units/store/week)** — see above.
- **Weeks of supply** — inventory on hand ÷ average weekly units. Below 2 weeks = stockout risk in this demo.
- **In-stock %** — share of expected facings / listings in stock.
- **OTIF %** — on-time, in-full.
- **Deductions $ / % of sales** — deductions in the period, by reason where available (shortage, compliance, damaged / returns).

## Forecast

Demo forecast: last 4-week average × seasonal trend × growth, per channel, next 4 weeks. Labelled as a forecast from the sample trend, not a guarantee. With real client data, use the same unified model plus the client's seasonality, promo calendar and inventory position.
