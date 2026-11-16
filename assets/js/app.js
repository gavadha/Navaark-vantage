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
  // (Walmart / Target) or top products (Amazon / DTC / Distributor).
  function isStoreChannel(ch) { return ch === "Walmart" || ch === "Target"; }
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

  function renderAll() {
    closeDrill();
    renderHeader(); renderKpis(); renderTrend(); renderScorecard();
    renderProducts(); renderExceptions(); renderChanges(); renderForecast(); renderInventoryFinance();
  }

  function setTab(name) {
    document.querySelectorAll(".tab").forEach(function (b) { b.classList.toggle("active", b.dataset.tab === name); });
    document.querySelectorAll("[data-panel]").forEach(function (p) { p.style.display = p.dataset.panel === name ? "" : "none"; });
    if (name === "sales" && chart) { chart.resize(); }
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
  }).catch(function (err) {
    document.body.insertAdjacentHTML("beforeend",
      '<div class="wrap"><p style="color:#b91c1c">Could not load this brand: ' + err.message +
      '. Run with a local server (python3 -m http.server) or GitHub Pages — opening index.html with file:// blocks fetch().</p></div>');
    console.error(err);
  });
})();
