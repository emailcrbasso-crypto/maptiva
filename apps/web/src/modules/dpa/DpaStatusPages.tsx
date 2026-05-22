/**
 * DpaStatusPages
 * Static feedback pages for the public DPA form flow:
 *   /dpa/obrigado       — response submitted successfully
 *   /dpa/ja-respondido  — token already used
 *   /dpa/acesso-negado  — invalid / expired token
 */

// ─── Obrigado ─────────────────────────────────────────────────────────────────

export function DpaObrigadoPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-10 text-center">
        <div className="text-5xl mb-5">✅</div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Diagnóstico enviado!
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          Suas respostas foram registradas com sucesso. Obrigado pela sua participação —
          suas percepções são valiosas para a organização.
        </p>
        <p className="mt-6 text-xs text-gray-400">
          Você pode fechar esta janela.
        </p>
      </div>
    </div>
  )
}

// ─── Já respondido ────────────────────────────────────────────────────────────

export function DpaJaRespondidoPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-10 text-center">
        <div className="text-5xl mb-5">📋</div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Diagnóstico já respondido
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          Este link já foi utilizado. Cada participante pode responder o diagnóstico apenas uma vez.
        </p>
        <p className="mt-6 text-xs text-gray-400">
          Se acredita que há um erro, entre em contato com a sua organização.
        </p>
      </div>
    </div>
  )
}

// ─── Acesso negado ────────────────────────────────────────────────────────────

export function DpaAcessoNegadoPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="max-w-md w-full bg-white rounded-2xl border border-gray-200 p-10 text-center">
        <div className="text-5xl mb-5">🔒</div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Link inválido ou expirado
        </h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          Este link de diagnóstico não é válido ou o período de respostas foi encerrado.
        </p>
        <p className="mt-6 text-xs text-gray-400">
          Se recebeu este link por e-mail, verifique se copiou o endereço completo.
          Em caso de dúvidas, entre em contato com a sua organização.
        </p>
      </div>
    </div>
  )
}
