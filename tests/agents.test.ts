import { expect, test } from 'claude-code/testing'

import type { Agent } from '../types'
import { ago, clip, dur, heat, layout, merge, prune, tally, toolLine } from '../hooks/sections/agents'

const ex: Agent = { id: 'ex', type: 'Explore', desc: 'achar o upsert', start: 4, tool: 'Grep upsertRow  src/' }
const pl: Agent = { id: 'pl', type: 'Plan', desc: 'desenhar a migração', start: 3 }
const gp: Agent = { id: 'gp', parent: 'pl', type: 'general-purpose', desc: 'ler o schema', start: 3, tool: 'Read  schema.ts' }
const cr: Agent = { id: 'cr', type: 'code-review', desc: 'revisar diff', start: 1, end: 40, ok: true }

test('árvore: filhos recuados embaixo do pai, o mais novo primeiro', async () => {
  const { rows, lens } = layout([cr, gp, pl, ex])
  expect(rows.map(r => r.pre.map(c => c.ch).join('') + `${r.kind}:${r.agent.id}`)).toEqual([
    '├───▶head:ex',
    '│      desc:ex',
    '│      tool:ex',
    '│gap:ex',
    '├───▶head:pl',
    '│      desc:pl',
    '│      └──▶head:gp',
    '│             desc:gp',
    '│             tool:gp',
    '│gap:pl',
    '└───▶head:cr',
  ])
  expect(lens).toEqual({ ex: 5, pl: 8, gp: 4, cr: 10 })
})

test('árvore: agent de pai sumido vai para a raiz', async () => {
  const { rows } = layout([{ ...gp, parent: 'nada' }])
  expect(rows.map(r => r.pre.map(c => c.ch).join(''))).toEqual(['└───▶', '       ', '       '])
})

test('caminho: trilha do pai e depois a seta, numerada em ordem', async () => {
  const { rows } = layout([ex, pl])
  const cells = rows.flatMap(r => r.pre).filter(c => c.path === 'pl')
  expect(cells.map(c => `${c.ch}${c.i}`)).toEqual(['│0', '│1', '│2', '└3', '─4', '─5', '─6', '▶7'])
})

test('pulso: cabeça, rastro e volta', async () => {
  expect([0, 1, 2, 3, 4].map(i => heat(i, 5, 3, 0))).toEqual([0, 1, 1, 2, 0])
  expect(heat(0, 5, 9, 0)).toBe(2)
  expect(heat(4, 5, 0, 4)).toBe(2)
  expect([0, 1, 2, 3, 4].map(i => heat(i, 5, 7, 0))).toEqual([0, 0, 0, 0, 0])
})

test('tempo e textos', async () => {
  expect(dur(12_400)).toBe('12s')
  expect(dur(75_000)).toBe('1m15s')
  expect(dur(3_720_000)).toBe('1h02m')
  expect(ago(30_000)).toBe('agora')
  expect(ago(150_000)).toBe('há 2 min')
  expect(clip('abcdef', 4)).toBe('abc…')
  const text = (list: Agent[]) => tally(list).map(s => s.t).join('')
  expect(text([ex, pl, cr])).toBe('● 2 rodando · ✓ 1 feito')
  expect(text([cr, { ...cr, ok: false }, { ...cr, ok: false }])).toBe('✓ 1 feito · ✗ 2 falharam')
  expect(tally([ex])[0]).toEqual({ t: '●', color: 'warning' })
})

test('ferramenta: nome e argumento curto', async () => {
  expect(toolLine('Grep', { pattern: 'upsertRow', path: 'src/' })).toBe('Grep  upsertRow  src/')
  expect(toolLine('Read', { file_path: '/a/b/schema.ts' })).toBe('Read  schema.ts')
  expect(toolLine('Bash', { command: 'git status\ngit log' })).toBe('Bash  git status')
  expect(toolLine('mcp__jira__getIssue', {})).toBe('getIssue')
})

test('limpeza: terminados há mais de 10 minutos saem', async () => {
  expect(prune([ex, cr], 40 + 10 * 60_000).map(a => a.id)).toEqual(['ex', 'cr'])
  expect(prune([ex, cr], 41 + 10 * 60_000).map(a => a.id)).toEqual(['ex'])
})

test('sync: entra quem já rodava e fecha quem terminou', async () => {
  const known = [{ id: 'a', type: 'Explore', desc: 'x', start: 1 }]
  const out = merge(known, [
    { id: 'a', type: 'Explore', description: 'x', status: 'completed' },
    { id: 'b', parentId: 'a', type: 'Plan', description: 'y', status: 'running' },
    { id: 'c', type: 'old', description: 'z', status: 'failed' },
  ], 50)
  expect(out.map(a => `${a.id}:${a.end ?? '-'}:${a.ok ?? '-'}:${a.parent ?? '-'}`)).toEqual(['a:50:true:-', 'b:-:-:a'])
})
