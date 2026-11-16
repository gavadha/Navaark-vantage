#!/usr/bin/env python3
"""Generate store-level drill-down data for the Vantage demo brands.

Reads each brand's brands/<slug>/data.json, derives store and per-channel
product data from the EXISTING weekly totals (so every number reconciles),
and writes back two new keys: `stores` and `channel_products`.

  stores: one row per sample store (Walmart and Target only). Store sales
    sum to the channel's total sales from the weekly rows, to the dollar
    (sales are whole dollars, so the numbers shown add up exactly).
    Store units sum to the channel's total units. Each store carries its
    top 3 SKUs, allocated from its own sales.
  channel_products: for every channel, the brand's SKUs ranked by sales,
    allocated from the channel total by each SKU's overall share.

Deterministic: the same seed always produces the same file, so re-running
this script reproduces the data exactly. It never changes any existing key.

Usage:  python3 tools/generate-stores.py
"""
import json
import random
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

WALMART_CITIES = [
    ("Rogers", "AR"), ("Bentonville", "AR"), ("Springdale", "AR"),
    ("Fayetteville", "AR"), ("Dallas", "TX"), ("Houston", "TX"),
    ("Atlanta", "GA"), ("Chicago", "IL"), ("Phoenix", "AZ"),
    ("Tampa", "FL"), ("Denver", "CO"), ("Minneapolis", "MN"),
]
TARGET_CITIES = [
    ("Minneapolis", "MN"), ("Dallas", "TX"), ("Chicago", "IL"),
    ("Atlanta", "GA"), ("Houston", "TX"), ("Phoenix", "AZ"),
    ("Tampa", "FL"), ("Denver", "CO"),
]
STORE_COUNTS = {"Walmart": 10, "Target": 8}          # hero brand
STORE_COUNTS_SMALL = {"Walmart": 8, "Target": 6}     # 26-week brands
STORE_CHANNELS = ["Walmart", "Target"]


def largest_remainder(total, weights):
    """Split integer `total` by `weights` (which sum to 1) so the parts sum
    exactly to `total`. Largest-remainder method."""
    raw = [total * w for w in weights]
    parts = [int(x) for x in raw]
    leftover = total - sum(parts)
    order = sorted(range(len(weights)), key=lambda i: (raw[i] - parts[i]), reverse=True)
    for i in order[:leftover]:
        parts[i] += 1
    return parts


def channel_stats(weekly, channel):
    rows = [r for r in weekly if r["channel"] == channel]
    n = len(rows)
    return {
        "sales": int(round(sum(r["sales"] for r in rows))),
        "units": int(round(sum(r["units"] for r in rows))),
        "velocity": sum(r["velocity_upsw"] for r in rows) / n,
        "in_stock": sum(r["in_stock_pct"] for r in rows) / n,
        "wos": sum(r["weeks_of_supply"] for r in rows) / n,
    }


