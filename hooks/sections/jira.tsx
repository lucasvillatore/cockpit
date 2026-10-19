import { atom, read, update } from 'claude-code'
import type { EngineInterface, RenderNode } from 'claude-code'

import type { Issue, Transition } from '../../types'
import { openPanel } from '../panel'
import type { PaneRender, SectionInfo, Seg } from '../panel'

const key = atom({ plugin: 'painel', key: 'jiraKey' } as const, '')
const issue = atom({ plugin: 'painel', key: 'jiraIssue' } as const, null)
const transitions = atom({ plugin: 'painel', key: 'jiraTransitions' } as const, [])
const error = atom({ plugin: 'painel', key: 'jiraError' } as const, '')
const pending = atom({ plugin: 'painel', key: 'jiraPending' } as const, null)
const picking = atom({ plugin: 'painel', key: 'jiraPicking' } as const, false)
const changed = atom({ plugin: 'painel', key: 'jiraChanged' } as const, false)
const synced = atom({ plugin: 'painel', key: 'jiraSynced' } as const, 0)

const SERVER = 'claude.ai Atlassian Rovo'
const CLOUD = 'madeiramadeira.atlassian.net'
const KEY = /\b[A-Z][A-Z0-9]+-\d+\b/
const CAT = /\bCAT-\d+\b/
const COLOR: Record<string, string> = { done: 'success', indeterminate: 'warning', new: 'suggestion' }
const AFTER: Record<string, string> = { done: 'o card vai para concluído', indeterminate: 'o card segue em andamento', new: 'o card volta para a fila' }

export const toneOf = (category?: string) => COLOR[category ?? ''] ?? 'inactive'

export const consequence = (category?: string) => AFTER[category ?? ''] ?? 'o status muda no Jira para todo o time'

export const clock = (t: number) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

export const parseTransitions = (json: string): Transition[] =>
  JSON.parse(json).transitions.map((t: { id: string; name: string; to?: { statusCategory?: { key?: string } } }) =>
    ({ id: t.id, name: t.name, category: t.to?.statusCategory?.key }))

export const keyOf = (text: string, re = KEY) => text.toUpperCase().match(re)?.[0] ?? ''

