/* Stock in / stock out / opname / movement history */
(function () {
  const user = Layout.mount({ page: 'stock', title: 'Stock & Counts' })
  if (!user) return
  const { $, $$, esc, icons, toast, confirm, setLoading } = UI

  let products = []
  let categories = []
  const byId = () => Object.fromEntries(products.map((p) => [p.id, p]))

  async function refreshProducts() {
    products = await Api.products.all()
  }

  // ======================================================================
  // Product picker (search-as-you-type, Enter selects / exact barcode match)
  // ======================================================================
  function productPicker(container, onPick) {
    container.innerHTML = `<div class="relative">
      <div class="input-icon"><i data-lucide="scan-line"></i>
      <input class="input h-11" placeholder="Type a name / SKU, or scan a barcode and press Enter" autocomplete="off" /></div>
      <div class="hidden absolute z-30 left-0 right-0 mt-1 card max-h-72 overflow-y-auto thin-scroll p-1" data-results></div></div>`
    icons()
    const input = $('input', container)
    const results = $('[data-results]', container)
    let matches = []
    let active = 0
    function render() {
      const q = input.value.trim().toLowerCase()
      if (!q) return results.classList.add('hidden')
      matches = products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.barcode.includes(q)).slice(0, 8)
      active = 0
      results.classList.remove('hidden')
      results.innerHTML = matches.length
        ? matches
            .map(
              (p, i) => `<button type="button" data-i="${i}" class="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-left ${i === 0 ? 'bg-brand-50' : 'hover:bg-ink-50'}">
            <span class="min-w-0"><span class="block text-sm font-semibold truncate">${esc(p.name)}</span><span class="text-xs text-ink-500">${esc(p.sku)} · ${esc(p.barcode)}</span></span>
            <span class="text-xs font-semibold ${p.stock <= p.minStock ? 'text-red-600' : 'text-ink-500'} whitespace-nowrap">Stock ${p.stock}</span></button>`,
            )
            .join('')
        : '<p class="text-sm text-ink-500 px-3 py-3">No products found.</p>'
    }
    function highlight() {
      $$('[data-i]', results).forEach((b, i) => {
        b.classList.toggle('bg-brand-50', i === active)
        if (i === active) b.scrollIntoView({ block: 'nearest' })
      })
    }
    function pick(p) {
      if (!p) return
      onPick(p)
      input.value = ''
      results.classList.add('hidden')
      input.focus()
    }
    input.addEventListener('input', render)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(matches.length - 1, active + 1); highlight() }
      if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); highlight() }
      if (e.key === 'Escape') results.classList.add('hidden')
      if (e.key === 'Enter') {
        e.preventDefault()
        const q = input.value.trim()
        const exact = products.find((p) => p.barcode === q || p.sku.toLowerCase() === q.toLowerCase())
        if (exact) return pick(exact)
        if (matches[active]) pick(matches[active])
        else if (q) { toast('No product matches that code.', 'warning'); UI.replayClass(input, 'shake') }
      }
    })
    results.addEventListener('mousedown', (e) => {
      const b = e.target.closest('[data-i]')
      if (b) { e.preventDefault(); pick(matches[Number(b.dataset.i)]) }
    })
    input.addEventListener('blur', () => setTimeout(() => results.classList.add('hidden'), 120))
  }

  // ======================================================================
  // Line builder for stock in / stock out
  // ======================================================================
  function lineBuilder(kind) {
    const lines = [] // { productId, quantity, purchasePrice? }
    const box = $(`[data-lines="${kind}"]`)
    const summary = $(`[data-summary="${kind}"]`)
    const saveBtn = $(`#${kind}-save`)

    function add(p) {
      const existing = lines.find((l) => l.productId === p.id)
      if (existing) existing.quantity++
      else lines.unshift({ productId: p.id, quantity: kind === 'in' ? Math.max(1, p.minStock) : 1, purchasePrice: p.purchasePrice })
      render(p.id)
    }

    function render(flashId) {
      const map = byId()
      if (!lines.length) {
        box.innerHTML = UI.emptyState({ icon: kind === 'in' ? 'package-plus' : 'package-minus', title: 'No products yet', text: 'Search or scan a product above to add it.' })
      } else {
        box.innerHTML = `<div class="space-y-2">${lines
          .map((l, i) => {
            const p = map[l.productId]
            const after = kind === 'in' ? p.stock + l.quantity : p.stock - l.quantity
            const invalid = kind === 'out' && after < 0
            return `<div class="flex flex-wrap sm:flex-nowrap items-center gap-3 p-3 rounded-xl border ${invalid ? 'border-red-200 bg-red-50/50' : 'border-ink-100'} ${l.productId === flashId ? 'flash' : ''} anim-fade-up">
              <div class="flex-1 min-w-[180px]"><p class="text-sm font-semibold">${esc(p.name)}</p>
                <p class="text-xs text-ink-500">${esc(p.sku)} · stock ${p.stock} → <b class="${invalid ? 'text-red-600' : kind === 'in' ? 'text-green-600' : 'text-ink-900'}">${after}</b> ${esc(p.unit)}</p></div>
              ${kind === 'in' ? `<div class="w-36"><p class="text-[10px] text-ink-500 mb-0.5">Cost / ${esc(p.unit)}</p><input class="input h-9" data-price="${i}" inputmode="numeric" value="${Fmt.number(l.purchasePrice)}"></div>` : ''}
              <div class="w-32"><p class="text-[10px] text-ink-500 mb-0.5">Qty</p>
                <div class="flex items-center border border-ink-200 rounded-[10px] h-9 overflow-hidden">
                  <button class="w-8 h-full hover:bg-ink-50" data-dec="${i}">−</button>
                  <input class="w-full h-full text-center text-sm font-semibold outline-none" data-qty="${i}" type="number" min="1" value="${l.quantity}">
                  <button class="w-8 h-full hover:bg-ink-50" data-inc="${i}">+</button></div></div>
              <button class="btn btn-ghost btn-icon btn-sm text-ink-400 hover:text-red-600" data-rm="${i}" title="Remove"><i data-lucide="x"></i></button>
            </div>`
          })
          .join('')}</div>`
      }
      icons()
      updateSummary()
    }

    function updateSummary() {
      const map = byId()
      const units = lines.reduce((s, l) => s + (l.quantity || 0), 0)
      const value = lines.reduce((s, l) => s + (l.quantity || 0) * (kind === 'in' ? l.purchasePrice : map[l.productId].purchasePrice), 0)
      const invalid = kind === 'out' && lines.some((l) => l.quantity > map[l.productId].stock)
      summary.innerHTML = `
        <div class="flex justify-between"><span class="text-ink-500">Products</span><b>${lines.length}</b></div>
        <div class="flex justify-between"><span class="text-ink-500">Total units</span><b>${Fmt.number(units)}</b></div>
        <div class="flex justify-between pt-2 border-t border-ink-100"><span class="text-ink-500">${kind === 'in' ? 'Purchase value' : 'Loss value'}</span><b class="${kind === 'out' ? 'text-red-600' : ''}">${Fmt.rupiah(value)}</b></div>
        ${invalid ? '<p class="text-xs text-red-600">Some quantities exceed the available stock.</p>' : ''}`
      saveBtn.disabled = !lines.length || invalid || lines.some((l) => !(l.quantity > 0))
    }

    box.addEventListener('click', (e) => {
      const t = e.target.closest('[data-inc],[data-dec],[data-rm]')
      if (!t) return
      if (t.dataset.inc) lines[t.dataset.inc].quantity++
      if (t.dataset.dec) lines[t.dataset.dec].quantity = Math.max(1, lines[t.dataset.dec].quantity - 1)
      if (t.dataset.rm) lines.splice(Number(t.dataset.rm), 1)
      render()
    })
    box.addEventListener('change', (e) => {
      if (e.target.dataset.qty !== undefined) {
        lines[e.target.dataset.qty].quantity = Math.max(1, Math.floor(Number(e.target.value) || 1))
        render()
      }
      if (e.target.dataset.price !== undefined) {
        lines[e.target.dataset.price].purchasePrice = Fmt.parseNumber(e.target.value)
        e.target.value = Fmt.number(lines[e.target.dataset.price].purchasePrice)
        updateSummary()
      }
    })

    productPicker($(`[data-picker="${kind}"]`), add)
    render()
    return { lines, render, clear: () => { lines.splice(0); render() } }
  }

  // ---------------- Stock in ----------------
  let inBuilder, outBuilder
  async function setupIn() {
    const suppliers = await Api.suppliers.list()
    $('#in-supplier').innerHTML = '<option value="">Select supplier</option>' + suppliers.map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')
    inBuilder = lineBuilder('in')
    $('#in-save').addEventListener('click', async (e) => {
      const supplierId = $('#in-supplier').value
      if (!supplierId) {
        toast('Please select a supplier first.', 'warning')
        UI.replayClass($('#in-supplier'), 'shake')
        return $('#in-supplier').focus()
      }
      const btn = e.currentTarget
      setLoading(btn, true, 'Saving...')
      try {
        const res = await Api.stock.stockIn({ supplierId, reference: $('#in-ref').value.trim(), note: $('#in-note').value.trim(), items: inBuilder.lines })
        toast(`Stock in saved (${res.count} products) · ${res.reference}`)
        $('#in-ref').value = ''
        $('#in-note').value = ''
        await refreshProducts()
        inBuilder.clear()
      } catch (err) {
        toast(err.message, 'error')
      } finally {
        setLoading(btn, false)
        btn.disabled = !inBuilder.lines.length
      }
    })
  }

  // ---------------- Stock out ----------------
  let outReason = 'damaged'
  function setupOut() {
    outBuilder = lineBuilder('out')
    $('#out-reasons').addEventListener('click', (e) => {
      const b = e.target.closest('[data-reason]')
      if (!b) return
      outReason = b.dataset.reason
      $$('[data-reason]').forEach((x) => x.classList.toggle('active', x === b))
    })
    $('#out-save').addEventListener('click', async (e) => {
      const ok = await confirm({ title: 'Save stock out?', message: `Stock will be reduced for ${outBuilder.lines.length} product(s). This is recorded in the history.`, confirmText: 'Save', danger: true })
      if (!ok) return
      const btn = $('#out-save')
      setLoading(btn, true, 'Saving...')
      try {
        const res = await Api.stock.stockOut({ reason: outReason, note: $('#out-note').value.trim(), items: outBuilder.lines })
        toast(`Stock out saved · ${res.reference}`)
        $('#out-note').value = ''
        await refreshProducts()
        outBuilder.clear()
      } catch (err) {
        toast(err.message, 'error')
      } finally {
        setLoading(btn, false)
        btn.disabled = !outBuilder.lines.length
      }
      void e
    })
  }

  // ---------------- Opname ----------------
  const counts = {} // productId -> physical count
  function setupOpname() {
    $('#op-category').innerHTML = '<option value="">All categories</option>' + categories.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')
    $('#op-search').addEventListener('input', UI.debounce(renderOpname, 200))
    $('#op-category').addEventListener('change', renderOpname)
    $('#op-only').addEventListener('change', renderOpname)
    $('#op-rows').addEventListener('input', (e) => {
      const id = e.target.dataset.count
      if (!id) return
      if (e.target.value === '') delete counts[id]
      else counts[id] = Math.max(0, Math.floor(Number(e.target.value)))
      updateOpnameRow(id)
      updateOpnameSummary()
    })
    $('#op-rows').addEventListener('keydown', (e) => {
      // Enter jumps to the next count input for fast data entry.
      if (e.key === 'Enter' && e.target.dataset.count) {
        e.preventDefault()
        const inputs = $$('[data-count]', $('#op-rows'))
        const next = inputs[inputs.indexOf(e.target) + 1]
        if (next) next.focus(), next.select()
      }
    })
    $('#op-reset').addEventListener('click', () => {
      Object.keys(counts).forEach((k) => delete counts[k])
      renderOpname()
    })
    $('#op-save').addEventListener('click', saveOpname)
    renderOpname()
  }

  function renderOpname() {
    const q = $('#op-search').value.trim().toLowerCase()
    const cat = $('#op-category').value
    const only = $('#op-only').checked
    const rows = products
      .filter((p) => (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)) && (!cat || p.categoryId === cat) && (!only || counts[p.id] !== undefined))
      .sort((a, b) => a.name.localeCompare(b.name, 'id'))
    $('#op-rows').innerHTML = rows.length
      ? rows
          .map(
            (p, i) => `<tr data-row="${p.id}" class="row-in" style="--i:${Math.min(i, 20)}">
        <td><p class="font-semibold text-sm">${esc(p.name)}</p><p class="text-xs text-ink-500">${esc(p.sku)}</p></td>
        <td class="num font-semibold">${p.stock} <span class="text-xs font-normal text-ink-500">${esc(p.unit)}</span></td>
        <td><input type="number" min="0" class="input h-9 text-center font-semibold" data-count="${p.id}" value="${counts[p.id] ?? ''}" placeholder="—"></td>
        <td class="num font-bold" data-diff></td><td class="num text-sm" data-value></td></tr>`,
          )
          .join('')
      : `<tr><td colspan="5">${UI.emptyState({ icon: 'clipboard-list', title: 'No products', text: only ? 'No products counted yet.' : 'Change the search or filter.' })}</td></tr>`
    rows.forEach((p) => updateOpnameRow(p.id))
    updateOpnameSummary()
    icons()
  }

  function updateOpnameRow(id) {
    const row = $(`[data-row="${id}"]`)
    if (!row) return
    const p = byId()[id]
    const diffCell = $('[data-diff]', row)
    const valCell = $('[data-value]', row)
    if (counts[id] === undefined) {
      diffCell.innerHTML = '<span class="text-ink-300">—</span>'
      valCell.innerHTML = ''
      row.classList.remove('bg-green-50/40', 'bg-red-50/40')
      return
    }
    const diff = counts[id] - p.stock
    diffCell.innerHTML = diff === 0 ? '<span class="badge badge-green no-dot">Match</span>' : `<span class="${diff > 0 ? 'text-green-600' : 'text-red-600'}">${diff > 0 ? '+' : ''}${diff}</span>`
    valCell.innerHTML = diff === 0 ? '' : `<span class="${diff > 0 ? 'text-green-600' : 'text-red-600'}">${Fmt.rupiah(diff * p.purchasePrice)}</span>`
    row.classList.toggle('bg-green-50/40', diff > 0)
    row.classList.toggle('bg-red-50/40', diff < 0)
  }

  function updateOpnameSummary() {
    const map = byId()
    const ids = Object.keys(counts)
    const diffs = ids.map((id) => counts[id] - map[id].stock)
    const mismatched = diffs.filter((d) => d !== 0).length
    const value = ids.reduce((s, id) => s + (counts[id] - map[id].stock) * map[id].purchasePrice, 0)
    $('#op-summary').innerHTML = `
      <span>Counted: <b>${ids.length}</b> / ${products.length}</span>
      <span>Mismatched: <b class="${mismatched ? 'text-amber-600' : ''}">${mismatched} products</b></span>
      <span>Difference value: <b class="${value < 0 ? 'text-red-600' : value > 0 ? 'text-green-600' : ''}">${Fmt.rupiah(value)}</b></span>`
    $('#op-save').disabled = !ids.length
  }

  async function saveOpname() {
    const map = byId()
    const ids = Object.keys(counts)
    const mismatched = ids.filter((id) => counts[id] !== map[id].stock).length
    const ok = await confirm({
      title: 'Save count results?',
      message: `${ids.length} products counted, <b>${mismatched}</b> will be adjusted to the physical count.`,
      confirmText: 'Save adjustments',
    })
    if (!ok) return
    const btn = $('#op-save')
    setLoading(btn, true, 'Saving...')
    try {
      const res = await Api.stock.opname({ note: $('#op-note').value.trim(), items: ids.map((id) => ({ productId: id, physicalCount: counts[id] })) })
      toast(`Count saved: ${res.adjusted} products adjusted · ${res.reference}`)
      ids.forEach((id) => delete counts[id])
      $('#op-note').value = ''
      await refreshProducts()
      renderOpname()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(btn, false)
      updateOpnameSummary()
    }
  }

  // ---------------- History ----------------
  const h = { page: 1, search: '', type: '' }
  async function loadHistory() {
    const tbody = $('#h-rows')
    tbody.innerHTML = UI.skeletonRows(7, 8)
    $('#h-pager').innerHTML = ''
    try {
      const res = await Api.stock.movements({ page: h.page, pageSize: 15, search: h.search, type: h.type })
      if (!res.data.length) {
        tbody.innerHTML = `<tr><td colspan="7">${UI.emptyState({ icon: 'history', title: 'No history yet', text: 'Try changing the search filter.' })}</td></tr>`
        return icons()
      }
      tbody.innerHTML = res.data
        .map(
          (m, i) => `<tr class="row-in" style="--i:${i}">
          <td class="text-xs text-ink-600 whitespace-nowrap">${Fmt.dateTime(m.createdAt)}</td>
          <td><a href="products.html?view=${m.productId}" class="font-semibold text-sm hover:text-brand-600">${esc(m.productName)}</a><p class="text-xs text-ink-500">${esc(m.productSku)}</p></td>
          <td>${UI.movementBadge(m.type)}</td>
          <td class="num font-bold ${m.quantity > 0 ? 'text-green-600' : 'text-red-600'}">${m.quantity > 0 ? '+' : ''}${m.quantity}</td>
          <td class="num text-xs text-ink-500 whitespace-nowrap">${m.stockBefore} → <b class="text-ink-900">${m.stockAfter}</b></td>
          <td class="text-xs max-w-xs"><p class="text-ink-700 truncate">${esc(m.reason || '-')}</p><p class="text-ink-400">${esc(m.reference || '')}</p></td>
          <td class="text-xs text-ink-600 whitespace-nowrap">${esc(m.userName || '-')}</td></tr>`,
        )
        .join('')
      $('#h-pager').innerHTML = UI.pagination(res)
      icons()
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="7">${UI.errorState(err.message)}</td></tr>`
      icons()
      $('[data-retry]', tbody).addEventListener('click', loadHistory)
    }
  }
  $('#h-search').addEventListener('input', UI.debounce((e) => { h.search = e.target.value.trim(); h.page = 1; loadHistory() }, 300))
  $('#h-type').addEventListener('change', (e) => { h.type = e.target.value; h.page = 1; loadHistory() })
  $('#h-pager').addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]')
    if (!b || b.disabled) return
    h.page = Number(b.dataset.page)
    loadHistory()
  })

  // ---------------- Init ----------------
  const tabs = UI.tabs($('#tabs'), (tab) => {
    if (tab === 'history') loadHistory()
    if (tab === 'opname') renderOpname()
    if (tab === 'in' && inBuilder) inBuilder.render()
    if (tab === 'out' && outBuilder) outBuilder.render()
    history.replaceState(null, '', '?tab=' + tab)
  })

  ;(async function init() {
    icons()
    try {
      await refreshProducts()
      categories = await Api.categories.list()
    } catch (err) {
      $('#content').insertAdjacentHTML('beforeend', `<div class="card mt-6">${UI.errorState(err.message)}</div>`)
      return icons()
    }
    await setupIn()
    setupOut()
    setupOpname()
    const initial = UI.query('tab')
    if (initial && ['in', 'out', 'opname', 'history'].includes(initial)) tabs.select(initial)
  })()
})()
