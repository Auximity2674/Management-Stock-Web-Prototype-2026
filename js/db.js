/* ==========================================================================
   Mock database — the ONLY file that touches localStorage for app data.
   It plays the role of the backend's database. When a real REST API exists,
   this file (and the mock implementation in api.js) can be deleted.
   ========================================================================== */
(function () {
  /**
   * Demo mode: skip the login page and sign in automatically as the owner.
   * Roles can still be switched from the user menu. Set to false to bring
   * the login page (login.html) back.
   */
  const DEMO_NO_LOGIN = true

  // Bump the version when the seed data changes so browsers reseed automatically.
  const DB_KEY = 'stokku.db.v2'
  const SESSION_KEY = 'stokku.session.v2'
  let cache = null

  // Drop data left by older versions (it can take ~2 MB of the storage quota).
  try {
    ;['stokku.db.v1', 'stokku.session.v1'].forEach((k) => localStorage.removeItem(k))
  } catch {
    /* storage unavailable */
  }

  function load() {
    if (cache) return cache
    try {
      const raw = localStorage.getItem(DB_KEY)
      if (raw) {
        cache = JSON.parse(raw)
        return cache
      }
    } catch (err) {
      console.warn('[db] stored data unreadable, reseeding', err)
    }
    return reset()
  }

  function save() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(cache))
    } catch (err) {
      console.error('[db] failed to persist', err)
      throw new Error('Browser storage is full or blocked.')
    }
  }

  function reset() {
    cache = window.Seed.build()
    save()
    return cache
  }

  function nextId(prefix, counterKey) {
    const db = load()
    db.counters[counterKey] = (db.counters[counterKey] || 0) + 1
    return prefix + '-' + String(db.counters[counterKey]).padStart(6, '0')
  }

  function uid(prefix) {
    return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  }

  // Session storage stands in for an auth token / cookie.
  const Session = {
    get() {
      try {
        return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null')
      } catch {
        return null
      }
    },
    set(user) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user))
    },
    clear() {
      localStorage.removeItem(SESSION_KEY)
    },
  }

  window.DB = { load, save, reset, nextId, uid, Session, DEMO_NO_LOGIN }
})()
