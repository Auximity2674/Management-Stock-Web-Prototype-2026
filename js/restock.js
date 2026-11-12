/* ==========================================================================
   Restock recommendation engine — pure JavaScript, no DOM / app dependencies.
   Works in the browser (window.Restock) and in Node (module.exports), so it
   can be unit-tested or moved to the backend unchanged.

   Per product:
     avgDaily      = forecast(daily sales over the last N complete days)
     daysOfStock   = stock / avgDaily
     safetyStock   = Z × σ(daily sales) × √leadTime
     reorderPoint  = avgDaily × leadTime + safetyStock
     suggestedQty  = max(0, avgDaily × targetCoverageDays + safetyStock − stock)

   The forecasting step is a pluggable "strategy" (moving average by default,
   exponential smoothing included) so the model can be swapped later.
   ========================================================================== */
;(function (root, factory) {
  const lib = factory()
  if (typeof module === 'object' && module.exports) module.exports = lib
  else root.Restock = lib
})(typeof self !== 'undefined' ? self : this, function () {
  const DAY_MS = 24 * 60 * 60 * 1000

  const DEFAULTS = Object.freeze({
    analysisDays: 30,
    zValue: 1.65, // ≈ 95% service level
    targetCoverageDays: 14,
    method: 'sma', // 'sma' = simple moving average, 'ses' = exponential smoothing
    smoothingAlpha: 0.3,
    soonBufferDays: 7, // "Restock Soon" when within this many days of the reorder point
    overstockFactor: 2, // "Overstock" when stock > factor × (target coverage + safety stock)
  })

  const STATUS = Object.freeze({
    RESTOCK_NOW: 'restock_now',
    RESTOCK_SOON: 'restock_soon',
    SAFE: 'safe',
    OVERSTOCK: 'overstock',
  })

  const STATUS_PRIORITY = { restock_now: 0, restock_soon: 1, safe: 2, overstock: 3 }

  // ---------------------------------------------------------------- stats
  function mean(values) {
    if (!values.length) return 0
    let sum = 0
    for (const v of values) sum += v
    return sum / values.length
  }

  /** Sample standard deviation (n − 1). Returns 0 for fewer than 2 values. */
  function stdDev(values) {
    if (values.length < 2) return 0
    const m = mean(values)
    let sq = 0
    for (const v of values) sq += (v - m) * (v - m)
    return Math.sqrt(sq / (values.length - 1))
  }

  // ---------------------------------------------------------------- forecasting strategies
  /** Each strategy turns a daily series (oldest → newest) into an expected daily demand. */
  const strategies = {
    sma: {
      id: 'sma',
      label: 'Simple moving average (SMA)',
      forecast: (series) => mean(series),
    },
    ses: {
      id: 'ses',
      label: 'Exponential smoothing (SES)',
      forecast: (series, opts = {}) => {
        if (!series.length) return 0
        const alpha = opts.smoothingAlpha ?? DEFAULTS.smoothingAlpha
        // Initialise with the mean of the first week to reduce start-up bias.
        let level = mean(series.slice(0, Math.min(7, series.length)))
        for (const x of series) level = alpha * x + (1 - alpha) * level
        return level
      },
    },
  }

  function getStrategy(method) {
    if (method && typeof method === 'object' && typeof method.forecast === 'function') return method
    return strategies[method] || strategies.sma
  }

  // ---------------------------------------------------------------- series building
  function startOfDay(date) {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    return d
  }

  /**
   * Buckets sales records into per-product daily quantity series.
   * @param records  [{ productId, quantity, date }] (date: ISO string / Date / ms)
   * @param options  { days, endDate } — window covers `days` complete days ending
   *                 just before `endDate` (default: start of today, so today's
   *                 partial sales don't drag the average down).
   * @returns Map<productId, number[]> oldest → newest, length = days
   */
  function buildDailySeries(records, { days = DEFAULTS.analysisDays, endDate } = {}) {
    const end = startOfDay(endDate ?? Date.now()).getTime()
    const start = end - days * DAY_MS
    const series = new Map()
    for (const r of records) {
      const t = new Date(r.date).getTime()
      if (!(t >= start && t < end)) continue
      // Use calendar days (robust to DST shifts) rather than raw ms division.
      const idx = Math.round((startOfDay(t).getTime() - start) / DAY_MS)
      if (idx < 0 || idx >= days) continue
      let arr = series.get(r.productId)
      if (!arr) {
        arr = new Array(days).fill(0)
        series.set(r.productId, arr)
      }
      arr[idx] += Number(r.quantity) || 0
    }
    return series
  }

  // ---------------------------------------------------------------- core calculation
  /**
   * Calculates the recommendation for one product.
   * @param product  { id, stock, leadTimeDays }
   * @param series   daily sales, oldest → newest
   * @param settings partial DEFAULTS
   */
  function calculateForProduct(product, series, settings = {}) {
    const s = { ...DEFAULTS, ...settings }
    const stock = Math.max(0, Number(product.stock) || 0)
    const leadTime = Math.max(0, Number(product.leadTimeDays) || 0)
    const data = Array.isArray(series) ? series : []

    const avgDailySales = Math.max(0, getStrategy(s.method).forecast(data, s))
    const sigma = stdDev(data)
    const safetyStock = s.zValue * sigma * Math.sqrt(leadTime)
    const reorderPoint = avgDailySales * leadTime + safetyStock
    const targetStock = avgDailySales * s.targetCoverageDays + safetyStock
    const suggestedQty = Math.max(0, Math.ceil(targetStock - stock))
    const daysOfStock = avgDailySales > 0 ? stock / avgDailySales : Infinity
    const totalSold = data.reduce((a, b) => a + b, 0)

    let status
    if (avgDailySales <= 0) {
      // No demand in the window: any stock on hand is dead stock.
      status = stock > 0 ? STATUS.OVERSTOCK : STATUS.SAFE
    } else if (stock <= reorderPoint) {
      status = STATUS.RESTOCK_NOW
    } else if (stock <= reorderPoint + avgDailySales * s.soonBufferDays) {
      status = STATUS.RESTOCK_SOON
    } else if (stock > targetStock * s.overstockFactor) {
      status = STATUS.OVERSTOCK
    } else {
      status = STATUS.SAFE
    }

    return {
      productId: product.id,
      stock,
      leadTimeDays: leadTime,
      avgDailySales,
      stdDev: sigma,
      totalSold,
      daysOfStock,
      safetyStock,
      reorderPoint,
      targetStock,
      suggestedQty: status === STATUS.OVERSTOCK ? 0 : suggestedQty,
      status,
      noDemand: avgDailySales <= 0,
    }
  }

  /**
   * Calculates recommendations for many products, sorted by urgency.
   * @param products [{ id, stock, leadTimeDays, ... }]
   * @param records  [{ productId, quantity, date }]
   * @param settings partial DEFAULTS
   * @param options  { endDate }
   */
  function calculateRestockRecommendations(products, records, settings = {}, options = {}) {
    const s = { ...DEFAULTS, ...settings }
    const seriesMap = buildDailySeries(records, { days: s.analysisDays, endDate: options.endDate })
    const empty = new Array(s.analysisDays).fill(0)
    return products
      .map((p) => {
        const series = seriesMap.get(p.id) || empty
        return { ...calculateForProduct(p, series, s), series }
      })
      .sort(
        (a, b) =>
          STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status] ||
          (a.daysOfStock === b.daysOfStock ? 0 : a.daysOfStock - b.daysOfStock),
      )
  }

  return {
    DEFAULTS,
    STATUS,
    STATUS_PRIORITY,
    strategies,
    mean,
    stdDev,
    buildDailySeries,
    calculateForProduct,
    calculateRestockRecommendations,
  }
})
