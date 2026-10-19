import { expect, test } from 'claude-code/testing'

import { pick, titleOf } from '../hooks/sections/sessions'

const user = (content: unknown) => JSON.stringify({ type: 'user', message: { content } })

test('sessões: título pelo customTitle ou pela primeira mensagem útil', async () => {
  expect(titleOf([user('oi'), '{"type":"custom-title","customTitle":"novo \\"aspas\\"","sessionId":"x"}'].join('\n'))).toBe('novo "aspas"')
  expect(titleOf([user('<command-name>/clear</command-name>'), user([{ type: 'text', text: '<x>corrige</x>   o   bug' }])].join('\n'))).toBe('corrige o bug')
  expect(titleOf('{"type":"assistant"}\nlixo')).toBe('')
})

test('sessões: filtro sem caixa e no máximo 8', async () => {
  const list = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, when: '', title: i === 3 ? 'Worker V2' : `outra ${i}` }))
  expect(pick(list, '  worker ').map(s => s.id)).toEqual(['s3'])
  expect(pick(list, '').length).toBe(8)
})
