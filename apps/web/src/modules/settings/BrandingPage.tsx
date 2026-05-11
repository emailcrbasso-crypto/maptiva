/**
 * BrandingPage — Configurações de white label por tenant
 *
 * Rota: /settings/branding
 * Acesso: owner ou admin apenas
 *
 * Permite configurar:
 *   - Nome de exibição da empresa
 *   - Tagline (tela de login)
 *   - URL do logo
 *   - Cores primária e secundária
 *   - Texto do rodapé dos PDFs
 *   - Remetente de e-mail (nome + endereço)
 *   - Ocultar marca Maptiva
 *   - Domínio customizado
 */

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useTenant } from '@/modules/auth/TenantContext'

// ─── Color swatch picker (simplified — no external dep) ──────────────────────

function ColorInput({
  label,
  value,
  onChange,
}: {
  label:    string
  value:    string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#111827"
          pattern="^#[0-9a-fA-F]{6}$"
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
        />
      </div>
    </div>
  )
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">
        {title}
      </h2>
      <div className="space-y-4">
        {children}
      </div>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label:    string
  hint?:    string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {hint && <p className="text-xs text-gray-400 mb-2">{hint}</p>}
      {children}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BrandingPage() {
  const { branding, reload } = useTenant()

  // Form state — initialized from live branding
  const [displayName,      setDisplayName]      = useState(branding.name === 'Maptiva' ? '' : branding.name)
  const [tagline,          setTagline]          = useState(branding.tagline ?? '')
  const [logoUrl,          setLogoUrl]          = useState(branding.logoUrl ?? '')
  const [faviconUrl,       setFaviconUrl]       = useState(branding.faviconUrl ?? '')
  const [primaryColor,     setPrimaryColor]     = useState(branding.primaryColor)
  const [secondaryColor,   setSecondaryColor]   = useState(branding.secondaryColor)
  const [pdfFooterText,    setPdfFooterText]    = useState(branding.pdfFooterText)
  const [emailFromName,    setEmailFromName]    = useState('')
  const [emailFromAddress, setEmailFromAddress] = useState('')
  const [hideMaptiva,      setHideMaptiva]      = useState(branding.hideMaptiva)
  const [customDomain,     setCustomDomain]     = useState(branding.customDomain ?? '')

  const [saving,  setSaving]  = useState(false)
  const [success, setSuccess] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  // Pre-populate email sender fields (not exposed by get_tenant_branding for security;
  // admins/owners can read directly from tenants via RLS).
  useEffect(() => {
    if (!branding.id) return
    supabase
      .from('tenants')
      .select('email_from_name, email_from_address')
      .eq('id', branding.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setEmailFromName((data as { email_from_name: string | null }).email_from_name ?? '')
          setEmailFromAddress((data as { email_from_address: string | null }).email_from_address ?? '')
        }
      })
  }, [branding.id])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSuccess(false)
    setError(null)

    const updates: Record<string, unknown> = {
      display_name:       displayName || null,
      tagline:            tagline || null,
      logo_url:           logoUrl || null,
      favicon_url:        faviconUrl || null,
      primary_color:      primaryColor,
      secondary_color:    secondaryColor,
      pdf_footer_text:    pdfFooterText || null,
      email_from_name:    emailFromName || null,
      email_from_address: emailFromAddress || null,
      hide_maptiva_brand: hideMaptiva,
      custom_domain:      customDomain || null,
    }

    // We need the tenant_id — pull from branding context
    if (!branding.id) {
      setError('Tenant não carregado. Recarregue a página.')
      setSaving(false)
      return
    }

    const { error: err } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', branding.id)

    if (err) {
      setError(err.message)
    } else {
      setSuccess(true)
      await reload() // Refresh TenantContext
    }

    setSaving(false)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Identidade visual</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Configure o branding da sua empresa. As alterações são aplicadas imediatamente para todos os usuários.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-5">

        {/* ── Identity ── */}
        <Section title="Identidade">
          <Field
            label="Nome de exibição"
            hint="Nome que aparece no cabeçalho, e-mails e PDFs. Se vazio, usa o nome interno do tenant."
          >
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={branding.name}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </Field>

          <Field
            label="Tagline"
            hint="Texto exibido abaixo do nome na tela de login."
          >
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Plataforma de avaliação de talentos"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </Field>
        </Section>

        {/* ── Logo ── */}
        <Section title="Logo">
          <Field
            label="URL do logo"
            hint="URL pública de uma imagem PNG ou SVG (recomendado: fundo transparente, altura mínima 64px). Hospede no Supabase Storage ou em CDN externo."
          >
            <input
              type="url"
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://cdn.suaempresa.com/logo.png"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </Field>

          {logoUrl && (
            <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-4">
              <img
                src={logoUrl}
                alt="Preview do logo"
                className="h-8 w-auto object-contain"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none'
                }}
              />
              <span className="text-xs text-gray-400">Preview</span>
            </div>
          )}

          <Field
            label="URL do favicon"
            hint="Ícone exibido na aba do navegador (.ico, .png 32×32). Opcional."
          >
            <input
              type="url"
              value={faviconUrl}
              onChange={(e) => setFaviconUrl(e.target.value)}
              placeholder="https://cdn.suaempresa.com/favicon.ico"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </Field>
        </Section>

        {/* ── Colors ── */}
        <Section title="Cores">
          <ColorInput
            label="Cor primária"
            value={primaryColor}
            onChange={setPrimaryColor}
          />
          <ColorInput
            label="Cor secundária"
            value={secondaryColor}
            onChange={setSecondaryColor}
          />
          <div
            className="rounded-lg p-4 text-sm font-medium text-white text-center"
            style={{ backgroundColor: primaryColor }}
          >
            Preview — botão primário
          </div>
        </Section>

        {/* ── Email ── */}
        <Section title="E-mail de convite">
          <Field
            label="Nome do remetente"
            hint="Ex: 'RH Acme Corp'. Aparece no campo 'De:' do e-mail. Se vazio, usa o nome de exibição."
          >
            <input
              type="text"
              value={emailFromName}
              onChange={(e) => setEmailFromName(e.target.value)}
              placeholder={displayName || branding.name}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </Field>

          <Field
            label="Endereço de envio"
            hint="E-mail remetente customizado. Requer domínio verificado no Resend. Se vazio, usa o endereço padrão da Maptiva."
          >
            <input
              type="email"
              value={emailFromAddress}
              onChange={(e) => setEmailFromAddress(e.target.value)}
              placeholder="noreply@suaempresa.com"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </Field>
        </Section>

        {/* ── PDF ── */}
        <Section title="PDF de relatórios">
          <Field
            label="Texto do rodapé"
            hint="Aparece no rodapé de todos os PDFs gerados."
          >
            <input
              type="text"
              value={pdfFooterText}
              onChange={(e) => setPdfFooterText(e.target.value)}
              placeholder="Relatório Confidencial"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </Field>
        </Section>

        {/* ── Domain ── */}
        <Section title="Domínio customizado">
          <Field
            label="Domínio próprio"
            hint="Configure seu DNS para apontar este domínio para o servidor da Maptiva. Contate o suporte para ativar."
          >
            <input
              type="text"
              value={customDomain}
              onChange={(e) => setCustomDomain(e.target.value.toLowerCase().trim())}
              placeholder="avaliacoes.suaempresa.com.br"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </Field>
        </Section>

        {/* ── White label ── */}
        <Section title="White label">
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="hide_maptiva"
              checked={hideMaptiva}
              onChange={(e) => setHideMaptiva(e.target.checked)}
              className="mt-0.5 rounded border-gray-300"
            />
            <label htmlFor="hide_maptiva" className="text-sm text-gray-700">
              <span className="font-medium">Ocultar marca Maptiva</span>
              <p className="text-gray-400 text-xs mt-0.5">
                Remove "Powered by Maptiva" de e-mails, PDFs e rodapé da plataforma.
                Disponível para planos white label.
              </p>
            </label>
          </div>
        </Section>

        {/* ── Actions ── */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving || !branding.id}
            className="px-6 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>

          {success && (
            <span className="text-sm text-green-600">✓ Configurações salvas com sucesso.</span>
          )}
          {error && (
            <span className="text-sm text-red-500">{error}</span>
          )}
        </div>
      </form>
    </div>
  )
}
