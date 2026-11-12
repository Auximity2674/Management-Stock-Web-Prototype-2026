/* ==========================================================================
   Formatting + UI helpers (toast, modal, confirm, states, count-up, print).
   ========================================================================== */
(function () {
  // ---------------- Formatters (English locale, Indonesian Rupiah) ----------------
  const nf = new Intl.NumberFormat('en-GB')
  const Fmt = {
    rupiah(n) {
      const v = Math.round(Number(n) || 0)
      return (v < 0 ? '-Rp ' : 'Rp ') + nf.format(Math.abs(v))
    },
    /** Compact for chart axes: Rp 1.2M / Rp 350K */
    rupiahShort(n) {
      const v = Number(n) || 0
      if (Math.abs(v) >= 1e9) return 'Rp ' + (v / 1e9).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + 'B'
      if (Math.abs(v) >= 1e6) return 'Rp ' + (v / 1e6).toLocaleString('en-GB', { maximumFractionDigits: 1 }) + 'M'
      if (Math.abs(v) >= 1e3) return 'Rp ' + (v / 1e3).toLocaleString('en-GB', { maximumFractionDigits: 0 }) + 'K'
      return 'Rp ' + nf.format(v)
    },
    number(n, digits = 0) {
      return (Number(n) || 0).toLocaleString('en-GB', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
    },
    date(iso) {
      return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    },
    dateLong(iso) {
      return new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    },
    dateTime(iso) {
      return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    },
    time(iso) {
      return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    },
    /** Parses "Rp 10,000" / "10,000" / "10000" → 10000 */
    parseNumber(str) {
      return Number(String(str).replace(/[^\d-]/g, '')) || 0
    },
    initials(name) {
      return String(name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
    },
  }

  const ROLE_LABEL = { owner: 'Owner', cashier: 'Cashier', warehouse: 'Warehouse Staff' }
  const PAYMENT_LABEL = { cash: 'Cash', qris: 'QRIS', transfer: 'Bank Transfer' }
  const MOVEMENT_LABEL = {
    initial: ['Opening Stock', 'badge-gray'],
    in: ['Stock In', 'badge-green'],
    out: ['Stock Out', 'badge-red'],
    sale: ['Sale', 'badge-blue'],
    opname: ['Stock Count', 'badge-amber'],
    void: ['Void/Refund', 'badge-orange'],
  }

  // ---------------- DOM helpers ----------------
  const $ = (sel, root = document) => root.querySelector(sel)
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel))

  /** Escapes user-provided text before inserting into innerHTML. */
  function esc(v) {
    return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
  }

  function icons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 2 } })
  }

  function debounce(fn, ms = 250) {
    let t
    return (...args) => {
      clearTimeout(t)
      t = setTimeout(() => fn(...args), ms)
    }
  }

  // ---------------- Toast ----------------
  function toast(message, type = 'success', duration = 3200) {
    let root = $('#toast-root')
    if (!root) {
      root = document.createElement('div')
      root.id = 'toast-root'
      document.body.appendChild(root)
    }
    const icon = { success: 'circle-check', error: 'circle-alert', info: 'info', warning: 'triangle-alert' }[type]
    const el = document.createElement('div')
    el.className = `toast toast-${type}`
    el.innerHTML = `<i data-lucide="${icon}"></i><div class="toast-text">${esc(message)}</div><div class="toast-bar" style="animation-duration:${duration}ms"></div>`
    root.appendChild(el)
    icons()
    const remove = () => {
      el.classList.add('leaving')
      setTimeout(() => el.remove(), 250)
    }
    el.addEventListener('click', remove)
    setTimeout(remove, duration)
  }

  // ---------------- Modal ----------------
  /**
   * Opens a modal. Returns { el, close }.
   * opts: { title, body (html), footer (html), size: 'sm'|'md'|'lg'|'xl', drawer: bool, onClose }
   */
  function modal(opts) {
    const widths = { sm: '420px', md: '560px', lg: '760px', xl: '980px' }
    const overlay = document.createElement('div')
    overlay.className = 'overlay' + (opts.drawer ? ' drawer' : '')
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" style="max-width:${widths[opts.size || 'md']}">
        <div class="modal-head">
          <div class="min-w-0">
            <h3 class="text-base font-bold text-ink-900 truncate">${opts.title || ''}</h3>
            ${opts.subtitle ? `<p class="text-xs text-ink-500 mt-0.5">${opts.subtitle}</p>` : ''}
          </div>
          <button class="btn btn-ghost btn-icon btn-sm" data-close aria-label="Close"><i data-lucide="x"></i></button>
        </div>
        <div class="modal-body thin-scroll ${opts.drawer ? 'flex-1' : ''}">${opts.body || ''}</div>
        ${opts.footer ? `<div class="modal-foot">${opts.footer}</div>` : ''}
      </div>`
    document.body.appendChild(overlay)
    document.body.style.overflow = 'hidden'
    icons()
    let closed = false
    function close() {
      if (closed) return
      closed = true
      overlay.classList.add('closing')
      document.removeEventListener('keydown', onKey)
      setTimeout(() => {
        overlay.remove()
        if (!$('.overlay')) document.body.style.overflow = ''
        opts.onClose && opts.onClose()
      }, 180)
    }
    function onKey(e) {
      if (e.key === 'Escape' && overlay === $$('.overlay').pop()) close()
    }
    overlay.addEventListener('mousedown', (e) => {
      if (e.target === overlay && !opts.persistent) close()
    })
    $$('[data-close]', overlay).forEach((b) => b.addEventListener('click', close))
    document.addEventListener('keydown', onKey)
    const first = overlay.querySelector('[autofocus], .modal-body input:not([type=hidden]), .modal-body select')
    if (first) setTimeout(() => first.focus(), 60)
    return { el: overlay, close }
  }

  /** Promise-based confirm dialog → resolves true/false. */
  function confirm({ title = 'Confirm', message = '', confirmText = 'Yes, continue', danger = false } = {}) {
    return new Promise((resolve) => {
      let answered = false
      const m = modal({
        title,
        size: 'sm',
        body: `<div class="flex gap-4">
            <div class="kpi-icon shrink-0 ${danger ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-600'} scale-in"><i data-lucide="${danger ? 'triangle-alert' : 'circle-help'}"></i></div>
            <p class="text-sm text-ink-600 leading-relaxed pt-1">${message}</p></div>`,
        footer: `<button class="btn btn-outline" data-close>Cancel</button>
                 <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${confirmText}</button>`,
        onClose: () => !answered && resolve(false),
      })
      $('[data-ok]', m.el).addEventListener('click', () => {
        answered = true
        resolve(true)
        m.close()
      })
    })
  }

  // ---------------- States ----------------
  function skeletonRows(cols, rows = 6) {
    return Array.from({ length: rows })
      .map(
        () =>
          `<tr>${Array.from({ length: cols })
            .map((_, i) => `<td><div class="skeleton h-4" style="width:${i === 0 ? 70 : 40 + ((i * 17) % 40)}%"></div></td>`)
            .join('')}</tr>`,
      )
      .join('')
  }

  function emptyState({ icon = 'package-open', title = 'No data yet', text = '', action = '' } = {}) {
    return `<div class="flex flex-col items-center justify-center text-center py-14 px-6 anim-fade-up">
      <div class="relative mb-4">
        <div class="absolute inset-0 rounded-full bg-brand-100 blur-xl opacity-70"></div>
        <div class="relative w-16 h-16 rounded-2xl bg-white border border-ink-100 grid place-items-center text-brand-500 shadow-sm float" style="animation-duration:6s"><i data-lucide="${icon}" class="w-7 h-7"></i></div>
      </div>
      <p class="font-bold text-ink-900">${title}</p>
      ${text ? `<p class="text-sm text-ink-500 mt-1 max-w-sm">${text}</p>` : ''}
      ${action ? `<div class="mt-4">${action}</div>` : ''}
    </div>`
  }

  function errorState(message = 'Something went wrong while loading data.') {
    return `<div class="flex flex-col items-center justify-center text-center py-14 px-6 anim-fade-up">
      <div class="w-14 h-14 rounded-2xl bg-red-50 text-red-500 grid place-items-center mb-3 shake"><i data-lucide="wifi-off" class="w-6 h-6"></i></div>
      <p class="font-bold text-ink-900">Failed to load data</p>
      <p class="text-sm text-ink-500 mt-1">${esc(message)}</p>
      <button class="btn btn-outline btn-sm mt-4" data-retry><i data-lucide="rotate-cw"></i>Try again</button>
    </div>`
  }

  function setLoading(btn, loading, text) {
    if (!btn) return
    if (loading) {
      btn.dataset.html = btn.innerHTML
      btn.disabled = true
      btn.innerHTML = `<svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.2-8.56" stroke-linecap="round"/></svg>${text || 'Processing...'}`
    } else {
      btn.disabled = false
      if (btn.dataset.html) btn.innerHTML = btn.dataset.html
      icons()
    }
  }

  // ---------------- Animations ----------------
  /** Animates a number in an element from its current value to `to`. */
  function countUp(el, to, { duration = 1100, format = (v) => Fmt.number(v) } = {}) {
    if (!el) return
    const from = Number(el.dataset.value || 0)
    el.dataset.value = to
    const start = performance.now()
    const ease = (t) => 1 - Math.pow(1 - t, 4)
    function frame(t) {
      const p = Math.min(1, (t - start) / duration)
      el.textContent = format(from + (to - from) * ease(p))
      if (p < 1) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }

  function replayClass(el, cls) {
    if (!el) return
    el.classList.remove(cls)
    void el.offsetWidth
    el.classList.add(cls)
  }

  // ---------------- Pagination ----------------
  function pagination({ page, pageSize, total }) {
    const pages = Math.max(1, Math.ceil(total / pageSize))
    const from = total ? (page - 1) * pageSize + 1 : 0
    const to = Math.min(total, page * pageSize)
    const nums = []
    for (let i = 1; i <= pages; i++) {
      if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i)
      else if (nums[nums.length - 1] !== '…') nums.push('…')
    }
    return `<div class="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-ink-100">
      <p class="text-xs text-ink-500">Showing <b class="text-ink-800">${from}–${to}</b> of <b class="text-ink-800">${Fmt.number(total)}</b></p>
      <div class="flex items-center gap-1">
        <button class="btn btn-ghost btn-icon btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="Previous"><i data-lucide="chevron-left"></i></button>
        ${nums
          .map((n) =>
            n === '…'
              ? '<span class="px-1 text-ink-400 text-sm">…</span>'
              : `<button class="btn btn-sm ${n === page ? 'btn-dark' : 'btn-ghost'} min-w-[2rem] px-2" data-page="${n}">${n}</button>`,
          )
          .join('')}
        <button class="btn btn-ghost btn-icon btn-sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="Next"><i data-lucide="chevron-right"></i></button>
      </div></div>`
  }

  // ---------------- Badges ----------------
  function stockBadge(p) {
    if (p.stock <= 0) return '<span class="badge badge-red badge-pulse">Out of stock</span>'
    if (p.stock <= p.minStock) return '<span class="badge badge-amber">Low</span>'
    return '<span class="badge badge-green">In stock</span>'
  }
  function movementBadge(type) {
    const [label, cls] = MOVEMENT_LABEL[type] || [type, 'badge-gray']
    return `<span class="badge ${cls}">${label}</span>`
  }
  function trxStatusBadge(status) {
    return {
      completed: '<span class="badge badge-green">Completed</span>',
      voided: '<span class="badge badge-red">Void</span>',
      refunded: '<span class="badge badge-amber">Refund</span>',
    }[status]
  }

  // ---------------- Printing ----------------
  /**
   * Prints HTML in an isolated hidden iframe so page styles don't interfere
   * (needed for thermal receipt widths). `pageCss` sets @page size.
   */
  async function printHtml(html, pageCss = '') {
    const frame = document.createElement('iframe')
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;'
    document.body.appendChild(frame)
    const cssHref = new URL('css/app.css', document.baseURI).href
    const doc = frame.contentDocument
    doc.open()
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="${cssHref}">
      <style>body{margin:0;background:#fff} ${pageCss}</style></head><body>${html}</body></html>`)
    doc.close()
    await new Promise((r) => {
      const link = doc.querySelector('link')
      link.onload = r
      link.onerror = r
      setTimeout(r, 1200)
    })
    frame.contentWindow.focus()
    frame.contentWindow.print()
    setTimeout(() => frame.remove(), 1500)
  }

  /** Builds receipt HTML (thermal 58/80mm). */
  function receiptHtml(tx, store, width = '58') {
    const lines = tx.items
      .map(
        (it) => `<div>${esc(it.name)}</div>
        <div class="r-row"><span>${it.quantity} x ${Fmt.number(it.price)}</span><span>${Fmt.number(it.price * it.quantity)}</span></div>
        ${it.discount ? `<div class="r-row r-muted"><span>&nbsp;&nbsp;Discount</span><span>-${Fmt.number(it.discount)}</span></div>` : ''}`,
      )
      .join('')
    return `<div class="receipt w${width}">
      <div class="r-center r-title">${esc(store.name)}</div>
      <div class="r-center r-muted">${esc(store.address)}</div>
      <div class="r-center r-muted">Tel. ${esc(store.phone)}</div>
      <div class="r-sep"></div>
      <div class="r-row r-muted"><span>${esc(tx.invoiceNo)}</span></div>
      <div class="r-row r-muted"><span>${Fmt.dateTime(tx.createdAt)}</span><span>${esc(tx.cashierName.split(' ')[0])}</span></div>
      ${tx.status !== 'completed' ? `<div class="r-void">${tx.status === 'voided' ? 'VOID' : 'REFUND'}</div>` : ''}
      <div class="r-sep"></div>
      ${lines}
      <div class="r-sep"></div>
      <div class="r-row"><span>Subtotal</span><span>${Fmt.number(tx.subtotal)}</span></div>
      ${tx.discount ? `<div class="r-row"><span>Discount</span><span>-${Fmt.number(tx.discount)}</span></div>` : ''}
      <div class="r-row r-bold" style="font-size:13px"><span>TOTAL</span><span>${Fmt.number(tx.total)}</span></div>
      <div class="r-row"><span>${PAYMENT_LABEL[tx.paymentMethod]}</span><span>${Fmt.number(tx.amountPaid)}</span></div>
      ${tx.paymentMethod === 'cash' ? `<div class="r-row"><span>Change</span><span>${Fmt.number(tx.change)}</span></div>` : ''}
      <div class="r-sep"></div>
      <div class="r-center r-muted" style="white-space:pre-line">${esc(store.receiptFooter)}</div>
    </div>`
  }

  function printReceipt(tx, store, width = '58') {
    return printHtml(receiptHtml(tx, store, width), `@page{size:${width}mm auto;margin:0}`)
  }

  /**
   * Wires an underline tab bar: buttons [data-tab] inside `bar`, panels [data-panel].
   * Returns { select(name) }.
   */
  function tabs(bar, onChange) {
    const ink = bar.querySelector('.tab-ink')
    const buttons = $$('[data-tab]', bar).filter((b) => b.style.display !== 'none')
    function place(btn) {
      if (!ink || !btn) return
      ink.style.left = btn.offsetLeft + 'px'
      ink.style.width = btn.offsetWidth + 'px'
    }
    function select(name) {
      buttons.forEach((b) => b.classList.toggle('active', b.dataset.tab === name))
      $$('[data-panel]').forEach((p) => {
        const show = p.dataset.panel === name
        p.classList.toggle('hidden', !show)
        if (show) replayClass(p, 'anim-fade-up')
      })
      place(buttons.find((b) => b.dataset.tab === name))
      onChange && onChange(name)
    }
    buttons.forEach((b) => b.addEventListener('click', () => select(b.dataset.tab)))
    window.addEventListener('resize', () => place(bar.querySelector('.tab.active')))
    requestAnimationFrame(() => place(bar.querySelector('.tab.active')))
    return { select }
  }

  /** Reads ?key=value from the URL. */
  function query(key) {
    return new URLSearchParams(location.search).get(key)
  }

  window.Fmt = Fmt
  window.UI = {
    $, $$, esc, icons, debounce, toast, modal, confirm, skeletonRows, emptyState, errorState, setLoading,
    countUp, replayClass, pagination, stockBadge, movementBadge, trxStatusBadge, printHtml, receiptHtml, printReceipt, query, tabs,
    ROLE_LABEL, PAYMENT_LABEL, MOVEMENT_LABEL,
  }
})()
