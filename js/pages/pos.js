/* Point of Sale (full-screen, tablet friendly) */
(function () {
  const user = Auth.guard('pos')
  if (!user) return
  const { $, $$, esc, icons, toast, modal, setLoading } = UI
  const CART_KEY = 'stokku.pos.cart'

  let products = []
  let categories = []
  let store = null
  let activeCategory = ''
  // cart: [{ productId, quantity, discount }]
  let cart = loadCart()
  let discountMode = 'rp'
  let discountInput = 0

  // ---------------- Header ----------------
  $('#home-link').href = Auth.home(user.role)
  $('#cashier').innerHTML = `${Layout.avatar(user.name, 'w-9 h-9')}<div class="hidden md:block leading-tight"><div class="text-sm font-semibold">${esc(user.name)}</div><div class="text-[11px] text-white/50">${UI.ROLE_LABEL[user.role]}</div></div>`
  const navLinks = [
    { href: 'transactions.html', label: 'History', icon: 'receipt-text', page: 'transactions' },
    { href: 'products.html', label: 'Products', icon: 'package', page: 'products' },
    { href: 'dashboard.html', label: 'Dashboard', icon: 'layout-dashboard', page: 'dashboard' },
  ].filter((l) => Auth.canAccess(l.page, user.role))
  $('#pos-nav').innerHTML = navLinks
    .map((l) => `<a href="${l.href}" title="${l.label}" class="flex items-center gap-2 px-3 py-2 rounded-xl text-sm whitespace-nowrap text-white/70 hover:text-white hover:bg-white/5 transition"><i data-lucide="${l.icon}" class="w-4 h-4"></i><span class="hidden xl:inline">${l.label}</span></a>`)
    .join('')
  if (DB.DEMO_NO_LOGIN) {
    $('#logout').title = 'Switch role (demo)'
    $('#logout').innerHTML = '<i data-lucide="repeat"></i>'
  }
  $('#logout').addEventListener('click', Auth.logout)
  function tick() {
    const d = new Date()
    $('#clock').textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    $('#today').textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })
  }
  tick()
  setInterval(tick, 1000)
  icons()

  // ---------------- Cart persistence (per browser tab) ----------------
  function loadCart() {
    try {
      return JSON.parse(sessionStorage.getItem(CART_KEY) || '[]')
    } catch {
      return []
    }
  }
  function persistCart() {
    sessionStorage.setItem(CART_KEY, JSON.stringify(cart))
  }

  const productById = (id) => products.find((p) => p.id === id)

  // ---------------- Catalog ----------------
  function renderCategories() {
    const chips = [{ id: '', name: 'All', color: '#17181C' }, ...categories]
    $('#categories').innerHTML = chips
      .map((c) => `<button class="chip ${c.id === activeCategory ? 'active' : ''}" data-cat="${c.id}">${c.id ? `<span class="w-2 h-2 rounded-full" style="background:${c.color}"></span>` : ''}${esc(c.name)}</button>`)
      .join('')
  }
  $('#categories').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]')
    if (!b) return
    activeCategory = b.dataset.cat
    renderCategories()
    renderGrid()
  })

  function renderGrid() {
    const q = $('#search').value.trim().toLowerCase()
    const catColor = Object.fromEntries(categories.map((c) => [c.id, c.color]))
    const list = products
      .filter((p) => (!activeCategory || p.categoryId === activeCategory) && (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q)))
      .sort((a, b) => (a.stock <= 0) - (b.stock <= 0) || a.name.localeCompare(b.name, 'id'))
    if (!list.length) {
      $('#grid').innerHTML = `<div class="col-span-full">${UI.emptyState({ icon: 'search-x', title: 'No products found', text: 'Try another keyword or choose the "All" category.' })}</div>`
      return icons()
    }
    $('#grid').innerHTML = list
      .map((p, i) => {
        const inCart = cart.find((c) => c.productId === p.id)
        const out = p.stock <= 0
        return `<button class="tile card relative text-left p-3.5 flex flex-col ${out ? 'disabled' : ''} row-in" style="--i:${Math.min(i, 24)}" data-add="${p.id}" ${out ? 'aria-disabled="true"' : ''}>
          ${inCart ? `<span data-badge class="absolute top-2.5 right-2.5 min-w-[22px] h-[22px] px-1 rounded-full bg-brand-500 text-white text-[11px] font-bold grid place-items-center scale-in">${inCart.quantity}</span>` : ''}
          <div class="w-11 h-11 rounded-xl grid place-items-center text-white text-xs font-bold mb-3" style="background:${catColor[p.categoryId] || '#8E94A3'}">${esc(Fmt.initials(p.name))}</div>
          <p class="text-sm font-semibold leading-snug line-clamp-2 min-h-[2.5rem]">${esc(p.name)}</p>
          <p class="text-[11px] text-ink-400 mt-0.5">${esc(p.sku)}</p>
          <div class="flex items-end justify-between mt-auto pt-2">
            <span class="font-bold text-brand-600">${Fmt.rupiah(p.sellingPrice)}</span>
            <span class="text-[11px] font-semibold ${out ? 'text-red-600' : p.stock <= p.minStock ? 'text-amber-600' : 'text-ink-400'}">${out ? 'Out of stock' : 'Stock ' + p.stock}</span>
          </div></button>`
      })
      .join('')
  }

  /** Updates in-cart quantity badges without re-rendering (and re-animating) the grid. */
  function refreshTiles() {
    $$('[data-add]', $('#grid')).forEach((tile) => {
      const line = cart.find((c) => c.productId === tile.dataset.add)
      let badge = $('[data-badge]', tile)
      if (!line) return badge && badge.remove()
      if (!badge) {
        badge = document.createElement('span')
        badge.dataset.badge = ''
        badge.className = 'absolute top-2.5 right-2.5 min-w-[22px] h-[22px] px-1 rounded-full bg-brand-500 text-white text-[11px] font-bold grid place-items-center scale-in'
        tile.appendChild(badge)
      } else if (badge.textContent !== String(line.quantity)) UI.replayClass(badge, 'pop')
      badge.textContent = line.quantity
    })
  }

  $('#grid').addEventListener('click', (e) => {
    const tile = e.target.closest('[data-add]')
    if (!tile) return
    const p = productById(tile.dataset.add)
    if (addToCart(p)) flyToCart(tile)
  })
  $('#search').addEventListener('input', UI.debounce(renderGrid, 120))
  $('#search').addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.target.value = ''; renderGrid() }
    if (e.key === 'Enter') {
      // Enter in search: exact code match, or the only visible product.
      const q = e.target.value.trim()
      const exact = findByCode(q)
      const visible = $$('[data-add]:not(.disabled)', $('#grid'))
      const p = exact || (visible.length === 1 ? productById(visible[0].dataset.add) : null)
      if (p && addToCart(p)) { e.target.value = ''; renderGrid() }
    }
  })

  // ---------------- Barcode ----------------
  function findByCode(code) {
    const c = String(code).trim().toLowerCase()
    if (!c) return null
    return products.find((p) => p.barcode.toLowerCase() === c || p.sku.toLowerCase() === c) || null
  }
  function handleScan(code) {
    const p = findByCode(code)
    if (!p) {
      toast(`Barcode "${code}" is not registered.`, 'error')
      UI.replayClass($('#barcode'), 'shake')
      return
    }
    if (addToCart(p)) {
      const tile = $(`[data-add="${p.id}"]`)
      if (tile) flyToCart(tile)
    }
  }
  $('#barcode').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const code = e.target.value.trim()
      e.target.value = ''
      if (code) handleScan(code)
    }
  })

  // Keyboard-wedge scanners type very fast and end with Enter. Catch scans
  // even when no input is focused.
  let scanBuffer = ''
  let lastKey = 0
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F2') { e.preventDefault(); $('#search').focus(); $('#search').select() }
    if (e.key === 'F4') { e.preventDefault(); $('#barcode').focus() }
    if (e.key === 'F9') { e.preventDefault(); if (!$('.overlay')) openPayment() }
    const tag = (e.target.tagName || '').toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || $('.overlay')) return
    const now = performance.now()
    if (now - lastKey > 60) scanBuffer = ''
    lastKey = now
    if (e.key === 'Enter' && scanBuffer.length >= 4) {
      handleScan(scanBuffer)
      scanBuffer = ''
    } else if (e.key.length === 1) scanBuffer += e.key
  })

  // ---------------- Cart ----------------
  function addToCart(p) {
    if (!p) return false
    const line = cart.find((c) => c.productId === p.id)
    const qty = line ? line.quantity : 0
    if (qty + 1 > p.stock) {
      toast(p.stock <= 0 ? `${p.name} is out of stock.` : `Only ${p.stock} of ${p.name} in stock.`, 'warning')
      return false
    }
    if (line) line.quantity++
    else cart.push({ productId: p.id, quantity: 1, discount: 0 })
    renderCart(p.id)
    refreshTiles()
    return true
  }

  function flyToCart(fromEl) {
    const target = window.innerWidth >= 1024 ? $('#cart-icon') : $('#open-cart')
    const a = fromEl.getBoundingClientRect()
    const b = target.getBoundingClientRect()
    const dot = document.createElement('div')
    dot.className = 'fly-dot'
    dot.style.left = a.left + a.width / 2 - 7 + 'px'
    dot.style.top = a.top + a.height / 2 - 7 + 'px'
    dot.style.setProperty('--dx', b.left + b.width / 2 - (a.left + a.width / 2) + 'px')
    dot.style.setProperty('--dy', b.top + b.height / 2 - (a.top + a.height / 2) + 'px')
    document.body.appendChild(dot)
    setTimeout(() => {
      dot.remove()
      UI.replayClass(target, 'pop')
    }, 600)
  }

  function totals() {
    const lines = cart
      .map((c) => {
        const p = productById(c.productId)
        if (!p) return null
        const gross = p.sellingPrice * c.quantity
        const discount = Math.min(c.discount || 0, gross)
        return { ...c, p, gross, discount, subtotal: gross - discount }
      })
      .filter(Boolean)
    const subtotal = lines.reduce((s, l) => s + l.subtotal, 0)
    const trxDiscount = Math.min(subtotal, Math.round(discountMode === 'pct' ? (subtotal * Math.min(100, discountInput)) / 100 : discountInput))
    const items = lines.reduce((s, l) => s + l.quantity, 0)
    return { lines, subtotal, trxDiscount, total: subtotal - trxDiscount, items }
  }

  function renderCart(flashId) {
    persistCart()
    const t = totals()
    const box = $('#cart-items')
    if (!t.lines.length) {
      box.innerHTML = UI.emptyState({ icon: 'shopping-basket', title: 'Cart is empty', text: 'Pick a product or scan a barcode to start a sale.' })
    } else {
      box.innerHTML = `<div class="divide-y divide-ink-100">${t.lines
        .map(
          (l) => `<div class="px-5 py-3.5 ${l.productId === flashId ? 'flash' : ''}" data-line="${l.productId}">
          <div class="flex items-start gap-3">
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold leading-snug">${esc(l.p.name)}</p>
              <p class="text-xs text-ink-500 mt-0.5">${Fmt.rupiah(l.p.sellingPrice)} / ${esc(l.p.unit)}</p>
            </div>
            <div class="text-right">
              <p class="text-sm font-bold tabular-nums">${Fmt.rupiah(l.subtotal)}</p>
              ${l.discount ? `<p class="text-[11px] text-ink-400 line-through tabular-nums">${Fmt.rupiah(l.gross)}</p>` : ''}
            </div>
          </div>
          <div class="flex items-center justify-between mt-2.5">
            <div class="flex items-center border border-ink-200 rounded-[10px] h-9 overflow-hidden bg-white">
              <button class="w-9 h-full hover:bg-ink-50 text-ink-600" data-dec="${l.productId}" aria-label="Decrease"><i data-lucide="minus" class="w-3.5 h-3.5 mx-auto"></i></button>
              <input class="w-12 h-full text-center text-sm font-bold outline-none tabular-nums" data-qty="${l.productId}" value="${l.quantity}" inputmode="numeric">
              <button class="w-9 h-full hover:bg-ink-50 text-ink-600" data-inc="${l.productId}" aria-label="Increase"><i data-lucide="plus" class="w-3.5 h-3.5 mx-auto"></i></button>
            </div>
            <div class="flex items-center gap-1">
              <div class="relative ${l.discount ? '' : 'hidden'}" data-disc-wrap="${l.productId}">
                <input class="input h-8 w-24 text-right text-xs pr-2" data-disc="${l.productId}" value="${l.discount ? Fmt.number(l.discount) : ''}" placeholder="Discount Rp" inputmode="numeric">
              </div>
              <button class="btn btn-ghost btn-icon btn-sm ${l.discount ? 'text-brand-600' : 'text-ink-400'}" data-disc-toggle="${l.productId}" title="Item discount"><i data-lucide="badge-percent"></i></button>
              <button class="btn btn-ghost btn-icon btn-sm text-ink-400 hover:text-red-600" data-rm="${l.productId}" title="Remove"><i data-lucide="trash-2"></i></button>
            </div>
          </div></div>`,
        )
        .join('')}</div>`
    }
    $('#cart-count').textContent = t.items
    $('#cart-sub').textContent = t.lines.length ? `${t.lines.length} products · ${t.items} items` : 'No items yet'
    $('#t-subtotal').textContent = Fmt.rupiah(t.subtotal)
    $('#disc-row').hidden = !t.trxDiscount
    $('#t-disc-amount').textContent = '-' + Fmt.rupiah(t.trxDiscount)
    const totalEl = $('#t-total')
    if (totalEl.dataset.value !== String(t.total)) {
      UI.countUp(totalEl, t.total, { duration: 450, format: Fmt.rupiah })
      UI.replayClass(totalEl, 'pop')
    }
    $('#pay-btn').disabled = !t.lines.length
    $('#m-count').textContent = `${t.items} items`
    $('#m-total').textContent = Fmt.rupiah(t.total)
    icons()
  }

  $('#cart-items').addEventListener('click', (e) => {
    const t = e.target.closest('[data-inc],[data-dec],[data-rm],[data-disc-toggle]')
    if (!t) return
    const id = t.dataset.inc || t.dataset.dec || t.dataset.rm || t.dataset.discToggle
    const line = cart.find((c) => c.productId === id)
    if (!line) return
    if (t.dataset.inc) {
      const p = productById(id)
      if (line.quantity + 1 > p.stock) return toast(`Only ${p.stock} of ${p.name} in stock.`, 'warning')
      line.quantity++
    }
    if (t.dataset.dec) {
      line.quantity--
      if (line.quantity <= 0) cart = cart.filter((c) => c !== line)
    }
    if (t.dataset.rm) cart = cart.filter((c) => c !== line)
    if (t.dataset.discToggle) {
      const wrap = $(`[data-disc-wrap="${id}"]`)
      wrap.classList.toggle('hidden')
      if (!wrap.classList.contains('hidden')) $('input', wrap).focus()
      return
    }
    renderCart()
    refreshTiles()
  })
  $('#cart-items').addEventListener('change', (e) => {
    const qtyId = e.target.dataset.qty
    const discId = e.target.dataset.disc
    if (qtyId) {
      const line = cart.find((c) => c.productId === qtyId)
      const p = productById(qtyId)
      let q = Math.floor(Fmt.parseNumber(e.target.value))
      if (q > p.stock) { toast(`Only ${p.stock} of ${p.name} in stock.`, 'warning'); q = p.stock }
      if (q <= 0) cart = cart.filter((c) => c !== line)
      else line.quantity = q
    }
    if (discId) {
      const line = cart.find((c) => c.productId === discId)
      const p = productById(discId)
      line.discount = Math.min(Fmt.parseNumber(e.target.value), p.sellingPrice * line.quantity)
    }
    renderCart()
    refreshTiles()
  })
  $('#cart-items').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.target.dataset.qty || e.target.dataset.disc)) e.target.blur()
  })

  $('#clear-cart').addEventListener('click', async () => {
    if (!cart.length) return
    if (!(await UI.confirm({ title: 'Clear the cart?', message: 'All items in the current order will be removed.', confirmText: 'Clear', danger: true }))) return
    resetOrder()
  })

  // Transaction discount (Rp or %)
  $('#disc-mode').addEventListener('click', (e) => {
    const b = e.target.closest('[data-mode]')
    if (!b) return
    discountMode = b.dataset.mode
    $$('#disc-mode button').forEach((x) => x.classList.toggle('active', x === b))
    $('#t-discount').placeholder = discountMode === 'pct' ? '0 %' : '0'
    readDiscount()
  })
  function readDiscount() {
    const input = $('#t-discount')
    let v = Fmt.parseNumber(input.value)
    if (discountMode === 'pct') v = Math.min(100, v)
    discountInput = v
    input.value = v ? Fmt.number(v) : ''
    renderCart()
  }
  $('#t-discount').addEventListener('input', readDiscount)

  // Mobile cart sheet
  $('#open-cart').addEventListener('click', () => $('#cart-panel').classList.remove('translate-y-full'))
  $('#close-cart').addEventListener('click', () => $('#cart-panel').classList.add('translate-y-full'))

  function resetOrder() {
    cart = []
    discountInput = 0
    $('#t-discount').value = ''
    renderCart()
    refreshTiles()
  }

  // ---------------- Payment ----------------
  const METHODS = [
    { id: 'cash', label: 'Cash', icon: 'banknote' },
    { id: 'qris', label: 'QRIS', icon: 'qr-code' },
    { id: 'transfer', label: 'Transfer', icon: 'landmark' },
  ]

  function quickAmounts(total) {
    const set = new Set([total])
    ;[5000, 10000, 20000, 50000, 100000].forEach((n) => set.add(Math.ceil(total / n) * n))
    return [...set].filter((v) => v >= total).sort((a, b) => a - b).slice(0, 6)
  }

  function fakeQr(seedText) {
    // Decorative QR-like pattern (not a scannable code) for the demo.
    const n = 25
    let h = 0
    for (const ch of seedText) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    const rand = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296)
    let cells = ''
    const finder = (x, y) => (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7)
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!finder(x, y) && rand() > 0.52) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`
    const eye = (x, y) => `<rect x="${x}" y="${y}" width="7" height="7"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`
    return `<svg viewBox="-1 -1 ${n + 2} ${n + 2}" class="w-48 h-48" shape-rendering="crispEdges"><rect x="-1" y="-1" width="${n + 2}" height="${n + 2}" fill="#fff"/><g fill="#17181C">${cells}${eye(0, 0)}${eye(n - 7, 0)}${eye(0, n - 7)}</g></svg>`
  }

  function openPayment() {
    const t = totals()
    if (!t.lines.length) return
    let method = 'cash'
    let paid = 0
    const m = modal({
      title: 'Payment',
      subtitle: `${t.lines.length} products · ${t.items} items`,
      size: 'md',
      body: `
        <div class="rounded-2xl bg-ink-900 text-white p-5 relative overflow-hidden">
          <div class="blob w-40 h-40 bg-brand-500 -right-10 -top-16 float" style="opacity:.5"></div>
          <p class="text-sm text-white/60 relative">Amount due</p>
          <p class="text-4xl font-extrabold tracking-tight relative tabular-nums mt-1">${Fmt.rupiah(t.total)}</p>
          ${t.trxDiscount ? `<p class="text-xs text-white/50 mt-1 relative">Includes a discount of ${Fmt.rupiah(t.trxDiscount)}</p>` : ''}
        </div>
        <div class="grid grid-cols-3 gap-2 mt-5" id="methods">
          ${METHODS.map((x) => `<button class="rounded-xl border-2 p-3 flex flex-col items-center gap-1.5 transition ${x.id === method ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-100 hover:border-ink-300 text-ink-600'}" data-method="${x.id}"><i data-lucide="${x.icon}" class="w-6 h-6"></i><span class="text-sm font-semibold">${x.label}</span></button>`).join('')}
        </div>
        <div id="method-body" class="mt-5"></div>`,
      footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary btn-lg" id="confirm-pay"><i data-lucide="check-check"></i>Complete sale</button>`,
    })
    const body = $('#method-body', m.el)
    const confirmBtn = $('#confirm-pay', m.el)

    function renderMethod() {
      $$('[data-method]', m.el).forEach((b) => {
        const on = b.dataset.method === method
        b.className = `rounded-xl border-2 p-3 flex flex-col items-center gap-1.5 transition ${on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-ink-100 hover:border-ink-300 text-ink-600'}`
      })
      if (method === 'cash') {
        body.innerHTML = `<label class="label">Cash received</label>
          <div class="relative"><span class="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-ink-400">Rp</span>
          <input id="paid" class="input h-14 text-2xl font-bold pl-12 tabular-nums" inputmode="numeric" value="${paid ? Fmt.number(paid) : ''}" placeholder="0" autocomplete="off"></div>
          <div class="grid grid-cols-3 gap-2 mt-3">${quickAmounts(t.total).map((v, i) => `<button class="btn btn-outline btn-sm" data-quick="${v}">${i === 0 ? 'Exact amount' : Fmt.rupiah(v)}</button>`).join('')}</div>
          <div class="flex items-center justify-between mt-4 p-4 rounded-xl bg-ink-50" id="change-box">
            <span class="text-sm font-semibold text-ink-600">Change</span><span class="text-2xl font-extrabold tabular-nums" id="change">Rp 0</span></div>`
        const input = $('#paid', body)
        setTimeout(() => input.focus(), 50)
        input.addEventListener('input', () => {
          paid = Fmt.parseNumber(input.value)
          input.value = paid ? Fmt.number(paid) : ''
          updateChange()
        })
        input.addEventListener('keydown', (e) => e.key === 'Enter' && confirmBtn.click())
        $$('[data-quick]', body).forEach((b) => b.addEventListener('click', () => {
          paid = Number(b.dataset.quick)
          input.value = Fmt.number(paid)
          updateChange()
        }))
        updateChange()
      } else if (method === 'qris') {
        body.innerHTML = `<div class="flex flex-col items-center text-center">
          <div class="p-3 rounded-2xl border border-ink-100 shadow-sm scale-in relative">${fakeQr(String(t.total) + Date.now())}
            <div class="absolute inset-x-3 top-3 h-0.5 bg-brand-500/70 shadow-[0_0_12px_rgba(242,104,58,.8)]" style="animation: scanline 2s ease-in-out infinite alternate"></div></div>
          <p class="text-sm font-semibold mt-3">Ask the customer to scan the QRIS code</p>
          <p class="text-xs text-ink-500 mt-1 flex items-center gap-1.5"><svg class="spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.2-8.56" stroke-linecap="round"/></svg>Waiting for payment confirmation… (demo)</p></div>
          <style>@keyframes scanline{from{transform:translateY(0)}to{transform:translateY(190px)}}</style>`
        confirmBtn.disabled = false
      } else {
        body.innerHTML = `<div class="rounded-xl border border-ink-100 divide-y divide-ink-100 text-sm anim-fade-up">
          <div class="flex justify-between p-3"><span class="text-ink-500">Bank</span><b>BCA</b></div>
          <div class="flex justify-between p-3"><span class="text-ink-500">Account no.</span><b class="font-mono">123 456 7890</b></div>
          <div class="flex justify-between p-3"><span class="text-ink-500">Account name</span><b>${esc(store.name)}</b></div>
          <div class="flex justify-between p-3"><span class="text-ink-500">Amount</span><b class="text-brand-600">${Fmt.rupiah(t.total)}</b></div></div>
          <p class="text-xs text-ink-500 mt-3 flex gap-2"><i data-lucide="info" class="w-4 h-4 shrink-0"></i>Make sure the funds have arrived before completing the sale.</p>`
        confirmBtn.disabled = false
      }
      icons()
    }

    function updateChange() {
      const change = paid - t.total
      const el = $('#change', body)
      const box = $('#change-box', body)
      if (!el) return
      el.textContent = paid ? (change >= 0 ? Fmt.rupiah(change) : 'Short by ' + Fmt.rupiah(-change)) : 'Rp 0'
      box.className = `flex items-center justify-between mt-4 p-4 rounded-xl transition-colors ${!paid ? 'bg-ink-50' : change >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`
      confirmBtn.disabled = paid < t.total
    }

    $('#methods', m.el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-method]')
      if (!b) return
      method = b.dataset.method
      renderMethod()
    })

    confirmBtn.addEventListener('click', async () => {
      if (confirmBtn.disabled) return
      setLoading(confirmBtn, true, 'Processing...')
      try {
        const tx = await Api.transactions.create({
          items: t.lines.map((l) => ({ productId: l.productId, quantity: l.quantity, discount: l.discount })),
          discount: t.trxDiscount,
          paymentMethod: method,
          amountPaid: method === 'cash' ? paid : t.total,
        })
        m.close()
        products = await Api.products.all()
        resetOrder()
        renderGrid()
        $('#cart-panel').classList.add('translate-y-full')
        showSuccess(tx)
      } catch (err) {
        setLoading(confirmBtn, false)
        toast(err.message, 'error')
        // Stock may have changed elsewhere — refresh catalog.
        products = await Api.products.all()
        renderGrid()
      }
    })
    renderMethod()
  }

  // ---------------- Success + receipt ----------------
  function showSuccess(tx) {
    let width = localStorage.getItem('stokku.receiptWidth') || '58'
    const m = modal({
      title: 'Payment successful',
      subtitle: esc(tx.invoiceNo),
      size: 'lg',
      body: `<div class="grid md:grid-cols-2 gap-6 items-start">
        <div class="text-center md:text-left">
          <div class="relative w-20 h-20 mx-auto md:mx-0">
            <span class="absolute inset-0 rounded-full bg-green-400" style="animation:pulse-ring 1.4s ease-out 2"></span>
            <div class="relative w-20 h-20 rounded-full bg-green-500 grid place-items-center scale-in shadow-lg shadow-green-500/30">
              <svg viewBox="0 0 24 24" class="w-10 h-10 check-draw" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
            </div>
          </div>
          <p class="text-sm text-ink-500 mt-5">Total paid</p>
          <p class="text-3xl font-extrabold tabular-nums" id="s-total">Rp 0</p>
          <div class="mt-4 space-y-2 text-sm">
            <div class="flex justify-between"><span class="text-ink-500">Method</span><b>${UI.PAYMENT_LABEL[tx.paymentMethod]}</b></div>
            ${tx.paymentMethod === 'cash' ? `<div class="flex justify-between"><span class="text-ink-500">Received</span><b>${Fmt.rupiah(tx.amountPaid)}</b></div>
            <div class="flex justify-between items-center p-3 rounded-xl bg-green-50 text-green-700"><span class="font-semibold">Change</span><b class="text-xl">${Fmt.rupiah(tx.change)}</b></div>` : ''}
            <div class="flex justify-between"><span class="text-ink-500">Cashier</span><b>${esc(tx.cashierName)}</b></div>
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between mb-2"><p class="text-xs font-semibold text-ink-500 uppercase tracking-wider">Receipt preview</p>
            <div class="segmented" id="rw"><button data-w="58" class="${width === '58' ? 'active' : ''}">58 mm</button><button data-w="80" class="${width === '80' ? 'active' : ''}">80 mm</button></div></div>
          <div class="bg-ink-100 rounded-xl p-4 max-h-[46vh] overflow-auto thin-scroll"><div class="shadow-md mx-auto w-fit" id="receipt"></div></div>
        </div></div>`,
      footer: `<button class="btn btn-outline" id="print"><i data-lucide="printer"></i>Print receipt</button><button class="btn btn-primary" data-close id="new-trx"><i data-lucide="plus"></i>New sale <span class="opacity-60 text-xs">(Enter)</span></button>`,
      onClose: () => $('#search').focus(),
    })
    UI.countUp($('#s-total', m.el), tx.total, { duration: 900, format: Fmt.rupiah })
    const renderReceipt = () => ($('#receipt', m.el).innerHTML = UI.receiptHtml(tx, store, width))
    renderReceipt()
    $('#rw', m.el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-w]')
      if (!b) return
      width = b.dataset.w
      localStorage.setItem('stokku.receiptWidth', width)
      $$('#rw button', m.el).forEach((x) => x.classList.toggle('active', x === b))
      renderReceipt()
    })
    $('#print', m.el).addEventListener('click', () => UI.printReceipt(tx, store, width))
    setTimeout(() => $('#new-trx', m.el).focus(), 100)
  }

  $('#pay-btn').addEventListener('click', openPayment)

  // ---------------- Init ----------------
  ;(async function init() {
    $('#grid').innerHTML = Array.from({ length: 12 })
      .map(() => '<div class="card p-3.5"><div class="skeleton w-11 h-11 rounded-xl"></div><div class="skeleton h-4 mt-3"></div><div class="skeleton h-4 w-2/3 mt-2"></div><div class="skeleton h-5 w-1/2 mt-4"></div></div>')
      .join('')
    try {
      const [p, c, s] = await Promise.all([Api.products.all(), Api.categories.list(), Api.settings.get()])
      products = p
      categories = c
      store = s.store
      $('#store-name').textContent = store.name
      cart = cart.filter((l) => productById(l.productId))
      renderCategories()
      renderGrid()
      renderCart()
      $('#barcode').focus()
    } catch (err) {
      $('#grid').innerHTML = `<div class="col-span-full card">${UI.errorState(err.message)}</div>`
      icons()
      $('[data-retry]').addEventListener('click', () => location.reload())
    }
  })()
})()
