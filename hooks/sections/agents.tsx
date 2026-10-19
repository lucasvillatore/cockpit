import { atom, read, update } from 'claude-code'
import type { AgentInfo, AgentSpawnInput, EngineInterface, Timer, ToolCallInput, TurnCompleteInput } from 'claude-code'

import type { Agent } from '../../types'
import { openPanel } from '../panel'
import type { PaneRender, SectionInfo, Seg } from '../panel'

const agents = atom({ plugin: 'painel', key: 'agents' } as const, [])
const opened = atom({ plugin: 'painel', key: 'agentsOpened' } as const, false)

const TTL = 10 * 60_000
const FAST = 150
const SLOW = 30_000

export type Cell = { ch: string; path?: string; i?: number }
export type Row = { kind: 'head' | 'desc' | 'tool' | 'gap'; pre: Cell[]; agent: Agent }

export const live = (a: Agent) => a.end === undefined

export const prune = (list: Agent[], now: number) => list.filter(a => a.end === undefined || now - a.end <= TTL)

export const dur = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  if (s < 60) return `${s}s`
  if (m < 60) return `${m}m${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}m`
}

export const ago = (ms: number) => {
  const m = Math.floor(ms / 60_000)
  return m < 1 ? 'agora' : `há ${m} min`
}

export const clip = (text: string, n: number) => (text.length > n ? `${text.slice(0, Math.max(0, n - 1))}…` : text)

export const toolLine = (tool: string, args: Record<string, unknown>) => {
  const s = (k: string) => (typeof args[k] === 'string' ? (args[k] as string).trim().split('\n')[0] ?? '' : '')
  const arg = s('pattern')
    ? [s('pattern'), s('path')].filter(Boolean).join('  ')
    : s('file_path').split('/').pop() || s('command') || s('path') || s('url') || s('query') || s('skill') || s('description')
  const name = tool.replace(/^mcp__.+?__/, '')
  return clip(arg ? `${name}  ${arg}` : name, 200)
}

export const tally = (list: Agent[]): Seg[] => {
  const run = list.filter(live).length
  const ok = list.filter(a => a.ok === true).length
  const bad = list.filter(a => a.ok === false).length
  const parts: Seg[][] = []
  if (run) parts.push([{ t: '●', color: 'warning' }, { t: ` ${run} rodando` }])
  if (ok) parts.push([{ t: `✓ ${ok} ${ok === 1 ? 'feito' : 'feitos'}`, dim: true }])
  if (bad) parts.push([{ t: '✗', color: 'error' }, { t: ` ${bad} ${bad === 1 ? 'falhou' : 'falharam'}` }])
  return parts.flatMap((p, i) => (i ? [{ t: ' · ', dim: true }, ...p] : p))
}

export const heat = (i: number, len: number, frame: number, offset: number) => {
  const head = (frame + offset) % (len + 4)
  return i === head ? 2 : i === head - 1 || i === head - 2 ? 1 : 0
}

export const layout = (list: Agent[]) => {
  const ids = new Set(list.map(a => a.id))
  const kids = (p?: string) =>
    list.filter(a => (a.parent && ids.has(a.parent) ? a.parent : undefined) === p).sort((x, y) => y.start - x.start)
  const lens: Record<string, number> = {}
  const cell = (ch: string, path?: string): Cell => (path ? { ch, path, i: (lens[path] = (lens[path] ?? 0) + 1) - 1 } : { ch })
  const rows: Row[] = []
  const walk = (p: string | undefined, indent: () => Cell[], depth: number) => {
    const cs = kids(p)
    cs.forEach((a, k) => {
      const next = cs[k + 1]?.id
      const bar = () => (next ? cell('│', next) : cell(' '))
      const inner = () => [...indent(), bar(), cell('      ')]
      const arrow = (next ? '├' : '└') + '─'.repeat(depth ? 2 : 3) + '▶'
      rows.push({ kind: 'head', agent: a, pre: [...indent(), ...[...arrow].map(ch => cell(ch, a.id))] })
      if (a.desc && live(a)) rows.push({ kind: 'desc', agent: a, pre: inner() })
      if (live(a) && a.tool) rows.push({ kind: 'tool', agent: a, pre: inner() })
      walk(a.id, inner, depth + 1)
      if (next) rows.push({ kind: 'gap', agent: a, pre: [...indent(), bar()] })
    })
  }
  walk(undefined, () => [], 0)
  return { rows, lens }
}

const RUNNING = new Set(['pending', 'running', 'waiting', 'idle'])

