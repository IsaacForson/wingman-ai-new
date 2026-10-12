/** Save text as a file via the browser download flow. */
export function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
