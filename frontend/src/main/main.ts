/**
 * Wingman AI - Electron main process.
 * Window + tray, global shortcuts, the backend process, API keys and
 * permission for capturing call audio.
 */
import {
  app, BrowserWindow, desktopCapturer, ipcMain, Menu, nativeImage, screen, session, shell, systemPreferences, Tray,
} from 'electron'
import path from 'path'
import { BackendManager, type BackendConnection } from './backend'
import { SecretVault } from './secrets'
import { Shortcuts, type ShortcutAction } from './shortcuts'

if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let vault: SecretVault
let shortcuts: Shortcuts

const send = (channel: string, ...args: unknown[]) => mainWindow?.webContents.send(channel, ...args)

const backend = new BackendManager(async (conn) => {
  await vault.pushAll(conn).catch((e) => console.error('[secrets] push failed', e))
  send('backend:restarted')
})

function showWindow(): void {
  mainWindow?.show()
  mainWindow?.focus()
}

function createWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  // A transparent, click-through overlay covering the screen so the island can be dragged anywhere.
  mainWindow = new BrowserWindow({
    width, height, x: 0, y: 0,
    frame: false, transparent: true, alwaysOnTop: true, skipTaskbar: true, resizable: false,
    hasShadow: false, backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  mainWindow.setIgnoreMouseEvents(true, { forward: true })
  if (process.platform === 'darwin') {
    mainWindow.setWindowButtonVisibility(false)
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
    mainWindow.setAlwaysOnTop(true, 'screen-saver')
  }

  // Links in answers open in the user's browser, never inside the overlay.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e) => e.preventDefault())

  if (process.env.VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })
  mainWindow.on('closed', () => (mainWindow = null))
}

function createTray(): void {
  const icon = nativeImage.createFromPath(path.join(__dirname, '../resources/tray-icon.png'))
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 16, height: 16 }))
  if (icon.isEmpty()) tray.setTitle('W')
  const modes = ['interview', 'study', 'work', 'meeting', 'research', 'practice']
  tray.setToolTip('Wingman AI')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Show Wingman', click: showWindow },
    { type: 'separator' },
    ...modes.map((mode) => ({
      label: `${mode[0].toUpperCase()}${mode.slice(1)} mode`,
      click: () => send('app:set-mode', mode),
    })),
    { type: 'separator' },
    { label: 'Pause / resume', click: () => send('app:toggle-pause') },
    { label: 'Settings…', click: () => { showWindow(); send('app:open-settings') } },
    { type: 'separator' },
    { label: 'Quit Wingman', click: () => { isQuitting = true; app.quit() } },
  ]))
  tray.on('click', () => (mainWindow?.isVisible() ? mainWindow.hide() : showWindow()))
}

function setupShortcuts(): void {
  shortcuts = new Shortcuts({
    toggleVisibility: () => (mainWindow?.isVisible() ? mainWindow.hide() : showWindow()),
    commandPalette: () => { showWindow(); send('app:open-command-palette') },
    toggleListening: () => send('app:toggle-listening'),
    pauseResume: () => send('app:toggle-pause'),
    captureScreen: () => send('app:capture-screen'),
    emergencyHide: () => { mainWindow?.hide(); send('app:emergency-hide') },
  })
  shortcuts.apply({})
}

/** Lets the renderer capture system audio (the other side of a call) via getDisplayMedia. */
function setupMediaPermissions(): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    async (_request, callback) => {
      try {
        const [source] = await desktopCapturer.getSources({ types: ['screen'] })
        // macOS 14.2+: needs NSAudioCaptureUsageDescription in Info.plist (set in package.json).
        callback(source ? { video: source, audio: 'loopback' } : {})
      } catch (err) {
        console.error('[media] getSources failed', err)
        callback({})
      }
    },
    { useSystemPicker: false },
  )
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    const ours = wc === mainWindow?.webContents
    callback(ours && ['media', 'display-capture', 'clipboard-sanitized-write'].includes(permission))
  })
}

function setupIPC(): void {
  let modalOpen = false
  ipcMain.handle('backend:connection', async () => backend.ensure())
  ipcMain.handle('secrets:status', () => ({ keys: vault.status(), encrypted: vault.encrypted }))
  ipcMain.handle('secrets:set', async (_e, provider: string, key: string | null) => {
    await vault.set(provider, key, backend.connection)
    return vault.status()
  })
  ipcMain.handle('secrets:push', async () => {
    const conn = backend.connection
    if (conn) await vault.pushAll(conn)
  })
  ipcMain.handle('shortcuts:get', () => shortcuts.bindings)
  ipcMain.handle('shortcuts:set', (_e, bindings: Partial<Record<ShortcutAction, string>>) => shortcuts.apply(bindings))
  ipcMain.handle('media:request-mic', async () => {
    if (process.platform !== 'darwin') return true
    return systemPreferences.askForMediaAccess('microphone')
  })

  ipcMain.handle('window:set-ignore-mouse', (_e, ignore: boolean) => {
    modalOpen = !ignore
    mainWindow?.setIgnoreMouseEvents(ignore, { forward: true })
  })
  ipcMain.on('window:mouse-enter-island', () => mainWindow?.setIgnoreMouseEvents(false))
  ipcMain.on('window:mouse-leave-island', () => {
    if (!modalOpen) mainWindow?.setIgnoreMouseEvents(true, { forward: true })
  })
  ipcMain.handle('window:set-always-on-top', (_e, flag: boolean) => {
    if (flag && process.platform === 'darwin') mainWindow?.setAlwaysOnTop(true, 'screen-saver')
    else mainWindow?.setAlwaysOnTop(flag)
  })
  ipcMain.handle('window:set-opacity', (_e, opacity: number) => mainWindow?.setOpacity(Math.max(0.4, Math.min(1, opacity))))
  ipcMain.handle('window:set-content-protection', (_e, hide: boolean) => mainWindow?.setContentProtection(hide))
  ipcMain.handle('app:set-launch-at-startup', (_e, enabled: boolean) =>
    app.setLoginItemSettings({ openAtLogin: enabled }))
  ipcMain.handle('app:set-show-in-dock', (_e, show: boolean) => {
    if (process.platform === 'darwin') void (show ? app.dock?.show() : app.dock?.hide())
  })
  ipcMain.handle('app:open-external', (_e, url: string) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
  })
  ipcMain.handle('app:quit', () => { isQuitting = true; app.quit() })
}

app.on('second-instance', showWindow)

app.whenReady().then(async () => {
  vault = new SecretVault()
  setupIPC()
  setupMediaPermissions()
  createWindow()
  createTray()
  setupShortcuts()
  try {
    const conn: BackendConnection = await backend.ensure()
    await vault.pushAll(conn)
  } catch (err) {
    console.error('[backend]', err)
    send('backend:error', String((err as Error).message || err))
  }
})

app.on('activate', () => { if (!mainWindow) createWindow() })
app.on('before-quit', () => { isQuitting = true })
app.on('will-quit', () => backend.stop())
