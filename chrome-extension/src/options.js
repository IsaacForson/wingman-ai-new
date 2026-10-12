import { checkConnection, getKey } from './api.js'

const input = document.getElementById('key')
const result = document.getElementById('result')

getKey().then((key) => {
  if (key) {
    input.placeholder = 'Paired. Paste a new key to replace it.'
    result.textContent = 'Paired.'
  }
})

document.getElementById('save').addEventListener('click', async () => {
  const key = input.value.trim()
  if (!key) return
  result.classList.remove('error')
  result.textContent = 'Checking…'
  const problem = await checkConnection(key)
  if (problem) {
    result.textContent = problem
    result.classList.add('error')
    return
  }
  await chrome.storage.local.set({ pairingKey: key })
  input.value = ''
  result.textContent = 'Paired. Select text on any page and right-click → Explain with Wingman.'
})
