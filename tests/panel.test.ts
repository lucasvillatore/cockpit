import { expect, test } from 'claude-code/testing'

import { rule, safe, width } from '../hooks/panel'

test('cabeçalho: mede segmentos por caractere e a régua fecha a linha', async () => {
  const segs = [{ t: 'CAT-4411', color: 'claude' }, { t: ' · ', dim: true }, { t: '●', color: 'warning' }, { t: ' EM REVISÃO' }]
  expect(width(segs)).toBe(23)
  expect(rule(46, 'JIRA', segs)).toBe(46 - 7 - 24)
  expect(rule(46, 'GIT', [])).toBe(46 - 6)
  expect(rule(10, 'AGENTS', segs)).toBe(1)
})

test('seção quebrada: safe guarda o valor ou a primeira linha do erro', async () => {
  expect(await safe(Promise.resolve(3))).toEqual({ ok: true, value: 3 })
  expect(await safe(Promise.reject(new Error('quebrou\ndetalhe')))).toEqual({ ok: false, error: 'quebrou' })
  expect(await safe(Promise.reject(''))).toEqual({ ok: false, error: 'erro desconhecido' })
})
