import { useEffect, useState } from 'preact/hooks'
import { getKV, requestPersist, setKV } from '../lib/db'
import { getSettings, saveSettings, type Settings } from '../lib/session'
import { setSoundOn } from '../lib/audio'
import { setRetention } from '../lib/srs'
import { Run } from './Run'
import { Placement } from './Placement'
import { Library, MapView, SettingsView, Today } from './screens'
import { Icon } from './art'

type Tab = 'today' | 'map' | 'library' | 'settings'

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [placed, setPlaced] = useState<boolean | null>(null)
  const [tab, setTab] = useState<Tab>('today')
  const [running, setRunning] = useState(false)
  const [runKey, setRunKey] = useState(0)

  useEffect(() => {
    requestPersist()
    Promise.all([getSettings(), getKV('placementDone', false)]).then(([s, p]) => {
      setRetention(s.retention)
      setSoundOn(s.sound)
      setSettings(s)
      setPlaced(p)
    })
  }, [])

  useEffect(() => {
    if (settings) setSoundOn(settings.sound)
  }, [settings?.sound])

  if (!settings || placed === null)
    return (
      <div class="screen center" />
    )

  if (!placed) return <Placement lang={settings.gloss} onDone={() => setPlaced(true)} />

  if (running)
    return (
      <Run
        key={runKey}
        settings={settings}
        onSettings={async (s) => {
          await saveSettings(s)
          setSettings(s)
        }}
        onExit={() => {
          setRunning(false)
          setTab('today')
        }}
      />
    )

  return (
    <div class="shell">
      <div class="shell-main" key={tab}>
        {tab === 'today' && (
          <Today
            settings={settings}
            onSettings={setSettings}
            onStart={() => {
              setRunKey((k) => k + 1)
              setRunning(true)
            }}
          />
        )}
        {tab === 'map' && <MapView lang={settings.gloss} />}
        {tab === 'library' && <Library lang={settings.gloss} />}
        {tab === 'settings' && (
          <SettingsView
            settings={settings}
            onSettings={setSettings}
            onRetakePlacement={async () => {
              await setKV('placementDone', false)
              setPlaced(false)
            }}
          />
        )}
      </div>
      <nav class="tabbar" aria-label="Sections">
        {(
          [
            ['today', 'today', 'Today'],
            ['map', 'progress', 'Progress'],
            ['library', 'words', 'Words'],
            ['settings', 'settings', 'Settings']
          ] as [Tab, 'today' | 'progress' | 'words' | 'settings', string][]
        ).map(([t, icon, label]) => (
          <button class={tab === t ? 'on' : ''} onClick={() => setTab(t)} aria-current={tab === t ? 'page' : undefined}>
            <Icon name={icon} size={24} />
            <span class="tab-label">{label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
