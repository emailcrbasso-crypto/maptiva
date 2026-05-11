/**
 * importParticipants.ts
 * Parses an Excel (.xlsx / .xls) or CSV file and returns a list of people rows.
 *
 * Expected columns (case-insensitive, order-independent):
 *   name   | nome          → required
 *   email                  → required
 *   job_title | cargo      → optional
 *   department | área      → optional
 *
 * Returns: { rows: ParsedPerson[], errors: string[] }
 */

import * as XLSX from 'xlsx'

export interface ParsedPerson {
  name: string
  email: string
  job_title: string
  department: string
}

export interface ParseResult {
  rows: ParsedPerson[]
  errors: string[]
}

// Column aliases → canonical field name
const ALIASES: Record<string, keyof ParsedPerson> = {
  name:       'name',
  nome:       'name',
  email:      'email',
  'e-mail':   'email',
  job_title:  'job_title',
  cargo:      'job_title',
  função:     'job_title',
  funcao:     'job_title',
  department: 'department',
  departamento: 'department',
  área:       'department',
  area:       'department',
  setor:      'department',
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .trim()
}

/**
 * parseParticipantFile
 * Accepts a File object (xlsx, xls, or csv) and returns parsed rows + validation errors.
 */
export async function parseParticipantFile(file: File): Promise<ParseResult> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })

  // Use first sheet
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return { rows: [], errors: ['Arquivo vazio ou sem planilhas.'] }
  }

  const ws = wb.Sheets[sheetName]
  // header: 1 → returns array of arrays (first row = headers)
  const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' })

  if (raw.length < 2) {
    return { rows: [], errors: ['Planilha deve ter pelo menos uma linha de cabeçalho e uma linha de dados.'] }
  }

  // Build column-index map
  const headerRow = raw[0] as string[]
  const colMap: Partial<Record<keyof ParsedPerson, number>> = {}

  headerRow.forEach((cell, idx) => {
    const key = normalize(String(cell))
    const field = ALIASES[key]
    if (field && !(field in colMap)) {
      colMap[field] = idx
    }
  })

  const errors: string[] = []

  if (colMap.name === undefined) {
    errors.push('Coluna "nome" (ou "name") não encontrada.')
  }
  if (colMap.email === undefined) {
    errors.push('Coluna "email" não encontrada.')
  }
  if (errors.length > 0) {
    return { rows: [], errors }
  }

  const rows: ParsedPerson[] = []

  for (let i = 1; i < raw.length; i++) {
    const row = raw[i] as string[]

    const name  = String(row[colMap.name!]  ?? '').trim()
    const email = String(row[colMap.email!] ?? '').trim().toLowerCase()

    // Skip blank rows
    if (!name && !email) continue

    if (!name) {
      errors.push(`Linha ${i + 1}: nome em branco.`)
      continue
    }
    if (!email || !email.includes('@')) {
      errors.push(`Linha ${i + 1}: email inválido ("${email}").`)
      continue
    }

    const job_title  = colMap.job_title  !== undefined ? String(row[colMap.job_title]  ?? '').trim() : ''
    const department = colMap.department !== undefined ? String(row[colMap.department] ?? '').trim() : ''

    rows.push({ name, email, job_title, department })
  }

  return { rows, errors }
}

/**
 * downloadParticipantTemplate
 * Generates and triggers download of a blank Excel template for participant import.
 */
export function downloadParticipantTemplate(): void {
  const headers = [['nome', 'email', 'cargo', 'departamento']]
  const ws = XLSX.utils.aoa_to_sheet(headers)
  ws['!cols'] = [{ wch: 28 }, { wch: 32 }, { wch: 24 }, { wch: 24 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Participantes')
  XLSX.writeFile(wb, 'modelo_importacao_participantes.xlsx')
}
