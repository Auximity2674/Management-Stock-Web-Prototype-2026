/* Products, categories & suppliers page */
(function () {
  const user = Layout.mount({ page: 'products', title: 'Products' })
  if (!user) return
  const { $, $$, esc, icons, toast, modal, confirm, setLoading } = UI
  const isOwner = user.role === 'owner'

  const state = {
    search: UI.query('q') || '',
    categoryId: '',
    stockStatus: UI.query('status') || '',
    sort: 'name:asc',
    page: 1,
    pageSize: 10,
    categories: [],
    suppliers: [],
  }
  const catMap = () => Object.fromEntries(state.categories.map((c) => [c.id, c]))
  const supMap = () => Object.fromEntries(state.suppliers.map((s) => [s.id, s]))

  // ---------- Setup ----------
  if (!isOwner) $$('.owner-only').forEach((el) => (el.style.display = 'none'))
  if (isOwner) {
    $('#header-actions').innerHTML = `<button class="btn btn-primary" id="add-btn"><i data-lucide="plus"></i>Add product</button>`
    $('#add-btn').addEventListener('click', () => openForm())
  }
  icons()
  UI.tabs($('#tabs'), (tab) => {
    if (tab === 'categories') renderCategories()
    if (tab === 'suppliers') renderSuppliers()
    const btn = $('#add-btn')
    if (btn) {
      btn.innerHTML = { products: '<i data-lucide="plus"></i>Add product', categories: '<i data-lucide="plus"></i>Add category', suppliers: '<i data-lucide="plus"></i>Add supplier' }[tab]
      btn.onclick = null
      btn.replaceWith(btn.cloneNode(true))
      const nb = $('#add-btn')
      nb.addEventListener('click', () => (tab === 'products' ? openForm() : tab === 'categories' ? openCategoryForm() : openSupplierForm()))
      icons()
    }
  })

  $('#search').value = state.search
  $('#f-status').value = state.stockStatus
  $('#search').addEventListener('input', UI.debounce((e) => { state.search = e.target.value.trim(); state.page = 1; loadProducts() }, 280))
  $('#f-category').addEventListener('change', (e) => { state.categoryId = e.target.value; state.page = 1; loadProducts() })
  $('#f-status').addEventListener('change', (e) => { state.stockStatus = e.target.value; state.page = 1; loadProducts() })
  $('#f-sort').addEventListener('change', (e) => { state.sort = e.target.value; loadProducts() })
  $('#f-size').addEventListener('change', (e) => { state.pageSize = Number(e.target.value); state.page = 1; loadProducts() })
  $('#pager').addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]')
    if (!b || b.disabled) return
    state.page = Number(b.dataset.page)
    loadProducts()
  })

  async function init() {
    try {
      const [cats, sups] = await Promise.all([Api.categories.list(), Api.suppliers.list()])
      state.categories = cats
      state.suppliers = sups
      $('#f-category').innerHTML = '<option value="">All categories</option>' + cats.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')
    } catch (err) {
      toast(err.message, 'error')
    }
    loadSummary()
    await loadProducts()
    const view = UI.query('view')
    if (view) openDetail(view)
  }

  // ---------- Summary cards ----------
  async function loadSummary() {
    const box = $('#summary')
    box.innerHTML = Array.from({ length: 4 }).map(() => '<div class="card p-4"><div class="skeleton h-4 w-24"></div><div class="skeleton h-7 w-16 mt-3"></div></div>').join('')
    const all = await Api.products.all()
    const value = all.reduce((s, p) => s + p.stock * p.purchasePrice, 0)
    const low = all.filter((p) => p.stock > 0 && p.stock <= p.minStock).length
    const out = all.filter((p) => p.stock <= 0).length
    const cards = [
      { label: 'Total products', value: all.length, icon: 'package', color: 'bg-iris-50 text-iris-600', filter: '' },
      { label: 'Inventory value', value, icon: 'wallet', color: 'bg-teal-50 text-teal-600', money: true },
      { label: 'Low stock', value: low, icon: 'package-minus', color: 'bg-amber-50 text-amber-600', filter: 'low' },
      { label: 'Out of stock', value: out, icon: 'package-x', color: 'bg-red-50 text-red-600', filter: 'out' },
    ]
    box.innerHTML = cards
      .map(
        (c, i) => `<button class="card card-hover p-4 text-left flex items-center gap-3 ${c.filter !== undefined ? '' : 'cursor-default'}" data-filter="${c.filter ?? ''}" ${c.money ? 'data-nofilter' : ''}>
          <div class="kpi-icon ${c.color}"><i data-lucide="${c.icon}"></i></div>
          <div class="min-w-0"><p class="text-xs text-ink-500 font-medium">${c.label}</p>
          <p class="text-lg sm:text-xl font-bold truncate" data-count="${i}">0</p></div></button>`,
      )
      .join('')
    icons()
    cards.forEach((c, i) => UI.countUp($(`[data-count="${i}"]`, box), c.value, { format: c.money ? Fmt.rupiahShort : (v) => Fmt.number(v) }))
    $$('[data-filter]', box).forEach((b) =>
      b.addEventListener('click', () => {
        if (b.hasAttribute('data-nofilter')) return
        state.stockStatus = b.dataset.filter
        $('#f-status').value = state.stockStatus
        state.page = 1
        loadProducts()
      }),
    )
  }

  // ---------- Product table ----------
  let reqId = 0
  async function loadProducts() {
    const id = ++reqId
    const rows = $('#rows')
    rows.innerHTML = UI.skeletonRows(7, Math.min(state.pageSize, 8))
    $('#state').innerHTML = ''
    $('#pager').innerHTML = ''
    try {
      const [sortBy, sortDir] = state.sort.split(':')
      const res = await Api.products.list({ search: state.search, categoryId: state.categoryId, stockStatus: state.stockStatus, sortBy, sortDir, page: state.page, pageSize: state.pageSize })
      if (id !== reqId) return // a newer request superseded this one
      state.page = res.page
      if (!res.data.length) {
        rows.innerHTML = ''
        $('#state').innerHTML = UI.emptyState({
          icon: 'search-x',
          title: 'No products found',
          text: state.search || state.categoryId || state.stockStatus ? 'Try a different keyword or filter.' : 'No products yet. Add your first product.',
        })
        icons()
        return
      }
      const cats = catMap()
      rows.innerHTML = res.data.map((p, i) => productRow(p, cats[p.categoryId], i)).join('')
      $('#pager').innerHTML = UI.pagination(res)
      icons()
    } catch (err) {
      rows.innerHTML = ''
      $('#state').innerHTML = UI.errorState(err.message)
      icons()
      $('#state [data-retry]').addEventListener('click', loadProducts)
    }
  }

  function productRow(p, cat, i) {
    const pct = Math.min(100, Math.round((p.stock / Math.max(1, p.minStock * 3)) * 100))
    const barColor = p.stock <= 0 ? '#dc2626' : p.stock <= p.minStock ? '#d97706' : '#16a34a'
    return `<tr class="row-in" style="--i:${i}">
      <td>
        <button class="flex items-center gap-3 text-left group" data-view="${p.id}">
          <div class="w-10 h-10 rounded-xl grid place-items-center text-white text-xs font-bold shrink-0 transition group-hover:scale-105" style="background:${cat ? cat.color : '#8E94A3'}">${esc(Fmt.initials(p.name))}</div>
          <div class="min-w-0"><p class="font-semibold text-ink-900 group-hover:text-brand-600 transition truncate max-w-[260px]">${esc(p.name)}</p>
          <p class="text-xs text-ink-500">${esc(p.sku)} · ${esc(p.barcode || '-')}</p></div>
        </button>
      </td>
      <td><span class="text-sm text-ink-700">${cat ? esc(cat.name) : '-'}</span></td>
      <td class="num text-ink-600">${Fmt.rupiah(p.purchasePrice)}</td>
      <td class="num font-semibold">${Fmt.rupiah(p.sellingPrice)}</td>
      <td>
        <div class="w-28">
          <div class="flex justify-between text-xs mb-1"><b>${Fmt.number(p.stock)} <span class="font-normal text-ink-500">${esc(p.unit)}</span></b><span class="text-ink-400">min ${p.minStock}</span></div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${barColor}"></div></div>
        </div>
      </td>
      <td>${UI.stockBadge(p)}</td>
      <td class="num whitespace-nowrap">
        <button class="btn btn-ghost btn-icon btn-sm" data-view="${p.id}" title="Details & history"><i data-lucide="eye"></i></button>
        ${isOwner ? `<button class="btn btn-ghost btn-icon btn-sm" data-edit="${p.id}" title="Edit"><i data-lucide="pencil"></i></button>
        <button class="btn btn-ghost btn-icon btn-sm text-red-500 hover:!bg-red-50" data-del="${p.id}" title="Delete"><i data-lucide="trash-2"></i></button>` : ''}
      </td></tr>`
  }

  $('#rows').addEventListener('click', async (e) => {
    const view = e.target.closest('[data-view]')
    const edit = e.target.closest('[data-edit]')
    const del = e.target.closest('[data-del]')
    if (view) openDetail(view.dataset.view)
    if (edit) openForm(await Api.products.get(edit.dataset.edit))
    if (del) {
      const p = await Api.products.get(del.dataset.del)
      const ok = await confirm({ title: 'Delete product?', message: `<b>${esc(p.name)}</b> will be removed from the catalog. Transaction history is kept.`, confirmText: 'Delete', danger: true })
      if (!ok) return
      try {
        await Api.products.remove(p.id)
        toast('Product deleted.')
        loadProducts()
        loadSummary()
      } catch (err) {
        toast(err.message, 'error')
      }
    }
  })

  // ---------- Product form ----------
  function field(name, label, input, cls = '') {
    return `<div class="${cls}"><label class="label" for="pf-${name}">${label}</label>${input}<p class="field-error hidden" data-err="${name}"></p></div>`
  }

  function openForm(p) {
    const editing = !!p
    p = p || { name: '', sku: '', barcode: '', categoryId: '', unit: 'pcs', purchasePrice: '', sellingPrice: '', stock: 0, minStock: 5, supplierId: '', leadTimeDays: 3 }
    const catOpts = state.categories.map((c) => `<option value="${c.id}" ${c.id === p.categoryId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')
    const supOpts = state.suppliers.map((s) => `<option value="${s.id}" ${s.id === p.supplierId ? 'selected' : ''}>${esc(s.name)}</option>`).join('')
    const m = modal({
      title: editing ? 'Edit product' : 'Add new product',
      subtitle: editing ? esc(p.sku) : 'Fill in the product details below.',
      size: 'lg',
      body: `<form id="pform" class="grid sm:grid-cols-6 gap-4" novalidate>
        ${field('name', 'Product name *', `<input id="pf-name" name="name" class="input" value="${esc(p.name)}" placeholder="e.g. Granulated Sugar 1 kg" />`, 'sm:col-span-6')}
        ${field('sku', 'SKU *', `<input id="pf-sku" name="sku" class="input uppercase" value="${esc(p.sku)}" placeholder="STP-051" />`, 'sm:col-span-2')}
        ${field('barcode', 'Barcode', `<div class="input-icon"><i data-lucide="barcode"></i><input id="pf-barcode" name="barcode" class="input" value="${esc(p.barcode)}" placeholder="Scan / type" /></div>`, 'sm:col-span-2')}
        ${field('unit', 'Unit *', `<input id="pf-unit" name="unit" class="input" value="${esc(p.unit)}" list="units" /><datalist id="units"><option>pcs</option><option>pack</option><option>bottle</option><option>box</option><option>kg</option><option>can</option><option>sack</option><option>jar</option></datalist>`, 'sm:col-span-2')}
        ${field('categoryId', 'Category *', `<select id="pf-categoryId" name="categoryId" class="select"><option value="">Select category</option>${catOpts}</select>`, 'sm:col-span-3')}
        ${field('supplierId', 'Supplier', `<select id="pf-supplierId" name="supplierId" class="select"><option value="">— No supplier —</option>${supOpts}</select>`, 'sm:col-span-3')}
        ${field('purchasePrice', 'Cost price (Rp) *', `<input id="pf-purchasePrice" name="purchasePrice" class="input" inputmode="numeric" data-money value="${p.purchasePrice === '' ? '' : Fmt.number(p.purchasePrice)}" placeholder="0" />`, 'sm:col-span-3')}
        ${field('sellingPrice', 'Selling price (Rp) *', `<input id="pf-sellingPrice" name="sellingPrice" class="input" inputmode="numeric" data-money value="${p.sellingPrice === '' ? '' : Fmt.number(p.sellingPrice)}" placeholder="0" />`, 'sm:col-span-3')}
        <div class="sm:col-span-6 -mt-1 text-xs text-ink-500" id="margin-hint"></div>
        ${field('stock', editing ? 'Current stock' : 'Opening stock', `<input id="pf-stock" name="stock" type="number" min="0" class="input" value="${p.stock}" ${editing ? 'disabled' : ''} />${editing ? '<p class="text-[11px] text-ink-400 mt-1">Change stock from the Stock & Counts page.</p>' : ''}`, 'sm:col-span-2')}
        ${field('minStock', 'Minimum stock *', `<input id="pf-minStock" name="minStock" type="number" min="0" class="input" value="${p.minStock}" />`, 'sm:col-span-2')}
        ${field('leadTimeDays', 'Lead time (days) *', `<input id="pf-leadTimeDays" name="leadTimeDays" type="number" min="0" class="input" value="${p.leadTimeDays}" />`, 'sm:col-span-2')}
      </form>`,
      footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="pf-save"><i data-lucide="check"></i>${editing ? 'Save changes' : 'Save product'}</button>`,
    })
    const form = $('#pform', m.el)
    const moneyInputs = $$('[data-money]', form)
    moneyInputs.forEach((inp) =>
      inp.addEventListener('input', () => {
        const v = Fmt.parseNumber(inp.value)
        inp.value = v ? Fmt.number(v) : ''
        updateMargin()
      }),
    )
    function updateMargin() {
      const buy = Fmt.parseNumber(form.purchasePrice.value)
      const sell = Fmt.parseNumber(form.sellingPrice.value)
      const hint = $('#margin-hint', m.el)
      if (buy && sell) {
        const margin = sell - buy
        const pct = (margin / sell) * 100
        hint.innerHTML = `Margin: <b class="${margin < 0 ? 'text-red-600' : 'text-green-600'}">${Fmt.rupiah(margin)} (${Fmt.number(pct, 1)}%)</b> per ${esc(form.unit.value || 'unit')}`
      } else hint.textContent = ''
    }
    updateMargin()

    $('#pf-save', m.el).addEventListener('click', async () => {
      const btn = $('#pf-save', m.el)
      $$('[data-err]', form).forEach((e) => e.classList.add('hidden'))
      $$('.is-invalid', form).forEach((e) => e.classList.remove('is-invalid'))
      const input = {
        name: form.name.value,
        sku: form.sku.value.toUpperCase(),
        barcode: form.barcode.value,
        unit: form.unit.value,
        categoryId: form.categoryId.value,
        supplierId: form.supplierId.value,
        purchasePrice: Fmt.parseNumber(form.purchasePrice.value),
        sellingPrice: Fmt.parseNumber(form.sellingPrice.value),
        stock: Number(form.stock.value),
        minStock: Number(form.minStock.value),
        leadTimeDays: Number(form.leadTimeDays.value),
      }
      setLoading(btn, true, 'Saving...')
      try {
        if (editing) await Api.products.update(p.id, input)
        else await Api.products.create(input)
        toast(editing ? 'Product changes saved.' : 'New product added.')
        m.close()
        loadProducts()
        loadSummary()
      } catch (err) {
        setLoading(btn, false)
        if (err.fields) {
          Object.entries(err.fields).forEach(([k, msg]) => {
            const el = $(`[data-err="${k}"]`, form)
            if (el) { el.textContent = msg; el.classList.remove('hidden') }
            const inp = form[k]
            if (inp) inp.classList.add('is-invalid')
          })
          UI.replayClass($('.modal', m.el), 'shake')
        }
        toast(err.message, 'error')
      }
    })
  }

  // ---------- Product detail drawer ----------
  async function openDetail(id) {
    const m = modal({ title: 'Product details', size: 'lg', drawer: true, body: `<div class="space-y-3">${'<div class="skeleton h-6"></div>'.repeat(5)}</div>` })
    let p
    try {
      p = await Api.products.get(id)
    } catch (err) {
      $('.modal-body', m.el).innerHTML = UI.errorState(err.message)
      return icons()
    }
    const cat = catMap()[p.categoryId]
    const sup = supMap()[p.supplierId]
    const margin = p.sellingPrice - p.purchasePrice
    $('.modal-head h3', m.el).textContent = p.name
    $('.modal-body', m.el).innerHTML = `
      <div class="flex items-center gap-4 anim-fade-up">
        <div class="w-14 h-14 rounded-2xl grid place-items-center text-white font-bold" style="background:${cat ? cat.color : '#8E94A3'}">${esc(Fmt.initials(p.name))}</div>
        <div class="flex-1 min-w-0"><p class="text-xs text-ink-500">${esc(p.sku)} · ${esc(p.barcode || 'no barcode')}</p>
        <div class="flex flex-wrap gap-2 mt-1">${UI.stockBadge(p)}<span class="badge badge-gray no-dot">${cat ? esc(cat.name) : '-'}</span></div></div>
        ${isOwner ? `<button class="btn btn-outline btn-sm" id="d-edit"><i data-lucide="pencil"></i>Edit</button>` : ''}
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 stagger">
        ${[
          ['Stock', `${Fmt.number(p.stock)} ${esc(p.unit)}`],
          ['Minimum stock', `${p.minStock} ${esc(p.unit)}`],
          ['Selling price', Fmt.rupiah(p.sellingPrice)],
          ['Margin', `${Fmt.rupiah(margin)}`],
          ['Cost price', Fmt.rupiah(p.purchasePrice)],
          ['Stock value', Fmt.rupiah(p.stock * p.purchasePrice)],
          ['Lead time', `${p.leadTimeDays} days`],
          ['Supplier', sup ? esc(sup.name) : '-'],
        ]
          .map(([k, v]) => `<div class="rounded-xl bg-ink-50 px-3 py-2.5"><p class="text-[11px] text-ink-500">${k}</p><p class="text-sm font-bold truncate" title="${v}">${v}</p></div>`)
          .join('')}
      </div>
      <div class="mt-6">
        <div class="flex items-center justify-between"><p class="font-bold">Stock level (60 days)</p><span class="text-xs text-ink-400">stock level after each movement</span></div>
        <div class="h-44 mt-2"><canvas id="stock-chart"></canvas></div>
      </div>
      <div class="mt-6">
        <div class="flex items-center justify-between gap-3">
          <p class="font-bold">Movement history</p>
          <label class="flex items-center gap-2 text-xs text-ink-600 cursor-pointer"><input type="checkbox" id="hide-sales" class="accent-brand-500"> Hide sales</label>
        </div>
        <div class="card mt-3 overflow-hidden"><div class="table-wrap"><table class="table">
          <thead><tr><th>Time</th><th>Type</th><th class="num">Qty</th><th class="num">Stock</th><th>Notes</th></tr></thead>
          <tbody id="mv-rows"></tbody></table></div><div id="mv-pager"></div></div>
      </div>`
    icons()
    const editBtn = $('#d-edit', m.el)
    if (editBtn) editBtn.addEventListener('click', () => { m.close(); openForm(p) })

    // Stock level chart from all movements of this product
    Api.stock.movements({ productId: id, pageSize: 100000 }).then((res) => {
      const pts = res.data.slice().reverse()
      const canvas = $('#stock-chart', m.el)
      if (!canvas || !window.Chart) return
      const ctx = canvas.getContext('2d')
      const grad = ctx.createLinearGradient(0, 0, 0, 170)
      grad.addColorStop(0, 'rgba(88,101,232,0.28)')
      grad.addColorStop(1, 'rgba(88,101,232,0)')
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: pts.map((x) => Fmt.dateTime(x.createdAt)),
          datasets: [
            { data: pts.map((x) => x.stockAfter), borderColor: '#5865E8', backgroundColor: grad, fill: true, tension: 0.25, pointRadius: 0, borderWidth: 2, stepped: false },
            { data: pts.map(() => p.minStock), borderColor: '#F2683A', borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0, fill: false },
          ],
        },
        options: {
          maintainAspectRatio: false,
          animation: { duration: 1100, easing: 'easeOutQuart' },
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => (c.datasetIndex ? ` Minimum: ${c.raw}` : ` Stock: ${c.raw}`) } } },
          scales: { x: { display: false }, y: { beginAtZero: true, grid: { color: '#ECEEF2' }, ticks: { color: '#8E94A3', font: { size: 11 } }, border: { display: false } } },
        },
      })
    })

    const mvState = { page: 1, excludeSales: false }
    async function loadMovements() {
      const tbody = $('#mv-rows', m.el)
      if (!tbody) return
      tbody.innerHTML = UI.skeletonRows(5, 5)
      const res = await Api.stock.movements({ productId: id, page: mvState.page, pageSize: 8, excludeSales: mvState.excludeSales })
      if (!res.data.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-ink-500 py-8">No history yet.</td></tr>`
        $('#mv-pager', m.el).innerHTML = ''
        return
      }
      tbody.innerHTML = res.data
        .map(
          (mv, i) => `<tr class="row-in" style="--i:${i}">
          <td class="whitespace-nowrap text-xs text-ink-600">${Fmt.dateTime(mv.createdAt)}</td>
          <td>${UI.movementBadge(mv.type)}</td>
          <td class="num font-bold ${mv.quantity > 0 ? 'text-green-600' : 'text-red-600'}">${mv.quantity > 0 ? '+' : ''}${mv.quantity}</td>
          <td class="num text-xs text-ink-500 whitespace-nowrap">${mv.stockBefore} → <b class="text-ink-900">${mv.stockAfter}</b></td>
          <td class="text-xs"><p class="text-ink-700">${esc(mv.reason || mv.reference || '-')}</p><p class="text-ink-400">${esc(mv.userName || '')}${mv.reason && mv.reference ? ' · ' + esc(mv.reference) : ''}</p></td></tr>`,
        )
        .join('')
      $('#mv-pager', m.el).innerHTML = UI.pagination(res)
      icons()
    }
    $('#mv-pager', m.el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-page]')
      if (!b || b.disabled) return
      mvState.page = Number(b.dataset.page)
      loadMovements()
    })
    $('#hide-sales', m.el).addEventListener('change', (e) => {
      mvState.excludeSales = e.target.checked
      mvState.page = 1
      loadMovements()
    })
    loadMovements()
  }

  // ---------- Categories ----------
  async function renderCategories() {
    const grid = $('#category-grid')
    grid.innerHTML = Array.from({ length: 4 }).map(() => '<div class="card p-5"><div class="skeleton h-10 w-10"></div><div class="skeleton h-4 w-28 mt-4"></div></div>').join('')
    try {
      state.categories = await Api.categories.list()
    } catch (err) {
      grid.innerHTML = `<div class="sm:col-span-2 xl:col-span-4 card">${UI.errorState(err.message)}</div>`
      return icons()
    }
    grid.innerHTML = state.categories.length
      ? state.categories
          .map(
            (c) => `<div class="card card-hover p-5 group">
        <div class="flex items-start justify-between">
          <div class="w-11 h-11 rounded-xl grid place-items-center text-white transition group-hover:rotate-6" style="background:${c.color}"><i data-lucide="tag" class="w-5 h-5"></i></div>
          <div class="flex gap-1 opacity-60 group-hover:opacity-100 transition">
            <button class="btn btn-ghost btn-icon btn-sm" data-cedit="${c.id}"><i data-lucide="pencil"></i></button>
            <button class="btn btn-ghost btn-icon btn-sm text-red-500" data-cdel="${c.id}"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
        <p class="font-bold mt-4">${esc(c.name)}</p>
        <p class="text-sm text-ink-500">${c.productCount} products</p>
      </div>`,
          )
          .join('')
      : `<div class="sm:col-span-2 xl:col-span-4 card">${UI.emptyState({ icon: 'tags', title: 'No categories yet' })}</div>`
    icons()
  }

  $('#category-grid').addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-cedit]')
    const del = e.target.closest('[data-cdel]')
    if (edit) openCategoryForm(state.categories.find((c) => c.id === edit.dataset.cedit))
    if (del) {
      const c = state.categories.find((x) => x.id === del.dataset.cdel)
      if (!(await confirm({ title: 'Delete category?', message: `Category <b>${esc(c.name)}</b> will be deleted.`, confirmText: 'Delete', danger: true }))) return
      try {
        await Api.categories.remove(c.id)
        toast('Category deleted.')
        renderCategories()
      } catch (err) {
        toast(err.message, 'error')
      }
    }
  })

  const COLORS = ['#F2683A', '#5865E8', '#14B8A6', '#F59E0B', '#8B5CF6', '#EC4899', '#64748B', '#10B981', '#EF4444', '#0EA5E9']
  function openCategoryForm(c) {
    c = c || { name: '', color: COLORS[state.categories.length % COLORS.length] }
    const m = modal({
      title: c.id ? 'Edit category' : 'Add category',
      size: 'sm',
      body: `<label class="label">Category name</label><input class="input" id="c-name" value="${esc(c.name)}" placeholder="e.g. Spices" />
        <label class="label mt-4">Color</label>
        <div class="flex flex-wrap gap-2" id="c-colors">${COLORS.map((col) => `<button type="button" data-col="${col}" class="w-8 h-8 rounded-full transition hover:scale-110 ${col === c.color ? 'ring-2 ring-offset-2 ring-ink-900' : ''}" style="background:${col}"></button>`).join('')}</div>`,
      footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="c-save">Save</button>`,
    })
    let color = c.color
    $('#c-colors', m.el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-col]')
      if (!b) return
      color = b.dataset.col
      $$('[data-col]', m.el).forEach((x) => x.classList.toggle('ring-2', x === b))
      $$('[data-col]', m.el).forEach((x) => x.classList.toggle('ring-offset-2', x === b))
      $$('[data-col]', m.el).forEach((x) => x.classList.toggle('ring-ink-900', x === b))
    })
    $('#c-save', m.el).addEventListener('click', async (e) => {
      setLoading(e.currentTarget, true, 'Saving...')
      try {
        await Api.categories.save({ id: c.id, name: $('#c-name', m.el).value, color })
        toast('Category saved.')
        m.close()
        renderCategories()
        state.categories = await Api.categories.list()
      } catch (err) {
        setLoading($('#c-save', m.el), false)
        toast(err.message, 'error')
      }
    })
  }

  // ---------- Suppliers ----------
  async function renderSuppliers() {
    const tbody = $('#supplier-rows')
    tbody.innerHTML = UI.skeletonRows(5, 5)
    try {
      state.suppliers = await Api.suppliers.list()
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5">${UI.errorState(err.message)}</td></tr>`
      return icons()
    }
    tbody.innerHTML = state.suppliers.length
      ? state.suppliers
          .map(
            (s, i) => `<tr class="row-in" style="--i:${i}">
        <td><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl bg-iris-50 text-iris-600 grid place-items-center"><i data-lucide="truck" class="w-5 h-5"></i></div><p class="font-semibold">${esc(s.name)}</p></div></td>
        <td><p class="text-sm">${esc(s.contactPerson || '-')}</p><p class="text-xs text-ink-500">${esc(s.phone || '')}</p></td>
        <td class="text-sm text-ink-600 max-w-xs">${esc(s.address || '-')}</td>
        <td class="num"><span class="badge badge-blue no-dot">${s.productCount}</span></td>
        <td class="num whitespace-nowrap"><button class="btn btn-ghost btn-icon btn-sm" data-sedit="${s.id}"><i data-lucide="pencil"></i></button><button class="btn btn-ghost btn-icon btn-sm text-red-500" data-sdel="${s.id}"><i data-lucide="trash-2"></i></button></td></tr>`,
          )
          .join('')
      : `<tr><td colspan="5">${UI.emptyState({ icon: 'truck', title: 'No suppliers yet' })}</td></tr>`
    icons()
  }

  $('#supplier-rows').addEventListener('click', async (e) => {
    const edit = e.target.closest('[data-sedit]')
    const del = e.target.closest('[data-sdel]')
    if (edit) openSupplierForm(state.suppliers.find((s) => s.id === edit.dataset.sedit))
    if (del) {
      const s = state.suppliers.find((x) => x.id === del.dataset.sdel)
      if (!(await confirm({ title: 'Delete supplier?', message: `Supplier <b>${esc(s.name)}</b> will be deleted.`, confirmText: 'Delete', danger: true }))) return
      try {
        await Api.suppliers.remove(s.id)
        toast('Supplier deleted.')
        renderSuppliers()
      } catch (err) {
        toast(err.message, 'error')
      }
    }
  })

  function openSupplierForm(s) {
    s = s || { name: '', contactPerson: '', phone: '', address: '' }
    const m = modal({
      title: s.id ? 'Edit supplier' : 'Add supplier',
      body: `<div class="grid sm:grid-cols-2 gap-4">
        <div class="sm:col-span-2"><label class="label">Supplier name *</label><input class="input" id="s-name" value="${esc(s.name)}" /></div>
        <div><label class="label">Contact name</label><input class="input" id="s-contact" value="${esc(s.contactPerson)}" /></div>
        <div><label class="label">Phone / WhatsApp</label><input class="input" id="s-phone" value="${esc(s.phone)}" inputmode="tel" /></div>
        <div class="sm:col-span-2"><label class="label">Address</label><textarea class="textarea" id="s-address">${esc(s.address)}</textarea></div></div>`,
      footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-primary" id="s-save">Save</button>`,
    })
    $('#s-save', m.el).addEventListener('click', async (e) => {
      setLoading(e.currentTarget, true, 'Saving...')
      try {
        await Api.suppliers.save({ id: s.id, name: $('#s-name', m.el).value, contactPerson: $('#s-contact', m.el).value, phone: $('#s-phone', m.el).value, address: $('#s-address', m.el).value })
        toast('Supplier saved.')
        m.close()
        renderSuppliers()
      } catch (err) {
        setLoading($('#s-save', m.el), false)
        toast(err.message, 'error')
      }
    })
  }

  init()
})()
