import { useEffect, useRef } from 'react'
import { isHtml, plainToHtml, sanitizeHtml } from '@/lib/richText'

const RICH_CLASSES =
  '[&_p]:mb-3 [&_p:last-child]:mb-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ' +
  '[&_li]:mb-1 [&_a]:text-blue-600 [&_a]:underline [&_strong]:font-semibold [&_b]:font-semibold'

/** Exibe texto formatado (HTML sanitizado) ou, para textos antigos, texto puro. */
export function RichText({ value, className = '' }: { value: string; className?: string }) {
  if (!isHtml(value)) {
    return <p className={`${className} whitespace-pre-line`}>{value}</p>
  }
  return (
    <div
      className={`${className} ${RICH_CLASSES}`}
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }}
    />
  )
}

// ─── Editor ───────────────────────────────────────────────────────────────────

const BUTTONS: { label: string; title: string; cmd: string; cls?: string }[] = [
  { label: 'N', title: 'Negrito',            cmd: 'bold',                cls: 'font-bold' },
  { label: 'I', title: 'Itálico',            cmd: 'italic',              cls: 'italic' },
  { label: 'S', title: 'Sublinhado',         cmd: 'underline',           cls: 'underline' },
  { label: '•', title: 'Lista com marcadores', cmd: 'insertUnorderedList' },
  { label: '1.', title: 'Lista numerada',    cmd: 'insertOrderedList' },
  { label: 'Tx', title: 'Remover formatação', cmd: 'removeFormat' },
]

/** Editor simples de texto formatado. Guarda HTML sanitizado (vazio = ''). */
export function RichTextEditor({
  value, onChange, placeholder, minHeight = 110,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  minHeight?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const lastEmitted = useRef<string | null>(null)

  // Parágrafos como <p> (e não <div>) ao apertar Enter.
  useEffect(() => {
    try { document.execCommand('defaultParagraphSeparator', false, 'p') } catch { /* ignora */ }
  }, [])

  // Sincroniza o conteúdo quando o valor muda por fora (abertura, "Duplicar").
  useEffect(() => {
    const el = ref.current
    if (!el || value === lastEmitted.current) return
    el.innerHTML = value ? (isHtml(value) ? sanitizeHtml(value) : plainToHtml(value)) : ''
    lastEmitted.current = value
  }, [value])

  function emit() {
    const el = ref.current
    if (!el) return
    const normalizado = el.innerHTML.replace(/<div\b[^>]*>/gi, '<p>').replace(/<\/div>/gi, '</p>')
    const limpo = (el.textContent ?? '').trim() === '' ? '' : sanitizeHtml(normalizado)
    lastEmitted.current = limpo
    onChange(limpo)
  }

  function run(cmd: string, arg?: string) {
    ref.current?.focus()
    document.execCommand(cmd, false, arg)
    emit()
  }

  function addLink() {
    const url = window.prompt('Endereço do link (começando com https://)')?.trim()
    if (!url) return
    if (!/^(https?:|mailto:|tel:)/i.test(url)) {
      window.alert('O link precisa começar com https://, mailto: ou tel:')
      return
    }
    run('createLink', url)
  }

  return (
    <div className="border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-gray-900 focus-within:border-transparent bg-white">
      <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 px-2 py-1.5 bg-gray-50 rounded-t-lg">
        {BUTTONS.map((b) => (
          <button
            key={b.cmd}
            type="button"
            title={b.title}
            aria-label={b.title}
            onMouseDown={(e) => { e.preventDefault(); run(b.cmd) }}
            className={`min-w-7 h-7 px-1.5 rounded text-xs text-gray-700 hover:bg-gray-200 ${b.cls ?? ''}`}
          >
            {b.label}
          </button>
        ))}
        <button
          type="button"
          title="Inserir link"
          aria-label="Inserir link"
          onMouseDown={(e) => { e.preventDefault(); addLink() }}
          className="h-7 px-1.5 rounded text-xs text-gray-700 hover:bg-gray-200"
        >
          Link
        </button>
      </div>
      <div
        ref={ref}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          e.preventDefault()
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
        }}
        style={{ minHeight }}
        className={`px-3 py-2.5 text-sm text-gray-700 focus:outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-gray-400 ${RICH_CLASSES}`}
      />
    </div>
  )
}
