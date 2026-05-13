/**
 * ProfilePage — /settings/profile
 *
 * Três seções:
 *   1. Identidade  — foto, nome (public.users — cross-tenant)
 *   2. Dados profissionais — cargo, departamento (public.people — tenant-scoped)
 *                           só aparece se o usuário tiver vínculo em people
 *   3. Segurança   — alterar senha (Supabase Auth)
 */

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/modules/auth/AuthContext'

// ─── Avatar ───────────────────────────────────────────────────────────────────

function AvatarEditor({
  avatarUrl,
  displayName,
  onUploaded,
}: {
  avatarUrl: string | null
  displayName: string
  onUploaded: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const inputRef                  = useRef<HTMLInputElement>(null)

  function initials(name: string) {
    return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setUploading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Sessão expirada.'); setUploading(false); return }

    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const path = `${user.id}/avatar.${ext}`

    // Upload (upsert — substitui se já existir)
    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })

    if (uploadErr) {
      setError(uploadErr.message)
      setUploading(false)
      return
    }

    // URL pública + cache-buster para forçar reload do browser
    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
    const avatarWithTs = `${publicUrl}?t=${Date.now()}`

    // Persiste em public.users
    const { error: updateErr } = await supabase
      .from('users')
      .update({ avatar_url: avatarWithTs })
      .eq('auth_user_id', user.id)

    if (updateErr) {
      setError(updateErr.message)
    } else {
      onUploaded()
    }

    setUploading(false)
    // Reset input so the same file can be re-selected
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex items-center gap-5">
      {/* Avatar circle / photo */}
      <div className="relative shrink-0">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={displayName}
            className="w-16 h-16 rounded-full object-cover ring-2 ring-gray-100"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-gray-900 text-white flex items-center justify-center text-xl font-semibold">
            {initials(displayName)}
          </div>
        )}
        {/* Overlay de loading */}
        {uploading && (
          <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
            <svg className="w-5 h-5 text-white animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3V4a10 10 0 100 20v-4l-3 3 3 3v-4a8 8 0 01-8-8z"/>
            </svg>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {uploading ? 'Enviando...' : avatarUrl ? 'Trocar foto' : 'Adicionar foto'}
        </button>
        <p className="text-xs text-gray-400">JPG, PNG ou WebP · máx. 2 MB</p>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>

      {/* Input oculto */}
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  )
}

// ─── Seção de dados profissionais ────────────────────────────────────────────

interface PeopleRecord {
  id:         string
  job_title:  string | null
  department: string | null
}

function ProfessionalSection({ userId }: { userId: string }) {
  const [person,     setPerson]     = useState<PeopleRecord | null>(null)
  const [jobTitle,   setJobTitle]   = useState('')
  const [department, setDepartment] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [ok,         setOk]         = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [loaded,     setLoaded]     = useState(false)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('people')
      .select('id, job_title, department')
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const p = data as PeopleRecord
          setPerson(p)
          setJobTitle(p.job_title  ?? '')
          setDepartment(p.department ?? '')
        }
        setLoaded(true)
      })
  }, [userId])

  // Se não tiver registro em people, não renderiza a seção
  if (!loaded) return null
  if (!person)  return null

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!person) return
    setSaving(true)
    setOk(false)
    setError(null)

    const { error: err } = await supabase
      .from('people')
      .update({
        job_title:  jobTitle.trim()   || null,
        department: department.trim() || null,
      })
      .eq('id', person.id)

    if (err) setError(err.message)
    else     setOk(true)
    setSaving(false)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">
        Dados profissionais
      </h2>
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => { setJobTitle(e.target.value); setOk(false) }}
              placeholder="Ex: Analista de RH"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Departamento</label>
            <input
              type="text"
              value={department}
              onChange={(e) => { setDepartment(e.target.value); setOk(false) }}
              placeholder="Ex: Recursos Humanos"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Esses dados aparecem nos relatórios e exportações de avaliação do tenant.
        </p>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Salvando...' : 'Salvar dados profissionais'}
          </button>
          {ok && <span className="text-sm text-green-600">✓ Atualizado</span>}
        </div>
      </form>
    </div>
  )
}

