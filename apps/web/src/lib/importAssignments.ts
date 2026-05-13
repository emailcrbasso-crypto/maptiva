/**
 * importAssignments.ts
 * Parses a spreadsheet describing the assignment matrix (who evaluates whom).
 *
 * Expected columns (case-insensitive, order-independent):
 *   avaliado / avaliado_nome / nome_avaliado   → required — name of the evaluated person
 *   email_avaliado / avaliado_email            → required — email of the evaluated person
 *   avaliador / avaliador_nome / nome_avaliador → required — name of the evaluator
 *   email_avaliador / avaliador_email           → required — email of the evaluator
 *   relacao / relação / relationship / tipo     → required — relationship code
 *
 * Valid relationship codes (case-insensitive):
 *   self, autoavaliacao, autoavaliação → 'self'
 *   gestor, manager                    → 'manager'
 *   par, peer, pares                   → 'peer'
 *   subordinado, subordinate, subord   → 'subordinate'
 *   cliente, client                    → 'client'
 *
 * Returns: { rows: ParsedAssignment[], errors: string[] }
 */

import * as XLSX from 'xlsx'

export interface ParsedAssignment {
  evaluated_name:     string
  evaluated_email:    string
  evaluator_name:     string
  evaluator_email:    string
  relationship_code:  string
}

export interface AssignmentParseResult {
  rows:   ParsedAssignment[]
  errors: string[]
}

// Column aliases → canonical field
type AssignmentField =
  | 'evaluated_name'
  | 'evaluated_email'
  | 'evaluator_name'
  | 'evaluator_email'
  | 'relationship_code'

const ALIASES: Record<string, AssignmentField> = {
  // Evaluated
  avaliado:        'evaluated_name',
  avaliado_nome:   'evaluated_name',
  nome_avaliado:   'evaluated_name',
  'nome avaliado': 'evaluated_name',
  evaluated:       'evaluated_name',
  evaluated_name:  'evaluated_name',
  // Evaluated email
  email_avaliado:   'evaluated_email',
  avaliado_email:   'evaluated_email',
  'email avaliado': 'evaluated_email',
  // Evaluator
  avaliador:         'evaluator_name',
  avaliador_nome:    'evaluator_name',
  nome_avaliador:    'evaluator_name',
  'nome avaliador':  'evaluator_name',
  evaluator:         'evaluator_name',
  evaluator_name:    'evaluator_name',
  // Evaluator email
  email_avaliador:    'evaluator_email',
  avaliador_email:    'evaluator_email',
  'email avaliador':  'evaluator_email',
  // Relationship
  relacao:       'relationship_code',
  relação:       'relationship_code',
  relationship:  'relationship_code',
  tipo:          'relationship_code',
  type:          'relationship_code',
}

// Relationship label → canonical code
const REL_MAP: Record<string, string> = {
  self:          'self',
  autoavaliacao: 'self',
  autoavaliação: 'self',
  auto:          'self',
  gestor:        'manager',
  manager:       'manager',
  par:           'peer',
  pares:         'peer',
  peer:          'peer',
  subordinado:   'subordinate',
  subordinate:   'subordinate',
  subord:        'subordinate',
  cliente:       'client',
  client:        'client',
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .trim()
    .replace(/\s+/g, '_')
}

function normalizeRel(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

export async function parseAssignmentFile(file: File): Promise<AssignmentParseResult> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })

  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return { rows: [], errors: ['Arquivo vazio ou sem planilhas.'] }
  }

  const ws  = wb.Sheets[sheetName]
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })

  if (raw.length < 2) {
    return { rows: [], errors: ['A planilha precisa ter pelo menos uma linha de cabeçalho e uma de dados.'] }
  }

  // Map headers to fields
  const headerRow = raw[0] as string[]
  const colMap: Partial<Record<AssignmentField, number>> = {}

  headerRow.forEach((cell, idx) => {
    const key   = normalize(String(cell))
    const field = ALIASES[key]
    if (field && !(field in colMap)) {
      colMap[field] = idx
    }
  })

  const errors: string[] = []

  const required: AssignmentField[] = [
    'evaluated_email', 'evaluator_email', 'relationship_code',
  ]
  for (const field of required) {
    if (colMap[field] === undefined) {
      const friendly: Record<string, string> = {
        evaluated_email:   '"email_avaliado"',
        evaluator_email:   '"email_avaliador"',
        relationship_code: '"relacao"',
      }
      errors.push(`Coluna obrigatória não encontrada: ${friendly[field]}.`)
    }
  }
  if (errors.length > 0) return { rows: [], errors }

  const rows: ParsedAssignment[] = []

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i] as string[]

    const evaluated_email = String(row[colMap.evaluated_email!]   ?? '').trim().toLowerCase()
    const evaluator_email = String(row[colMap.evaluator_email!]   ?? '').trim().toLowerCase()
    const rel_raw         = String(row[colMap.relationship_code!] ?? '').trim()

    // Skip blank rows
    if (!evaluated_email && !evaluator_email && !rel_raw) continue

    if (!evaluated_email || !evaluated_email.includes('@')) {
      errors.push(`Linha ${i + 1}: email do avaliado inválido ("${evaluated_email}").`)
      continue
    }
    if (!evaluator_email || !evaluator_email.includes('@')) {
      errors.push(`Linha ${i + 1}: email do avaliador inválido ("${evaluator_email}").`)
      continue
    }

    const relationship_code = REL_MAP[normalizeRel(rel_raw)]
    if (!relationship_code) {
      errors.push(
        `Linha ${i + 1}: relação desconhecida ("${rel_raw}"). Use: self, gestor, par, subordinado, cliente.`
      )
      continue
    }

    const evaluated_name = colMap.evaluated_name !== undefined
      ? String(row[colMap.evaluated_name] ?? '').trim()
      : evaluated_email

    const evaluator_name = colMap.evaluator_name !== undefined
      ? String(row[colMap.evaluator_name] ?? '').trim()
      : evaluator_email

    rows.push({ evaluated_name, evaluated_email, evaluator_name, evaluator_email, relationship_code })
  }

  return { rows, errors }
}

/**
 * downloadAssignmentTemplate
 * Generates and triggers download of a blank Excel template for the assignment matrix.
 */
export function downloadAssignmentTemplate(): void {
  const headers = [['nome_avaliado', 'email_avaliado', 'nome_avaliador', 'email_avaliador', 'relacao']]
  const examples = [
    ['Ana Souza',    'ana@empresa.com',    'Carlos Lima',   'carlos@empresa.com',  'gestor'],
    ['Carlos Lima',  'carlos@empresa.com', 'Ana Souza',     'ana@empresa.com',     'par'],
    ['Carlos Lima',  'carlos@empresa.com', 'Carlos Lima',   'carlos@empresa.com',  'self'],
    ['Maria Pinto',  'maria@empresa.com',  'Carlos Lima',   'carlos@empresa.com',  'subordinado'],
  ]

  const ws = XLSX.utils.aoa_to_sheet([...headers, ...examples])
  ws['!cols'] = [{ wch: 24 }, { wch: 30 }, { wch: 24 }, { wch: 30 }, { wch: 14 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Matriz')
  XLSX.writeFile(wb, 'modelo_matriz_avaliacao.xlsx')
}
