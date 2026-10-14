import type { Route } from '../khatwa/nav'

/**
 * The new design gives every screen its own address under /new, so the browser's back
 * button, refresh and shared links all work. The classic design keeps its in-memory
 * routing at /, untouched.
 */
export const BASE = '/new'

export function toPath(route: Route): string {
  switch (route.name) {
    case 'today':
      return BASE
    case 'mountains':
      return `${BASE}/mountains`
    case 'mountain':
      return `${BASE}/mountains/${route.id}`
    case 'expedition':
      return `${BASE}/mountains/new${route.resume ? '?resume=1' : ''}`
    case 'journal':
      return `${BASE}/journal`
    case 'journey':
      return `${BASE}/journey`
    case 'habit':
      return `${BASE}/habits/${route.id}`
    case 'habits':
      return route.edit === 'new' ? `${BASE}/habits?edit=new` : route.edit ? `${BASE}/habits?edit=${route.edit}` : `${BASE}/habits`
    case 'letgo':
      return route.id ? `${BASE}/letgo/${route.id}` : route.create ? `${BASE}/letgo?create=1` : `${BASE}/letgo`
    case 'letgoPlan':
      return `${BASE}/letgo/plan`
    case 'ceremony':
      return `${BASE}/letgo/${route.id}/ceremony`
    default:
      return `${BASE}/${route.name}`
  }
}

export function fromLocation(pathname: string, search: string): Route {
  const q = new URLSearchParams(search)
  const parts = pathname.replace(/^\/new\/?/, '').split('/').filter(Boolean)
  const id = (s: string | undefined): number | null => (s && /^\d+$/.test(s) ? Number(s) : null)
  const [head, second, third] = parts
  switch (head) {
    case undefined:
      return { name: 'today' }
    case 'mountains':
      if (second === 'new') return { name: 'expedition', resume: q.get('resume') === '1' }
      return id(second) !== null ? { name: 'mountain', id: id(second)! } : { name: 'mountains' }
    case 'habits': {
      if (id(second) !== null) return { name: 'habit', id: id(second)! }
      const edit = q.get('edit')
      return { name: 'habits', edit: edit === 'new' ? 'new' : id(edit ?? undefined) ?? undefined }
    }
    case 'letgo':
      if (second === 'plan') return { name: 'letgoPlan' }
      if (id(second) !== null && third === 'ceremony') return { name: 'ceremony', id: id(second)! }
      if (id(second) !== null) return { name: 'letgo', id: id(second)! }
      return { name: 'letgo', create: q.get('create') === '1' || undefined }
    case 'journal':
    case 'journey':
    case 'todo':
    case 'calendar':
    case 'progress':
    case 'review':
    case 'achievements':
    case 'settings':
    case 'me':
      return { name: head }
    default:
      return { name: 'today' }
  }
}

/** The four places the new design puts first; everything else lives under More. */
export type Primary = 'today' | 'mountains' | 'journal' | 'journey' | 'more'

export function primaryOf(route: Route): Primary {
  switch (route.name) {
    case 'today':
    case 'todo':
      return 'today'
    case 'mountains':
    case 'mountain':
    case 'expedition':
      return 'mountains'
    case 'journal':
      return 'journal'
    case 'journey':
      return 'journey'
    default:
      return 'more'
  }
}