export const merge = (known: Agent[], infos: Pick<AgentInfo, 'id' | 'parentId' | 'type' | 'description' | 'status'>[], now: number): Agent[] => {
  const byId = new Map(infos.map(i => [i.id, i]))
  const updated = known.map(a => {
    const i = byId.get(a.id)
    return a.end === undefined && i && !RUNNING.has(i.status) ? { ...a, end: now, ok: i.status === 'completed', tool: undefined } : a
  })
  const fresh = infos
    .filter(i => RUNNING.has(i.status) && !known.some(a => a.id === i.id))
    .map(i => ({ id: i.id, parent: i.parentId, type: i.type, desc: i.description, start: now }))
  return [...updated, ...fresh]
}

let timer: Timer | undefined
let pace = 0

async function tick($: EngineInterface) {
  const list = prune(await read($, agents), await $.clock.now())
  const want = list.some(live) ? FAST : list.length ? SLOW : 0
  if (want !== pace) {
    timer?.cancel()
    timer = want ? $.clock.every(want, () => void tick($)) : undefined
    pace = want
  }
  $.ui.invalidate('ui.render')
}

export const info: SectionInfo = { id: 'agents', title: 'Agents', commands: [] }

export async function spawn($: EngineInterface, e: AgentSpawnInput, id: string) {
  const now = await $.clock.now()
  const a: Agent = { id, parent: e.parentAgentId, type: e.subagentType, desc: e.description, start: now }
  await update($, agents, list => [...prune(list, now).filter(x => x.id !== id), a])
  if (!(await read($, opened))) {
    await update($, opened, () => true)
    void openPanel($)
  }
  await tick($)
}

export async function sync($: EngineInterface) {
  const infos = await $.agent.list()
  const now = await $.clock.now()
  const before = await read($, agents)
  const after = merge(before, infos, now)
  if (JSON.stringify(after) === JSON.stringify(before)) return
  await update($, agents, () => after)
  await tick($)
}

export async function tool($: EngineInterface, e: ToolCallInput) {
  const id = e.agentId
  if (!id || !(await read($, agents)).some(a => a.id === id)) return
  const line = toolLine(e.tool, e as unknown as Record<string, unknown>)
  await update($, agents, list => list.map(a => (a.id === id ? { ...a, tool: line } : a)))
}

export async function complete($: EngineInterface, e: TurnCompleteInput) {
  const id = e.agentId
  if (!id || !(await read($, agents)).some(a => a.id === id)) return
  const now = await $.clock.now()
  await update($, agents, list => list.map(a => (a.id === id ? { ...a, end: now, ok: e.reason === 'answer', tool: undefined } : a)))
  await tick($)
}

export async function summary($: EngineInterface) {
  return tally(prune(await read($, agents), await $.clock.now()))
}

export async function render($: EngineInterface, e: PaneRender, cols: number) {
  const { Box, Text } = $.ui.resolve(e)
  const now = await $.clock.now()
  const list = prune(await read($, agents), now)
  if (!list.length) return <Text dimColor>Nenhum agent nesta sessão.</Text>

  const frame = Math.floor(now / FAST)
  const { rows, lens } = layout(list)
  const byId = new Map(list.map((a, n) => [a.id, { a, offset: n * 3 }]))

  const paint = (c: Cell, key: string) => {
    const p = c.path ? byId.get(c.path) : undefined
    const level = p && live(p.a) ? heat(c.i ?? 0, lens[p.a.id] ?? 0, frame, p.offset) : 0
    if (level === 2) return <Text key={key} color="claude">{c.ch}</Text>
    if (level === 1) return <Text key={key} color="claude" dimColor>{c.ch}</Text>
    return <Text key={key} dimColor>{c.ch}</Text>
  }

  return (
    <Box flexDirection="column">
      <Text weight="bold">sessão principal</Text>
      {rows.map((r, n) => {
        const a = r.agent
        const key = `ag-${n}`
        const pre = r.pre.map((c, j) => paint(c, `${key}-${j}`))
        const room = cols - r.pre.reduce((w, c) => w + c.ch.length, 0)
        const on = live(a)
        if (r.kind === 'head') {
          const icon = on ? <Text color="warning">●</Text> : a.ok ? <Text color="success">✓</Text> : <Text color="error">✗</Text>
          const time = on ? dur(now - a.start).padStart(6) : `${dur((a.end ?? now) - a.start)} · ${ago(now - (a.end ?? now))}`
          return (
            <Box key={key} justifyContent="space-between">
              <Text>{pre} {icon} <Text weight={on ? 'bold' : undefined} dimColor={!on}>{clip(a.type, Math.max(4, room - time.length - 4))}</Text></Text>
              <Text dimColor>{time}</Text>
            </Box>
          )
        }
        if (r.kind === 'desc') return <Text key={key}>{pre}{clip(a.desc, room)}</Text>
        if (r.kind === 'tool') return <Text key={key}>{pre}<Text dimColor>⎿</Text> <Text color="suggestion">{clip(a.tool ?? '', room - 2)}</Text></Text>
        return <Text key={key}>{pre}</Text>
      })}
    </Box>
  )
}
