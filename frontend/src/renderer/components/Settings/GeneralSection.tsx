import toast from 'react-hot-toast'
import { useSettingsStore } from '../../store/settingsStore'
import { Button, Section, Slider, Toggle } from '../ui/controls'

export function GeneralSection() {
  const s = useSettingsStore()
  return (
    <>
      <Section title="Window">
        <Toggle label="Keep on top of other windows" value={s.alwaysOnTop} onChange={(v) => s.setPreference('alwaysOnTop', v)} />
        <Slider label="Opacity" value={s.windowOpacity} min={0.4} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => s.setPreference('windowOpacity', v)} />
        <Toggle label="Scroll to new answers" value={s.autoScrollAnswers} onChange={(v) => s.setPreference('autoScrollAnswers', v)} />
      </Section>
      <Section title="Startup">
        <Toggle label="Open Wingman when I log in" value={s.launchAtStartup} onChange={(v) => s.setPreference('launchAtStartup', v)} />
        {window.wingman?.platform === 'darwin' && <Toggle label="Show in the Dock" value={s.showInDock} onChange={(v) => s.setPreference('showInDock', v)} />}
      </Section>
      <Section title="Reset">
        <div className="flex items-center justify-between py-2.5">
          <p className="text-sm text-white">Restore window and display preferences</p>
          <Button onClick={() => { s.resetPreferences(); toast.success('Preferences restored') }}>Reset</Button>
        </div>
      </Section>
    </>
  )
}
