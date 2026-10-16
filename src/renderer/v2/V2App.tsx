import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { BookOpen, CircleCheck, Ellipsis, Footprints, LayoutGrid, Mountain, TriangleAlert, X } from 'lucide-react'
import '@fontsource-variable/schibsted-grotesk/index.css'
import '@fontsource-variable/literata/opsz.css'
import '@fontsource-variable/literata/opsz-italic.css'
import './v2.css'
import type { AccountStatus, AppSettings, DashboardView, SyncStatus, ToastMessage } from '@shared/types'
import { useData } from '../hooks/useData'
import { initial } from '../lib/khatwa'
import { SIGNED_OUT_EVENT } from '../lib/webApi'
import { ShellContext, type Route, type Shell } from '../khatwa/nav'
import ActiveSession from '../khatwa/ActiveSession'
import { fromLocation, primaryOf, toPath, type Primary } from './router'
import Today from './screens/Today'
import Mountains from './screens/Mountains'
import MountainPage from './screens/MountainPage'
import JournalPage from './screens/Journal'
import Journey from './screens/Journey'
import SignIn from './screens/SignIn'
import Classic from './screens/Classic'

type Toast = ToastMessage & { id: number }

const TABS: { key: Exclude<Primary, 'more'>; label: string; route: Route; icon: ReactElement }[] = [
  { key: 'today', label: 'Today', route: { name: 'today' }, icon: <LayoutGrid size={20} /> },
  { key: 'mountains', label: 'Mountains', route: { name: 'mountains' }, icon: <Mountain size={20} /> },
  { key: 'journal', label: 'Journal', route: { name: 'journal' }, icon: <BookOpen size={20} /> },
  { key: 'journey', label: 'Journey', route: { name: 'journey' }, icon: <Footprints size={20} /> }
]

const MORE: { label: string; route: Route }[] = [
  { label: 'Habits', route: { name: 'habits' } },
  { label: 'To-do', route: { name: 'todo' } },
  { label: 'Calendar', route: { name: 'calendar' } },
  { label: 'Progress', route: { name: 'progress' } },
  { label: 'Weekly review', route: { name: 'review' } },
  { label: 'Achievements', route: { name: 'achievements' } },
  { label: 'Let go', route: { name: 'letgo' } },
  { label: 'Settings', route: { name: 'settings' } }
]

