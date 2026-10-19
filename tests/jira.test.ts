import { expect, test } from 'claude-code/testing'

import { criteriaOf, keyOf, parseIssue } from '../hooks/sections/jira'

test('chave: da branch e do prompt', async () => {
  expect(keyOf('feature/cat-4279-reengenharia\n')).toBe('CAT-4279')
  expect(keyOf('olha o CAT-12 e o UTF-8', /\bCAT-\d+\b/)).toBe('CAT-12')
  expect(keyOf('production')).toBe('')
})

test('critérios: só o bloco de aceite, sem negrito', async () => {
  const md = '## O que?\n* x\n### **Critérios de Aceite**\n\n* **Campo novo:**\n    * cadastro\n* \\*lembrar\n---\n## Outro\n* y'
  expect(criteriaOf(md)).toEqual(['• Campo novo:', '    • cadastro', '• *lembrar'])
  expect(criteriaOf('sem nada')).toEqual([])
})

test('issue: lê o formato do getJiraIssue', async () => {
  const json = JSON.stringify({ issues: { nodes: [{ key: 'CAT-1', webUrl: 'u', fields: {
    summary: 's', issuetype: { name: 'História' }, priority: { name: 'Médio' }, assignee: null,
    status: { name: 'DEPLOYED', statusCategory: { key: 'done' } }, description: null,
  } }] } })
  expect(parseIssue(json)).toEqual({ key: 'CAT-1', summary: 's', type: 'História', status: 'DEPLOYED', category: 'done',
    assignee: 'sem responsável', priority: 'Médio', criteria: [], url: 'u' })
})
