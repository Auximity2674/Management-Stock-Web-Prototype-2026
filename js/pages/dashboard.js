/* Owner analytics dashboard */
(function () {
  const user = Layout.mount({ page: 'dashboard', title: 'Dashboard' })
  if (!user) return
  const { $, $$, esc, icons } = UI
  const DAY = 86400000

  const state = { tx: [], products: [], categories: [], settings: null, period: 'daily', metric: 'revenue', alertTab: 'out' }
  let trendChart = null
  let catChart = null

  // Greeting
  const h = new Date().getHours()
  const part = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'
  $('#greeting').textContent = `Good ${part}, ${user.name.split(' ')[0]} 👋`
  $('#today-label').textContent = Fmt.dateLong(new Date().toISOString())
  icons()

  // Chart.js global look
  if (window.Chart) {
    Chart.defaults.font.family = "'Plus Jakarta Sans', sans-serif"
    Chart.defaults.color = '#8E94A3'
  }

  // ---------------- Helpers ----------------
  const dayKey = (d) => {
    const x = new Date(d)
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0')
  }
  const startOfDay = (d) => {
    const x = new Date(d)
    x.setHours(0, 0, 0, 0)
    return x
  }
  const profitOf = (t) => t.items.reduce((s, it) => s + it.subtotal - it.cost * it.quantity, 0) - t.discount
  const completed = () => state.tx.filter((t) => t.status === 'completed')

  function trendChip(curr, prev) {
    if (!prev) return curr ? '<span class="trend trend-up">new</span>' : ''
    const pct = ((curr - prev) / prev) * 100
    const up = pct >= 0
    return `<span class="trend ${up ? 'trend-up' : 'trend-down'}">${up ? '↑' : '↓'} ${Fmt.number(Math.abs(pct), 1)}%</span>`
  }

  // ---------------- KPIs ----------------
  function renderKpis() {
    const today = startOfDay(new Date()).getTime()
    const yStart = today - DAY
    // Compare against yesterday up to the same time of day (fair comparison for a partial day).
    const nowOffset = Date.now() - today
    const done = completed()
    const todayTx = done.filter((t) => new Date(t.createdAt).getTime() >= today)
    const yTx = done.filter((t) => {
      const ts = new Date(t.createdAt).getTime()
      return ts >= yStart && ts < yStart + nowOffset
    })
    const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0)
    const inventory = sum(state.products, (p) => p.stock * p.purchasePrice)
    const retailValue = sum(state.products, (p) => p.stock * p.sellingPrice)
    const kpis = [
      { label: "Today's sales", icon: 'banknote', color: 'bg-brand-50 text-brand-600', value: sum(todayTx, (t) => t.total), prev: sum(yTx, (t) => t.total), money: true },
      { label: 'Transactions', icon: 'receipt-text', color: 'bg-iris-50 text-iris-600', value: todayTx.length, prev: yTx.length },
      { label: "Today's gross profit", icon: 'trending-up', color: 'bg-green-50 text-green-600', value: sum(todayTx, profitOf), prev: sum(yTx, profitOf), money: true },
      { label: 'Inventory value', icon: 'warehouse', color: 'bg-teal-50 text-teal-600', value: inventory, money: true, sub: `Retail value ${Fmt.rupiahShort(retailValue)}` },
    ]
    $('#kpis').innerHTML = kpis
      .map((k, i) => {
        const borders = [i % 2 === 0 ? 'border-r' : '', i < 2 ? 'border-b lg:border-b-0' : '', i < 3 ? 'lg:border-r' : 'lg:border-r-0'].join(' ')
        return `<div class="p-4 sm:p-5 border-ink-100 ${borders} anim-fade-up group" style="animation-delay:${i * 70}ms">
          <div class="flex items-center gap-2.5"><div class="kpi-icon !w-9 !h-9 ${k.color} transition group-hover:scale-110 group-hover:-rotate-6"><i data-lucide="${k.icon}" class="!w-4 !h-4"></i></div>
          <p class="text-xs sm:text-sm text-ink-500 font-medium leading-tight">${k.label}</p></div>
          <div class="flex flex-wrap items-center gap-2 mt-3">
            <p class="text-xl sm:text-[28px] font-extrabold tracking-tight tabular-nums leading-none" data-kpi="${i}">0</p>
            ${k.prev !== undefined ? trendChip(k.value, k.prev) : ''}
          </div>
          <p class="text-xs text-ink-500 mt-2">${k.prev !== undefined ? `vs yesterday (same time): <b class="text-ink-800">${k.money ? Fmt.rupiahShort(k.prev) : Fmt.number(k.prev)}</b>` : k.sub}</p>
        </div>`
      })
      .join('')
    icons()
    kpis.forEach((k, i) => UI.countUp($(`[data-kpi="${i}"]`), k.value, { duration: 1300, format: k.money ? Fmt.rupiah : (v) => Fmt.number(v) }))
  }

  // ---------------- Trend chart ----------------
  function buildBuckets() {
    const done = completed()
    const now = new Date()
    const buckets = []
    if (state.period === 'daily') {
      for (let i = 29; i >= 0; i--) {
        const d = startOfDay(now.getTime() - i * DAY)
        buckets.push({ key: dayKey(d), label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), full: Fmt.dateLong(d.toISOString()), from: d.getTime(), to: d.getTime() + DAY })
      }
    } else if (state.period === 'weekly') {
      // ISO-like weeks starting Monday, last 8 weeks
      const monday = startOfDay(now)
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
      for (let i = 7; i >= 0; i--) {
        const from = new Date(monday.getTime() - i * 7 * DAY)
        const to = new Date(from.getTime() + 7 * DAY)
        buckets.push({ label: from.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), full: `${Fmt.date(from.toISOString())} – ${Fmt.date(new Date(to - 1).toISOString())}`, from: from.getTime(), to: to.getTime() })
      }
    } else {
      for (let i = 2; i >= 0; i--) {
        const from = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1)
        buckets.push({ label: from.toLocaleDateString('en-GB', { month: 'long' }), full: from.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }), from: from.getTime(), to: to.getTime() })
      }
    }
    buckets.forEach((b) => {
      b.revenue = 0
      b.profit = 0
      b.count = 0
    })
    done.forEach((t) => {
      const ts = new Date(t.createdAt).getTime()
      const b = buckets.find((x) => ts >= x.from && ts < x.to)
      if (!b) return
      b.revenue += t.total
      b.profit += profitOf(t)
      b.count++
    })
    return buckets
  }

  function renderTrend() {
    const buckets = buildBuckets()
    const values = buckets.map((b) => b[state.metric])
    const total = values.reduce((a, b) => a + b, 0)
    $('#trend-label').textContent = { daily: 'Last 30 days', weekly: 'Last 8 weeks', monthly: 'Last 3 months' }[state.period] + (state.metric === 'profit' ? ' · gross profit' : ' · sales')
    UI.countUp($('#trend-total'), total, { duration: 900, format: Fmt.rupiah })

    const canvas = $('#trend-chart')
    const ctx = canvas.getContext('2d')
    const base = state.metric === 'profit' ? ['#22C55E', '#BBF7D0'] : ['#5865E8', '#C9CDF8']
    const lastIdx = values.length - 1
    const colors = values.map((_, i) => (i === lastIdx ? '#F2683A' : base[0]))
    const data = {
      labels: buckets.map((b) => b.label),
      datasets: [{ data: values, backgroundColor: colors, hoverBackgroundColor: '#F2683A', borderRadius: 8, borderSkipped: false, maxBarThickness: state.period === 'daily' ? 22 : 56, categoryPercentage: 0.7 }],
    }
    const options = {
      maintainAspectRatio: false,
      animation: { duration: 900, easing: 'easeOutQuart', delay: (c) => (c.type === 'data' && c.mode === 'default' ? c.dataIndex * 18 : 0) },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#fff',
          titleColor: '#8E94A3',
          bodyColor: '#17181C',
          borderColor: '#ECEEF2',
          borderWidth: 1,
          padding: 12,
          cornerRadius: 12,
          displayColors: false,
          titleFont: { size: 11, weight: '500' },
          bodyFont: { size: 15, weight: '700' },
          callbacks: {
            title: (items) => buckets[items[0].dataIndex].full,
            label: (c) => Fmt.rupiah(c.raw),
            afterLabel: (c) => `${buckets[c.dataIndex].count} transactions`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkipPadding: 12, font: { size: 11 } } },
        y: { beginAtZero: true, grid: { color: '#F0F1F4' }, border: { display: false, dash: [4, 4] }, ticks: { callback: (v) => Fmt.rupiahShort(v), font: { size: 11 }, maxTicksLimit: 6 } },
      },
    }
    if (trendChart) {
      trendChart.data = data
      trendChart.options = options
      trendChart.update()
    } else trendChart = new Chart(ctx, { type: 'bar', data, options })
  }

  $('#period').addEventListener('click', (e) => {
    const b = e.target.closest('[data-period]')
    if (!b) return
    state.period = b.dataset.period
    $$('#period button').forEach((x) => x.classList.toggle('active', x === b))
    renderTrend()
  })
  $('#metric').addEventListener('click', (e) => {
    const b = e.target.closest('[data-metric]')
    if (!b) return
    state.metric = b.dataset.metric
    $$('#metric button').forEach((x) => x.classList.toggle('active', x === b))
    renderTrend()
  })

  // ---------------- Timeline ----------------
  const METHOD_ICON = { cash: 'banknote', qris: 'qr-code', transfer: 'landmark' }
  function renderTimeline() {
    const recent = state.tx.slice(0, 8)
    if (!recent.length) {
      $('#timeline').innerHTML = UI.emptyState({ icon: 'receipt', title: 'No transactions yet' })
      return icons()
    }
    $('#timeline').innerHTML = recent
      .map(
        (t, i) => `<div class="flex gap-3 anim-fade-up" style="animation-delay:${0.2 + i * 0.05}s">
        <div class="w-12 shrink-0 text-right pt-3"><p class="text-sm font-bold leading-none">${Fmt.time(t.createdAt)}</p><p class="text-[10px] text-ink-400 mt-1">${dayKey(t.createdAt) === dayKey(new Date()) ? 'Today' : Fmt.date(t.createdAt).replace(/ \d{4}$/, '')}</p></div>
        <div class="flex flex-col items-center pt-4"><span class="timeline-dot ${i === 0 ? '!border-brand-500 !bg-brand-500' : ''}"></span>${i < recent.length - 1 ? '<span class="timeline-line my-1"></span>' : ''}</div>
        <a href="transactions.html" class="flex-1 min-w-0 mb-2.5 flex items-center gap-3 rounded-xl border border-ink-100 p-3 hover:border-brand-200 hover:shadow-sm transition">
          <div class="w-9 h-9 rounded-full border border-ink-100 grid place-items-center text-ink-600 shrink-0"><i data-lucide="${METHOD_ICON[t.paymentMethod]}" class="w-4 h-4"></i></div>
          <div class="min-w-0 flex-1"><p class="text-sm font-bold ${t.status !== 'completed' ? 'line-through text-ink-400' : ''}">${Fmt.rupiah(t.total)}</p>
          <p class="text-[11px] text-ink-500 truncate">${t.items.reduce((s, x) => s + x.quantity, 0)} items · Cashier: <b class="text-ink-700">${esc(t.cashierName.split(' ')[0])}</b></p></div>
          ${t.status !== 'completed' ? UI.trxStatusBadge(t.status) : ''}
        </a></div>`,
      )
      .join('')
    icons()
  }

  // ---------------- Product performance ----------------
  function salesByProduct(days) {
    const since = Date.now() - days * DAY
    const map = {}
    completed().forEach((t) => {
      if (new Date(t.createdAt).getTime() < since) return
      t.items.forEach((it) => {
        const m = (map[it.productId] ||= { qty: 0, revenue: 0 })
        m.qty += it.quantity
        m.revenue += it.subtotal
      })
    })
    return map
  }

  function renderPerformance() {
    const sales = salesByProduct(30)
    const catColor = Object.fromEntries(state.categories.map((c) => [c.id, c.color]))
    const rows = state.products.map((p) => ({ p, qty: sales[p.id]?.qty || 0, revenue: sales[p.id]?.revenue || 0 }))
    const best = rows.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 5)
    const max = best[0]?.revenue || 1
    $('#best').innerHTML = best
      .map(
        (r, i) => `<div class="anim-fade-up" style="animation-delay:${0.25 + i * 0.06}s">
        <div class="flex items-center gap-3">
          <span class="w-6 text-center text-sm font-extrabold ${i === 0 ? 'text-brand-500' : 'text-ink-300'}">${i + 1}</span>
          <div class="w-9 h-9 rounded-xl grid place-items-center text-white text-[11px] font-bold shrink-0" style="background:${catColor[r.p.categoryId] || '#8E94A3'}">${esc(Fmt.initials(r.p.name))}</div>
          <div class="flex-1 min-w-0"><p class="text-sm font-semibold truncate">${esc(r.p.name)}</p><p class="text-xs text-ink-500">${Fmt.number(r.qty)} ${esc(r.p.unit)} sold</p></div>
          <p class="text-sm font-bold tabular-nums">${Fmt.rupiahShort(r.revenue)}</p>
        </div>
        <div class="bar-track mt-2 ml-9"><div class="bar-fill" style="width:${(r.revenue / max) * 100}%;background:linear-gradient(90deg,#F8834F,#F2683A);animation-delay:${0.3 + i * 0.08}s"></div></div>
      </div>`,
      )
      .join('')

    const slow = rows
      .filter((r) => r.p.stock > 0)
      .sort((a, b) => a.qty - b.qty || b.p.stock * b.p.purchasePrice - a.p.stock * a.p.purchasePrice)
      .slice(0, 5)
    $('#slow').innerHTML = slow
      .map(
        (r, i) => `<a href="products.html?view=${r.p.id}" class="flex items-center gap-3 p-2.5 -mx-2.5 rounded-xl hover:bg-ink-50 transition anim-fade-up" style="animation-delay:${0.3 + i * 0.06}s">
        <div class="w-9 h-9 rounded-xl bg-ink-100 text-ink-500 grid place-items-center shrink-0"><i data-lucide="${r.qty === 0 ? 'snowflake' : 'turtle'}" class="w-4 h-4"></i></div>
        <div class="flex-1 min-w-0"><p class="text-sm font-semibold truncate">${esc(r.p.name)}</p><p class="text-xs text-ink-500">${r.qty === 0 ? 'No sales' : Fmt.number(r.qty) + ' sold'} · stock ${r.p.stock}</p></div>
        <div class="text-right"><p class="text-xs text-ink-400">tied-up capital</p><p class="text-sm font-bold text-ink-700">${Fmt.rupiahShort(r.p.stock * r.p.purchasePrice)}</p></div></a>`,
      )
      .join('')
    icons()
  }

  function renderAlerts() {
    const list = state.products
      .filter((p) => (state.alertTab === 'out' ? p.stock <= 0 : p.stock > 0 && p.stock <= p.minStock))
      .sort((a, b) => a.stock / Math.max(1, a.minStock) - b.stock / Math.max(1, b.minStock))
    const outCount = state.products.filter((p) => p.stock <= 0).length
    const lowCount = state.products.filter((p) => p.stock > 0 && p.stock <= p.minStock).length
    $('#alert-tabs').innerHTML = `<button class="${state.alertTab === 'out' ? 'active' : ''}" data-a="out">Out · ${outCount}</button><button class="${state.alertTab === 'low' ? 'active' : ''}" data-a="low">Low · ${lowCount}</button>`
    $('#alerts').innerHTML = list.length
      ? list
          .map(
            (p, i) => `<a href="products.html?view=${p.id}" class="flex items-center gap-3 p-2.5 rounded-xl border border-ink-100 hover:border-ink-200 transition row-in" style="--i:${i}">
          <div class="w-2 self-stretch rounded-full ${p.stock <= 0 ? 'bg-red-500' : 'bg-amber-400'}"></div>
          <div class="flex-1 min-w-0"><p class="text-sm font-semibold truncate">${esc(p.name)}</p><p class="text-xs text-ink-500">${esc(p.sku)}</p></div>
          <div class="text-right"><p class="text-sm font-bold ${p.stock <= 0 ? 'text-red-600' : 'text-amber-600'}">${p.stock} ${esc(p.unit)}</p><p class="text-[11px] text-ink-400">min ${p.minStock}</p></div></a>`,
          )
          .join('')
      : `<p class="text-sm text-ink-500 text-center py-8">No products ${state.alertTab === 'out' ? 'out of stock' : 'running low'} 🎉</p>`
  }
  $('#alert-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-a]')
    if (!b) return
    state.alertTab = b.dataset.a
    renderAlerts()
  })

  // ---------------- Category + payments ----------------
  function renderCategoryAndPayments() {
    const since = Date.now() - 30 * DAY
    const recent = completed().filter((t) => new Date(t.createdAt).getTime() >= since)
    const pcat = Object.fromEntries(state.products.map((p) => [p.id, p.categoryId]))
    const byCat = {}
    recent.forEach((t) => t.items.forEach((it) => (byCat[pcat[it.productId] || 'x'] = (byCat[pcat[it.productId] || 'x'] || 0) + it.subtotal)))
    const cats = state.categories.map((c) => ({ ...c, value: byCat[c.id] || 0 })).sort((a, b) => b.value - a.value)
    const total = cats.reduce((s, c) => s + c.value, 0)
    $('#cat-total').textContent = Fmt.rupiahShort(total)
    $('#cat-legend').innerHTML = cats
      .map(
        (c, i) => `<div class="flex items-center gap-2.5 text-sm anim-fade-up" style="animation-delay:${0.4 + i * 0.04}s" data-ci="${i}">
        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${c.color}"></span><span class="flex-1 truncate text-ink-700">${esc(c.name)}</span>
        <span class="text-xs text-ink-400 tabular-nums">${total ? Fmt.number((c.value / total) * 100, 1) : 0}%</span><b class="w-20 text-right tabular-nums">${Fmt.rupiahShort(c.value)}</b></div>`,
      )
      .join('')
    const ctx = $('#cat-chart').getContext('2d')
    catChart = new Chart(ctx, {
      type: 'doughnut',
      data: { labels: cats.map((c) => c.name), datasets: [{ data: cats.map((c) => c.value), backgroundColor: cats.map((c) => c.color), borderWidth: 3, borderColor: '#fff', hoverOffset: 8 }] },
      options: {
        cutout: '72%',
        maintainAspectRatio: false,
        animation: { animateRotate: true, duration: 1200, easing: 'easeOutQuart' },
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => ` ${Fmt.rupiah(c.raw)}` } } },
      },
    })
    void catChart

    const byMethod = { cash: { n: 0, v: 0 }, qris: { n: 0, v: 0 }, transfer: { n: 0, v: 0 } }
    recent.forEach((t) => {
      byMethod[t.paymentMethod].n++
      byMethod[t.paymentMethod].v += t.total
    })
    const colors = { cash: '#16A34A', qris: '#5865E8', transfer: '#F2683A' }
    $('#payments').innerHTML = Object.entries(byMethod)
      .map(([k, m], i) => {
        const pct = total ? (m.v / recent.reduce((s, t) => s + t.total, 0)) * 100 : 0
        return `<div class="anim-fade-up" style="animation-delay:${0.45 + i * 0.06}s"><div class="flex items-center justify-between text-sm">
          <span class="flex items-center gap-2 font-semibold"><i data-lucide="${METHOD_ICON[k]}" class="w-4 h-4" style="color:${colors[k]}"></i>${UI.PAYMENT_LABEL[k]}</span>
          <span><b class="tabular-nums">${Fmt.rupiahShort(m.v)}</b> <span class="text-xs text-ink-400">· ${Fmt.number(m.n)} trx · ${Fmt.number(pct, 1)}%</span></span></div>
          <div class="bar-track mt-2 !h-2"><div class="bar-fill" style="width:${pct}%;background:${colors[k]};animation-delay:${0.5 + i * 0.1}s"></div></div></div>`
      })
      .join('')

    // Busiest hour / avg basket / avg daily
    const hours = new Array(24).fill(0)
    recent.forEach((t) => hours[new Date(t.createdAt).getHours()]++)
    const peak = hours.indexOf(Math.max(...hours))
    const avgBasket = recent.length ? recent.reduce((s, t) => s + t.total, 0) / recent.length : 0
    const stats = [
      ['Busiest hour', `${String(peak).padStart(2, '0')}:00–${String(peak + 1).padStart(2, '0')}:00`],
      ['Average basket', Fmt.rupiahShort(avgBasket)],
      ['Sales / day', Fmt.number(recent.length / 30, 1)],
    ]
    $('#hour-stats').innerHTML = stats.map(([k, v]) => `<div class="rounded-xl bg-ink-50 p-3"><p class="text-[11px] text-ink-500">${k}</p><p class="text-sm font-bold mt-0.5">${v}</p></div>`).join('')
    icons()
  }

  function renderRestockCta() {
    const records = []
    completed().forEach((t) => t.items.forEach((it) => records.push({ productId: it.productId, quantity: it.quantity, date: t.createdAt })))
    const recs = Restock.calculateRestockRecommendations(state.products, records, state.settings)
    const now = recs.filter((r) => r.status === 'restock_now').length
    $('#restock-count').textContent = `${now} products`
  }

  // ---------------- Load ----------------
  function skeletons() {
    $('#kpis').innerHTML = Array.from({ length: 4 }).map(() => '<div class="p-5"><div class="skeleton h-4 w-32"></div><div class="skeleton h-8 w-40 mt-4"></div><div class="skeleton h-3 w-24 mt-3"></div></div>').join('')
    ;['#timeline', '#best', '#slow', '#alerts'].forEach((s) => ($(s).innerHTML = '<div class="space-y-3">' + '<div class="skeleton h-10"></div>'.repeat(4) + '</div>'))
  }

  ;(async function load() {
    skeletons()
    try {
      const since = new Date(Date.now() - 95 * DAY)
      since.setDate(1)
      const [tx, products, categories, settings] = await Promise.all([Api.transactions.list({ from: since.toISOString() }), Api.products.all(), Api.categories.list(), Api.settings.get()])
      Object.assign(state, { tx, products, categories, settings: settings.restock })
      renderKpis()
      renderTrend()
      renderTimeline()
      renderPerformance()
      renderAlerts()
      renderCategoryAndPayments()
      renderRestockCta()
    } catch (err) {
      $('#content').innerHTML = `<div class="card mt-6">${UI.errorState(err.message)}</div>`
      icons()
      $('[data-retry]').addEventListener('click', () => location.reload())
    }
  })()
})()
