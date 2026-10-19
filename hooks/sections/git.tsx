import { atom, read, update } from 'claude-code'
import type { EngineInterface } from 'claude-code'

import type { Pr } from '../../types'
import type { PaneRender, SectionInfo, Seg } from '../panel'

const forMe = atom({ plugin: 'painel', key: 'gitForMe' } as const, [])
const mine = atom({ plugin: 'painel', key: 'gitMine' } as const, [])
const flipped = atom({ plugin: 'painel', key: 'gitFlipped' } as const, [])
const error = atom({ plugin: 'painel', key: 'gitError' } as const, '')
const loading = atom({ plugin: 'painel', key: 'gitLoading' } as const, false)

const FIELDS = 'number,repository,title,author,createdAt,url'
const DETAIL = 'additions,deletions,reviews,comments,statusCheckRollup'
const BOTS: Record<string, string> = { cigmudmm: 'GMUD', 'sonarqube-madeiramadeira': 'Sonar', sonarqubecloud: 'Sonar' }
const OK = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])

type Review = Pr['reviews'][number]

export const botOf = (login: string) => BOTS[login] ?? (login.endsWith('[bot]') ? login.slice(0, -5) : '')

export const age = (from: string, now: number) => {
  const days = Math.floor((now - Date.parse(from)) / 86400000)
  if (days < 1) return 'hoje'
  if (days < 30) return `${days} d`
  if (days < 365) return `${Math.floor(days / 30)} meses`
  const y = Math.floor(days / 365)
  return y === 1 ? '1 ano' : `${y} anos`
}

export const isOpen = (flips: string[], k: string) => /^[grp]:forMe/.test(k) !== flips.includes(k)

export const approvals = (pr: Pr) => new Set(pr.reviews.filter(r => r.s === 'APPROVED').map(r => r.u)).size

export const verdicts = (reviews: Review[]) => {
  const by = new Map<string, Review>()
  for (const r of reviews) {
    const prev = by.get(r.u)
    if (!prev || r.s === 'APPROVED' || r.s === 'CHANGES_REQUESTED' || prev.s === 'COMMENTED') by.set(r.u, r)
  }
  return [...by.values()]
}

export const robots = (comments: Pr['comments']) => {
  const count: Record<string, number> = {}
  for (const c of comments) {
    const bot = botOf(c.u)
    if (bot) count[bot] = (count[bot] ?? 0) + 1
  }
  return Object.entries(count).map(([k, v]) => (v > 1 ? `${k} ×${v}` : k)).join(' · ')
}

export const parseDetail = (base: Omit<Pr, 'add' | 'del' | 'ciOk' | 'ciTotal' | 'reviews' | 'comments'>, json: string): Pr => {
  const d = JSON.parse(json)
  const checks: { conclusion?: string; state?: string }[] = d.statusCheckRollup ?? []
  return {
    ...base,
    add: d.additions ?? 0,
    del: d.deletions ?? 0,
    ciOk: checks.filter(c => OK.has(c.conclusion ?? c.state ?? '')).length,
    ciTotal: checks.length,
    reviews: (d.reviews ?? []).map((r: { author?: { login?: string }; state: string; submittedAt?: string }) =>
      ({ u: r.author?.login ?? '?', s: r.state, d: (r.submittedAt ?? '').slice(0, 10) })),
    comments: (d.comments ?? []).map((c: { author?: { login?: string }; createdAt?: string; body?: string }) =>
      ({ u: c.author?.login ?? '?', d: (c.createdAt ?? '').slice(0, 10), b: (c.body ?? '').replace(/\s+/g, ' ').trim() })),
  }
}

async function gh($: EngineInterface, args: string[]) {
  const r = await $.process.run(['gh', ...args], { timeoutMs: 60000 })
  if (r.exitCode !== 0) throw new Error(r.stderr.trim() || `gh saiu com ${r.exitCode}`)
  return r.stdout
}

