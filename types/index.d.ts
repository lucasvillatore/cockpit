export type Issue = {
  key: string
  summary: string
  type: string
  status: string
  category: string
  assignee: string
  priority: string
  criteria: string[]
  url: string
}

export type Transition = { id: string; name: string; category?: string }

export type Agent = {
  id: string
  parent?: string
  type: string
  desc: string
  start: number
  end?: number
  ok?: boolean
  tool?: string
}

export type Pr = {
  repo: string
  slug: string
  n: number
  title: string
  author: string
  createdAt: string
  url: string
  add: number
  del: number
  ciOk: number
  ciTotal: number
  reviews: { u: string; s: string; d: string }[]
  comments: { u: string; d: string; b: string }[]
}

export type SessionItem = { id: string; when: string; title: string }

declare module 'claude-code' {
  interface PluginState {
    painel: {
      collapsed: string[]
      jiraKey: string
      jiraIssue: Issue | null
      jiraTransitions: Transition[]
      jiraError: string
      jiraPending: Transition | null
      jiraPicking: boolean
      jiraChanged: boolean
      jiraSynced: number
      agents: Agent[]
      agentsOpened: boolean
      gitForMe: Pr[]
      gitMine: Pr[]
      gitFlipped: string[]
      gitError: string
      gitLoading: boolean
      sessions: SessionItem[]
      sessionsFilter: string
      sessionsLoaded: boolean
    }
  }
}
