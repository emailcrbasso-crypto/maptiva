/**
 * ProfilePage — /settings/profile
 * Permite ao usuário editar seu nome e redefinir a senha.
 */

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/modules/auth/AuthContext'

export function ProfilePage() {
  const { profile, reloadProfile } = useAuth()

  const [name,      setName]      = useState(profile?.name  ?? '')
  const [password,  setPassword]  = useState('')
  const [password2, setPassword2] = useState('')

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

    const { error } = await supabase
      .from('users')
      .update({ name: name.trim() })
      .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id ?? '')

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

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Meu perfil</h1>
        <p className="text-sm text-gray-400 mt-0.5">
          Atualize seu nome e senha de acesso.
        </p>
      </div>

      <div className="space-y-5">

        {/* ── Nome ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">
            Informações pessoais
          </h2>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
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

        {/* ── Senha ── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 pb-3 border-b border-gray-100">
            Alterar senha
          </h2>
          <form onSubmit={handleSavePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nova senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar nova senha</label>
              <input
                type="password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
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