export default function V2App() {
  const [route, setRoute] = useState<Route>(() => fromLocation(window.location.pathname, window.location.search))
  const [account, setAccount] = useState<AccountStatus | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [session, setSession] = useState<number | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const moreRef = useRef<HTMLDivElement>(null)

  const { data: settings, refetch: refetchSettings } = useData<AppSettings>(() => window.api.settings.get(), [])
  const { data: dashboard } = useData<DashboardView>(() => window.api.view.dashboard(), [])

  const pushToast = useCallback((message: ToastMessage) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { ...message, id }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
  }, [])

  const navigate = useCallback((next: Route) => {
    const path = toPath(next)
    if (`${window.location.pathname}${window.location.search}` !== path) window.history.pushState(null, '', path)
    setRoute(next)
    setMoreOpen(false)
    window.scrollTo({ top: 0 })
  }, [])

  // Back and forward move between screens like any website.
  useEffect(() => {
    const onPop = (): void => setRoute(fromLocation(window.location.pathname, window.location.search))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => window.api.on.toast(pushToast), [pushToast])

  // Coming back from a Google redirect: say how it went, then tidy the address bar.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const google = q.get('google')
    const signin = q.get('signin')
    if (!google && !signin) return
    const detail = q.get('message') ?? undefined
    if (google === 'connected') pushToast({ kind: 'success', title: 'Google is linked', body: 'Your habits now sync with Google Tasks and Calendar.' })
    if (google === 'error') pushToast({ kind: 'error', title: 'Could not connect to Google', body: detail })
    if (signin === 'error') pushToast({ kind: 'error', title: 'Google sign-in did not finish', body: detail })
    window.history.replaceState(null, '', window.location.pathname)
  }, [pushToast])

  useEffect(() => window.api.on.syncStatus(setStatus), [])

  useEffect(() => {
    window.api.account
      .status()
      .then(setAccount)
      .catch(() => setAccount({ configured: true, user: null, offline: true }))
    const onSignedOut = (): void => setAccount((a) => (a?.configured && a.user ? { ...a, user: null } : a))
    window.addEventListener(SIGNED_OUT_EVENT, onSignedOut)
    return () => window.removeEventListener(SIGNED_OUT_EVENT, onSignedOut)
  }, [])

  const inApp = Boolean(account && (!account.configured || account.user))

  // Same start-up and heartbeat as the classic design: schedule up to date, reminders
  // delivered, Google synced on the user's interval.
  useEffect(() => {
    if (!inApp) return
    let stopped = false
    const tick = (): void => {
      if (!stopped && document.visibilityState === 'visible') void window.api.app.tick().catch(() => undefined)
    }
    void window.api.app
      .start()
      .catch((err: unknown) => pushToast({ kind: 'error', title: 'Khatwa could not load your day', body: err instanceof Error ? err.message : String(err) }))
      .finally(tick)
    const timer = setInterval(tick, 60_000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [inApp, pushToast])

  // The user's theme choice applies here too.
  useEffect(() => {
    if (!settings) return
    const root = document.documentElement
    const dark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
    root.setAttribute('data-theme', dark ? 'dark' : 'light')
    root.setAttribute('data-reduce-motion', String(settings.reduceMotion))
  }, [settings])

  useEffect(() => {
    if (!moreOpen) return
    const close = (e: MouseEvent): void => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    const esc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [moreOpen])

  const signOut = useCallback(async () => {
    await window.api.account.signOut()
    setAccount((a) => (a ? { ...a, user: null } : a))
    navigate({ name: 'today' })
  }, [navigate])

  const shell = useMemo<Shell>(
    () => ({
      navigate,
      settings: settings ?? null,
      level: dashboard?.level ?? null,
      toast: (kind, title, body) => pushToast({ kind, title, body }),
      openSession: setSession,
      account: account?.user ?? null,
      accountsEnabled: account?.configured ?? false,
      requireAccount: async () => Boolean(account?.user) || !account?.configured,
      signOut,
      startTour: () => undefined
    }),
    [navigate, settings, dashboard?.level, pushToast, account, signOut]
  )

  if (!account) return <div className="k2" aria-busy="true" />

  if (account.configured && !account.user) {
    return (
      <div className="k2">
        <SignIn
          onSignedIn={(user) => {
            setAccount({ configured: true, offline: false, user })
            if (!settings?.displayName && user.name) void window.api.settings.save({ displayName: user.name }).then(refetchSettings)
          }}
        />
      </div>
    )
  }

  const active = primaryOf(route)
  const name = settings?.displayName ?? ''

  const screen: ReactElement = (() => {
    switch (route.name) {
      case 'today':
        return <Today />
      case 'mountains':
        return <Mountains />
      case 'mountain':
        return <MountainPage id={route.id} />
      case 'journal':
        return <JournalPage />
      case 'journey':
        return <Journey />
      default:
        return <Classic route={route} status={status} onSettingsChanged={refetchSettings} />
    }
  })()

  return (
    <ShellContext.Provider value={shell}>
      <div className="k2">
        <header className="k2-nav">
          <button className="k2-mark" onClick={() => navigate({ name: 'today' })} aria-label="Khatwa, go to Today">
            <span className="k2-blaze" aria-hidden="true" />
            Khatwa
          </button>
          <nav className="k2-tabs" aria-label="Main">
            {TABS.map((t) => (
              <a
                key={t.key}
                href={toPath(t.route)}
                className="k2-tab"
                aria-current={active === t.key ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault()
                  navigate(t.route)
                }}
              >
                {t.icon}
                {t.label}
              </a>
            ))}
            <div ref={moreRef} className="relative flex">
              <button className="k2-tab" aria-current={active === 'more' ? 'page' : undefined} aria-expanded={moreOpen} aria-haspopup="menu" onClick={() => setMoreOpen((o) => !o)}>
                <Ellipsis size={20} />
                More
              </button>
              {moreOpen ? (
                <div className="k2-menu max-[760px]:!top-auto max-[760px]:bottom-full max-[760px]:mb-2" role="menu">
                  {MORE.map((m) => (
                    <a
                      key={m.label}
                      role="menuitem"
                      href={toPath(m.route)}
                      onClick={(e) => {
                        e.preventDefault()
                        navigate(m.route)
                      }}
                    >
                      {m.label}
                    </a>
                  ))}
                  {account.configured ? (
                    <>
                      <hr />
                      <button role="menuitem" onClick={() => void signOut()}>
                        Sign out
                      </button>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </nav>
          <a
            href={toPath({ name: 'me' })}
            className="k2-avatar ml-auto"
            title={name || 'Me'}
            onClick={(e) => {
              e.preventDefault()
              navigate({ name: 'me' })
            }}
          >
            {initial(name)}
          </a>
        </header>

        <main key={'id' in route && route.id !== undefined ? `${route.name}-${route.id}` : route.name}>{screen}</main>

        {session !== null ? (
          <div className="k2-classic">
            <ActiveSession
              occurrenceId={session}
              onClose={() => setSession(null)}
              onNavigateMountain={(id) => {
                setSession(null)
                navigate({ name: 'mountain', id })
              }}
            />
          </div>
        ) : null}

        {toasts.length > 0 ? (
          <div className="k2-toasts" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className="k2-toast">
                {t.kind === 'error' || t.kind === 'warn' ? <TriangleAlert size={18} className="shrink-0 mt-0.5" /> : <CircleCheck size={18} className="shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  {t.title}
                  {t.body ? <small>{t.body}</small> : null}
                </div>
                <button aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </ShellContext.Provider>
  )
}