// ─── Página principal ────────────────────────────────────────────────────────

export function ProfilePage() {
  const { profile, reloadProfile } = useAuth()

  // ── Bug fix: sync local name with profile whenever context updates ──
  // (useState inicial é lido só uma vez; useEffect mantém sincronia)
  const [name,      setName]      = useState(profile?.name  ?? '')
  const [password,  setPassword]  = useState('')
  const [password2, setPassword2] = useState('')

  useEffect(() => {
    if (profile?.name) setName(profile.name)
  }, [profile?.name])

  const [savingName, setSavingName] = useState(false)
  const [savingPwd,  setSavingPwd]  = useState(false)
  const [nameOk,     setNameOk]     = useState(false)
  const [pwdOk,      setPwdOk]      = useState(false)
  const [nameErr,    setNameErr]    = useState<string | null>(null)
  const [pwdErr,     setPwdErr]     = useState<string | null>(null)

  async function handleSaveName(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSavingName(true)
    setNameOk(false)
    setNameErr(null)

    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await supabase
      .from('users')
      .update({ name: name.trim() })
      .eq('auth_user_id', user?.id ?? '')

    if (error) {
      setNameErr(error.message)
    } else {
      setNameOk(true)
      await reloadProfile()
    }
    setSavingName(false)
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwdOk(false)
    setPwdErr(null)

    if (password.length < 6) {
      setPwdErr('A senha precisa ter ao menos 6 caracteres.')
      return
    }
    if (password !== password2) {
      setPwdErr('As senhas não conferem.')
      return
    }

    setSavingPwd(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setPwdErr(error.message)
    } else {
      setPwdOk(true)
      setPassword('')
      setPassword2('')
    }
    setSavingPwd(false)
  }

  const displayName = profile?.name || profile?.email || '—'

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Meu perfil</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Gerencie sua identidade e dados de acesso.
        </p>
      </div>

      <div className="space-y-5">

        {/* ── 1. Identidade (foto + nome) ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-5 pb-3 border-b border-gray-100">
            Identidade
          </h2>

          {/* Foto */}
          <div className="mb-5 pb-5 border-b border-gray-50">
            <AvatarEditor
              avatarUrl={profile?.avatarUrl ?? null}
              displayName={displayName}
              onUploaded={reloadProfile}
            />
          </div>

          {/* Nome + e-mail */}
          <form onSubmit={handleSaveName} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input
                type="text"
                value={profile?.email ?? ''}
                disabled
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-400 cursor-not-allowed"
              />
              <p className="text-xs text-gray-400 mt-1">O e-mail não pode ser alterado aqui.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => { setName(e.target.value); setNameOk(false) }}
                placeholder="Seu nome completo"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            {nameErr && <p className="text-sm text-red-500">{nameErr}</p>}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingName || !name.trim()}
                className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {savingName ? 'Salvando...' : 'Salvar nome'}
              </button>
              {nameOk && <span className="text-sm text-green-600">✓ Nome atualizado</span>}
            </div>
          </form>
        </div>

        {/* ── 2. Dados profissionais (só se tiver vínculo em people) ── */}
        {profile?.id && <ProfessionalSection userId={profile.id} />}

        {/* ── 3. Senha ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">
            Segurança
          </h2>
          <form onSubmit={handleSavePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setPwdOk(false) }}
                placeholder="Mínimo 6 caracteres"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
              <input
                type="password"
                value={password2}
                onChange={(e) => { setPassword2(e.target.value); setPwdOk(false) }}
                placeholder="Repita a senha"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            {pwdErr && <p className="text-sm text-red-500">{pwdErr}</p>}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingPwd || !password}
                className="px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                {savingPwd ? 'Salvando...' : 'Alterar senha'}
              </button>
              {pwdOk && <span className="text-sm text-green-600">✓ Senha alterada com sucesso</span>}
            </div>
          </form>
        </div>

      </div>
    </div>
  )
}
