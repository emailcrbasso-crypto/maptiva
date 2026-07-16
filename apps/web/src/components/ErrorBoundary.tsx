/**
 * ErrorBoundary — captura erros de renderização e exibe um fallback
 * amigável com botão de recarregar, em vez de deixar a tela branca.
 *
 * Especialmente importante para páginas públicas (formulário do DPA),
 * onde um bundle em cache antigo poderia quebrar a coleta.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  message:  string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message ?? 'Erro inesperado' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log para o console — ajuda a diagnosticar em produção.
    console.error('ErrorBoundary capturou um erro:', error, info)
  }

  handleReload = () => {
    // Força um recarregamento do servidor (descarta bundle em cache).
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md text-center">
          <p className="text-4xl mb-4">🔄</p>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            Algo não carregou corretamente
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Isso costuma acontecer quando a página está desatualizada.
            Clique abaixo para recarregar — seus dados anteriores não são perdidos.
          </p>
          <button
            onClick={this.handleReload}
            className="text-sm bg-gray-900 text-white px-5 py-2.5 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Recarregar página
          </button>
          {import.meta.env.DEV && (
            <p className="mt-4 text-xs text-red-400 break-words">{this.state.message}</p>
          )}
        </div>
      </div>
    )
  }
}
