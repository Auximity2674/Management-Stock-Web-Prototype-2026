/* ==========================================================================
   API service layer (mock).
   Every page calls Api.* — never DB or localStorage directly. Each method
   returns a Promise and simulates network latency, so replacing the bodies
   with fetch('/api/...') calls later requires no change in the pages.
   ========================================================================== */
(function () {
  const LATENCY = [180, 420] // ms, min/max

  function delay() {
    const ms = LATENCY[0] + Math.random() * (LATENCY[1] - LATENCY[0])
    return new Promise((r) => setTimeout(r, ms))
  }

  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

  /** Wraps a handler: waits, runs, returns a deep copy (like a JSON response). */
  async function respond(fn) {
    await delay()
    return clone(fn())
  }

  class ApiError extends Error {
    constructor(message, status = 400) {
      super(message)
      this.status = status
    }
  }

  // --- "Server-side" auth helpers (a real API derives these from the token) ---
  function currentUser() {
    const u = DB.Session.get()
    if (!u) throw new ApiError('Session expired, please sign in again.', 401)
    return u
  }
  function requireRole(...roles) {
    const u = currentUser()
    if (!roles.includes(u.role)) throw new ApiError('You do not have permission for this action.', 403)
    return u
  }

  const now = () => new Date().toISOString()
  const db = () => DB.load()
  const findProduct = (id) => {
    const p = db().products.find((x) => x.id === id)
    if (!p) throw new ApiError('Product not found.', 404)
    return p
  }

  /** Applies a signed stock change and records a movement. Single source of truth for stock. */
  function applyStock(product, quantity, type, extra = {}) {
    const before = product.stock
    const after = before + quantity
    if (after < 0) throw new ApiError(`Not enough stock for ${product.name} (${before} left).`)
    product.stock = after
    product.updatedAt = now()
    const movement = {
      id: DB.nextId('mov', 'movement'),
      productId: product.id,
      type,
      quantity,
      stockBefore: before,
      stockAfter: after,
      reason: extra.reason,
      reference: extra.reference,
      userName: extra.userName,
      createdAt: now(),
    }
    db().movements.push(movement)
    return movement
  }

  function validateProduct(input, ignoreId) {
    const errors = {}
    if (!input.name || !input.name.trim()) errors.name = 'Name is required'
    if (!input.sku || !input.sku.trim()) errors.sku = 'SKU is required'
    if (!input.categoryId) errors.categoryId = 'Select a category'
    if (!input.unit || !input.unit.trim()) errors.unit = 'Unit is required'
    if (!(input.sellingPrice > 0)) errors.sellingPrice = 'Selling price must be > 0'
    if (!(input.purchasePrice >= 0)) errors.purchasePrice = 'Invalid cost price'
    if (input.sellingPrice > 0 && input.purchasePrice > input.sellingPrice) errors.sellingPrice = 'Selling price is below cost price'
    if (!(input.minStock >= 0)) errors.minStock = 'Invalid'
    if (!(input.leadTimeDays >= 0)) errors.leadTimeDays = 'Invalid'
    const others = db().products.filter((p) => p.id !== ignoreId)
    if (input.sku && others.some((p) => p.sku.toLowerCase() === input.sku.trim().toLowerCase())) errors.sku = 'SKU already in use'
    if (input.barcode && others.some((p) => p.barcode === input.barcode.trim())) errors.barcode = 'Barcode already in use'
    if (Object.keys(errors).length) {
      const e = new ApiError('Please check the product details.', 422)
      e.fields = errors
      throw e
    }
  }

  const PRODUCT_FIELDS = ['name', 'sku', 'barcode', 'categoryId', 'unit', 'purchasePrice', 'sellingPrice', 'minStock', 'supplierId', 'leadTimeDays']
  const pick = (obj, keys) => Object.fromEntries(keys.map((k) => [k, typeof obj[k] === 'string' ? obj[k].trim() : obj[k]]))

  const Api = {
    ApiError,

    auth: {
      login(username, password) {
        return respond(() => {
          const u = db().users.find((x) => x.username === String(username).trim().toLowerCase())
          if (!u || u.password !== password) throw new ApiError('Incorrect username or password.', 401)
          const { password: _omit, ...session } = u
          DB.Session.set(session)
          return session
        })
      },
      logout() {
        DB.Session.clear()
        return Promise.resolve()
      },
      /** Demo helper only — a real backend would never expose this. */
      demoAccounts() {
        return respond(() => db().users.map(({ username, password, role, name }) => ({ username, password, role, name })))
      },
    },

    products: {
      list(q = {}) {
        return respond(() => {
          const d = db()
          let rows = d.products.slice()
          if (q.search) {
            const s = q.search.toLowerCase()
            rows = rows.filter((p) => p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s) || p.barcode.includes(s))
          }
          if (q.categoryId) rows = rows.filter((p) => p.categoryId === q.categoryId)
          if (q.stockStatus === 'low') rows = rows.filter((p) => p.stock > 0 && p.stock <= p.minStock)
          if (q.stockStatus === 'out') rows = rows.filter((p) => p.stock <= 0)
          if (q.stockStatus === 'ok') rows = rows.filter((p) => p.stock > p.minStock)
          const sortBy = q.sortBy || 'name'
          const dir = q.sortDir === 'desc' ? -1 : 1
          rows.sort((a, b) => {
            const av = a[sortBy]
            const bv = b[sortBy]
            return (typeof av === 'string' ? av.localeCompare(bv, 'en') : av - bv) * dir
          })
          const total = rows.length
          const pageSize = q.pageSize || 10
          const page = Math.min(Math.max(1, q.page || 1), Math.max(1, Math.ceil(total / pageSize)))
          return { data: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize }
        })
      },
      all() {
        return respond(() => db().products)
      },
      get(id) {
        return respond(() => findProduct(id))
      },
      findByCode(code) {
        return respond(() => {
          const c = String(code).trim().toLowerCase()
          return db().products.find((p) => p.barcode.toLowerCase() === c || p.sku.toLowerCase() === c) || null
        })
      },
      create(input) {
        return respond(() => {
          const user = requireRole('owner')
          validateProduct(input)
          const product = { id: DB.uid('prd'), ...pick(input, PRODUCT_FIELDS), stock: 0, createdAt: now(), updatedAt: now() }
          db().products.push(product)
          const initial = Math.max(0, Math.floor(Number(input.stock) || 0))
          if (initial > 0) applyStock(product, initial, 'initial', { reason: 'Opening stock', userName: user.name })
          DB.save()
          return product
        })
      },
      update(id, input) {
        return respond(() => {
          requireRole('owner')
          const p = findProduct(id)
          validateProduct(input, id)
          Object.assign(p, pick(input, PRODUCT_FIELDS), { updatedAt: now() })
          DB.save()
          return p
        })
      },
      remove(id) {
        return respond(() => {
          requireRole('owner')
          const d = db()
          findProduct(id)
          d.products = d.products.filter((p) => p.id !== id)
          DB.save()
          return { ok: true }
        })
      },
    },

    categories: {
      list() {
        return respond(() => {
          const d = db()
          return d.categories.map((c) => ({ ...c, productCount: d.products.filter((p) => p.categoryId === c.id).length }))
        })
      },
      save(input) {
        return respond(() => {
          requireRole('owner')
          if (!input.name || !input.name.trim()) throw new ApiError('Category name is required.')
          const d = db()
          if (d.categories.some((c) => c.id !== input.id && c.name.toLowerCase() === input.name.trim().toLowerCase()))
            throw new ApiError('A category with this name already exists.')
          if (input.id) {
            const c = d.categories.find((x) => x.id === input.id)
            Object.assign(c, { name: input.name.trim(), color: input.color })
          } else {
            d.categories.push({ id: DB.uid('cat'), name: input.name.trim(), color: input.color || '#64748B' })
          }
          DB.save()
          return { ok: true }
        })
      },
      remove(id) {
        return respond(() => {
          requireRole('owner')
          const d = db()
          const used = d.products.filter((p) => p.categoryId === id).length
          if (used) throw new ApiError(`This category is still used by ${used} products.`)
          d.categories = d.categories.filter((c) => c.id !== id)
          DB.save()
          return { ok: true }
        })
      },
    },

    suppliers: {
      list() {
        return respond(() => {
          const d = db()
          return d.suppliers.map((s) => ({ ...s, productCount: d.products.filter((p) => p.supplierId === s.id).length }))
        })
      },
      save(input) {
        return respond(() => {
          requireRole('owner')
          if (!input.name || !input.name.trim()) throw new ApiError('Supplier name is required.')
          const d = db()
          const data = pick(input, ['name', 'contactPerson', 'phone', 'address'])
          if (input.id) Object.assign(d.suppliers.find((x) => x.id === input.id), data)
          else d.suppliers.push({ id: DB.uid('sup'), ...data })
          DB.save()
          return { ok: true }
        })
      },
      remove(id) {
        return respond(() => {
          requireRole('owner')
          const d = db()
          const used = d.products.filter((p) => p.supplierId === id).length
          if (used) throw new ApiError(`This supplier is still used by ${used} products.`)
          d.suppliers = d.suppliers.filter((s) => s.id !== id)
          DB.save()
          return { ok: true }
        })
      },
    },

    stock: {
      stockIn({ supplierId, reference, note, items }) {
        return respond(() => {
          const user = requireRole('owner', 'warehouse')
          if (!items || !items.length) throw new ApiError('Add at least one product.')
          const supplier = db().suppliers.find((s) => s.id === supplierId)
          items.forEach((it) => {
            if (!(it.quantity > 0)) throw new ApiError('Quantity must be greater than 0.')
          })
          const ref = reference || 'IN-' + Date.now().toString().slice(-8)
          items.forEach((it) => {
            const p = findProduct(it.productId)
            if (it.purchasePrice > 0) p.purchasePrice = it.purchasePrice
            applyStock(p, Math.floor(it.quantity), 'in', {
              reason: [supplier ? supplier.name : null, note].filter(Boolean).join(' — ') || 'Stock in',
              reference: ref,
              userName: user.name,
            })
          })
          DB.save()
          return { reference: ref, count: items.length }
        })
      },
      stockOut({ reason, note, items }) {
        return respond(() => {
          const user = requireRole('owner', 'warehouse')
          if (!items || !items.length) throw new ApiError('Add at least one product.')
          const label = { damaged: 'Damaged', expired: 'Expired', adjustment: 'Adjustment', lost: 'Lost', other: 'Other' }[reason] || 'Other'
          // Validate all lines before mutating anything (atomic, like a DB transaction).
          items.forEach((it) => {
            const p = findProduct(it.productId)
            if (!(it.quantity > 0)) throw new ApiError('Quantity must be greater than 0.')
            if (it.quantity > p.stock) throw new ApiError(`Only ${p.stock} of ${p.name} in stock.`)
          })
          const ref = 'OUT-' + Date.now().toString().slice(-8)
          items.forEach((it) =>
            applyStock(findProduct(it.productId), -Math.floor(it.quantity), 'out', {
              reason: note ? `${label} — ${note}` : label,
              reference: ref,
              userName: user.name,
            }),
          )
          DB.save()
          return { reference: ref, count: items.length }
        })
      },
      opname({ note, items }) {
        return respond(() => {
          const user = requireRole('owner', 'warehouse')
          const ref = 'OPN-' + Date.now().toString().slice(-8)
          let adjusted = 0
          items.forEach((it) => {
            const p = findProduct(it.productId)
            const count = Math.max(0, Math.floor(it.physicalCount))
            const diff = count - p.stock
            if (diff !== 0) {
              adjusted++
              applyStock(p, diff, 'opname', { reason: note ? `Stock count — ${note}` : 'Stock count', reference: ref, userName: user.name })
            }
          })
          DB.save()
          return { reference: ref, checked: items.length, adjusted }
        })
      },
      movements(q = {}) {
        return respond(() => {
          const d = db()
          const pmap = Object.fromEntries(d.products.map((p) => [p.id, p]))
          let rows = d.movements
          if (q.productId) rows = rows.filter((m) => m.productId === q.productId)
          if (q.type) rows = rows.filter((m) => m.type === q.type)
          if (q.excludeSales) rows = rows.filter((m) => m.type !== 'sale')
          if (q.search) {
            const s = q.search.toLowerCase()
            rows = rows.filter((m) => {
              const p = pmap[m.productId]
              return (p && (p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s))) || (m.reference || '').toLowerCase().includes(s)
            })
          }
          rows = rows.slice().reverse() // newest first
          const total = rows.length
          const pageSize = q.pageSize || 15
          const page = Math.min(Math.max(1, q.page || 1), Math.max(1, Math.ceil(total / pageSize)))
          const data = rows.slice((page - 1) * pageSize, page * pageSize).map((m) => {
            const p = pmap[m.productId]
            return { ...m, productName: p ? p.name : '(deleted product)', productSku: p ? p.sku : '-', unit: p ? p.unit : '' }
          })
          return { data, total, page, pageSize }
        })
      },
    },

    transactions: {
      list(q = {}) {
        return respond(() => {
          let rows = db().transactions
          if (q.from) rows = rows.filter((t) => t.createdAt >= q.from)
          if (q.to) rows = rows.filter((t) => t.createdAt <= q.to)
          if (q.status) rows = rows.filter((t) => t.status === q.status)
          if (q.paymentMethod) rows = rows.filter((t) => t.paymentMethod === q.paymentMethod)
          if (q.search) {
            const s = q.search.toLowerCase()
            rows = rows.filter((t) => t.invoiceNo.toLowerCase().includes(s) || t.cashierName.toLowerCase().includes(s))
          }
          return rows.slice().reverse()
        })
      },
      get(id) {
        return respond(() => {
          const t = db().transactions.find((x) => x.id === id)
          if (!t) throw new ApiError('Transaction not found.', 404)
          return t
        })
      },
      create({ items, discount = 0, paymentMethod, amountPaid }) {
        return respond(() => {
          const user = requireRole('owner', 'cashier')
          if (!items || !items.length) throw new ApiError('The cart is empty.')
          const lines = items.map((it) => {
            const p = findProduct(it.productId)
            if (!(it.quantity > 0)) throw new ApiError('Invalid quantity.')
            if (it.quantity > p.stock) throw new ApiError(`Only ${p.stock} of ${p.name} left in stock.`)
            const gross = p.sellingPrice * it.quantity
            const lineDiscount = Math.min(Math.max(0, Math.round(it.discount || 0)), gross)
            return {
              productId: p.id, name: p.name, sku: p.sku, unit: p.unit, price: p.sellingPrice, cost: p.purchasePrice,
              quantity: it.quantity, discount: lineDiscount, subtotal: gross - lineDiscount,
            }
          })
          const subtotal = lines.reduce((s, l) => s + l.subtotal, 0)
          const trxDiscount = Math.min(Math.max(0, Math.round(discount)), subtotal)
          const total = subtotal - trxDiscount
          const paid = paymentMethod === 'cash' ? Math.round(amountPaid) : total
          if (paymentMethod === 'cash' && paid < total) throw new ApiError('The amount paid is not enough.')
          const d = db()
          d.counters.invoice++
          const seq = d.counters.invoice
          const createdAt = now()
          const tx = {
            id: 'trx-' + String(seq).padStart(6, '0'),
            invoiceNo: 'INV/' + Seed.ymd(new Date()) + '/' + String(seq).padStart(5, '0'),
            items: lines, subtotal, discount: trxDiscount, total, paymentMethod,
            amountPaid: paid, change: paid - total, cashierId: user.id, cashierName: user.name, status: 'completed', createdAt,
          }
          lines.forEach((l) => applyStock(findProduct(l.productId), -l.quantity, 'sale', { reference: tx.invoiceNo, userName: user.name }))
          d.transactions.push(tx)
          DB.save()
          return tx
        })
      },
      /** Void (cancel) or refund (goods returned) — both restore stock. Owner only. */
      void(id, { reason, mode }) {
        return respond(() => {
          const user = requireRole('owner')
          if (!reason || reason.trim().length < 3) throw new ApiError('A reason is required (min. 3 characters).')
          const t = db().transactions.find((x) => x.id === id)
          if (!t) throw new ApiError('Transaction not found.', 404)
          if (t.status !== 'completed') throw new ApiError('This transaction has already been cancelled.')
          const label = mode === 'refund' ? 'Refund' : 'Void'
          t.items.forEach((l) => {
            const p = db().products.find((x) => x.id === l.productId)
            if (p) applyStock(p, l.quantity, 'void', { reason: `${label}: ${reason.trim()}`, reference: t.invoiceNo, userName: user.name })
          })
          t.status = mode === 'refund' ? 'refunded' : 'voided'
          t.voidReason = reason.trim()
          t.voidedAt = now()
          t.voidedBy = user.name
          DB.save()
          return t
        })
      },
    },

    settings: {
      get() {
        return respond(() => ({ store: db().store, restock: db().restockSettings }))
      },
      saveRestock(input) {
        return respond(() => {
          requireRole('owner', 'warehouse')
          const s = {
            analysisDays: Math.round(Number(input.analysisDays)),
            zValue: Number(input.zValue),
            targetCoverageDays: Math.round(Number(input.targetCoverageDays)),
            method: input.method === 'ses' ? 'ses' : 'sma',
          }
          if (!(s.analysisDays >= 7 && s.analysisDays <= 60)) throw new ApiError('Analysis period must be 7–60 days.')
          if (!(s.zValue > 0 && s.zValue <= 4)) throw new ApiError('Z value must be between 0 and 4.')
          if (!(s.targetCoverageDays >= 1 && s.targetCoverageDays <= 90)) throw new ApiError('Coverage target must be 1–90 days.')
          db().restockSettings = s
          DB.save()
          return s
        })
      },
    },

    /** Daily sales quantity records, used by the restock algorithm. */
    sales: {
      records({ days = 60 } = {}) {
        return respond(() => {
          const since = new Date()
          since.setHours(0, 0, 0, 0)
          since.setDate(since.getDate() - days)
          const iso = since.toISOString()
          const out = []
          db().transactions.forEach((t) => {
            if (t.status !== 'completed' || t.createdAt < iso) return
            t.items.forEach((it) => out.push({ productId: it.productId, quantity: it.quantity, date: t.createdAt }))
          })
          return out
        })
      },
    },

    demo: {
      reset() {
        return respond(() => {
          requireRole('owner')
          DB.reset()
          return { ok: true }
        })
      },
    },
  }

  window.Api = Api
})()
