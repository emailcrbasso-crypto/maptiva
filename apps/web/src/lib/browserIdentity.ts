/** Aplica título e ícone da aba do navegador. */
export function applyBrowserIdentity(title: string | null, faviconUrl: string | null) {
  if (title) document.title = title
  if (faviconUrl) {
    let link = document.querySelector<HTMLLinkElement>('link[rel~="icon"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'icon'
      document.head.appendChild(link)
    }
    link.href = faviconUrl
  }
}
