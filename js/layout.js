/* ==========================================================================
   Auth guard + shared app shell (dark top bar, collapsible sidebar).
   Each admin page calls Layout.mount({ page, title }) and keeps its own
   content inside <main id="content">.
   ========================================================================== */
(function () {
  const { esc, $, $$, icons } = UI

  // Which roles may open which page. Menu items and route access both use this.
  const NAV = [
    { section: 'Overview' },
    { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard', href: 'dashboard.html', roles: ['owner'] },
    { section: 'Sales' },
    { id: 'pos', label: 'Point of Sale', icon: 'scan-barcode', href: 'pos.html', roles: ['owner', 'cashier'] },
    { id: 'transactions', label: 'Transactions', icon: 'receipt-text', href: 'transactions.html', roles: ['owner', 'cashier'] },
    { section: 'Inventory' },
    { id: 'products', label: 'Products', icon: 'package', href: 'products.html', roles: ['owner', 'cashier', 'warehouse'] },
    { id: 'stock', label: 'Stock & Counts', icon: 'warehouse', href: 'stock.html', roles: ['owner', 'warehouse'] },
    { id: 'restock', label: 'Restock Advisor', icon: 'sparkles', href: 'restock.html', roles: ['owner', 'warehouse'] },
  ]

  const HOME = { owner: 'dashboard.html', cashier: 'pos.html', warehouse: 'stock.html' }

  const ROLE_ICON = { owner: 'crown', cashier: 'scan-barcode', warehouse: 'warehouse' }
  const ROLE_DESC = { owner: 'Full access, reports & settings', cashier: 'POS checkout & stock view', warehouse: 'Stock in/out & stock counts' }

  const Auth = {
    user: () => DB.Session.get(),
    home: (role) => HOME[role] || 'login.html',
    canAccess(pageId, role) {
      const item = NAV.find((n) => n.id === pageId)
      return !!item && item.roles.includes(role)
    },
    /** Demo mode: signs in as the given role (default owner) without a password. */
    signInAs(role = 'owner') {
      const u = DB.load().users.find((x) => x.role === role)
      if (!u) return null
      const { password: _omit, ...session } = u
      DB.Session.set(session)
      return session
    },
    /** Returns the current session, auto-signing in as owner in demo mode. */
    ensureSession() {
      return DB.Session.get() || (DB.DEMO_NO_LOGIN ? Auth.signInAs('owner') : null)
    },
    /** Demo mode: modal to switch between the owner / cashier / warehouse views. */
    openRoleSwitcher() {
      const current = DB.Session.get()
      const users = DB.load().users
      const m = UI.modal({
        title: 'Switch role',
        subtitle: 'Demo mode — view the app as each role.',
        size: 'sm',
        body: `<div class="grid gap-3 stagger">${users
          .map(
            (u) => `<button class="card card-hover flex items-center gap-4 p-3.5 text-left group ${current && current.role === u.role ? 'ring-2 ring-brand-400' : ''}" data-role="${u.role}">
            <div class="kpi-icon bg-brand-50 text-brand-600 transition group-hover:scale-110"><i data-lucide="${ROLE_ICON[u.role]}"></i></div>
            <div class="flex-1 min-w-0"><p class="text-sm font-bold">${UI.ROLE_LABEL[u.role]} <span class="font-medium text-ink-400">· ${esc(u.name)}</span></p>
            <p class="text-xs text-ink-500">${ROLE_DESC[u.role]}</p></div>
            ${current && current.role === u.role ? '<span class="badge badge-orange no-dot">Active</span>' : '<i data-lucide="arrow-right" class="w-4 h-4 text-ink-300 transition group-hover:text-brand-500 group-hover:translate-x-1"></i>'}
          </button>`,
          )
          .join('')}</div>`,
      })
      $$('[data-role]', m.el).forEach((b) =>
        b.addEventListener('click', () => {
          const s = Auth.signInAs(b.dataset.role)
          sessionStorage.removeItem('stokku.pos.cart')
          location.href = Auth.home(s.role)
        }),
      )
    },
    /** Redirects to login (no session) or to the role's home page (no access). */
    guard(pageId) {
      const user = Auth.ensureSession()
      if (!user) {
        location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop()))
        return null
      }
      if (!Auth.canAccess(pageId, user.role)) {
        sessionStorage.setItem('stokku.flash', 'That page is not available for your role.')
        location.replace(Auth.home(user.role))
        return null
      }
      return user
    },
    async logout() {
      if (DB.DEMO_NO_LOGIN) return Auth.openRoleSwitcher()
      await Api.auth.logout()
      location.replace('login.html')
    },
  }

  const LOGO = `<svg viewBox="0 0 32 32" class="w-8 h-8 shrink-0"><rect width="32" height="32" rx="9" fill="#F2683A"/><path d="M9 12.5 16 9l7 3.5v7L16 23l-7-3.5z" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/><path d="M9 12.5 16 16l7-3.5M16 16v7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/></svg>`

  function avatar(name, size = 'w-10 h-10') {
    return `<div class="${size} rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-white grid place-items-center text-sm font-bold ring-2 ring-white/15">${esc(Fmt.initials(name))}</div>`
  }

  function mount({ page, title }) {
    const user = Auth.guard(page)
    if (!user) return null

    const content = $('#content')
    const collapsed = localStorage.getItem('stokku.sidebar') === 'collapsed'

    const navHtml = NAV.filter((n) => n.section || n.roles.includes(user.role))
      // Drop section headers that ended up with no items for this role.
      .filter((n, i, arr) => !n.section || (arr[i + 1] && !arr[i + 1].section))
      .map((n) =>
        n.section
          ? `<div class="nav-section">${n.section}</div>`
          : `<a href="${n.href}" class="nav-item ${n.id === page ? 'active' : ''}" data-nav="${n.id}" title="${n.label}">
               <i data-lucide="${n.icon}"></i><span class="nav-label">${n.label}</span></a>`,
      )
      .join('')

    const shell = document.createElement('div')
    shell.className = 'min-h-screen flex flex-col'
    shell.innerHTML = `
      <header class="topbar sticky top-0 z-40 h-16 flex items-center gap-3 px-3 sm:px-5">
        <button class="topbar-btn lg:hidden" id="menu-toggle" aria-label="Menu"><i data-lucide="menu"></i></button>
        <a href="${Auth.home(user.role)}" class="flex items-center gap-2.5 shrink-0">
          ${LOGO}<span class="text-lg font-extrabold tracking-tight hidden sm:block">Stok<span class="text-brand-400">Ku</span></span>
        </a>
        <div class="hidden md:block w-px h-7 bg-white/15 mx-2"></div>
        <h1 class="hidden md:block text-lg font-semibold truncate">${esc(title)}</h1>
        <div class="flex-1"></div>
        <form id="global-search" class="hidden md:block relative w-72 lg:w-80">
          <i data-lucide="search" class="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-white/50"></i>
          <input name="q" class="topbar-search w-full pl-11 pr-4 text-sm" placeholder="Search products, SKU, barcode..." autocomplete="off" />
        </form>
        ${
          Auth.canAccess('pos', user.role) && page !== 'pos'
            ? `<a href="pos.html" class="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-600 grid place-items-center shadow-[0_8px_24px_-8px_rgba(242,104,58,.8)] transition hover:rotate-90 duration-300" title="Open POS"><i data-lucide="plus" class="w-5 h-5"></i></a>`
            : ''
        }
        <div class="hidden sm:block w-px h-7 bg-white/15 mx-1"></div>
        <div class="relative">
          <button class="topbar-btn" id="bell-btn" aria-label="Stock alerts"><i data-lucide="bell" id="bell-icon"></i><span id="bell-count" class="hidden absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-[10px] font-bold grid place-items-center ring-2 ring-ink-900"></span></button>
          <div id="bell-menu" class="hidden"></div>
        </div>
        <div class="relative">
          <button class="flex items-center gap-3 pl-2 pr-1 sm:pr-3 py-1 rounded-full hover:bg-white/5 transition" id="user-btn">
            ${avatar(user.name)}
            <div class="hidden sm:block text-left leading-tight">
              <div class="text-sm font-semibold">${esc(user.name)}</div>
              <div class="text-xs text-white/50">${UI.ROLE_LABEL[user.role]}</div>
            </div>
            <i data-lucide="chevron-down" class="hidden sm:block w-4 h-4 text-white/50"></i>
          </button>
          <div id="user-menu" class="hidden"></div>
        </div>
      </header>
      <div class="flex flex-1 min-h-0">
        <div id="sidebar-backdrop" class="hidden fixed inset-0 bg-ink-900/40 z-40 lg:hidden"></div>
        <aside id="sidebar" class="sidebar ${collapsed ? 'collapsed' : ''} bg-white border-r border-ink-100 flex flex-col shrink-0 lg:sticky lg:top-16 lg:h-[calc(100vh-4rem)]">
          <div class="lg:hidden h-16 flex items-center gap-2.5 px-5 border-b border-ink-100">${LOGO}<span class="font-extrabold text-lg">Stok<span class="text-brand-500">Ku</span></span></div>
          <nav class="relative flex-1 py-3 overflow-y-auto thin-scroll" id="nav">
            <span class="nav-indicator" id="nav-indicator" style="opacity:0"></span>
            ${navHtml}
          </nav>
          <div class="p-3 border-t border-ink-100 hidden lg:block">
            <button id="collapse-btn" class="nav-item w-[calc(100%-0rem)] !m-0" title="Collapse menu">
              <i data-lucide="${collapsed ? 'panel-left-open' : 'panel-left-close'}"></i><span class="nav-label">Collapse menu</span>
            </button>
          </div>
        </aside>
        <div class="flex-1 min-w-0" id="content-slot"></div>
      </div>`

    content.parentNode.insertBefore(shell, content)
    $('#content-slot', shell).appendChild(content)
    content.classList.add('anim-fade-up')
    icons()

    // Sliding active indicator
    const indicator = $('#nav-indicator')
    function moveIndicator(el) {
      if (!el) return
      indicator.style.opacity = 1
      indicator.style.top = el.offsetTop + 'px'
    }
    const active = $('.nav-item.active', $('#nav'))
    requestAnimationFrame(() => moveIndicator(active))
    $$('.nav-item[data-nav]').forEach((a) => {
      a.addEventListener('mouseenter', () => moveIndicator(a))
      a.addEventListener('mouseleave', () => moveIndicator(active))
    })

    // Collapse (desktop) / off-canvas (mobile)
    const sidebar = $('#sidebar')
    $('#collapse-btn').addEventListener('click', () => {
      const isCollapsed = sidebar.classList.toggle('collapsed')
      localStorage.setItem('stokku.sidebar', isCollapsed ? 'collapsed' : 'open')
      $('#collapse-btn').innerHTML = `<i data-lucide="${isCollapsed ? 'panel-left-open' : 'panel-left-close'}"></i><span class="nav-label">Collapse menu</span>`
      icons()
      window.dispatchEvent(new Event('resize')) // let charts reflow
    })
    const backdrop = $('#sidebar-backdrop')
    $('#menu-toggle').addEventListener('click', () => {
      sidebar.classList.add('open')
      backdrop.classList.remove('hidden')
    })
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('open')
      backdrop.classList.add('hidden')
    })

    // Global search → products page
    $('#global-search').addEventListener('submit', (e) => {
      e.preventDefault()
      const q = e.target.q.value.trim()
      location.href = 'products.html' + (q ? '?q=' + encodeURIComponent(q) : '')
    })

    // User menu
    const userMenu = $('#user-menu')
    $('#user-btn').addEventListener('click', (e) => {
      e.stopPropagation()
      closeMenus(userMenu)
      if (!userMenu.classList.contains('hidden')) return userMenu.classList.add('hidden')
      userMenu.className = 'dropdown p-2'
      userMenu.innerHTML = `
        <div class="px-3 py-2.5 mb-1 border-b border-ink-100">
          <p class="text-sm font-bold">${esc(user.name)}</p><p class="text-xs text-ink-500">@${esc(user.username)} · ${UI.ROLE_LABEL[user.role]}</p>
        </div>
        ${user.role === 'owner' ? `<button class="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg hover:bg-ink-50 text-ink-700" id="reset-demo"><i data-lucide="database-backup" class="w-4 h-4"></i>Reset demo data</button>` : ''}
        ${
          DB.DEMO_NO_LOGIN
            ? `<button class="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg hover:bg-brand-50 text-brand-600" id="logout-btn"><i data-lucide="repeat" class="w-4 h-4"></i>Switch role (demo)</button>`
            : `<button class="w-full flex items-center gap-3 px-3 py-2.5 text-sm rounded-lg hover:bg-red-50 text-red-600" id="logout-btn"><i data-lucide="log-out" class="w-4 h-4"></i>Log out</button>`
        }`
      icons()
      $('#logout-btn').addEventListener('click', Auth.logout)
      const reset = $('#reset-demo')
      if (reset)
        reset.addEventListener('click', async () => {
          userMenu.classList.add('hidden')
          const ok = await UI.confirm({
            title: 'Reset demo data?',
            message: 'All products, transactions and stock history will be restored to the original sample data. Your changes will be lost.',
            confirmText: 'Reset data',
            danger: true,
          })
          if (!ok) return
          try {
            await Api.demo.reset()
            UI.toast('Demo data has been reset.')
            setTimeout(() => location.reload(), 600)
          } catch (err) {
            UI.toast(err.message, 'error')
          }
        })
    })

    // Bell — low-stock alerts
    setupBell()

    document.addEventListener('click', () => closeMenus())

    // Flash message left by a redirect
    const flash = sessionStorage.getItem('stokku.flash')
    if (flash) {
      sessionStorage.removeItem('stokku.flash')
      setTimeout(() => UI.toast(flash, 'warning'), 300)
    }
    return user
  }

  function closeMenus(except) {
    ;['#user-menu', '#bell-menu'].forEach((sel) => {
      const el = $(sel)
      if (el && el !== except) el.classList.add('hidden')
    })
  }

  async function setupBell() {
    const btn = $('#bell-btn')
    const menu = $('#bell-menu')
    let alerts = []
    try {
      const products = await Api.products.all()
      alerts = products.filter((p) => p.stock <= p.minStock).sort((a, b) => a.stock - b.stock)
    } catch {
      return
    }
    const count = $('#bell-count')
    if (alerts.length) {
      count.textContent = alerts.length > 99 ? '99+' : alerts.length
      count.classList.remove('hidden')
      const icon = $('#bell-icon')
      const ring = () => UI.replayClass($('#bell-btn svg'), 'wiggle')
      setTimeout(ring, 800)
      setInterval(ring, 12000)
      void icon
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      closeMenus(menu)
      if (!menu.classList.contains('hidden')) return menu.classList.add('hidden')
      const user = DB.Session.get()
      const canRestock = Auth.canAccess('restock', user.role)
      menu.className = 'dropdown w-[340px] max-w-[calc(100vw-2rem)]'
      menu.innerHTML = `
        <div class="flex items-center justify-between px-4 py-3 border-b border-ink-100">
          <p class="font-bold text-sm">Stock Alerts</p><span class="badge badge-orange no-dot">${alerts.length} products</span>
        </div>
        <div class="max-h-80 overflow-y-auto thin-scroll stagger">
          ${
            alerts.length
              ? alerts
                  .slice(0, 30)
                  .map(
                    (p) => `<a href="products.html?view=${p.id}" class="flex items-center gap-3 px-4 py-2.5 hover:bg-ink-50">
                <div class="w-9 h-9 rounded-xl grid place-items-center ${p.stock <= 0 ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-600'}"><i data-lucide="${p.stock <= 0 ? 'package-x' : 'package-minus'}" class="w-4 h-4"></i></div>
                <div class="min-w-0 flex-1"><p class="text-sm font-semibold truncate">${esc(p.name)}</p>
                <p class="text-xs text-ink-500">${p.stock} ${esc(p.unit)} left · min. ${p.minStock}</p></div>
                ${p.stock <= 0 ? '<span class="badge badge-red no-dot">Out</span>' : '<span class="badge badge-amber no-dot">Low</span>'}
              </a>`,
                  )
                  .join('')
              : '<p class="text-sm text-ink-500 text-center py-8">All stock levels are healthy 🎉</p>'
          }
        </div>
        ${canRestock ? `<a href="restock.html" class="block text-center text-sm font-semibold text-brand-600 py-3 border-t border-ink-100 hover:bg-brand-50 rounded-b-[14px]">View restock advice →</a>` : ''}`
      icons()
    })
  }

  window.Auth = Auth
  window.Layout = { mount, NAV, LOGO, avatar }
})()
