import { explain } from './api.js'

const $ = (id) => document.getElementById(id)
const LABELS = { explain: 'Explaining', summarize: 'Summarizing', reply: 'Drafting a reply to' }
let lastAt = 0

if (navigator.platform.toLowerCase().includes('mac')) $('shortcut').textContent = '⌘⇧Y'

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

/** Minimal, safe markdown: code blocks, inline code, bold, lists, paragraphs. */
function render(md) {
  const blocks = escapeHtml(md).split(/```/)
  return blocks
    .map((block, i) => {
      if (i % 2 === 1) return `<pre><code>${block.replace(/^[\w+-]*\n/, '')}</code></pre>`
      return block
        .split(/\n{2,}/)
        .map((p) => {
          const inline = (t) => t.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          const lines = p.trim().split('\n')
          if (lines.every((l) => /^\s*([-*]|\d+\.)\s+/.test(l))) {
            return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^\s*([-*]|\d+\.)\s+/, ''))}</li>`).join('')}</ul>`
          }
          return p.trim() ? `<p>${inline(p.trim()).replace(/\n/g, '<br>')}</p>` : ''
        })
        .join('')
    })
    .join('')
}

async function handle(request) {
  if (!request || request.at <= lastAt) return
  lastAt = request.at
  $('empty').hidden = true
  $('request').hidden = false
  $('instruction').textContent = `${LABELS[request.instruction] || 'Explaining'}${request.pageTitle ? ` from “${request.pageTitle}”` : ''}`
  $('selection').textContent = request.text.length > 600 ? `${request.text.slice(0, 600)}…` : request.text
  $('answer').hidden = true
  $('footer').hidden = true
  $('status').hidden = false
  $('status').textContent = 'Asking Wingman…'
  $('status').classList.remove('error')
  try {
    const result = await explain(request)
    $('status').hidden = true
    $('answer').innerHTML = render(result.answer)
    $('answer').hidden = false
    $('meta').textContent = result.provider ? `${result.provider} · ${result.model}` : ''
    $('footer').hidden = false
    $('copy').onclick = async () => {
      await navigator.clipboard.writeText(result.answer)
      $('copy').textContent = 'Copied'
      setTimeout(() => ($('copy').textContent = 'Copy'), 1500)
    }
  } catch (err) {
    $('status').textContent = err.message
    $('status').classList.add('error')
  }
}

chrome.storage.session.get('request').then(({ request }) => handle(request))
chrome.storage.session.onChanged.addListener((changes) => {
  if (changes.request?.newValue) void handle(changes.request.newValue)
})