async function search($: EngineInterface, who: string) {
  const list: { number: number; repository: { nameWithOwner: string; name: string }; title: string; author: { login: string }; createdAt: string; url: string }[] =
    JSON.parse(await gh($, ['search', 'prs', who, '--state=open', '--json', FIELDS, '--limit', '30']))
  return Promise.all(list.map(async p => {
    const base = { repo: p.repository.name, slug: p.repository.nameWithOwner, n: p.number, title: p.title, author: p.author.login, createdAt: p.createdAt.slice(0, 10), url: p.url }
    return parseDetail(base, await gh($, ['pr', 'view', String(p.number), '-R', p.repository.nameWithOwner, '--json', DETAIL]))
  }))
}

async function load($: EngineInterface) {
  await update($, loading, () => true)
  await update($, error, () => '')
  try {
    const [a, b] = await Promise.all([search($, '--review-requested=@me'), search($, '--author=@me')])
    await update($, forMe, () => a)
    await update($, mine, () => b)
  } catch (err) {
    await update($, error, () => String(err instanceof Error ? err.message : err).split('\n')[0]!.slice(0, 200))
  }
  await update($, loading, () => false)
}

async function toggle($: EngineInterface, k: string) {
  await update($, flipped, list => (list.includes(k) ? list.filter(x => x !== k) : [...list, k]))
}

async function review($: EngineInterface, pr: Pr) {
  await $.command.run({ command: 'code-review', args: pr.url })
}

export const info: SectionInfo = {
  id: 'git',
  title: 'Git',
  commands: [{ name: 'git', description: 'Mostra os PRs para revisar e os seus no painel' }],
}

export async function command($: EngineInterface, name: string) {
  if (name !== 'git') return undefined
  void load($)
  return 'Carregando os PRs no painel.'
}

export async function start($: EngineInterface, isInteractive: boolean) {
  if (isInteractive) await load($)
}

export async function summary($: EngineInterface): Promise<Seg[]> {
  const a = (await read($, forMe)).length
  const b = (await read($, mine)).length
  return [{ t: `${a} para mim`, color: a ? 'warning' : undefined, dim: !a }, { t: ` · ${b} meus`, dim: true }]
}

