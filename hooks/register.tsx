import { atom, read, update } from 'claude-code'
import type { Register, RenderNode } from 'claude-code'

import { PANE, openPanel, quiet, rule, safe } from './panel'
import type { Safe, Seg } from './panel'
import {
  complete as agentsComplete,
  info as agents,
  render as agentsRender,
  spawn as agentsSpawn,
  summary as agentsSummary,
  sync as agentsSync,
  tool as agentsTool,
} from './sections/agents'
import {
  command as gitCommand,
  info as git,
  render as gitRender,
  start as gitStart,
  summary as gitSummary,
} from './sections/git'
import {
  command as jiraCommand,
  info as jira,
  prompt as jiraPrompt,
  render as jiraRender,
  start as jiraStart,
  summary as jiraSummary,
} from './sections/jira'
import {
  info as sessions,
  render as sessionsRender,
  start as sessionsStart,
  summary as sessionsSummary,
} from './sections/sessions'

const SECTIONS = [jira, agents, git, sessions]

const collapsed = atom({ plugin: 'painel', key: 'collapsed' } as const, [])

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'painel', description: 'Abre o painel lateral' })
    for (const c of SECTIONS.flatMap(s => s.commands)) await $.command.register(c)
    quiet(jiraStart($, e.isInteractive))
    quiet(agentsSync($))
    quiet(gitStart($, e.isInteractive))
    quiet(sessionsStart($, e.isInteractive))
    if (e.isInteractive) quiet(openPanel($))
    return next(e)
  })

  on('command.run', async ($, e, next) => {
    if (e.command === 'painel') {
      quiet(agentsSync($))
      await openPanel($)
      return { text: 'Painel aberto.' }
    }
    const fromJira = await safe(jiraCommand($, e.command, e.args))
    const fromGit = await safe(gitCommand($, e.command))
    const failed = [fromJira, fromGit].find(r => !r.ok)
    const text = (fromJira.ok ? fromJira.value : undefined) ?? (fromGit.ok ? fromGit.value : undefined)
    if (text !== undefined) return { text }
    return failed && !failed.ok ? { text: `Não deu: ${failed.error}` } : next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    quiet(jiraPrompt($, e.text))
    quiet(agentsSync($))
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.agentId) quiet(agentsSpawn($, e, r.agentId))
    return r
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId) quiet(agentsTool($, e))
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) quiet(agentsComplete($, e))
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const closed = await read($, collapsed)
    const isClosed = (id: string) => closed.includes(id)
    const toggle = (id: string) => update($, collapsed, list => (isClosed(id) ? list.filter(x => x !== id) : [...list, id]))

    const cols = Math.max(20, e.props.bodyColumns - 2)

    const BROKEN: Seg[] = [{ t: '✗ erro', color: 'error' }]

    const frame = (id: string, title: string, sum: Safe<Seg[]>, body: Safe<RenderNode | null> | null) => {
      const segs = sum.ok ? sum.value : BROKEN
      return (
        <Box key={`s-${id}`} flexDirection="column">
          <Button key={`hd-${id}`} plain onPress={() => toggle(id)}>
            <Text dimColor>{isClosed(id) ? '▸' : '▾'} </Text>
            <Text weight="bold">{title.toUpperCase()}</Text>
            <Text dimColor>{` ${'─'.repeat(rule(cols, title.toUpperCase(), segs))}${segs.length ? ' ' : ''}`}</Text>
            {segs.map((s, i) => <Text key={`hs-${id}-${i}`} color={s.color} dimColor={s.dim}>{s.t}</Text>)}
          </Button>
          {body && (
            <Box paddingLeft={2} flexDirection="column">
              {body.ok ? body.value : (
                <Text><Text color="error">✗ não deu para desenhar</Text><Text dimColor> {body.error.slice(0, Math.max(0, cols - 26))}</Text></Text>
              )}
            </Box>
          )}
        </Box>
      )
    }

    return (
      <Box flexDirection="column" paddingX={1} gap={1}>
        {frame(sessions.id, sessions.title, await safe(sessionsSummary($)), isClosed(sessions.id) ? null : await safe(sessionsRender($, e, cols - 2)))}
        {frame(jira.id, jira.title, await safe(jiraSummary($)), isClosed(jira.id) ? null : await safe(jiraRender($, e, cols - 2)))}
        {frame(agents.id, agents.title, await safe(agentsSummary($)), isClosed(agents.id) ? null : await safe(agentsRender($, e, cols - 2)))}
        {frame(git.id, git.title, await safe(gitSummary($)), isClosed(git.id) ? null : await safe(gitRender($, e, cols - 2)))}
      </Box>
    )
  })
}