def gen_stores(brand, data, rng):
    products = data["products"]
    counts = STORE_COUNTS if len({r["week"] for r in data["weekly"]}) > 30 else STORE_COUNTS_SMALL
    stores = []
    for channel in STORE_CHANNELS:
        if channel not in {r["channel"] for r in data["weekly"]}:
            continue
        stats = channel_stats(data["weekly"], channel)
        cities = WALMART_CITIES if channel == "Walmart" else TARGET_CITIES
        offset = rng.randrange(len(cities))
        picked = [cities[(offset + i) % len(cities)] for i in range(counts[channel])]
        prefix = "WM" if channel == "Walmart" else "TG"
        kind = "Walmart Supercenter" if channel == "Walmart" else "Target"
        weights = [rng.uniform(0.5, 1.5) for _ in picked]
        wsum = sum(weights)
        weights = [w / wsum for w in weights]
        # Units get their own weights, so a store's sales rank and units
        # rank are not identical (different stores sell a different mix).
        uweights = [rng.uniform(0.5, 1.5) for _ in picked]
        usum = sum(uweights)
        uweights = [w / usum for w in uweights]
        sales_parts = largest_remainder(stats["sales"], weights)
        units_parts = largest_remainder(stats["units"], uweights)
        sku_sales_share = [p["sales"] for p in products]
        ssum = sum(sku_sales_share)
        sku_sales_share = [s / ssum for s in sku_sales_share]
        sku_units_share = [p["units"] for p in products]
        usum = sum(sku_units_share)
        sku_units_share = [u / usum for u in sku_units_share]
        for i, (city, state) in enumerate(picked):
            # Per-store SKU mix: overall share, jittered, so stores differ.
            sw = [s * rng.uniform(0.7, 1.3) for s in sku_sales_share]
            sw = [s / sum(sw) for s in sw]
            uw = [s * rng.uniform(0.7, 1.3) for s in sku_units_share]
            uw = [s / sum(uw) for s in uw]
            sku_sales = largest_remainder(sales_parts[i], sw)
            sku_units = largest_remainder(units_parts[i], uw)
            ranked = sorted(range(len(products)), key=lambda j: sku_sales[j], reverse=True)
            top = [{
                "sku": products[j]["sku"],
                "product": products[j]["name"],
                "sales": sku_sales[j],
                "units": sku_units[j],
            } for j in ranked[:3]]
            stores.append({
                "id": "%s-%03d" % (prefix, i + 1),
                "name": "%s - %s, %s" % (kind, city, state),
                "city": city,
                "state": state,
                "channel": channel,
                "sales": sales_parts[i],
                "units": units_parts[i],
                "in_stock_pct": round(max(78.0, min(99.0, stats["in_stock"] + rng.uniform(-6, 2))), 1),
                "velocity_upsw": round(max(0.1, stats["velocity"] * rng.uniform(0.6, 1.6)), 1),
                "weeks_of_supply": round(max(0.8, min(5.0, stats["wos"] + rng.uniform(-1.2, 1.2))), 1),
                "top_skus": top,
            })
    return stores


def gen_channel_products(data):
    products = data["products"]
    sku_sales_share = [p["sales"] for p in products]
    ssum = sum(sku_sales_share)
    sku_sales_share = [s / ssum for s in sku_sales_share]
    sku_units_share = [p["units"] for p in products]
    usum = sum(sku_units_share)
    sku_units_share = [u / usum for u in sku_units_share]
    out = []
    for channel in sorted({r["channel"] for r in data["weekly"]}):
        stats = channel_stats(data["weekly"], channel)
        sales_parts = largest_remainder(stats["sales"], sku_sales_share)
        units_parts = largest_remainder(stats["units"], sku_units_share)
        rows = [{
            "sku": p["sku"],
            "product": p["name"],
            "sales": sales_parts[i],
            "units": units_parts[i],
        } for i, p in enumerate(products)]
        rows.sort(key=lambda r: r["sales"], reverse=True)
        out.append({"channel": channel, "products": rows})
    return out


def main():
    index = json.load(open(os.path.join(ROOT, "brands", "index.json")))
    for b in index["brands"]:
        slug = b["slug"]
        path = os.path.join(ROOT, "brands", slug, "data.json")
        data = json.load(open(path))
        rng = random.Random("vantage-stores-" + slug)
        stores = gen_stores(slug, data, rng)
        channel_products = gen_channel_products(data)
        data["stores"] = stores
        data["channel_products"] = channel_products
        json.dump(data, open(path, "w"), indent=2)
        print("== %s: %d stores, %d channel product lists" % (slug, len(stores), len(channel_products)))
        for channel in sorted({r["channel"] for r in data["weekly"]}):
            stats = channel_stats(data["weekly"], channel)
            ss = sum(s["sales"] for s in stores if s["channel"] == channel)
            su = sum(s["units"] for s in stores if s["channel"] == channel)
            cp = [c for c in channel_products if c["channel"] == channel][0]
            cps = sum(p["sales"] for p in cp["products"])
            cpu = sum(p["units"] for p in cp["products"])
            print("   %-12s channel sales $%s units %s | stores sum $%s units %d (diff $%d) | "
                  "channel_products sum $%s units %d (diff $%d)" % (
                      channel, f"{stats['sales']:,}", f"{stats['units']:,}",
                      f"{ss:,}", su, ss - stats["sales"], f"{cps:,}", cpu, cps - stats["sales"]))
            # hard check: exact to the dollar
            assert ss == stats["sales"] or channel not in STORE_CHANNELS, channel
            assert cps == stats["sales"], channel


if __name__ == "__main__":
    main()