export async function render($: EngineInterface, e: PaneRender, cols: number) {
  const { Box, Button, Link, Text } = $.ui.resolve(e)
  const flips = await read($, flipped)
  const err = await read($, error)
  const busy = await read($, loading)
  const lists = { forMe: await read($, forMe), mine: await read($, mine) }
  const now = Date.now()
  const open = (k: string) => isOpen(flips, k)
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s)
  const arrow = (k: string) => <Text dimColor>{open(k) ? '▾' : '▸'} </Text>
  const day = (d: string) => d.split('-').reverse().join('/')

  if (err) return (
    <Box flexDirection="column" gap={1}>
      <Text color="error">Não deu para ler os PRs.</Text>
      <Text dimColor>{err}</Text>
      <Button key="git-retry" variant="primary" label="Tentar de novo" onPress={() => load($)} />
    </Box>
  )
  if (busy && !lists.forMe.length && !lists.mine.length) return <Text dimColor>Carregando os PRs…</Text>

  const prRows = (pr: Pr, id: 'forMe' | 'mine') => {
    const k = `p:${id}:${pr.slug}#${pr.n}`
    const ap = approvals(pr)
    const when = age(pr.createdAt, now).padStart(8)
    const room = cols - 4 - 2 - String(pr.n).length - 2 - 2 - when.length - 2
    const ci = pr.ciTotal === 0
      ? <Text dimColor>sem CI</Text>
      : pr.ciOk === pr.ciTotal ? <Text color="success">✓ CI {pr.ciOk}/{pr.ciTotal}</Text> : <Text color="error">✗ CI {pr.ciOk}/{pr.ciTotal}</Text>
    const people = verdicts(pr.reviews)
    const humans = pr.comments.filter(c => !botOf(c.u))
    const bots = robots(pr.comments)
    return (
      <Box key={`b-${k}`} flexDirection="column">
        <Box justifyContent="space-between" columnGap={1}>
          <Button key={k} plain onPress={() => toggle($, k)}>
            {arrow(k)}<Text color="suggestion">#{pr.n}</Text> {cut(pr.title, room)}
          </Button>
          <Text>{ap > 0 ? <Text color="success">✓{ap}</Text> : <Text dimColor>○0</Text>}<Text dimColor> {when}</Text></Text>
        </Box>
        {open(k) && (
          <Box flexDirection="column" paddingLeft={2}>
            <Box justifyContent="space-between">
              <Text><Text dimColor>{pr.author} · </Text><Text color="success">+{pr.add}</Text> <Text color="error">−{pr.del}</Text></Text>
              {ci}
            </Box>
            {people.map(r => (
              <Box key={`r-${k}-${r.u}`} justifyContent="space-between">
                <Text>
                  {r.s === 'APPROVED' ? <Text color="success">✓</Text> : r.s === 'CHANGES_REQUESTED' ? <Text color="error">✗</Text> : <Text color="suggestion">✎</Text>}
                  {' '}{r.u}<Text dimColor> {r.s === 'APPROVED' ? 'aprovou' : r.s === 'CHANGES_REQUESTED' ? 'pediu mudança' : 'revisou'}</Text>
                </Text>
                <Text dimColor>{day(r.d)}</Text>
              </Box>
            ))}
            {humans.map((c, i) => (
              <Box key={`c-${k}-${i}`} flexDirection="column">
                <Box justifyContent="space-between">
                  <Text><Text color="suggestion">✎</Text> {c.u}</Text>
                  <Text dimColor>{day(c.d)}</Text>
                </Box>
                <Text dimColor>  “{cut(c.b, cols - 12)}”</Text>
              </Box>
            ))}
            {bots && <Text dimColor>⚙ robôs: {bots}</Text>}
            {!people.length && !humans.length && <Text dimColor>ninguém revisou ainda</Text>}
            <Box columnGap={2}>
              {id === 'forMe' && <Button key={`rv-${k}`} variant="primary" label="revisar com Claude" onPress={() => review($, pr)} />}
              <Link href={pr.url} label="[ abrir ]" />
            </Box>
          </Box>
        )}
      </Box>
    )
  }

  const group = (id: 'forMe' | 'mine', title: string) => {
    const prs = lists[id]
    const gk = `g:${id}`
    const repos = new Map<string, Pr[]>()
    const newest = [...prs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    for (const pr of newest) repos.set(pr.repo, [...(repos.get(pr.repo) ?? []), pr])
    const names = [...repos.keys()]
    return (
      <Box key={gk} flexDirection="column">
        <Box justifyContent="space-between">
          <Button key={gk} plain onPress={() => toggle($, gk)}>{arrow(gk)}<Text weight="bold">{title}</Text></Button>
          <Text dimColor>{prs.length} PR</Text>
        </Box>
        {open(gk) && !prs.length && <Box paddingLeft={2}><Text dimColor>nenhum PR aberto</Text></Box>}
        {open(gk) && names.map(name => {
          const rk = `r:${id}:${name}`
          const list = repos.get(name) ?? []
          const ap = list.reduce((s, pr) => s + approvals(pr), 0)
          return (
            <Box key={`b-${rk}`} flexDirection="column" paddingLeft={2}>
              <Box justifyContent="space-between" columnGap={1}>
                <Button key={rk} plain onPress={() => toggle($, rk)}>{arrow(rk)}{cut(name, cols - 12)}</Button>
                <Text>{ap > 0 && <Text color="success">✓{ap} </Text>}<Text dimColor>{list.length} PR</Text></Text>
              </Box>
              {open(rk) && <Box flexDirection="column" paddingLeft={2}>{list.map(pr => prRows(pr, id))}</Box>}
            </Box>
          )
        })}
      </Box>
    )
  }

  return (
    <Box flexDirection="column" gap={1}>
      {group('forMe', 'PARA MIM')}
      {group('mine', 'MEUS PRS')}
      <Button key="git-reload" plain dimColor label={busy ? '↻ Atualizando…' : '↻ Atualizar'} onPress={() => load($)} />
    </Box>
  )
}
