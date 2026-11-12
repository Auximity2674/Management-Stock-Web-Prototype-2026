/* Login page */
(function () {
  const { $, esc, icons, toast, setLoading } = UI
  const HOME = { owner: 'dashboard.html', cashier: 'pos.html', warehouse: 'stock.html' }
  const ROLE_META = {
    owner: { icon: 'crown', color: 'bg-brand-50 text-brand-600', desc: 'Full access, reports & settings' },
    cashier: { icon: 'scan-barcode', color: 'bg-iris-50 text-iris-600', desc: 'POS checkout & stock view' },
    warehouse: { icon: 'warehouse', color: 'bg-teal-50 text-teal-600', desc: 'Stock in/out & stock counts' },
  }

  // Already signed in → go straight to the role's home page.
  const existing = DB.Session.get()
  if (existing) {
    location.replace(HOME[existing.role])
    return
  }

  icons()
  DB.load() // seeds demo data on first visit

  // Decorative count-up on the brand panel
  UI.countUp($('#demo-count'), 2847500, { duration: 1800, format: (v) => Fmt.rupiah(v) })

  const form = $('#login-form')
  const errorBox = $('#login-error')
  const btn = $('#login-btn')

  $('#toggle-pass').addEventListener('click', () => {
    const input = $('#password')
    input.type = input.type === 'password' ? 'text' : 'password'
    $('#toggle-pass').innerHTML = `<i data-lucide="${input.type === 'password' ? 'eye' : 'eye-off'}"></i>`
    icons()
  })

  async function login(username, password) {
    errorBox.classList.add('hidden')
    setLoading(btn, true, 'Checking...')
    try {
      const user = await Api.auth.login(username, password)
      toast(`Hello, ${user.name.split(' ')[0]}!`)
      const next = UI.query('next')
      // Only follow same-folder page names (no external redirects).
      const safeNext = next && /^[a-z-]+\.html$/.test(next) ? next : null
      setTimeout(() => location.replace(safeNext || HOME[user.role]), 350)
    } catch (err) {
      setLoading(btn, false)
      errorBox.textContent = err.message
      errorBox.classList.remove('hidden')
      UI.replayClass(form, 'shake')
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const username = form.username.value.trim()
    const password = form.password.value
    if (!username || !password) {
      errorBox.textContent = 'Username and password are required.'
      errorBox.classList.remove('hidden')
      UI.replayClass(form, 'shake')
      return
    }
    login(username, password)
  })

  Api.auth.demoAccounts().then((accounts) => {
    const box = $('#demo-accounts')
    box.innerHTML = accounts
      .map((a) => {
        const m = ROLE_META[a.role]
        return `<button type="button" class="card card-hover flex items-center gap-4 p-3.5 text-left group" data-u="${esc(a.username)}" data-p="${esc(a.password)}">
          <div class="kpi-icon ${m.color} transition group-hover:scale-110"><i data-lucide="${m.icon}"></i></div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-bold">${UI.ROLE_LABEL[a.role]} <span class="font-medium text-ink-400">· ${esc(a.name)}</span></p>
            <p class="text-xs text-ink-500">${m.desc}</p>
          </div>
          <code class="hidden sm:block text-[11px] text-ink-500 bg-ink-50 rounded-md px-2 py-1">${esc(a.username)} / ${esc(a.password)}</code>
          <i data-lucide="arrow-right" class="w-4 h-4 text-ink-300 transition group-hover:text-brand-500 group-hover:translate-x-1"></i>
        </button>`
      })
      .join('')
    icons()
    box.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => {
        form.username.value = b.dataset.u
        form.password.value = b.dataset.p
        login(b.dataset.u, b.dataset.p)
      }),
    )
  })
})()
