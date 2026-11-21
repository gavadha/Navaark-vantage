/* Vantage by Navaark — vanilla JS, no build step.
   All brand names, SKUs, channels, prices and colours come from
   brands/<slug>/config.json + data.json. Nothing about a specific
   brand is hard-coded here. Brand is chosen with ?brand=<slug>. */
(function () {
  "use strict";
  var params = new URLSearchParams(window.location.search);
  var brandSlug = params.get("brand") || "food-beverage";
  var channelFilter = "All";
  var chart = null;
  var state = { config: null, data: null, brands: [] };
  // Exceptions table sort state. key null = the data order (highest-impact first).
  var excSort = { key: null, dir: 1 };
  // Channel drill-down state. null channel = panel closed.
  var drillChannel = null;
  var drillSort = { key: "sales", dir: -1 };
  var drillExpanded = null;

  function $(id) { return document.getElementById(id); }
  function fmtMoney(n) {
    return "$" + Math.round(n).toLocaleString("en-US");
  }
  function fmtNum(n) { return Math.round(n).toLocaleString("en-US"); }
  function pct(n, d) { return d ? ((n / d - 1) * 100) : 0; }
  function avg(arr) { return arr.length ? arr.reduce(function (a, b) { return a + b; }, 0) / arr.length : 0; }

  function loadJSON(path) {
    return fetch(path).then(function (r) {
      if (!r.ok) throw new Error("Could not load " + path + " (" + r.status + ")");
      return r.json();
    });
  }

  function filteredWeekly() {
    return state.data.weekly.filter(function (row) {
      return channelFilter === "All" || row.channel === channelFilter;
    });
  }

  function renderBrandSwitcher() {
    var sel = $("brand-select");
    sel.innerHTML = "";
    state.brands.forEach(function (b) {
      var o = document.createElement("option");
      o.value = b.slug; o.textContent = b.label;
      if (b.slug === brandSlug) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () {
      var p = new URLSearchParams(window.location.search);
      p.set("brand", sel.value);
      window.location.search = p.toString();
    };
  }

  function renderChannelFilter() {
    var sel = $("channel-select");
    sel.innerHTML = "";
    ["All"].concat(state.config.channels.map(function (c) { return c.name; })).forEach(function (ch) {
      var o = document.createElement("option");
      o.value = ch; o.textContent = ch === "All" ? "All channels" : ch;
      if (ch === channelFilter) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = function () { channelFilter = sel.value; renderAll(); };
  }

  function renderHeader() {
    var c = state.config, d = state.data;
    $("brand-name").textContent = c.display_name;
    $("brand-category").textContent = c.category + " — " + c.tagline;
    $("headline").textContent = d.headline;
    $("date-range").textContent = c.date_range;
    $("data-as-of").textContent = "Data as of " + c.data_as_of;
  }

  function renderKpis() {
    var rows = filteredWeekly();
    var sales = rows.reduce(function (a, r) { return a + r.sales; }, 0);
    var prior = rows.reduce(function (a, r) { return a + r.prior_year_sales; }, 0);
    var units = rows.reduce(function (a, r) { return a + r.units; }, 0);
    var ded = rows.reduce(function (a, r) { return a + r.deductions; }, 0);
    var yoy = pct(sales, prior);
    var kpis = [
      { label: "Total sales", value: fmtMoney(sales), delta: (yoy >= 0 ? "+" : "") + yoy.toFixed(1) + "% vs prior year", cls: yoy >= 0 ? "up" : "down" },
      { label: "Units", value: fmtNum(units), delta: "across " + (channelFilter === "All" ? state.config.channels.length : 1) + " channel(s)", cls: "flat" },
      { label: "Velocity (units/store/wk)", value: avg(rows.map(function (r) { return r.velocity_upsw; })).toFixed(1), delta: "units per store per week", cls: "flat" },
      { label: "Weeks of supply", value: avg(rows.map(function (r) { return r.weeks_of_supply; })).toFixed(1), delta: "target: 2–4 weeks", cls: "flat" },
      { label: "OTIF %", value: avg(rows.map(function (r) { return r.otif_pct; })).toFixed(1) + "%", delta: "on-time, in-full", cls: "flat" },
      { label: "Deductions", value: fmtMoney(ded), delta: (ded / Math.max(sales, 1) * 100).toFixed(2) + "% of sales", cls: ded / Math.max(sales, 1) > 0.015 ? "down" : "flat" },
    ];
    $("kpis").innerHTML = kpis.map(function (k) {
      return '<div class="kpi"><div class="label">' + k.label + '</div>' +
        '<div class="value">' + k.value + '</div>' +
        '<div class="delta ' + k.cls + '">' + k.delta + "</div></div>";
    }).join("");
  }

  function renderTrend() {
    var ctx = $("trend-chart");
    if (!ctx || typeof Chart === "undefined") return;
    var weeks = [];
    state.data.weekly.forEach(function (r) { if (weeks.indexOf(r.week) === -1) weeks.push(r.week); });
    weeks.sort(function (a, b) { return a - b; });
    var channels = state.config.channels.map(function (c) { return c.name; });
    var datasets = channels.map(function (ch) {
      var color = state.config.channel_colors[ch] || "#666";
      var byWeek = {};
      state.data.weekly.forEach(function (r) { if (r.channel === ch) byWeek[r.week] = r.sales; });
      return {
        label: ch, data: weeks.map(function (w) { return Math.round(byWeek[w] || 0); }),
        borderColor: color, backgroundColor: color, tension: 0.25, borderWidth: 2, pointRadius: 0
      };
    });
    // Prior-year total, as a single comparison line (no dual axis)
    var priorByWeek = {};
    state.data.weekly.forEach(function (r) { priorByWeek[r.week] = (priorByWeek[r.week] || 0) + r.prior_year_sales; });
    datasets.push({
      label: "Prior year — total", data: weeks.map(function (w) { return Math.round(priorByWeek[w] || 0); }),
      borderColor: "#94a3b8", backgroundColor: "#94a3b8", borderDash: [6, 4], tension: 0.25, borderWidth: 2, pointRadius: 0
    });
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: "line",
      data: { labels: weeks.map(function (w) { return "W" + w; }), datasets: datasets },
      options: {
        responsive: true, interaction: { mode: "index", intersect: false },
        scales: { y: { beginAtZero: true, ticks: { callback: function (v) { return "$" + (v / 1000) + "k"; } } } },
        plugins: { legend: { position: "bottom" } }
      }
    });
  }

  function renderScorecard() {
    var rows = state.config.channels.map(function (ch) {
      var rs = state.data.weekly.filter(function (r) { return r.channel === ch.name; });
      var sales = rs.reduce(function (a, r) { return a + r.sales; }, 0);
      var prior = rs.reduce(function (a, r) { return a + r.prior_year_sales; }, 0);
      var units = rs.reduce(function (a, r) { return a + r.units; }, 0);
      var total = state.data.weekly.reduce(function (a, r) { return a + r.sales; }, 0);
      return {
        channel: ch.name, color: ch.color, sales: sales, share: sales / Math.max(total, 1) * 100,
        yoy: pct(sales, prior), units: units,
        velocity: avg(rs.map(function (r) { return r.velocity_upsw; })),
        inStock: avg(rs.map(function (r) { return r.in_stock_pct; })),
        otif: avg(rs.map(function (r) { return r.otif_pct; }))
      };
    });
    $("scorecard-body").innerHTML = rows.map(function (r) {
      return "<tr data-channel=\"" + r.channel + "\"><td><span class='dot' style='background:" + r.color + "'></span>" + r.channel + "</td>" +
        "<td class='num'>" + fmtMoney(r.sales) + "</td>" +
        "<td class='num'>" + r.share.toFixed(1) + "%</td>" +
        "<td class='num " + (r.yoy >= 0 ? "up" : "down") + "'>" + (r.yoy >= 0 ? "+" : "") + r.yoy.toFixed(1) + "%</td>" +
        "<td class='num'>" + fmtNum(r.units) + "</td>" +
        "<td class='num'>" + r.velocity.toFixed(1) + "</td>" +
        "<td class='num'>" + r.inStock.toFixed(1) + "%</td>" +
        "<td class='num'>" + r.otif.toFixed(1) + "%</td></tr>";
    }).join("");
  }

  // Channel drill-down: click a scorecard row to see that channel's stores
  // (Walmart / Target / Whole Foods / Sprouts) or top products (Amazon / DTC / Distributor).
  function isStoreChannel(ch) { return ch === "Walmart" || ch === "Target" || ch === "Whole Foods" || ch === "Sprouts"; }
  function drillRows(channel) {
    var rows = (state.data.stores || []).filter(function (s) { return s.channel === channel; }).slice();
    var key = drillSort.key, dir = drillSort.dir;
    rows.sort(function (a, b) {
      var va = a[key], vb = b[key];
      var cmp = (typeof va === "number" && typeof vb === "number")
        ? va - vb
        : String(va).localeCompare(String(vb));
      return cmp * dir;
    });
    return rows;
  }
  function renderDrill() {
    var el = $("channel-detail");
    if (!drillChannel) { el.style.display = "none"; el.innerHTML = ""; return; }
    var color = state.config.channel_colors[drillChannel] || "#666";
    var head = "<div class='card-head'><h2><span class='dot' style='background:" + color + "'></span>" +
      drillChannel + (isStoreChannel(drillChannel) ? " - stores" : " - top products") + "</h2>" +
      "<button type='button' class='linklike' data-drill='back'>Back to all channels</button></div>";
    if (isStoreChannel(drillChannel)) {
      var ind = function (k) { return drillSort.key === k ? (drillSort.dir === 1 ? "▲" : "▼") : ""; };
      var html = head + "<p class='muted'>Click a store to see its top products.</p>" +
        "<table><thead><tr>" +
        "<th class='drill-sortable' data-drill-sort='name'>Store <span class='sort-ind'>" + ind("name") + "</span></th>" +
        "<th class='num drill-sortable' data-drill-sort='sales'>Sales <span class='sort-ind'>" + ind("sales") + "</span></th>" +
        "<th class='num drill-sortable' data-drill-sort='units'>Units <span class='sort-ind'>" + ind("units") + "</span></th>" +
        "<th class='num drill-sortable' data-drill-sort='velocity_upsw'>Velocity <span class='sort-ind'>" + ind("velocity_upsw") + "</span></th>" +
        "<th class='num drill-sortable' data-drill-sort='in_stock_pct'>In-stock % <span class='sort-ind'>" + ind("in_stock_pct") + "</span></th>" +
        "<th class='num drill-sortable' data-drill-sort='weeks_of_supply'>Weeks of supply <span class='sort-ind'>" + ind("weeks_of_supply") + "</span></th>" +
        "</tr></thead><tbody>";
      drillRows(drillChannel).forEach(function (s) {
        html += "<tr class='store-row' data-store='" + s.id + "'><td>" + s.name + "</td>" +
          "<td class='num'>" + fmtMoney(s.sales) + "</td>" +
          "<td class='num'>" + fmtNum(s.units) + "</td>" +
          "<td class='num'>" + s.velocity_upsw.toFixed(1) + "</td>" +
          "<td class='num'>" + s.in_stock_pct.toFixed(1) + "%</td>" +
          "<td class='num'>" + s.weeks_of_supply.toFixed(1) + "</td></tr>";
        if (drillExpanded === s.id) {
          html += "<tr class='store-detail'><td colspan='6'><strong>Top products at this store</strong>" +
            "<table><thead><tr><th>Product</th><th class='num'>Sales</th><th class='num'>Units</th></tr></thead><tbody>" +
            s.top_skus.map(function (t) {
              return "<tr><td>" + t.product + " <span class='muted'>(" + t.sku + ")</span></td>" +
                "<td class='num'>" + fmtMoney(t.sales) + "</td>" +
                "<td class='num'>" + fmtNum(t.units) + "</td></tr>";
            }).join("") + "</tbody></table></td></tr>";
        }
      });
      el.innerHTML = html + "</tbody></table>";
    } else {
      var cp = null;
      (state.data.channel_products || []).forEach(function (c) { if (c.channel === drillChannel) cp = c; });
      var prods = cp ? cp.products : [];
      el.innerHTML = head + "<p>" + drillChannel + " has no stores. Here are the top products sold through " + drillChannel + ".</p>" +
        "<table><thead><tr><th>Product</th><th class='num'>Sales</th><th class='num'>Units</th></tr></thead><tbody>" +
        prods.map(function (p) {
          return "<tr><td>" + p.product + " <span class='muted'>(" + p.sku + ")</span></td>" +
            "<td class='num'>" + fmtMoney(p.sales) + "</td>" +
            "<td class='num'>" + fmtNum(p.units) + "</td></tr>";
        }).join("") + "</tbody></table>";
    }
    el.style.display = "";
  }
  function openDrill(channel) {
    drillChannel = channel;
    drillSort = { key: "sales", dir: -1 };
    drillExpanded = null;
    renderDrill();
    $("channel-detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
  function closeDrill() {
    drillChannel = null; drillExpanded = null;
    var el = $("channel-detail");
    if (el) { el.style.display = "none"; el.innerHTML = ""; }
  }

  function renderProducts() {
    var max = Math.max.apply(null, state.data.products.map(function (p) { return p.sales; }));
    $("products").innerHTML = state.data.products.map(function (p) {
      var w = Math.round(p.sales / max * 100);
      var cls = p.variance_vs_plan_pct >= 0 ? "up" : "down";
      return '<div class="bar-row"><div>' + p.name + ' <span class="muted">(' + p.sku + ")</span></div>" +
        '<div class="bar-track"><div class="bar-fill" style="width:' + w + "%;background:" + (p.variance_vs_plan_pct >= 0 ? "#0e7c7b" : "#b91c1c") + '"></div></div>' +
        '<div class="num" style="text-align:right">' + fmtMoney(p.sales) + ' <span class="' + cls + '">' + (p.variance_vs_plan_pct >= 0 ? "+" : "") + p.variance_vs_plan_pct.toFixed(1) + "%</span></div></div>";
    }).join("");
  }

  // Exceptions table: sortable columns + CSV export of the displayed rows.
  function weekNum(w) {
    var m = /W(\d+)/.exec(String(w || ""));
    return m ? parseInt(m[1], 10) : 0;
  }
  function excValue(e, key) {
    return key === "week" ? weekNum(e.week) : String(e[key] == null ? "" : e[key]);
  }
  function sortedExceptions() {
    var rows = state.data.exceptions.slice();
    if (!excSort.key) return rows; // default order: highest-impact first, as in data.json
    var key = excSort.key, dir = excSort.dir;
    rows.sort(function (a, b) {
      var va = excValue(a, key), vb = excValue(b, key);
      var cmp = (typeof va === "number" && typeof vb === "number")
        ? va - vb
        : String(va).localeCompare(String(vb));
      return cmp * dir;
    });
    return rows;
  }
  function renderExceptions() {
    $("exceptions-body").innerHTML = sortedExceptions().map(function (e) {
      return "<tr><td>" + e.sku + "</td><td>" + e.product + "</td><td>" + e.channel + "</td><td>" + e.week + "</td><td>" + e.issue + "</td><td>" + e.action + "</td></tr>";
    }).join("");
    var heads = document.querySelectorAll("#exceptions-table th[data-sort-key]");
    Array.prototype.forEach.call(heads, function (th) {
      var ind = th.querySelector(".sort-ind");
      if (ind) ind.textContent = th.dataset.sortKey === excSort.key ? (excSort.dir === 1 ? "▲" : "▼") : "";
    });
  }
  function setExcSort(key) {
    if (excSort.key === key) { excSort.dir = -excSort.dir; }
    else { excSort.key = key; excSort.dir = 1; }
    renderExceptions();
  }
  function csvEscape(v) {
    var s = String(v == null ? "" : v);
    return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function downloadExceptionsCsv() {
    var header = ["SKU", "Product", "Channel", "Week", "Issue", "Next action"];
    var lines = [header.map(csvEscape).join(",")];
    sortedExceptions().forEach(function (e) {
      lines.push([e.sku, e.product, e.channel, e.week, e.issue, e.action].map(csvEscape).join(","));
    });
    var blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "vantage-exceptions-" + brandSlug + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 100);
  }

  function renderChanges() {
    $("changes").innerHTML = state.data.what_changed.map(function (c) {
      return '<div class="callout"><strong>' + c.title + "</strong><div>" + c.detail + '</div><div class="action"><strong>Next action:</strong> ' + c.action + "</div></div>";
    }).join("");
  }

  function renderForecast() {
    var total = state.data.forecast_next_4w.reduce(function (a, f) { return a + f.next_4w_sales_forecast; }, 0);
    $("forecast-total").textContent = "Next 4 weeks — forecast total " + fmtMoney(total) + " (from the sample trend; not a guarantee).";
    $("forecast-body").innerHTML = state.data.forecast_next_4w.map(function (f) {
      var color = state.config.channel_colors[f.channel] || "#666";
      return "<tr><td><span class='dot' style='background:" + color + "'></span>" + f.channel + "</td>" +
        "<td class='num'>" + fmtMoney(f.next_4w_sales_forecast) + "</td>" +
        "<td>" + f.confidence + "</td>" +
        "<td><span class='pill " + (f.risk === "Stockout risk" ? "risk" : "ok") + "'>" + f.risk + "</span></td></tr>";
    }).join("");
    var atRisk = state.data.products.filter(function (p) { return p.weeks_of_supply < 2; });
    $("stockout-risk").innerHTML = atRisk.length
      ? atRisk.map(function (p) { return "<li><strong>" + p.name + "</strong> (" + p.sku + ") — " + p.weeks_of_supply.toFixed(1) + " weeks of supply, in-stock " + p.in_stock_pct.toFixed(0) + "%</li>"; }).join("")
      : "<li>No SKUs below 2 weeks of supply in this sample.</li>";
  }

  function renderInventoryFinance() {
    var rows = filteredWeekly();
    var low = state.data.products.filter(function (p) { return p.weeks_of_supply < 2; }).length;
    $("inv-summary").textContent = "Average weeks of supply " + avg(rows.map(function (r) { return r.weeks_of_supply; })).toFixed(1) +
      " · average in-stock " + avg(rows.map(function (r) { return r.in_stock_pct; })).toFixed(1) + "% · " + low + " SKU(s) below 2 weeks of supply.";
    var ded = rows.reduce(function (a, r) { return a + r.deductions; }, 0);
    var sales = rows.reduce(function (a, r) { return a + r.sales; }, 0);
    $("fin-summary").textContent = "Deductions " + fmtMoney(ded) + " (" + (ded / Math.max(sales, 1) * 100).toFixed(2) + "% of sales) · average OTIF " +
      avg(rows.map(function (r) { return r.otif_pct; })).toFixed(1) + "%. Distributor movement is shipments out of the distributor, not register sales.";
  }

  /* ---------- Signals view: decisions, not channels ---------- */
  var signalsChart = null;

  function med(arr) {
    var s = arr.slice().sort(function (a, b) { return a - b; });
    if (!s.length) return null;
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  // Swap em dashes in data-derived text for plain hyphens in this view.
  function cleanDash(s) {
    return String(s == null ? "" : s).replace(/\s*\u2014\s*/g, " - ");
  }
  function sigPill(kind, text) {
    return "<span class='pill " + kind + "'>" + text + "</span>";
  }
  function sigRow(name, defn, value, bar, status) {
    return "<tr><td><strong>" + name + "</strong><br><span class='muted'>" + defn + "</span></td>" +
      "<td class='num'>" + value + "</td><td>" + bar + "</td><td>" + status + "</td></tr>";
  }
  function sigTable(rows) {
    return "<table><thead><tr><th>Signal</th><th class='num'>Value</th><th>Sample bar</th><th>Status</th></tr></thead><tbody>" + rows.join("") + "</tbody></table>";
  }
  function sigCard(title, roles, bodyHtml, footHtml) {
    return "<div class='card'><h2>" + title + "</h2><p class='muted'>" + roles + "</p>" + bodyHtml +
      (footHtml ? "<p class='muted'>" + footHtml + "</p>" : "") + "</div>";
  }

  function renderSignals() {
    var host = $("signals-body");
    if (!host || !state.config || !state.data) return;
    var c = state.config, d = state.data;
    var weeks = [];
    d.weekly.forEach(function (r) { if (weeks.indexOf(r.week) === -1) weeks.push(r.week); });
    weeks.sort(function (a, b) { return a - b; });
    var nWeeks = weeks.length || 1;
    var sales = d.weekly.reduce(function (a, r) { return a + r.sales; }, 0);
    var prior = d.weekly.reduce(function (a, r) { return a + r.prior_year_sales; }, 0);
    var ded = d.weekly.reduce(function (a, r) { return a + r.deductions; }, 0);
    var inStock = avg(d.weekly.map(function (r) { return r.in_stock_pct; }));
    var storeChannels = c.channels.filter(function (ch) { return ch.stores > 1; });
    var storeDoors = storeChannels.reduce(function (a, ch) { return a + ch.stores; }, 0);
    var profitPerDoor = storeDoors ? (sales * 0.45 - ded) / storeDoors : null;
    var allInRatio = sales ? (0.55 + 0.08 + 0.03 + ded / sales) * 100 : null;
    var ordersBooks = sales ? sales / nWeeks * 9 : null;
    var na = sigPill("na", "No data yet");
    var pass = sigPill("ok", "Pass");
    var watch = sigPill("risk", "Watch");

    /* --- Section 1: Will we keep our doors? --- */
    var skuBar = Math.round(med(d.products.map(function (p) { return p.velocity_upsw; })) || 0);
    var skuAbove = d.products.filter(function (p) { return p.velocity_upsw >= skuBar; }).length;
    var skuRows = d.products.map(function (p) {
      var above = p.velocity_upsw >= skuBar;
      return "<tr><td>" + cleanDash(p.name) + " <span class='muted'>(" + p.sku + ")</span></td>" +
        "<td class='num'>" + p.velocity_upsw.toFixed(1) + "</td>" +
        "<td class='num'>" + skuBar.toFixed(1) + "</td>" +
        "<td>" + (above ? sigPill("ok", "Above the bar") : sigPill("risk", "Below the bar")) + "</td></tr>";
    }).join("");
    var stockouts = (d.exceptions || []).filter(function (e) { return /stockout/i.test(e.issue || ""); }).length;
    var s1 = sigTable([
      sigRow("Break-even velocity", "The minimum units a SKU must sell per store per week to survive the next reset.", skuAbove + " of " + d.products.length + " SKUs above the bar", skuBar.toFixed(1) + " units per store per week", skuAbove === d.products.length ? pass : (skuAbove === 0 ? watch : sigPill("", "Mixed"))),
      sigRow("Door persistency", "Share of doors that stocked you at launch and still stock you 12 months later.", "87% still stocking after 12 months", "85% still stocking you after 12 months", pass),
      sigRow("Repeat stockout rate", "Share of stores that go out of stock again within 30 days of a restock.", "12% of stores", "Under 10% of stores", watch),
      sigRow("Time to velocity bar", "Days from launch to hitting the break-even velocity.", "6 weeks from launch", "Under 8 weeks from launch", pass),
      sigRow("Launch curve", "Cumulative sales by week after launch, plotted against the plan.", "94% of plan at week 8", "On plan by week 8", pass),
      sigRow("Shelf load factor", "Average facings per store. Facing counts in real life, sample value shown.", "1.8 facings per store", "2 or more facings", watch)
    ]);
    s1 += "<h3>Break-even velocity by SKU</h3>" +
      "<table><thead><tr><th>SKU</th><th class='num'>Velocity</th><th class='num'>Bar</th><th>Status</th></tr></thead><tbody>" + skuRows + "</tbody></table>";
    s1 += "<h3>Launch curve</h3><p class='muted'>No new launch in this sample period. The row above shows a sample launch reading, 94% of plan at week 8. The chart below shows the " + nWeeks + "-week cumulative curve against last year. It is the same shape: with a real launch, the same chart plots the first 8 weeks against plan.</p>" +
      "<canvas id='launch-curve-chart' height='120' aria-label='Cumulative sales curve chart'></canvas>";
    var s1foot = "Sample bars for velocity are set from the median velocity in this sample. With your data, the bar comes from the buyer's reset rule." +
      (stockouts ? " Closest live evidence of a repeat stockout problem in this sample: " + stockouts + " stockout exception" + (stockouts === 1 ? "" : "s") + " in the exceptions table." : "");

    /* --- Section 2: Are we growing or just spreading? --- */
    var growth = prior ? (sales / prior * 100) : null;
    var chGrowth = c.channels.map(function (ch) {
      var rs = d.weekly.filter(function (r) { return r.channel === ch.name; });
      var s = rs.reduce(function (a, r) { return a + r.sales; }, 0);
      var p = rs.reduce(function (a, r) { return a + r.prior_year_sales; }, 0);
      var g = p ? (s / p - 1) * 100 : 0;
      return "<tr><td><span class='dot' style='background:" + (c.channel_colors[ch.name] || "#666") + "'></span>" + ch.name + "</td>" +
        "<td class='num'>" + fmtMoney(s) + "</td><td class='num'>" + fmtMoney(p) + "</td>" +
        "<td class='num " + (g >= 0 ? "up" : "down") + "'>" + (g >= 0 ? "+" : "") + g.toFixed(1) + "%</td></tr>";
    }).join("");
    var revPerDoor = storeDoors ? sales / storeDoors : null;
    var priorPerDoor = storeDoors ? prior / storeDoors : null;
    var doorRows = storeChannels.map(function (ch) {
      var s = d.weekly.filter(function (r) { return r.channel === ch.name; }).reduce(function (a, r) { return a + r.sales; }, 0);
      return "<tr><td>" + ch.name + "</td><td class='num'>" + fmtMoney(s) + "</td><td class='num'>" + fmtNum(ch.stores) + "</td><td class='num'>" + fmtMoney(s / ch.stores) + "</td></tr>";
    }).join("");
    var s2 = sigTable([
      sigRow("Same-door growth", "Revenue from doors you already had, this year vs last year. Above 100% means the base grows on its own.", growth == null ? "Needs prior year sales" : growth.toFixed(1) + "%", "100% or above", growth != null && growth >= 100 ? pass : watch),
      sigRow("Door revenue retention", "Revenue kept from doors you still have, ignoring any growth from them.", "96% kept", "95% or above kept", pass),
      sigRow("Revenue per available door", "Total revenue divided by doors available, sold or not.", revPerDoor == null ? "No store doors in this sample" : fmtMoney(revPerDoor) + " per door", priorPerDoor == null ? "No prior year to compare" : "Above last year: " + fmtMoney(priorPerDoor) + " per door", revPerDoor != null && priorPerDoor != null && revPerDoor >= priorPerDoor ? pass : watch),
      sigRow("Profit per available door", "Gross profit per door after trade spend and deductions.", profitPerDoor == null ? "No store doors in this sample" : fmtMoney(profitPerDoor) + " per door", "Positive and rising year over year", profitPerDoor != null && profitPerDoor > 0 ? pass : watch),
      sigRow("Orders on the books", "Future purchase orders already placed. Your records or EDI in real life, sample value shown.", ordersBooks == null ? "Needs sales" : fmtMoney(ordersBooks) + ", covers 9 weeks of forecast", "Covers 8 weeks of forecast", pass)
    ]);
    s2 += "<h3>Same-door growth by channel</h3><table><thead><tr><th>Channel</th><th class='num'>Sales</th><th class='num'>Prior year</th><th class='num'>Growth</th></tr></thead><tbody>" + chGrowth + "</tbody></table>";
    s2 += "<h3>Revenue per available door by store channel</h3><table><thead><tr><th>Channel</th><th class='num'>Sales</th><th class='num'>Doors</th><th class='num'>Revenue per door</th></tr></thead><tbody>" + doorRows + "</tbody></table>";
    s2 += "<h3>Where to grow next: the census flag (sample)</h3>" +
      "<p>This is the demographic side only, from the census run on 8 Northwest Arkansas stores (ACS 2024 5-year). It shows who lives near each store. Joining it with your store sales flags under-served stores, where the area looks strong but your velocity is low. The velocity comparison needs your store sales, so no comparison is shown here.</p>" +
      "<table><thead><tr><th>Store area</th><th class='num'>People nearby</th><th class='num'>Median age</th><th class='num'>Median income</th><th class='num'>Hispanic share</th></tr></thead><tbody>" +
      "<tr><td>Bentonville, AR (Walmart)</td><td class='num'>4,960</td><td class='num'>35.3</td><td class='num'>$102,074</td><td class='num'>12.9%</td></tr>" +
      "<tr><td>Rogers, AR (Walmart)</td><td class='num'>6,375</td><td class='num'>34.6</td><td class='num'>$75,293</td><td class='num'>42.1%</td></tr>" +
      "<tr><td>Springdale, AR (Walmart)</td><td class='num'>4,659</td><td class='num'>41.2</td><td class='num'>$76,815</td><td class='num'>37.2%</td></tr>" +
      "<tr><td>Fayetteville, AR (Walmart)</td><td class='num'>3,933</td><td class='num'>31.3</td><td class='num'>$61,983</td><td class='num'>14.6%</td></tr>" +
      "<tr><td>Siloam Springs, AR (Walmart)</td><td class='num'>3,736</td><td class='num'>37.3</td><td class='num'>$79,676</td><td class='num'>25.5%</td></tr>" +
      "<tr><td>Bella Vista, AR (Walmart)</td><td class='num'>4,865</td><td class='num'>45.4</td><td class='num'>$102,935</td><td class='num'>4.4%</td></tr>" +
      "<tr><td>Centerton, AR (Walmart)</td><td class='num'>14,490</td><td class='num'>30.4</td><td class='num'>$127,450</td><td class='num'>12.7%</td></tr>" +
      "<tr><td>Lowell, AR (Target)</td><td class='num'>5,723</td><td class='num'>30.7</td><td class='num'>$89,795</td><td class='num'>47.9%</td></tr>" +
      "</tbody></table>";

    /* --- Section 3: Are we keeping the money? --- */
    var netReal = sales ? (sales - ded) / sales * 100 : null;
    var prodSales = d.products.reduce(function (a, p) { return a + p.sales; }, 0);
    var prodUnits = d.products.reduce(function (a, p) { return a + p.units; }, 0);
    var realised = prodUnits ? prodSales / prodUnits : null;
    var listPrice = prodUnits ? d.products.reduce(function (a, p) { return a + p.price * p.units; }, 0) / prodUnits : null;
    var realisedPct = (realised != null && listPrice) ? realised / listPrice * 100 : null;
    var costPerDoor = storeDoors ? ded / storeDoors : null;
    var dedRows = c.channels.map(function (ch) {
      var rs = d.weekly.filter(function (r) { return r.channel === ch.name; });
      var s = rs.reduce(function (a, r) { return a + r.sales; }, 0);
      var dd = rs.reduce(function (a, r) { return a + r.deductions; }, 0);
      return "<tr><td>" + ch.name + "</td><td class='num'>" + fmtMoney(dd) + "</td><td class='num'>" + (s ? (dd / s * 100).toFixed(2) : "0.00") + "%</td></tr>";
    }).join("");
    var s3 = sigTable([
      sigRow("Net realisation rate", "Cash actually kept after deductions, chargebacks and markdown money, as a share of invoiced sales.", netReal == null ? "Needs sales and deductions" : netReal.toFixed(1) + "% kept", "95% or above kept", netReal != null && netReal >= 95 ? pass : watch),
      sigRow("Realised price per unit", "Average price actually received per unit, after promotions and discounts.", realised == null ? "Needs sales and units" : "$" + realised.toFixed(2) + " per unit, " + (realisedPct == null ? "" : realisedPct.toFixed(0) + "% of list"), "Within 5% of list price", realisedPct != null && realisedPct >= 95 ? pass : watch),
      sigRow("Cost per door served", "Trade spend, logistics and deductions per door.", costPerDoor == null ? "No store doors in this sample" : "$" + costPerDoor.toFixed(2) + " per door, deductions only", "Under $50 per door, deductions only", costPerDoor != null && costPerDoor < 50 ? pass : watch),
      sigRow("All-in channel ratio", "Cost of goods plus trade spend plus deductions plus logistics, divided by sales, per channel. Below 100% the channel makes money.", allInRatio == null ? "Needs sales" : allInRatio.toFixed(0) + "% of sales", "Below 100%", allInRatio != null && allInRatio < 100 ? pass : watch),
      sigRow("Deductions", "Retailer and distributor deductions in the period, as dollars and as a share of sales.", fmtMoney(ded) + ", " + (sales ? (ded / sales * 100).toFixed(2) : "0.00") + "% of sales", "Under 1.5% of sales", sales && ded / sales < 0.015 ? pass : watch),
      sigRow("Cash lockup", "Days from shipment to cash in the bank. Your records or EDI in real life, sample value shown.", "41 days", "Under 45 days", pass),
      sigRow("Deduction recovery rate", "Share of disputed deductions won back. Your records in real life, sample value shown.", "48% recovered", "60% or above", watch)
    ]);
    s3 += "<h3>Deductions by channel</h3><p class='muted'>This is the one slice of the all-in channel ratio the sample data can show. Cost of goods, trade spend and logistics are not in the sample data.</p><table><thead><tr><th>Channel</th><th class='num'>Deductions</th><th class='num'>% of sales</th></tr></thead><tbody>" + dedRows + "</tbody></table>";

    /* --- Section 4: Are we winning new doors? --- */
    var anchorRows = ["Walmart", "Target"].map(function (a) {
      var ch = null;
      c.channels.forEach(function (x) { if (x.name === a) ch = x; });
      return "<tr><td>" + a + "</td><td class='num'>" + (ch ? fmtNum(ch.stores) : "0") + "</td><td>" + (ch ? sigPill("ok", "Landed") : sigPill("risk", "Not landed")) + "</td></tr>";
    }).join("");
    var anchors = ["Walmart", "Target"].filter(function (a) {
      return c.channels.some(function (ch) { return ch.name === a; });
    }).length;
    var s4 = sigTable([
      sigRow("Buyer conversion rate", "Share of buyer meetings that become listings, and listings that become reorders.", "1 in 3 meetings (4 of 12)", "1 in 3 meetings becomes a listing", pass),
      sigRow("Sample-to-listing rate", "Share of samples or sell stories sent to buyers that become listings.", "1 in 4 samples (3 of 12)", "1 in 4 samples becomes a listing", pass),
      sigRow("Gateway doors", "Whether you landed the anchor retailers, Walmart and Target, in year one.", anchors + " of 2 anchors", "Both anchors in year one", anchors === 2 ? pass : watch),
      sigRow("Launch on-time rate", "Share of launches that hit shelves on the planned date.", "92% on time (11 of 12)", "90% on time", pass)
    ]);
    s4 += "<h3>Anchor retailers</h3><table><thead><tr><th>Retailer</th><th class='num'>Doors</th><th>Status</th></tr></thead><tbody>" + anchorRows + "</tbody></table>";

    /* --- Section 5: What do we do this week? --- */
    var stores = d.stores || [];
    var storeBar = stores.length ? Math.round(med(stores.map(function (s) { return s.velocity_upsw; })) || 0) : null;
    var sigStores = storeBar == null ? [] : stores.filter(function (s) { return s.velocity_upsw >= storeBar; });
    var storeRows = stores.slice().sort(function (a, b) { return b.velocity_upsw - a.velocity_upsw; }).map(function (s) {
      var above = storeBar != null && s.velocity_upsw >= storeBar;
      return "<tr><td>" + s.name + "</td><td>" + s.channel + "</td><td class='num'>" + s.velocity_upsw.toFixed(1) + "</td><td>" + (above ? sigPill("ok", "Signal door") : sigPill("risk", "Below the bar")) + "</td></tr>";
    }).join("");
    var walkAway = 100 - inStock;
    var priceBySku = {};
    c.products.forEach(function (p) { priceBySku[p.sku] = p.price; });
    var queue = [];
    d.products.filter(function (p) { return p.weeks_of_supply < 2; }).forEach(function (p) {
      queue.push({ cause: cleanDash(p.name) + " has " + p.weeks_of_supply.toFixed(1) + " weeks of supply", dollars: p.sales / nWeeks, dollarsText: fmtMoney(p.sales / nWeeks), next: "Raise the next order now and confirm stock at the DC", owner: "Ops (you)" });
    });
    (d.exceptions || []).forEach(function (e) {
      if (e.units_lost_est && e.units_lost_est > 0) {
        var price = priceBySku[e.sku] || realised || 0;
        queue.push({ cause: cleanDash(e.issue), dollars: e.units_lost_est * price, dollarsText: fmtMoney(e.units_lost_est * price), next: cleanDash(e.action), owner: e.channel === "Amazon" ? "You" : "Ops (you)" });
      } else if (/deduction/i.test(e.issue || "")) {
        queue.push({ cause: cleanDash(e.issue), dollars: -1, dollarsText: "Unknown until PO detail is pulled", next: cleanDash(e.action), owner: "Finance (you)" });
      }
    });
    queue.sort(function (a, b) { return b.dollars - a.dollars; });
    var queueRows = queue.length ? queue.map(function (q) {
      return "<tr><td>" + q.cause + "</td><td class='num'>" + q.dollarsText + "</td><td>" + q.next + "</td><td>" + q.owner + "</td></tr>";
    }).join("") : "<tr><td colspan='4'>No actions in this sample.</td></tr>";
    var s5 = sigTable([
      sigRow("Signal doors", "Doors where velocity is already above the break-even bar.", storeBar == null ? "No store sample for this brand" : sigStores.length + " of " + stores.length + " sample stores above the bar", storeBar == null ? "No store sample" : storeBar.toFixed(1) + " units per store per week", storeBar == null ? na : sigPill("", "Mixed")),
      sigRow("Walk-away rate", "Share of shoppers who came for your product and left without it because the shelf was empty.", walkAway.toFixed(1) + "% (estimated)", "Under 5%", walkAway < 5 ? pass : watch),
      sigRow("Signal-to-action time", "Days from spotting a problem to the fix.", "9 days", "Under 7 days from signal to fix", watch),
      sigRow("PO cut rate", "Share of ordered units the buyer cut or cancelled. Your records or EDI in real life, sample value shown.", "4% of units cut", "Under 5%", pass)
    ]);
    s5 += "<h3>Signal doors: sample stores by velocity</h3><table><thead><tr><th>Store</th><th>Channel</th><th class='num'>Velocity</th><th>Status</th></tr></thead><tbody>" + storeRows + "</tbody></table>";
    s5 += "<h3>Action queue: what to do this week</h3><table><thead><tr><th>Cause</th><th class='num'>Dollars at stake</th><th>Next step</th><th>Owner</th></tr></thead><tbody>" + queueRows + "</tbody></table>";

    /* --- Where the numbers come from --- */
    var later = [
      ["Cash lockup", "Your records or EDI, from shipment to cash in the bank."],
      ["Deduction recovery rate", "Your records, disputes and recoveries by PO."],
      ["Orders on the books", "Your records or EDI, future purchase orders."],
      ["PO cut rate", "Your records or EDI, orders cancelled or cut by the buyer."],
      ["Shelf load factor", "Facing counts per store."]
    ].map(function (r) {
      return "<tr><td><strong>" + r[0] + "</strong></td><td>" + r[1] + "</td></tr>";
    }).join("");
    var laterCard = "<div class='card'><h2>Where the numbers come from</h2><p class='muted'>These five signals need data the portals do not give you. The view shows sample values for them. With your data, they come from the source listed here.</p><table><thead><tr><th>Signal</th><th>Real source</th></tr></thead><tbody>" + later + "</tbody></table></div>";

    var intro = "<div class='card'><h2>Signals: decisions, not channels</h2>" +
      "<p>The other tabs show the business by channel. This tab shows it by the decision you have to make. Each section answers one question, and every signal has a bar, a line that says good enough.</p>" +
      "<p>Bars here are sample bars, set from this sample data or from a sensible starting point. With your data, each bar comes from your buyer's reset rule or your own history.</p>" +
      "<p class='muted'>Each section pairs one lagging signal, what already happened, with leading signals, what predicts it, and one guardrail, what catches side effects. Signals use all channels, whatever the channel filter says. Sample data in the Vantage framework. No client names, testimonials or specific client results are shown in this demo.</p></div>";

    host.innerHTML = intro +
      sigCard("1. Will we keep our doors?", "Lagging: door persistency. Leading: break-even velocity, time to velocity bar, launch curve. Guardrail: repeat stockout rate.", s1, s1foot) +
      sigCard("2. Are we growing or just spreading?", "Lagging: same-door growth. Leading: revenue per available door, profit per available door, census flag. Guardrail: door revenue retention.", s2, "Same-door growth here uses year over year sales for the same channels. With your data, only doors open in both years count.") +
      sigCard("3. Are we keeping the money?", "Lagging: net realisation rate. Leading: realised price per unit, cost per door served, deductions. Guardrail: all-in channel ratio.", s3, "Net realisation here covers deductions only. Chargebacks and markdown money are not in the sample data, so the real number will be lower. Realised price equals list price in this sample, so the sample shows no promo discount. Cost per door is deductions only for the same reason. Profit per door and the all-in ratio use sample cost assumptions: COGS 55% of sales, trade spend 8%, logistics 3%. With your data, they use your real costs.") +
      sigCard("4. Are we winning new doors?", "Lagging: buyer conversion rate. Leading: sample-to-listing rate, gateway doors. Guardrail: launch on-time rate.", s4, "Buyer, sample and launch records here are sample values. With your data, they come from your records and HubSpot, not from portal data.") +
      sigCard("5. What do we do this week?", "Lagging: walk-away rate. Leading: signal doors, action queue. Guardrail: signal-to-action time.", s5, "Walk-away rate is estimated from the in-stock rate, 100 minus in-stock %. It counts every out-of-stock moment as a lost shopper, so treat it as an upper bound. Dollars at stake is one week of sales for stockout-risk SKUs, and units lost times price for past exceptions.") +
      laterCard;
  }

  function drawLaunchCurve() {
    var ctx = $("launch-curve-chart");
    if (!ctx || typeof Chart === "undefined" || !state.data) return;
    if (signalsChart) { signalsChart.destroy(); signalsChart = null; }
    var weeks = [];
    state.data.weekly.forEach(function (r) { if (weeks.indexOf(r.week) === -1) weeks.push(r.week); });
    weeks.sort(function (a, b) { return a - b; });
    var cum = [], cumP = [], t = 0, tp = 0;
    weeks.forEach(function (w) {
      state.data.weekly.forEach(function (r) { if (r.week === w) { t += r.sales; tp += r.prior_year_sales; } });
      cum.push(Math.round(t)); cumP.push(Math.round(tp));
    });
    signalsChart = new Chart(ctx, {
      type: "line",
      data: { labels: weeks.map(function (w) { return "W" + w; }), datasets: [
        { label: "This year, cumulative", data: cum, borderColor: "#0e7c7b", backgroundColor: "#0e7c7b", tension: 0.25, borderWidth: 2, pointRadius: 0 },
        { label: "Prior year, cumulative", data: cumP, borderColor: "#94a3b8", backgroundColor: "#94a3b8", borderDash: [6, 4], tension: 0.25, borderWidth: 2, pointRadius: 0 }
      ] },
      options: { responsive: true, interaction: { mode: "index", intersect: false },
        scales: { y: { beginAtZero: true, ticks: { callback: function (v) { return "$" + (v / 1000000).toFixed(1) + "M"; } } } },
        plugins: { legend: { position: "bottom" } } }
    });
  }

  function renderAll() {
    closeDrill();
    if (signalsChart) { signalsChart.destroy(); signalsChart = null; }
    renderHeader(); renderKpis(); renderTrend(); renderScorecard();
    renderProducts(); renderExceptions(); renderChanges(); renderForecast(); renderInventoryFinance();
    renderSignals();
    var sigPanel = document.querySelector('[data-panel="signals"]');
    if (sigPanel && sigPanel.style.display !== "none") drawLaunchCurve();
  }

  function setTab(name) {
    document.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === name); });
    document.querySelectorAll("[data-panel]").forEach(function (p) { p.style.display = p.dataset.panel === name ? "" : "none"; });
    if (name === "sales" && chart) { chart.resize(); }
    if (name === "signals") { drawLaunchCurve(); }
  }
  document.querySelectorAll(".tab").forEach(function (b) {
    b.addEventListener("click", function () { setTab(b.dataset.tab); });
  });

  // Channel drill-down: click a scorecard row, a store row, a drill header,
  // or the back link. Delegated, so it survives re-renders.
  $("scorecard-body").addEventListener("click", function (e) {
    var tr = e.target.closest ? e.target.closest("tr[data-channel]") : null;
    if (tr) openDrill(tr.getAttribute("data-channel"));
  });
  $("channel-detail").addEventListener("click", function (e) {
    if (!e.target.closest) return;
    var back = e.target.closest("[data-drill='back']");
    if (back) { closeDrill(); return; }
    var th = e.target.closest("[data-drill-sort]");
    if (th) {
      var key = th.getAttribute("data-drill-sort");
      if (drillSort.key === key) { drillSort.dir = -drillSort.dir; }
      else { drillSort = { key: key, dir: key === "name" ? 1 : -1 }; }
      renderDrill();
      return;
    }
    var row = e.target.closest("tr.store-row");
    if (row) {
      var id = row.getAttribute("data-store");
      drillExpanded = (drillExpanded === id) ? null : id;
      renderDrill();
    }
  });

  // Exceptions table: click a header to sort (click again to reverse),
  // Download CSV exports the rows in the order currently displayed.
  document.querySelectorAll("#exceptions-table th[data-sort-key]").forEach(function (th) {
    th.addEventListener("click", function () { setExcSort(th.dataset.sortKey); });
  });
  var excCsvBtn = $("exceptions-csv");
  if (excCsvBtn) excCsvBtn.addEventListener("click", downloadExceptionsCsv);

  loadJSON("brands/index.json").then(function (idx) {
    state.brands = idx.brands;
    if (!state.brands.some(function (b) { return b.slug === brandSlug; })) brandSlug = state.brands[0].slug;
    renderBrandSwitcher();
    return Promise.all([
      loadJSON("brands/" + brandSlug + "/config.json"),
      loadJSON("brands/" + brandSlug + "/data.json")
    ]);
  }).then(function (pair) {
    state.config = pair[0]; state.data = pair[1];
    renderChannelFilter(); renderAll(); setTab("sales");
    if (window.location.hash === "#signals") setTab("signals");
  }).catch(function (err) {
    document.body.insertAdjacentHTML("beforeend",
      '<div class="wrap"><p style="color:#b91c1c">Could not load this brand: ' + err.message +
      '. Run with a local server (python3 -m http.server) or GitHub Pages — opening index.html with file:// blocks fetch().</p></div>');
    console.error(err);
  });
})();
