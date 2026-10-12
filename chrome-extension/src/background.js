// Context menu + shortcut: send the selected text to the side panel, which asks Wingman.
const ACTIONS = [
  ['explain', 'Explain with Wingman'],
  ['summarize', 'Summarize with Wingman'],
  ['reply', 'Draft a reply with Wingman'],
]

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.contextMenus.removeAll(() => {
    for (const [id, title] of ACTIONS) chrome.contextMenus.create({ id, title, contexts: ['selection'] })
  })
  if (reason === 'install') chrome.runtime.openOptionsPage()
})

async function ask(tab, text, instruction) {
  if (!text?.trim()) return
  await chrome.storage.session.set({ request: { text, instruction, pageTitle: tab?.title || '', at: Date.now() } })
  if (tab?.windowId !== undefined) await chrome.sidePanel.open({ windowId: tab.windowId })
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  void ask(tab, info.selectionText, info.menuItemId)
})

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'explain-selection' || !tab?.id) return
  // Open first: sidePanel.open must run inside the user gesture.
  const opening = chrome.sidePanel.open({ windowId: tab.windowId })
  const [result] = await chrome.scripting
    .executeScript({ target: { tabId: tab.id }, func: () => window.getSelection()?.toString() || '' })
    .catch(() => [])
  await opening
  if (result?.result) await chrome.storage.session.set({ request: { text: result.result, instruction: 'explain', pageTitle: tab.title || '', at: Date.now() } })
})

chrome.action.onClicked.addListener((tab) => chrome.sidePanel.open({ windowId: tab.windowId }))