export const criteriaOf = (description: string) => {
  const lines = description.split('\n')
  const start = lines.findIndex(l => /crit[ée]rios? de aceite/i.test(l))
  if (start < 0) return []
  const out: string[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^\s*(---|#{1,3} )/.test(line)) break
    const text = line.replace(/\*\*/g, '').replace(/\\\*/g, '*').trimEnd()
    if (text.trim()) out.push(text.replace(/^(\s*)\*\s+/, '$1• '))
  }
  return out
}

export const parseIssue = (json: string): Issue => {
  const node = JSON.parse(json).issues.nodes[0]
  const f = node.fields
  return {
    key: node.key,
    summary: f.summary ?? '',
    type: f.issuetype?.name ?? '',
    status: f.status?.name ?? '',
    category: f.status?.statusCategory?.key ?? '',
    assignee: f.assignee?.displayName ?? 'sem responsável',
    priority: f.priority?.name ?? '',
    criteria: criteriaOf(f.description ?? ''),
    url: node.webUrl ?? `https://${CLOUD}/browse/${node.key}`,
  }
}

const textOf = (r: { content: { type: string; text?: string }[] }) =>
  r.content.map(c => (c.type === 'text' ? c.text : '')).join('')

async function load($: EngineInterface, k: string) {
  await update($, key, () => k)
  await update($, error, () => '')
  await update($, pending, () => null)
  await update($, picking, () => false)
  const args = { cloudId: CLOUD, issueIdOrKey: k }
  const fetch = async () => {
    const got = await $.mcp.call(SERVER, 'getJiraIssue', {
      ...args,
      fields: ['summary', 'status', 'assignee', 'issuetype', 'priority', 'description'],
      responseContentFormat: 'markdown',
    })
    if (got.isError) throw new Error(textOf(got))
    return got
  }
  try {
    let got
    for (let i = 0; ; i++) {
      try { got = await fetch(); break }
      catch (err) { if (i >= 5) throw err; await $.clock.sleep(5000) }
    }
    await update($, issue, () => parseIssue(textOf(got)))
    const tr = await $.mcp.call(SERVER, 'getTransitionsForJiraIssue', args)
    await update($, transitions, () => (tr.isError ? [] : parseTransitions(textOf(tr))))
    await update($, synced, () => Date.now())
  } catch (err) {
    await update($, issue, () => null)
    await update($, error, () => String(err instanceof Error ? err.message : err).slice(0, 300))
  }
}

async function move($: EngineInterface, t: Transition) {
  const k = await read($, key)
  const r = await $.mcp.call(SERVER, 'transitionJiraIssue', { cloudId: CLOUD, issueIdOrKey: k, transition: { id: t.id } })
  if (r.isError) await $.ui.toast(`Jira: não deu para mover ${k} para ${t.name}`)
  else await $.ui.toast(`${k} → ${t.name}`)
  await load($, k)
  if (r.isError) return
  await update($, changed, () => true)
  await $.clock.sleep(2000)
  await update($, changed, () => false)
  $.ui.invalidate('ui.render')
}

async function fromBranch($: EngineInterface) {
  const r = await $.process.run(['git', 'branch', '--show-current']).catch(() => null)
  return r?.exitCode === 0 ? keyOf(r.stdout) : ''
}

function show($: EngineInterface, k: string) {
  void load($, k)
  void openPanel($)
}

export const info: SectionInfo = {
  id: 'jira',
  title: 'Jira',
  commands: [{ name: 'jira', description: 'Abre o card do Jira no painel', argumentHint: '[CAT-1234]' }],
}

export async function command($: EngineInterface, name: string, args: string) {
  if (name !== 'jira') return undefined
  const k = keyOf(args) || (await read($, key)) || (await fromBranch($))
  if (!k) return 'Informe o card: /jira CAT-1234'
  show($, k)
  return `Card ${k} aberto no painel.`
}

export async function start($: EngineInterface, isInteractive: boolean) {
  const k = await fromBranch($)
  if (k && isInteractive) show($, k)
}

export async function prompt($: EngineInterface, text: string) {
  const k = keyOf(text, CAT)
  if (k && (k !== (await read($, key)) || (await read($, error)))) show($, k)
}

export async function summary($: EngineInterface): Promise<Seg[]> {
  const it = await read($, issue)
  const k = await read($, key)
  if (!k) return []
  const head: Seg[] = [{ t: k, color: 'claude' }]
  if (it?.key !== k) return head
  return [...head, { t: ' · ', dim: true }, { t: '●', color: toneOf(it.category) }, { t: ` ${it.status.toUpperCase()}` }]
}

export async function render($: EngineInterface, e: PaneRender, cols: number) {
  const { Box, Button, Link, Text } = $.ui.resolve(e)
  const k = await read($, key)
  const it = await read($, issue)
  const err = await read($, error)
  const dot = (name: string, category?: string, strong = false) => (
    <Text><Text color={toneOf(category)}>●</Text> <Text weight={strong ? 'bold' : undefined}>{name.toUpperCase()}</Text></Text>
  )
  const field = (label: string, value: string) => <Text><Text dimColor>{label.padEnd(12)}</Text> {value}</Text>

  if (!k) return (
    <Box flexDirection="column" gap={1}>
      <Text>Nenhum card aberto.</Text>
      <Text dimColor>Cite um CAT-1234 no prompt ou use /jira CAT-1234.</Text>
    </Box>
  )
  if (err) return (
    <Box flexDirection="column" gap={1}>
      <Text color="error">Não deu para carregar o card.</Text>
      <Text dimColor>{err.split('\n')[0]}</Text>
      <Button key="jira-retry" variant="primary" label="Tentar de novo" onPress={() => load($, k)} />
    </Box>
  )
  if (!it || it.key !== k) return <Text dimColor>Carregando o card…</Text>

  const room = Math.max(3, (e.viewport?.rows ?? 30) - 16)
  const moves = await read($, transitions)
  const asked = await read($, pending)
  const choosing = await read($, picking)
  const fresh = await read($, changed)
  const when = await read($, synced)
  const inner = cols - 4
  const line = (key: string, body: RenderNode) => (
    <Box key={key} width={cols}>
      <Text dimColor>│ </Text>
      {body}
      <Box flexGrow={1} />
      <Text dimColor> │</Text>
    </Box>
  )

  const actions = asked ? (
    <Box flexDirection="column">
      <Text dimColor>┌─ confirmar {'─'.repeat(Math.max(1, cols - 14))}┐</Text>
      {line('jira-c-move', <Text>{dot(it.status, it.category, true)}  <Text dimColor>→</Text>  {dot(asked.name, asked.category, true)}</Text>)}
      {line('jira-c-why', <Text dimColor>{consequence(asked.category).slice(0, inner)}</Text>)}
      {line('jira-c-gap', <Text> </Text>)}
      {line('jira-c-btn', (
        <Box columnGap={2}>
          <Button key="jira-confirm" variant="primary" label="sim, mudar" onPress={() => move($, asked)} />
          <Button key="jira-cancel" label="cancelar" onPress={() => update($, pending, () => null)} />
        </Box>
      ))}
      <Text dimColor>└{'─'.repeat(Math.max(1, cols - 2))}┘</Text>
    </Box>
  ) : choosing ? (
    <Box flexDirection="column">
      <Text><Text dimColor>mudar de</Text> {dot(it.status, it.category, true)} <Text dimColor>para:</Text></Text>
      {moves.map(t => (
        <Box key={`jira-tb${t.id}`} paddingLeft={2}>
          <Button key={`jira-t${t.id}`} plain label={t.name.toUpperCase()} onPress={async () => { await update($, picking, () => false); await update($, pending, () => t) }}>
            <Text color={toneOf(t.category)}>●</Text> {t.name.toUpperCase()}
          </Button>
        </Box>
      ))}
      <Box marginTop={1}>
        <Button key="jira-pick-cancel" label="cancelar" onPress={() => update($, picking, () => false)} />
      </Box>
    </Box>
  ) : (
    <Box flexDirection="column">
      <Box columnGap={2}>
        {moves.length > 0 && <Button key="jira-pick" variant="primary" label="mudar status" onPress={() => update($, picking, () => true)} />}
        <Button key="jira-reload" label="↻ Atualizar" onPress={() => load($, k)} />
      </Box>
      <Box justifyContent="space-between">
        <Link href={it.url} label="↗ Abrir no Jira" />
        {when > 0 && <Text dimColor>atualizado {clock(when)}</Text>}
      </Box>
    </Box>
  )

  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between" columnGap={1}>
        <Text color="claude" weight="bold">{it.key}</Text>
        <Text dimColor>{it.type}</Text>
      </Box>
      <Text weight="bold">{it.summary}</Text>

      <Box marginTop={1} flexDirection="column">
        <Box justifyContent="space-between">
          <Text>
            <Text dimColor>{'status'.padEnd(12)}</Text>{' '}
            {fresh ? <Text inverse weight="bold"> {it.status.toUpperCase()} </Text> : dot(it.status, it.category, true)}
          </Text>
          {fresh && <Text dimColor>mudou agora</Text>}
        </Box>
        {field('responsável', it.assignee)}
        {field('prioridade', it.priority)}
      </Box>

      {it.criteria.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Box justifyContent="space-between">
            <Text weight="bold">Critérios de aceite</Text>
            <Text dimColor>{it.criteria.length}</Text>
          </Box>
          {it.criteria.slice(0, room).map((c, i) => {
            const [, pad = '', body = c] = c.match(/^(\s*)• (.*)$/) ?? []
            return <Text key={`jira-c${i}`}>{pad}<Text dimColor>• </Text>{body}</Text>
          })}
          {it.criteria.length > room && <Text dimColor>+ {it.criteria.length - room} no card</Text>}
        </Box>
      )}

      <Box marginTop={1} flexDirection="column">{actions}</Box>
    </Box>
  )
}
