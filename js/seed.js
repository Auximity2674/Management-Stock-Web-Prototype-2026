/* ==========================================================================
   Seed data: master data + 60 days of generated sales history.
   Generation is deterministic (seeded PRNG) and relative to "today",
   so the dashboard and restock recommendations always look alive.
   ========================================================================== */
(function () {
  const STORE = {
    name: 'Berkah Jaya Mart',
    address: 'Jl. Melati No. 27, Sukajadi, Bandung 40162',
    phone: '0812-3456-7890',
    receiptFooter: 'Thank you for shopping with us!\nPurchased items cannot be exchanged.',
  }

  const RESTOCK_SETTINGS = { analysisDays: 30, zValue: 1.65, targetCoverageDays: 14, method: 'sma' }

  const USERS = [
    { id: 'usr-1', name: 'Arsyad Rizantha', username: 'owner', password: 'owner123', role: 'owner' },
    { id: 'usr-2', name: 'Dimas Saputra', username: 'kasir', password: 'kasir123', role: 'cashier' },
    { id: 'usr-3', name: 'Fajar Nugroho', username: 'gudang', password: 'gudang123', role: 'warehouse' },
  ]

  const CATEGORIES = [
    { id: 'cat-1', name: 'Staples', color: '#F2683A' },
    { id: 'cat-2', name: 'Instant Food', color: '#5865E8' },
    { id: 'cat-3', name: 'Beverages', color: '#14B8A6' },
    { id: 'cat-4', name: 'Snack', color: '#F59E0B' },
    { id: 'cat-5', name: 'Household', color: '#8B5CF6' },
    { id: 'cat-6', name: 'Personal Care', color: '#EC4899' },
    { id: 'cat-7', name: 'Stationery', color: '#64748B' },
  ]

  const SUPPLIERS = [
    { id: 'sup-1', name: 'CV Sumber Pangan Jaya', contactPerson: 'Budi Santoso', phone: '081234567801', address: 'Jl. Pasar Induk No. 12, Bandung' },
    { id: 'sup-2', name: 'PT Distribusi Nusantara', contactPerson: 'Rina Wulandari', phone: '081234567802', address: 'Kawasan Industri Cikarang Blok C-7, Bekasi' },
    { id: 'sup-3', name: 'UD Segar Minuman', contactPerson: 'Agus Pratama', phone: '081234567803', address: 'Jl. Raya Bogor Km 21, Jakarta Timur' },
    { id: 'sup-4', name: 'PT Bersih Sejahtera', contactPerson: 'Dewi Lestari', phone: '081234567804', address: 'Jl. Industri Raya No. 88, Tangerang' },
    { id: 'sup-5', name: 'Toko Grosir Ilmu', contactPerson: 'Hendra Gunawan', phone: '081234567805', address: 'Jl. Pecinan No. 5, Semarang' },
  ]

  // [name, unit, purchasePrice, sellingPrice, currentStock, minStock, leadTimeDays, demandPerDay]
  // demandPerDay only drives the history generator; it is not stored on the product.
  const PRODUCT_GROUPS = {
    'cat-1|sup-1|STP': [
      ['Premium Rice 5 kg', 'sack', 68000, 75000, 14, 10, 3, 3.5],
      ['Medium Rice 5 kg', 'sack', 58000, 64000, 40, 10, 3, 2.2],
      ['Cooking Oil 1 L', 'bottle', 15500, 18000, 9, 15, 3, 6],
      ['Cooking Oil 2 L', 'pouch', 31000, 35500, 22, 10, 3, 2.5],
      ['Granulated Sugar 1 kg', 'pack', 15000, 17500, 35, 15, 3, 4.5],
      ['Wheat Flour 1 kg', 'pack', 10500, 12500, 18, 10, 3, 1.8],
      ['Chicken Eggs 1 kg', 'kg', 26000, 29500, 0, 8, 2, 3],
      ['Iodized Salt 250 g', 'pack', 2500, 3500, 60, 20, 3, 2],
      ['Sweet Soy Sauce 520 ml', 'bottle', 19000, 22500, 16, 8, 3, 1.4],
      ['Chili Sauce 340 ml', 'bottle', 11000, 13500, 21, 8, 3, 1.1],
      ['Sweetened Condensed Milk 370 g', 'can', 11500, 13500, 120, 12, 3, 1.5],
    ],
    'cat-2|sup-2|INS': [
      ['Instant Fried Noodles 85 g', 'pack', 2700, 3500, 160, 60, 2, 22],
      ['Instant Soto Noodles 75 g', 'pack', 2600, 3300, 45, 50, 2, 15],
      ['Instant Chicken Onion Noodles 70 g', 'pack', 2600, 3300, 110, 50, 2, 12],
      ['Spicy Cup Noodles 60 g', 'cup', 4800, 6000, 30, 15, 2, 2.5],
      ['Corn Vermicelli 175 g', 'pack', 5200, 6500, 25, 8, 2, 0.6],
      ['Sardines in Tomato Sauce 155 g', 'can', 9000, 11000, 18, 10, 2, 1.2],
      ['Corned Beef 198 g', 'can', 21000, 25000, 12, 6, 2, 0.4],
      ['Instant Chicken Porridge 45 g', 'sachet', 3800, 5000, 4, 10, 2, 1],
      ['Chicken Nuggets 500 g', 'pack', 38000, 45000, 8, 5, 2, 0.8],
      ['Chicken Sausages 375 g', 'pack', 24000, 29000, 0, 5, 2, 0.9],
    ],
    'cat-3|sup-3|BEV': [
      ['Mineral Water 600 ml', 'bottle', 2400, 3500, 140, 48, 2, 18],
      ['Mineral Water 1.5 L', 'bottle', 4500, 6000, 50, 24, 2, 5],
      ['Bottled Jasmine Tea 350 ml', 'bottle', 3800, 5000, 26, 24, 2, 9],
      ['Milk Coffee Sachet 30 g', 'sachet', 1300, 2000, 220, 50, 2, 16],
      ['Ground Black Coffee 165 g', 'pack', 13500, 16500, 20, 6, 2, 0.7],
      ['Tea Bags (25 pcs)', 'box', 5500, 7000, 24, 10, 2, 1.3],
      ['Chocolate UHT Milk 200 ml', 'box', 4300, 5500, 64, 24, 2, 7],
      ['Isotonic Drink 500 ml', 'bottle', 5200, 7000, 36, 12, 2, 3],
      ['Orange Juice 250 ml', 'box', 3800, 5000, 90, 12, 2, 0.5],
      ['Energy Drink 150 ml', 'bottle', 4200, 6000, 15, 10, 2, 1.8],
    ],
    'cat-4|sup-2|SNK': [
      ['Potato Chips 68 g', 'pack', 8500, 11000, 28, 10, 2, 2.4],
      ['Coconut Biscuits 300 g', 'pack', 7500, 9500, 33, 10, 2, 1.6],
      ['Chocolate Wafers 130 g', 'pack', 6500, 8500, 12, 10, 2, 2.8],
      ['Coated Peanuts 140 g', 'pack', 7000, 9000, 19, 8, 2, 0.9],
      ['Chocolate Bar 62 g', 'pack', 9000, 12000, 22, 8, 2, 1.1],
      ['Mint Candy (50 pcs)', 'jar', 17000, 22000, 9, 4, 2, 0.15],
      ['Shrimp Crackers 200 g', 'pack', 11000, 14000, 14, 6, 2, 0],
    ],
    'cat-5|sup-4|HSE': [
      ['Dish Soap 780 ml', 'pouch', 11500, 14500, 30, 10, 5, 2.3],
      ['Laundry Detergent 800 g', 'pack', 17500, 21500, 14, 10, 5, 2.6],
      ['Fabric Softener 900 ml', 'pouch', 13000, 16500, 25, 8, 5, 1.2],
      ['Floor Cleaner 800 ml', 'pouch', 10500, 13500, 20, 8, 5, 0.9],
      ['Facial Tissue 250 Sheets', 'pack', 11000, 14000, 40, 10, 5, 1.7],
      ['Large Trash Bags', 'roll', 7000, 9500, 70, 8, 5, 0.3],
    ],
    'cat-6|sup-4|PSC': [
      ['Bar Soap 85 g', 'pcs', 3200, 4500, 75, 24, 5, 4],
      ['Shampoo Sachet 10 ml', 'strip', 6500, 8500, 30, 10, 5, 2],
      ['Toothpaste 190 g', 'tube', 12000, 15000, 7, 8, 5, 1.6],
      ['Medium Toothbrush', 'pcs', 5500, 7500, 24, 8, 5, 0.7],
    ],
    'cat-7|sup-5|STN': [
      ['Notebook 38 Sheets', 'pcs', 3000, 4500, 85, 20, 7, 2.2],
      ['Black Gel Pen', 'pcs', 2500, 3500, 6, 12, 7, 1.5],
    ],
  }

  const HISTORY_DAYS = 60

  // Deterministic PRNG so every reset yields the same shaped data.
  function mulberry32(seed) {
    return function () {
      seed |= 0
      seed = (seed + 0x6d2b79f5) | 0
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }

  function poisson(lambda, rand) {
    if (lambda <= 0) return 0
    const L = Math.exp(-lambda)
    let k = 0
    let p = 1
    do {
      k++
      p *= rand()
    } while (p > L)
    return k - 1
  }

  function pad(n, len) {
    return String(n).padStart(len, '0')
  }

  function buildProducts(createdAt) {
    const products = []
    const demand = {}
    let i = 0
    for (const [key, rows] of Object.entries(PRODUCT_GROUPS)) {
      const [categoryId, supplierId, prefix] = key.split('|')
      for (const [name, unit, purchasePrice, sellingPrice, stock, minStock, leadTimeDays, perDay] of rows) {
        i++
        const n = pad(i, 3)
        const id = 'prd-' + n
        demand[id] = perDay
        products.push({
          id, name, sku: prefix + '-' + n, barcode: '8990001000' + n, categoryId, unit,
          purchasePrice, sellingPrice, stock, minStock, supplierId, leadTimeDays, createdAt, updatedAt: createdAt,
        })
      }
    }
    return { products, demand }
  }

  function build() {
    const rand = mulberry32(20261112)
    const now = new Date()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    start.setDate(start.getDate() - HISTORY_DAYS)

    const { products, demand } = buildProducts(start.toISOString())
    const byId = Object.fromEntries(products.map((p) => [p.id, p]))
    const cashiers = USERS.filter((u) => u.role !== 'warehouse')

    const transactions = []
    const events = [] // chronological stock-affecting events, resolved into movements below
    let invoiceSeq = 0

    for (let d = 0; d <= HISTORY_DAYS; d++) {
      const day = new Date(start)
      day.setDate(start.getDate() + d)
      const isToday = d === HISTORY_DAYS
      const weekday = day.getDay()
      const dayFactor = (weekday === 0 || weekday === 6 ? 1.3 : 1) * (0.85 + rand() * 0.3)
      // Today is only partially elapsed — scale volume by how far the store day (07:00–21:00) has gone.
      const hourNow = now.getHours() + now.getMinutes() / 60
      const todayShare = isToday ? Math.max(0.15, Math.min(1, (hourNow - 7) / 14)) : 1
      const maxHour = isToday ? Math.max(7.5, Math.min(21, hourNow)) : 21

      // 1) Daily units per product, split into small line chunks.
      const lines = []
      for (const p of products) {
        let qty = poisson(demand[p.id] * dayFactor * todayShare, rand)
        while (qty > 0) {
          const chunk = Math.min(qty, demand[p.id] > 8 ? 2 + Math.floor(rand() * 7) : 1 + Math.floor(rand() * 3))
          lines.push({ productId: p.id, quantity: chunk })
          qty -= chunk
        }
      }
      // 2) Shuffle and group lines into baskets of 1–4 items.
      for (let i = lines.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        ;[lines[i], lines[j]] = [lines[j], lines[i]]
      }
      const baskets = []
      while (lines.length) {
        const size = 1 + Math.floor(rand() * 6)
        baskets.push(lines.splice(0, size))
      }
      // 3) Spread baskets across opening hours and build transactions.
      const times = baskets
        .map(() => {
          const t = new Date(day)
          const h = 7 + rand() * (maxHour - 7)
          t.setHours(Math.floor(h), Math.floor((h % 1) * 60), Math.floor(rand() * 60), 0)
          return t
        })
        .sort((a, b) => a - b)

      baskets.forEach((basket, idx) => {
        const merged = {}
        basket.forEach((l) => (merged[l.productId] = (merged[l.productId] || 0) + l.quantity))
        const items = Object.entries(merged).map(([productId, quantity]) => {
          const p = byId[productId]
          const discount = rand() < 0.04 ? Math.round((p.sellingPrice * quantity * 0.05) / 100) * 100 : 0
          return {
            productId, name: p.name, unit: p.unit, price: p.sellingPrice, cost: p.purchasePrice,
            quantity, discount, subtotal: p.sellingPrice * quantity - discount,
          }
        })
        const subtotal = items.reduce((s, it) => s + it.subtotal, 0)
        const discount = subtotal > 150000 && rand() < 0.3 ? 5000 : 0
        const total = subtotal - discount
        const r = rand()
        const paymentMethod = r < 0.62 ? 'cash' : r < 0.9 ? 'qris' : 'transfer'
        const amountPaid = paymentMethod === 'cash' ? roundUpCash(total, rand) : total
        const cashier = cashiers[Math.floor(rand() * cashiers.length)]
        invoiceSeq++
        const createdAt = times[idx].toISOString()
        const tx = {
          id: 'trx-' + pad(invoiceSeq, 6),
          invoiceNo: 'INV/' + ymd(times[idx]) + '/' + pad(invoiceSeq, 5),
          items, subtotal, discount, total, paymentMethod, amountPaid, change: amountPaid - total,
          cashierId: cashier.id, cashierName: cashier.name, status: 'completed', createdAt,
        }
        transactions.push(tx)
        items.forEach((it) =>
          events.push({ productId: it.productId, type: 'sale', quantity: -it.quantity, reference: tx.invoiceNo, userName: cashier.name, createdAt }),
        )
      })

      // 4) Periodic supplier deliveries (stock in) in the morning.
      if (!isToday) {
        for (const p of products) {
          if (demand[p.id] <= 0) continue
          const cycle = 6 + (parseInt(p.id.slice(-2), 10) % 5)
          if (d % cycle === cycle - 1) {
            const t = new Date(day)
            t.setHours(8, 15, 0, 0)
            events.push({
              productId: p.id, type: 'in', quantity: Math.ceil(demand[p.id] * cycle * (0.9 + rand() * 0.3)),
              reference: 'DN-' + ymd(t) + '-' + p.supplierId.slice(-1), reason: 'Supplier delivery', userName: 'Fajar Nugroho', createdAt: t.toISOString(),
            })
          }
        }
      }
    }

    // A couple of manual stock-outs for realism.
    ;['prd-028', 'prd-022', 'prd-005'].forEach((pid, i) => {
      const t = new Date(start)
      t.setDate(start.getDate() + 20 + i * 11)
      t.setHours(17, 30, 0, 0)
      events.push({ productId: pid, type: 'out', quantity: -(2 + i), reason: ['Expired', 'Damaged', 'Damaged'][i], userName: 'Fajar Nugroho', createdAt: t.toISOString() })
    })

    // Resolve events → movements by walking BACKWARD from each product's current stock,
    // so history always ends exactly at the seeded stock level and never dips below zero.
    events.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))
    const movements = []
    for (const p of products) {
      const own = events.filter((e) => e.productId === p.id)
      const kept = []
      let level = p.stock
      for (let i = own.length - 1; i >= 0; i--) {
        const e = own[i]
        const before = level - e.quantity
        if (before < 0) continue // drop deliveries that history can't account for
        kept.push({ ...e, stockBefore: before, stockAfter: level })
        level = before
      }
      kept.push({ productId: p.id, type: 'initial', quantity: level, stockBefore: 0, stockAfter: level, reason: 'Opening stock', userName: 'System', createdAt: start.toISOString() })
      movements.push(...kept)
    }
    movements.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.type === 'initial' ? -1 : 0))
    movements.forEach((m, i) => (m.id = 'mov-' + pad(i + 1, 6)))
    const mSeq = movements.length

    return {
      version: 1,
      seededAt: now.toISOString(),
      store: { ...STORE },
      restockSettings: { ...RESTOCK_SETTINGS },
      users: USERS.map((u) => ({ ...u })),
      categories: CATEGORIES.map((c) => ({ ...c })),
      suppliers: SUPPLIERS.map((s) => ({ ...s })),
      products,
      transactions,
      movements,
      counters: { invoice: invoiceSeq, movement: mSeq },
    }
  }

  function roundUpCash(total, rand) {
    const notes = [total, Math.ceil(total / 5000) * 5000, Math.ceil(total / 10000) * 10000, Math.ceil(total / 50000) * 50000, Math.ceil(total / 100000) * 100000]
    return notes[Math.floor(rand() * notes.length)]
  }

  function ymd(d) {
    return d.getFullYear() + pad(d.getMonth() + 1, 2) + pad(d.getDate(), 2)
  }

  window.Seed = { build, ymd }
})()
