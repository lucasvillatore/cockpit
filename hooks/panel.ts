import type { Color, EngineInterface, RenderInput } from 'claude-code'

export const PANE = 'painel'

export type PaneRender = RenderInput<'Pane'>

export type SectionInfo = {
  id: string
  title: string
  commands: { name: string; description: string; argumentHint?: string }[]
}

export type Seg = { t: string; color?: Color; dim?: boolean }

export const width = (segs: Seg[]) => segs.reduce((n, s) => n + [...s.t].length, 0)

export const rule = (cols: number, name: string, segs: Seg[]) =>
  Math.max(1, cols - [...`▾ ${name} `].length - (segs.length ? width(segs) + 1 : 0))

export type Safe<T> = { ok: true; value: T } | { ok: false; error: string }

export async function safe<T>(work: Promise<T>): Promise<Safe<T>> {
  try {
    return { ok: true, value: await work }
  } catch (err) {
    return { ok: false, error: (String(err instanceof Error ? err.message : err).split('\n')[0] ?? '').trim() || 'erro desconhecido' }
  }
}

export const quiet = (work: Promise<unknown>) => void work.catch(() => undefined)

export async function openPanel($: EngineInterface) {
  const opened = await $.ui.open({ id: PANE, title: 'Painel' })
  if (opened.isPlaced) return opened
  $.ui.toast(`Painel não abriu: ${opened.reason}. Use /painel.`)
  return opened
}
