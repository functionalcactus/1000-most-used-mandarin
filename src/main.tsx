import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import { App } from './ui/App'
import './styles.css'

// Look for a new version on launch, whenever the app comes back to the foreground, and hourly.
// A new version installs and the page reloads into it (vite-plugin-pwa autoUpdate).
registerSW({
  immediate: true,
  onRegisteredSW(_url, reg) {
    if (!reg) return
    const check = () => reg.update().catch(() => {})
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
    setInterval(check, 60 * 60 * 1000)
  }
})
render(<App />, document.getElementById('app')!)
