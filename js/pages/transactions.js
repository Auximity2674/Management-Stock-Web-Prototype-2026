/* Transaction history: list, detail, reprint, void/refund (owner only) */
(function () {
  const user = Layout.mount({ page: 'transactions', title: 'Transactions' })
  if (!user) return
  const { $, $$, esc, icons, toast, modal, setLoading } = UI
  const isOwner = user.role === 'owner'

  const state = { rows: [], page: 1, pageSize: 15, store: null }
  icons()

  function rangeQuery() {
    const v = $('#range').value
    if (v === 'all') return {}
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date()
    if (v === '1') {
      start.setDate(start.getDate() - 1)
      end.setHours(0, 0, 0, 0)
      end.setMilliseconds(-1)
    } else if (v !== '0') start.setDate(start.getDate() - (Number(v) - 1))
    return { from: start.toISOString(), to: end.toISOString() }
  }

  async function load() {
    $('#rows').innerHTML = UI.skeletonRows(8, 8)
    $('#pager').innerHTML = ''
    try {
      state.rows = await Api.transactions.list({ ...rangeQuery(), status: $('#status').value, paymentMethod: $('#method').value, search: $('#search').value.trim() })
      state.page = 1
      renderSummary()
      renderRows()
    } catch (err) {
      $('#rows').innerHTML = `<tr><td colspan="8">${UI.errorState(err.message)}</td></tr>`
      icons()
      $('[data-retry]').addEventListener('click', load)
    }
  }

  function renderSummary() {
    const done = state.rows.filter((t) => t.status === 'completed')
    const revenue = done.reduce((s, t) => s + t.total, 0)
    const cards = [
      { label: 'Total sales', value: revenue, money: true, icon: 'banknote', color: 'bg-brand-50 text-brand-600' },
      { label: 'Completed sales', value: done.length, icon: 'receipt', color: 'bg-iris-50 text-iris-600' },
      { label: 'Average / sale', value: done.length ? revenue / done.length : 0, money: true, icon: 'calculator', color: 'bg-teal-50 text-teal-600' },
      { label: 'Void / refund', value: state.rows.length - done.length, icon: 'undo-2', color: 'bg-red-50 text-red-600' },
    ]
    $('#summary').innerHTML = cards
      .map((c, i) => `<div class="card card-hover p-4 flex items-center gap-3"><div class="kpi-icon ${c.color}"><i data-lucide="${c.icon}"></i></div>
        <div class="min-w-0"><p class="text-xs text-ink-500 font-medium">${c.label}</p><p class="text-lg sm:text-xl font-bold truncate" data-c="${i}">0</p></div></div>`)
      .join('')
    icons()
    cards.forEach((c, i) => UI.countUp($(`[data-c="${i}"]`), c.value, { format: c.money ? Fmt.rupiah : (v) => Fmt.number(v) }))
  }

  const METHOD_ICON = { cash: 'banknote', qris: 'qr-code', transfer: 'landmark' }
  function renderRows() {
    const total = state.rows.length
    if (!total) {
      $('#rows').innerHTML = `<tr><td colspan="8">${UI.emptyState({ icon: 'receipt', title: 'No transactions', text: 'Try a different date range or filter.' })}</td></tr>`
      return icons()
    }
    const pageRows = state.rows.slice((state.page - 1) * state.pageSize, state.page * state.pageSize)
    $('#rows').innerHTML = pageRows
      .map(
        (t, i) => `<tr class="row-in cursor-pointer" style="--i:${i}" data-id="${t.id}">
        <td class="font-semibold text-sm whitespace-nowrap">${esc(t.invoiceNo)}</td>
        <td class="text-sm text-ink-600 whitespace-nowrap">${Fmt.dateTime(t.createdAt)}</td>
        <td class="text-sm">${esc(t.cashierName)}</td>
        <td class="num text-sm">${t.items.reduce((s, it) => s + it.quantity, 0)}</td>
        <td><span class="inline-flex items-center gap-1.5 text-sm text-ink-700"><i data-lucide="${METHOD_ICON[t.paymentMethod]}" class="w-4 h-4 text-ink-400"></i>${UI.PAYMENT_LABEL[t.paymentMethod]}</span></td>
        <td class="num font-bold ${t.status !== 'completed' ? 'line-through text-ink-400' : ''}">${Fmt.rupiah(t.total)}</td>
        <td>${UI.trxStatusBadge(t.status)}</td>
        <td class="num"><i data-lucide="chevron-right" class="w-4 h-4 text-ink-300 inline"></i></td></tr>`,
      )
      .join('')
    $('#pager').innerHTML = UI.pagination({ page: state.page, pageSize: state.pageSize, total })
    icons()
  }

  $('#rows').addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]')
    if (row) openDetail(row.dataset.id)
  })
  $('#pager').addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]')
    if (!b || b.disabled) return
    state.page = Number(b.dataset.page)
    renderRows()
  })
  ;['#range', '#status', '#method'].forEach((s) => $(s).addEventListener('change', load))
  $('#search').addEventListener('input', UI.debounce(load, 300))

  async function openDetail(id) {
    const m = modal({ title: 'Transaction details', size: 'lg', body: '<div class="space-y-3">' + '<div class="skeleton h-6"></div>'.repeat(4) + '</div>' })
    let t
    try {
      t = await Api.transactions.get(id)
    } catch (err) {
      $('.modal-body', m.el).innerHTML = UI.errorState(err.message)
      return icons()
    }
    const profit = t.items.reduce((s, it) => s + it.subtotal - it.cost * it.quantity, 0) - t.discount
    $('.modal-head h3', m.el).textContent = t.invoiceNo
    $('.modal-body', m.el).innerHTML = `
      <div class="grid md:grid-cols-[1fr_auto] gap-6">
        <div>
          <div class="flex flex-wrap items-center gap-2">${UI.trxStatusBadge(t.status)}<span class="text-sm text-ink-500">${Fmt.dateLong(t.createdAt)}, ${Fmt.time(t.createdAt)}</span></div>
          ${t.status !== 'completed' ? `<div class="mt-3 p-3 rounded-xl bg-red-50 text-sm text-red-700"><b>${t.status === 'voided' ? 'Voided' : 'Refunded'}</b> by ${esc(t.voidedBy)} · ${Fmt.dateTime(t.voidedAt)}<br><span class="text-red-600/80">Reason: ${esc(t.voidReason)}</span></div>` : ''}
          <div class="card mt-4 overflow-hidden"><table class="table">
            <thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Subtotal</th></tr></thead>
            <tbody>${t.items.map((it) => `<tr><td class="text-sm font-semibold">${esc(it.name)}${it.discount ? `<p class="text-xs font-normal text-brand-600">Discount -${Fmt.rupiah(it.discount)}</p>` : ''}</td><td class="num">${it.quantity}</td><td class="num text-sm text-ink-600">${Fmt.rupiah(it.price)}</td><td class="num font-semibold">${Fmt.rupiah(it.subtotal)}</td></tr>`).join('')}</tbody>
          </table></div>
          <div class="mt-4 space-y-1.5 text-sm max-w-xs ml-auto">
            <div class="flex justify-between"><span class="text-ink-500">Subtotal</span><span>${Fmt.rupiah(t.subtotal)}</span></div>
            ${t.discount ? `<div class="flex justify-between"><span class="text-ink-500">Order discount</span><span>-${Fmt.rupiah(t.discount)}</span></div>` : ''}
            <div class="flex justify-between text-base font-bold pt-1.5 border-t border-ink-100"><span>Total</span><span>${Fmt.rupiah(t.total)}</span></div>
            <div class="flex justify-between"><span class="text-ink-500">${UI.PAYMENT_LABEL[t.paymentMethod]}</span><span>${Fmt.rupiah(t.amountPaid)}</span></div>
            ${t.paymentMethod === 'cash' ? `<div class="flex justify-between"><span class="text-ink-500">Change</span><span>${Fmt.rupiah(t.change)}</span></div>` : ''}
            ${isOwner ? `<div class="flex justify-between text-green-700"><span>Gross profit</span><b>${Fmt.rupiah(profit)}</b></div>` : ''}
            <div class="flex justify-between"><span class="text-ink-500">Cashier</span><span>${esc(t.cashierName)}</span></div>
          </div>
        </div>
        <div class="hidden md:block"><p class="text-xs font-semibold text-ink-500 uppercase tracking-wider mb-2">Receipt</p>
          <div class="bg-ink-100 rounded-xl p-3 max-h-[60vh] overflow-auto thin-scroll"><div class="shadow-md">${UI.receiptHtml(t, state.store, '58')}</div></div></div>
      </div>`
    const foot = document.createElement('div')
    foot.className = 'modal-foot'
    foot.innerHTML = `${isOwner && t.status === 'completed' ? `<button class="btn btn-outline text-red-600 mr-auto" id="void-btn"><i data-lucide="undo-2"></i>Void / Refund</button>` : ''}
      <button class="btn btn-outline" data-close>Close</button><button class="btn btn-dark" id="reprint"><i data-lucide="printer"></i>Reprint</button>`
    $('.modal', m.el).appendChild(foot)
    $('[data-close]', foot).addEventListener('click', m.close)
    $('#reprint', foot).addEventListener('click', () => UI.printReceipt(t, state.store, localStorage.getItem('stokku.receiptWidth') || '58'))
    const voidBtn = $('#void-btn', foot)
    if (voidBtn) voidBtn.addEventListener('click', () => openVoid(t, m))
    icons()
  }

  function openVoid(t, parent) {
    let mode = 'void'
    const m = modal({
      title: 'Cancel transaction',
      subtitle: esc(t.invoiceNo) + ' · ' + Fmt.rupiah(t.total),
      size: 'sm',
      body: `<div class="segmented w-full grid grid-cols-2" id="vmode"><button class="active" data-m="void">Void (cancel)</button><button data-m="refund">Refund (return)</button></div>
        <p class="text-xs text-ink-500 mt-3" id="vhint">Cancels a transaction entered by mistake. Stock for all items will be restored.</p>
        <label class="label mt-4">Reason *</label>
        <textarea id="vreason" class="textarea" placeholder="e.g. wrong quantity entered"></textarea>
        <div class="flex flex-wrap gap-1.5 mt-2">${['Input error', 'Customer cancelled', 'Damaged goods', 'Payment failed'].map((r) => `<button class="chip !h-7 !text-xs" data-r="${r}">${r}</button>`).join('')}</div>`,
      footer: `<button class="btn btn-outline" data-close>Cancel</button><button class="btn btn-danger" id="vok">Confirm</button>`,
    })
    $('#vmode', m.el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]')
      if (!b) return
      mode = b.dataset.m
      $$('#vmode button', m.el).forEach((x) => x.classList.toggle('active', x === b))
      $('#vhint', m.el).textContent = mode === 'void' ? 'Cancels a transaction entered by mistake. Stock for all items will be restored.' : 'The customer returns the goods and is refunded. Stock for all items will be restored.'
    })
    $$('[data-r]', m.el).forEach((b) => b.addEventListener('click', () => ($('#vreason', m.el).value = b.dataset.r)))
    $('#vok', m.el).addEventListener('click', async (e) => {
      const btn = e.currentTarget
      setLoading(btn, true, 'Processing...')
      try {
        await Api.transactions.void(t.id, { reason: $('#vreason', m.el).value, mode })
        toast(mode === 'void' ? 'Transaction voided & stock restored.' : 'Refund recorded & stock restored.')
        m.close()
        parent.close()
        load()
      } catch (err) {
        setLoading(btn, false)
        toast(err.message, 'error')
        UI.replayClass($('#vreason', m.el), 'shake')
      }
    })
  }

  ;(async function init() {
    try {
      state.store = (await Api.settings.get()).store
    } catch {
      state.store = { name: '', address: '', phone: '', receiptFooter: '' }
    }
    load()
  })()
})()
