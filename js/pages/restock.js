/* Restock recommendations + purchase order generator */
(function () {
  const user = Layout.mount({ page: 'restock', title: 'Restock Advisor' })
  if (!user) return
  const { $, $$, esc, icons, toast, modal, setLoading } = UI

  const STATUS_META = {
    restock_now: { label: 'Restock Now', badge: 'badge-red badge-pulse', icon: 'siren', color: 'bg-red-50 text-red-600', ring: 'ring-red-400' },
    restock_soon: { label: 'Restock Soon', badge: 'badge-amber', icon: 'clock-alert', color: 'bg-amber-50 text-amber-600', ring: 'ring-amber-400' },
    safe: { label: 'Safe', badge: 'badge-green', icon: 'shield-check', color: 'bg-green-50 text-green-600', ring: 'ring-green-400' },
    overstock: { label: 'Overstock', badge: 'badge-blue', icon: 'boxes', color: 'bg-iris-50 text-iris-600', ring: 'ring-iris-400' },
  }
  const Z_PRESETS = [
    { z: 1.28, label: '90% — saves capital' },
    { z: 1.65, label: '95% — balanced (recommended)' },
    { z: 1.96, label: '97.5% — safer' },
    { z: 2.33, label: '99% — almost never runs out' },
  ]

  const state = { products: [], suppliers: [], store: null, settings: null, records: [], recs: [], selected: new Set(), qty: {}, filterStatus: '' }
  const pmap = () => Object.fromEntries(state.products.map((p) => [p.id, p]))
  const smap = () => Object.fromEntries(state.suppliers.map((s) => [s.id, s]))
  icons()

  // ---------------- Load & compute ----------------
  async function load() {
    $('#rows').innerHTML = UI.skeletonRows(10, 8)
    $('#status-cards').innerHTML = Array.from({ length: 4 }).map(() => '<div class="card p-4"><div class="skeleton h-4 w-28"></div><div class="skeleton h-8 w-12 mt-3"></div></div>').join('')
    try {
      const [products, suppliers, settings, records] = await Promise.all([Api.products.all(), Api.suppliers.list(), Api.settings.get(), Api.sales.records({ days: 61 })])
      state.products = products
      state.suppliers = suppliers
      state.store = settings.store
      state.settings = { ...Restock.DEFAULTS, ...settings.restock }
      state.records = records
      $('#f-supplier').innerHTML = '<option value="">All suppliers</option>' + suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')
      compute(true)
    } catch (err) {
      $('#rows').innerHTML = `<tr><td colspan="10">${UI.errorState(err.message)}</td></tr>`
      icons()
      $('[data-retry]').addEventListener('click', load)
    }
  }

  function compute(resetSelection) {
    state.recs = Restock.calculateRestockRecommendations(state.products, state.records, state.settings)
    if (resetSelection) {
      state.selected = new Set(state.recs.filter((r) => (r.status === 'restock_now' || r.status === 'restock_soon') && r.suggestedQty > 0).map((r) => r.productId))
      state.qty = {}
    }
    $('#period-label').textContent = state.settings.analysisDays
    renderCards()
    renderFormula()
    renderRows()
  }

  // ---------------- Status cards ----------------
  function renderCards() {
    const counts = { restock_now: 0, restock_soon: 0, safe: 0, overstock: 0 }
    state.recs.forEach((r) => counts[r.status]++)
    const hints = { restock_now: 'stock ≤ reorder point', restock_soon: `within ${state.settings.soonBufferDays} days of reorder point`, safe: 'enough stock', overstock: 'excess / not selling' }
    $('#status-cards').innerHTML = Object.entries(STATUS_META)
      .map(
        ([key, m]) => `<button class="card card-hover p-4 text-left ${state.filterStatus === key ? 'ring-2 ' + m.ring : ''}" data-status="${key}">
        <div class="flex items-center justify-between"><div class="kpi-icon ${m.color}"><i data-lucide="${m.icon}"></i></div>
        <span class="text-3xl font-extrabold tabular-nums" data-cnt="${key}">0</span></div>
        <p class="font-semibold text-sm mt-3">${m.label}</p><p class="text-xs text-ink-500">${hints[key]}</p></button>`,
      )
      .join('')
    icons()
    Object.keys(counts).forEach((k) => UI.countUp($(`[data-cnt="${k}"]`), counts[k], { duration: 900 }))
  }
  $('#status-cards').addEventListener('click', (e) => {
    const b = e.target.closest('[data-status]')
    if (!b) return
    state.filterStatus = state.filterStatus === b.dataset.status ? '' : b.dataset.status
    $('#f-status').value = state.filterStatus
    renderCards()
    renderRows()
  })

  function renderFormula() {
    const s = state.settings
    const strat = Restock.strategies[s.method] || Restock.strategies.sma
    const items = [
      ['Average daily sales', `${strat.label} over the last ${s.analysisDays} days (today excluded).`],
      ['Safety stock', `Z × standard deviation of daily sales × √lead time. Z = <b>${s.zValue}</b>.`],
      ['Reorder point (ROP)', 'Average daily sales × lead time + safety stock. If stock ≤ ROP → <b>Restock Now</b>.'],
      ['Suggested order quantity', `Average daily sales × <b>${s.targetCoverageDays} days</b> coverage target + safety stock − current stock.`],
    ]
    $('#formula').innerHTML = items.map(([t, d], i) => `<div class="rounded-xl bg-ink-50 p-4"><span class="text-xs font-bold text-brand-600">0${i + 1}</span><p class="font-semibold mt-1">${t}</p><p class="text-ink-600 text-xs mt-1 leading-relaxed">${d}</p></div>`).join('')
  }

  // ---------------- Table ----------------
  function sparkline(series) {
    const data = series.slice(-30)
    const max = Math.max(1, ...data)
    const w = 96
    const h = 26
    const bw = w / data.length
    return `<svg viewBox="0 0 ${w} ${h}" class="w-24 h-[26px]">${data
      .map((v, i) => {
        const bh = Math.max(1.5, (v / max) * h)
        return `<rect x="${(i * bw + 0.5).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${Math.max(1, bw - 1).toFixed(1)}" height="${bh.toFixed(1)}" rx="1" fill="${i >= data.length - 7 ? '#F2683A' : '#C9CDF8'}"/>`
      })
      .join('')}</svg>`
  }

  function filtered() {
    const q = $('#search').value.trim().toLowerCase()
    const sup = $('#f-supplier').value
    const st = state.filterStatus
    const map = pmap()
    return state.recs.filter((r) => {
      const p = map[r.productId]
      return (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) && (!sup || p.supplierId === sup) && (!st || r.status === st)
    })
  }

  function orderQty(r) {
    return state.qty[r.productId] ?? r.suggestedQty
  }

  function renderRows() {
    const rows = filtered()
    const map = pmap()
    const sups = smap()
    const cover = state.settings.targetCoverageDays
    if (!rows.length) {
      $('#rows').innerHTML = `<tr><td colspan="10">${UI.emptyState({ icon: 'shield-check', title: 'No products', text: 'No products match this filter.' })}</td></tr>`
      updatePoButton()
      return icons()
    }
    $('#rows').innerHTML = rows
      .map((r, i) => {
        const p = map[r.productId]
        const m = STATUS_META[r.status]
        const days = r.daysOfStock
        const pct = days === Infinity ? 100 : Math.min(100, (days / (cover * 1.5)) * 100)
        const barColor = r.status === 'restock_now' ? '#dc2626' : r.status === 'restock_soon' ? '#d97706' : r.status === 'overstock' ? '#5865E8' : '#16a34a'
        const checked = state.selected.has(r.productId)
        return `<tr class="row-in ${checked ? 'bg-brand-50/40' : ''}" style="--i:${Math.min(i, 25)}" data-row="${r.productId}">
          <td><input type="checkbox" class="accent-brand-500 w-4 h-4" data-check="${r.productId}" ${checked ? 'checked' : ''}></td>
          <td class="min-w-[230px]"><a href="products.html?view=${p.id}" class="font-semibold text-sm hover:text-brand-600">${esc(p.name)}</a>
            <p class="text-xs text-ink-500">${esc(p.sku)} · ${esc(sups[p.supplierId]?.name || 'No supplier')} · lead ${p.leadTimeDays}d</p></td>
          <td><div class="flex items-center gap-2" title="Orange bars = last 7 days">${sparkline(r.series)}<span class="text-xs text-ink-500">${Fmt.number(r.totalSold)}</span></div></td>
          <td class="num font-bold">${Fmt.number(p.stock)} <span class="text-xs font-normal text-ink-500">${esc(p.unit)}</span></td>
          <td class="num text-sm">${Fmt.number(r.avgDailySales, 1)}</td>
          <td><div class="w-28"><p class="text-xs font-semibold mb-1">${days === Infinity ? '<span class="text-ink-400">no sales</span>' : Fmt.number(days, 1) + ' days'}</p>
            <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${barColor}"></div></div></div></td>
          <td class="num text-sm">${Fmt.number(Math.ceil(r.safetyStock))}</td>
          <td class="num text-sm">${Fmt.number(Math.ceil(r.reorderPoint))}</td>
          <td class="num"><input type="number" min="0" class="input h-9 w-24 text-right font-bold ml-auto ${orderQty(r) > 0 ? 'text-brand-600' : 'text-ink-400'}" data-qty="${r.productId}" value="${orderQty(r)}"></td>
          <td><span class="badge ${m.badge}">${m.label}</span>${r.noDemand && p.stock > 0 ? '<p class="text-[10px] text-ink-400 mt-1">no sales in period</p>' : ''}</td></tr>`
      })
      .join('')
    const visibleIds = rows.map((r) => r.productId)
    $('#check-all').checked = visibleIds.length > 0 && visibleIds.every((id) => state.selected.has(id))
    updatePoButton()
    icons()
  }

  function updatePoButton() {
    const n = [...state.selected].filter((id) => orderQty(state.recs.find((r) => r.productId === id)) > 0).length
    $('#po-count').textContent = n
    $('#po-btn').disabled = !n
  }

  $('#rows').addEventListener('change', (e) => {
    const check = e.target.dataset.check
    const qty = e.target.dataset.qty
    if (check) {
      if (e.target.checked) state.selected.add(check)
      else state.selected.delete(check)
      e.target.closest('tr').classList.toggle('bg-brand-50/40', e.target.checked)
      updatePoButton()
    }
    if (qty) {
      const v = Math.max(0, Math.floor(Number(e.target.value) || 0))
      state.qty[qty] = v
      e.target.value = v
      if (v > 0) state.selected.add(qty)
      renderRows()
    }
  })
  $('#check-all').addEventListener('change', (e) => {
    filtered().forEach((r) => (e.target.checked ? state.selected.add(r.productId) : state.selected.delete(r.productId)))
    renderRows()
  })
  $('#search').addEventListener('input', UI.debounce(renderRows, 200))
  $('#f-supplier').addEventListener('change', renderRows)
  $('#f-status').addEventListener('change', (e) => {
    state.filterStatus = e.target.value
    renderCards()
    renderRows()
  })

  // ---------------- Parameters ----------------
  $('#settings-btn').addEventListener('click', () => {
    const s = state.settings
    const m = modal({
      title: 'Restock algorithm settings',
      subtitle: 'Changes update the recommendations right away.',
      body: `<div class="space-y-5">
        <div><div class="flex justify-between"><label class="label">Analysis period</label><b class="text-sm" id="ad-val">${s.analysisDays} days</b></div>
          <input type="range" min="7" max="60" step="1" value="${s.analysisDays}" id="ad" class="w-full accent-brand-500">
          <p class="text-xs text-ink-500">How many past days of sales are used to calculate the average.</p></div>
        <div><label class="label">Service level (Z value)</label>
          <select id="z" class="select">${Z_PRESETS.map((x) => `<option value="${x.z}" ${x.z === s.zValue ? 'selected' : ''}>Z = ${x.z} · ${x.label}</option>`).join('')}
          ${Z_PRESETS.some((x) => x.z === s.zValue) ? '' : `<option value="${s.zValue}" selected>Z = ${s.zValue} · custom</option>`}</select>
          <p class="text-xs text-ink-500 mt-1">Higher means more safety stock (lower risk of running out).</p></div>
        <div><div class="flex justify-between"><label class="label">Stock coverage target</label><b class="text-sm" id="tc-val">${s.targetCoverageDays} days</b></div>
          <input type="range" min="3" max="45" step="1" value="${s.targetCoverageDays}" id="tc" class="w-full accent-brand-500">
          <p class="text-xs text-ink-500">How many days the stock should last after restocking.</p></div>
        <div><label class="label">Forecasting method</label>
          <div class="grid grid-cols-2 gap-2" id="method">${Object.values(Restock.strategies).map((x) => `<button type="button" data-m="${x.id}" class="rounded-xl border-2 p-3 text-left text-sm transition ${x.id === s.method ? 'border-brand-500 bg-brand-50' : 'border-ink-100 hover:border-ink-300'}"><b>${x.id.toUpperCase()}</b><p class="text-xs text-ink-500">${x.label}</p></button>`).join('')}</div></div>
      </div>`,
      footer: `<button class="btn btn-ghost mr-auto" id="defaults">Reset to defaults</button><button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="save">Save & recalculate</button>`,
    })
    let method = s.method
    const ad = $('#ad', m.el)
    const tc = $('#tc', m.el)
    ad.addEventListener('input', () => ($('#ad-val', m.el).textContent = ad.value + ' days'))
    tc.addEventListener('input', () => ($('#tc-val', m.el).textContent = tc.value + ' days'))
    $('#method', m.el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]')
      if (!b) return
      method = b.dataset.m
      $$('[data-m]', m.el).forEach((x) => (x.className = `rounded-xl border-2 p-3 text-left text-sm transition ${x === b ? 'border-brand-500 bg-brand-50' : 'border-ink-100 hover:border-ink-300'}`))
    })
    $('#defaults', m.el).addEventListener('click', () => {
      ad.value = Restock.DEFAULTS.analysisDays
      tc.value = Restock.DEFAULTS.targetCoverageDays
      $('#z', m.el).value = Restock.DEFAULTS.zValue
      ad.dispatchEvent(new Event('input'))
      tc.dispatchEvent(new Event('input'))
      $(`[data-m="${Restock.DEFAULTS.method}"]`, m.el).click()
    })
    $('#save', m.el).addEventListener('click', async (e) => {
      const btn = e.currentTarget
      setLoading(btn, true, 'Saving...')
      try {
        const saved = await Api.settings.saveRestock({ analysisDays: ad.value, zValue: $('#z', m.el).value, targetCoverageDays: tc.value, method })
        state.settings = { ...Restock.DEFAULTS, ...saved }
        m.close()
        compute(true)
        toast('Settings saved, recommendations updated.')
      } catch (err) {
        setLoading(btn, false)
        toast(err.message, 'error')
      }
    })
  })

  // ---------------- Purchase order ----------------
  $('#po-btn').addEventListener('click', () => {
    const map = pmap()
    const sups = smap()
    const lines = state.recs.filter((r) => state.selected.has(r.productId) && orderQty(r) > 0).map((r) => ({ p: map[r.productId], qty: orderQty(r) }))
    const groups = {}
    lines.forEach((l) => (groups[l.p.supplierId || 'none'] ||= []).push(l))
    const date = new Date()
    const ymd = Seed.ymd(date)
    const pos = Object.entries(groups).map(([supId, items], i) => ({
      number: `PO/${ymd}/${String(i + 1).padStart(3, '0')}`,
      supplier: sups[supId] || { name: 'No supplier', address: '-', phone: '-', contactPerson: '-' },
      items,
      total: items.reduce((s, l) => s + l.qty * l.p.purchasePrice, 0),
      leadTime: Math.max(...items.map((l) => l.p.leadTimeDays)),
    }))
    const grand = pos.reduce((s, po) => s + po.total, 0)

    const poHtml = (po) => {
      const eta = new Date(date.getTime() + po.leadTime * 86400000)
      return `<div class="po-doc po-page">
        <div class="po-head">
          <div><div style="font-size:16px;font-weight:800">${esc(state.store.name)}</div><div style="color:#6B7180">${esc(state.store.address)}<br>Tel. ${esc(state.store.phone)}</div></div>
          <div style="text-align:right"><h1>PURCHASE ORDER</h1><div style="color:#6B7180">${po.number}</div></div>
        </div>
        <div class="po-meta">
          <div><div style="font-size:10px;text-transform:uppercase;color:#8E94A3;font-weight:700;letter-spacing:.06em">To</div>
            <div style="font-weight:700;margin-top:2px">${esc(po.supplier.name)}</div><div>${esc(po.supplier.contactPerson || '')}</div><div style="color:#6B7180">${esc(po.supplier.address || '')}<br>${esc(po.supplier.phone || '')}</div></div>
          <div style="text-align:right"><div><b>Date:</b> ${Fmt.dateLong(date.toISOString())}</div><div><b>Expected arrival:</b> ${Fmt.date(eta.toISOString())}</div><div><b>Created by:</b> ${esc(user.name)}</div></div>
        </div>
        <table><thead><tr><th style="width:30px">No</th><th>Product</th><th>SKU</th><th class="num">Qty</th><th>Unit</th><th class="num">Price</th><th class="num">Subtotal</th></tr></thead>
        <tbody>${po.items.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.p.name)}</td><td>${esc(l.p.sku)}</td><td class="num"><b>${Fmt.number(l.qty)}</b></td><td>${esc(l.p.unit)}</td><td class="num">${Fmt.rupiah(l.p.purchasePrice)}</td><td class="num">${Fmt.rupiah(l.qty * l.p.purchasePrice)}</td></tr>`).join('')}
        <tr><td colspan="6" class="num"><b>Total</b></td><td class="num"><b>${Fmt.rupiah(po.total)}</b></td></tr></tbody></table>
        <p style="margin-top:14px;color:#6B7180;font-size:11px">Note: Please confirm availability & delivery schedule. Quantities were calculated automatically by the StokKu restock advisor.</p>
        <div class="po-sign"><div>Ordered by</div><div>Supplier</div></div>
      </div>`
    }

    const m = modal({
      title: 'Purchase Order',
      subtitle: `${pos.length} PO · ${lines.length} products · total ${Fmt.rupiah(grand)}`,
      size: 'xl',
      body: `<div class="flex flex-wrap gap-2 mb-4">${pos.map((po, i) => `<button class="chip ${i === 0 ? 'active' : ''}" data-po="${i}"><i data-lucide="truck" class="w-3.5 h-3.5"></i>${esc(po.supplier.name)} · ${po.items.length}</button>`).join('')}</div>
        <div class="bg-ink-100 rounded-xl p-4 sm:p-6 overflow-x-auto thin-scroll"><div class="bg-white shadow-lg mx-auto max-w-[800px] min-w-[640px] anim-fade-up" id="po-preview">${poHtml(pos[0])}</div></div>`,
      footer: `<button class="btn btn-outline" data-close>Close</button><button class="btn btn-outline" id="print-one"><i data-lucide="printer"></i>Print this PO</button><button class="btn btn-primary" id="print-all"><i data-lucide="printer"></i>Print all (${pos.length})</button>`,
    })
    let current = 0
    $$('[data-po]', m.el).forEach((b) =>
      b.addEventListener('click', () => {
        current = Number(b.dataset.po)
        $$('[data-po]', m.el).forEach((x) => x.classList.toggle('active', x === b))
        const prev = $('#po-preview', m.el)
        prev.innerHTML = poHtml(pos[current])
        UI.replayClass(prev, 'anim-fade-up')
      }),
    )
    const pageCss = '@page{size:A4;margin:12mm} .po-doc{padding:0}'
    $('#print-one', m.el).addEventListener('click', () => UI.printHtml(poHtml(pos[current]), pageCss))
    $('#print-all', m.el).addEventListener('click', () => UI.printHtml(pos.map(poHtml).join(''), pageCss))
  })

  load()
})()
