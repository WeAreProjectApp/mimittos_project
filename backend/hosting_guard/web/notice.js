/* Protocol 1: framework-independent presentation, no credentials or business API calls. */
(() => {
  if (window.__hostingControl) return
  window.__hostingControl = true
  let current = null
  let busy = false
  let bannerObserver = null
  const initial = document.getElementById('hosting-initial')
  if (initial) { try { current = JSON.parse(initial.textContent) } catch { /* retry through local adapter */ } }
  function exempt() {
    const path = location.pathname.replace(/^\/[a-z]{2}(?:-[a-z]{2})?(?=\/)/, '')
    return (current?.exempt_paths || []).some(prefix => path === prefix.replace(/\/$/, '') || path.startsWith(prefix))
  }
  function render() {
    if (!current || !document.body) return
    const mode = exempt() ? 'normal' : current.mode
    if (document.body.dataset.hostingStandalone && mode !== 'suspended') { location.reload(); return }
    document.documentElement.toggleAttribute('data-hosting-suspended', mode === 'suspended')
    document.documentElement.toggleAttribute('data-hosting-banner', mode === 'banner')
    bannerObserver?.disconnect()
    document.documentElement.style.removeProperty('--hosting-banner-height')
    let notice = document.getElementById('hosting-notice')
    if (mode === 'normal') { notice?.remove(); return }
    if (!notice) { notice = document.createElement('section'); notice.id = 'hosting-notice'; document.body.prepend(notice) }
    notice.className = mode === 'banner' ? 'hosting-banner' : 'hosting-screen'
    notice.setAttribute('role', mode === 'banner' ? 'status' : 'main')
    const title = document.createElement(mode === 'banner' ? 'h2' : 'h1')
    title.textContent = current.message.title
    const text = document.createElement('p')
    text.textContent = current.message.text
    notice.replaceChildren(title, text)
    if (mode === 'banner') {
      const measure = () => document.documentElement.style.setProperty('--hosting-banner-height', `${notice.getBoundingClientRect().height}px`)
      measure()
      bannerObserver = new ResizeObserver(measure)
      bannerObserver.observe(notice)
    }
    window.dispatchEvent(new CustomEvent('hosting-control-applied', { detail: { mode, version: current.version } }))
  }
  async function refresh() {
    if (busy) return
    busy = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    try {
      const result = await fetch('/__hosting/state', { cache: 'no-store', credentials: 'omit', signal: controller.signal })
      if (!result.ok) return
      const next = await result.json()
      if (!next.ready || !['normal', 'banner', 'suspended'].includes(next.mode) || !next.message) return
      if (current && (next.target_key !== current.target_key || next.version < current.version)) return
      current = next
      render()
    } catch { /* A disconnected production keeps its last valid presentation. */ }
    finally { clearTimeout(timeout); busy = false }
  }
  for (const method of ['pushState', 'replaceState']) {
    const original = history[method]
    history[method] = function (...args) { const result = original.apply(this, args); render(); return result }
  }
  addEventListener('popstate', () => { render(); refresh() })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh() })
  // Hydration can replace body siblings; immediately restore the active notice.
  new MutationObserver(() => {
    if (current && current.mode !== 'normal' && !exempt() && !document.getElementById('hosting-notice')) render()
  }).observe(document.body, { childList: true })
  render()
  refresh()
  setInterval(refresh, 10000)
})()
