import { expect, test } from 'claude-code/testing'

import { age, approvals, botOf, isOpen, parseDetail, robots, verdicts } from '../hooks/sections/git'

const NOW = Date.parse('2026-10-19')
const BASE = { repo: 'r', slug: 'o/r', n: 1, title: 't', author: 'a', createdAt: '2026-10-01', url: 'u' }

test('git: idade do PR', async () => {
  expect(age('2026-10-19', NOW)).toBe('hoje')
  expect(age('2026-10-12', NOW)).toBe('7 d')
  expect(age('2025-11-07', NOW)).toBe('11 meses')
  expect(age('2024-09-02', NOW)).toBe('2 anos')
})

test('git: robôs viram uma linha', async () => {
  expect(botOf('dependabot[bot]')).toBe('dependabot')
  expect(botOf('ran-j')).toBe('')
  expect(robots([{ u: 'cigmudmm', d: '', b: '' }, { u: 'cigmudmm', d: '', b: '' }, { u: 'sonarqubecloud', d: '', b: '' }, { u: 'ran-j', d: '', b: 'x' }]))
    .toBe('GMUD ×2 · Sonar')
})

test('git: um veredito por pessoa, aprovação vence comentário', async () => {
  const v = verdicts([{ u: 'b', s: 'COMMENTED', d: '1' }, { u: 'b', s: 'APPROVED', d: '2' }, { u: 'c', s: 'COMMENTED', d: '3' }])
  expect(v.map(r => `${r.u}:${r.s}`)).toEqual(['b:APPROVED', 'c:COMMENTED'])
})

test('git: lê o gh pr view', async () => {
  const pr = parseDetail(BASE, JSON.stringify({
    additions: 21, deletions: 83,
    statusCheckRollup: [{ conclusion: 'SUCCESS' }, { conclusion: 'FAILURE' }, { state: 'SUCCESS' }],
    reviews: [{ author: { login: 'CamilaDamasio' }, state: 'APPROVED', submittedAt: '2025-11-12T10:00:00Z' }],
    comments: [{ author: { login: 'ran-j' }, createdAt: '2026-04-05T00:00:00Z', body: 'Favor  olhar\n erro' }],
  }))
  expect(pr.ciOk).toBe(2)
  expect(pr.ciTotal).toBe(3)
  expect(approvals(pr)).toBe(1)
  expect(pr.comments[0]!.b).toBe('Favor olhar erro')
})

test('git: só PARA MIM vem aberto, clique inverte', async () => {
  expect(['g:forMe', 'r:forMe:x', 'p:forMe:o/x#1', 'g:mine', 'r:mine:x', 'p:mine:o/x#2'].map(k => isOpen([], k)))
    .toEqual([true, true, true, false, false, false])
  expect(isOpen(['g:forMe', 'g:mine'], 'g:forMe')).toBe(false)
  expect(isOpen(['g:forMe', 'g:mine'], 'g:mine')).toBe(true)
})
