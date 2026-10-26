/**
 * Texto formatado (HTML) das descrições dos projetos.
 *
 * O HTML é digitado por admins mas EXIBIDO em páginas públicas, então toda
 * exibição passa por sanitizeHtml(): só uma lista curta de tags e atributos
 * sobrevive (nada de script, estilo ou manipuladores de evento).
 */

import DOMPurify from 'dompurify'

const TAGS = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li', 'a']

let hookInstalled = false

export function sanitizeHtml(html: string): string {
  if (!hookInstalled) {
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A') {
        node.setAttribute('target', '_blank')
        node.setAttribute('rel', 'noopener noreferrer')
      }
    })
    hookInstalled = true
  }
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: TAGS,
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:)/i,
  })
}

/** true se o texto já contém marcação HTML (descrições antigas são texto puro). */
export function isHtml(s: string): boolean {
  return /<\/?(p|br|strong|b|em|i|u|ul|ol|li|a|div|span)\b/i.test(s)
}

/** Texto puro (com quebras de linha) -> HTML, para abrir no editor. */
export function plainToHtml(s: string): string {
  const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc
    .split(/\n\s*\n/)
    .map((par) => `<p>${par.trim().replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** HTML (ou texto puro) -> uma linha de texto, para listas e prévias. */
export function htmlToText(s: string): string {
  if (!isHtml(s)) return s
  const doc = new DOMParser().parseFromString(s.replace(/<\/(p|li)>|<br\s*\/?>/gi, ' $&'), 'text/html')
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}
