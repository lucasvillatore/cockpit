import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { SessionItem } from '../../types'
import type { PaneRender, SectionInfo, Seg } from '../panel'

const sessions = atom({ plugin: 'painel', key: 'sessions' } as const, [])
const filter = atom({ plugin: 'painel', key: 'sessionsFilter' } as const, '')
const loaded = atom({ plugin: 'painel', key: 'sessionsLoaded' } as const, false)

const LIMIT = 30
const SHOWN = 8
const NOISE = /^(\/?clear|Caveat:|The command below)/

const two = (n: number) => String(n).padStart(2, '0')

export const stamp = (ms: number) => {
  const d = new Date(ms)
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`
}

const textOf = (content: unknown) =>
  typeof content === 'string'
    ? content
    : Array.isArray(content)
      ? content.filter(b => b?.type === 'text').map(b => b.text).join(' ')
      : ''

export const titleOf = (jsonl: string) => {
  const titles = [...jsonl.matchAll(/"customTitle":"((?:[^"\\]|\\.)*)"/g)]
  if (titles.length > 0) return JSON.parse(`"${titles.at(-1)![1]}"`) as string
  for (const line of jsonl.split('\n')) {
    if (!line.includes('"type":"user"')) continue
    try {
      const text = textOf(JSON.parse(line).message?.content).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim()
      if (text && !NOISE.test(text)) return text.slice(0, 70)
    } catch {}
  }
  return ''
}

export const pick = (list: SessionItem[], query: string) =>
  list.filter(s => s.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, SHOWN)

async function load($: EngineInterface) {
  const home = (await $.env.get('HOME')) || (await $.env.get('USERPROFILE')) || ''
  const cwd = await $.session.cwd()
  const dir = `${home}/.claude/projects/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}`
  const current = await $.session.id()
  const files = (await $.fs.list(dir).catch(() => []))
    .filter(f => f.kind === 'file' && f.name.endsWith('.jsonl') && f.name !== `${current}.jsonl`)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, LIMIT)
  const items: SessionItem[] = await Promise.all(files.map(async f => {
    const id = f.name.slice(0, -'.jsonl'.length)
    const title = await $.fs.read(`${dir}/${f.name}`).then(titleOf, () => '')
    return { id, when: stamp(f.mtimeMs), title: title || id }
  }))
  await update($, sessions, () => items)
  await update($, loaded, () => true)
}

export const info: SectionInfo = { id: 'sessions', title: 'Sessões', commands: [] }

export async function start($: EngineInterface, isInteractive: boolean) {
  if (isInteractive) await load($)
}

export async function summary($: EngineInterface): Promise<Seg[]> {
  const n = (await read($, sessions)).length
  return [{ t: n === 1 ? '1 recente' : `${n} recentes`, dim: true }]
}

export async function render($: EngineInterface, e: PaneRender, cols: number) {
  const els = $.ui.resolve(e)
  const { Box, Button, Text } = els
  const Input = 'Input' in els ? els.Input : null
  const all = await read($, sessions)
  const query = await read($, filter)
  const shown = pick(all, query)
  const room = Math.max(8, cols - 13)
  const cut = (s: string) => (s.length > room ? `${s.slice(0, room - 1)}…` : s)

  if (!(await read($, loaded))) return <Text dimColor>Carregando as sessões…</Text>

  return (
    <Box flexDirection="column">
      {Input && <Input key="sess-filter" placeholder="filtrar…" value={query} onInput={(text: string) => void update($, filter, () => text)} onSubmit={() => {}} />}
      {shown.length === 0 && <Text dimColor>{all.length ? 'Nenhuma sessão bate com o filtro.' : 'Nenhuma outra sessão neste projeto.'}</Text>}
      {shown.map(s => (
        <Box key={`sess-${s.id}`} justifyContent="space-between" columnGap={1}>
          <Button key={`sess-go-${s.id}`} plain onPress={() => $.command.run({ command: 'resume', args: s.id })}>{cut(s.title)}</Button>
          <Text dimColor>{s.when}</Text>
        </Box>
      ))}
      {all.length > SHOWN && !query && <Text dimColor>+ {all.length - SHOWN} mais antigas, filtre para achar</Text>}
      <Box marginTop={1}>
        <Button key="sess-reload" plain dimColor label="↻ Atualizar" onPress={() => load($)} />
      </Box>
    </Box>
  )
}
