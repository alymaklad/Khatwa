import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, Plus, X } from 'lucide-react'
import { MOODS, type Attachment, type JournalDraft, type JournalEntry, type Mood } from '@shared/types'
import { useData } from '../../hooks/useData'
import { today } from '../../lib/khatwa'
import { useShell } from '../../khatwa/nav'
import { DEEP_PROMPTS, MONTHLY_PROMPTS, QUICK_PROMPTS } from '../../routes/Journal'

const MOOD_LABEL: Record<Mood, string> = { good: 'Good', okay: 'Okay', low: 'Low', stressed: 'Stressed', exhausted: 'Exhausted' }
const PROMPT_LABEL = new Map<string, string>([...DEEP_PROMPTS, ...MONTHLY_PROMPTS])

type Page = Omit<JournalDraft, 'attachmentIds'> & { id: number | null; attachments: Attachment[] }
type SaveState = 'idle' | 'saving' | 'saved' | 'error'

function blankPage(): Page {
  return { id: null, date: today(), kind: 'free', title: null, body: '', mood: null, stepToward: null, prompts: {}, tags: [], goalId: null, letGoId: null, attachments: [] }
}

function fromEntry(e: JournalEntry): Page {
  return { ...e, attachments: e.attachments }
}

const hasWriting = (p: Page): boolean =>
  Boolean(p.body.trim() || p.title?.trim() || Object.values(p.prompts).some((v) => v.trim()) || p.mood || p.stepToward || p.attachments.length)

function writtenDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function shortDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

function preview(e: JournalEntry): string {
  const text = e.title?.trim() || e.body.trim() || Object.values(e.prompts).find((v) => v.trim()) || (e.attachments.length ? 'Photos' : '')
  return text.split('\n')[0] ?? ''
}

/** Keeps a textarea as tall as its text, so the page grows instead of scrolling inside itself. */
function useAutoHeight(value: string) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || 'fieldSizing' in el.style) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [value])
  return ref
}

function Lines({ value, onChange, placeholder, label, minRows }: { value: string; onChange: (v: string) => void; placeholder?: string; label: string; minRows?: number }) {
  const ref = useAutoHeight(value)
  return (
    <textarea
      ref={ref}
      className="k2-paper-body"
      style={minRows ? { minHeight: `calc(var(--rule) * ${minRows})` } : undefined}
      value={value}
      placeholder={placeholder}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export default function JournalPage() {
  const shell = useShell()
  const { data: entries, error, refetch } = useData<JournalEntry[]>(() => window.api.journal.list(), [])
  const [page, setPage] = useState<Page | null>(null)
  const [save, setSave] = useState<SaveState>('idle')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  const latest = useRef<Page | null>(null)
  const inFlight = useRef<Promise<void> | null>(null)
  const dirty = useRef(false)
  const timer = useRef<number | null>(null)

  // Open today's page if there is one, otherwise a fresh page for today.
  useEffect(() => {
    if (!entries || page) return
    const todays = entries.find((e) => e.date === today() && e.kind === 'free')
    const first = todays ? fromEntry(todays) : blankPage()
    latest.current = first
    setPage(first)
  }, [entries, page])

  const prompt = useMemo(() => QUICK_PROMPTS[new Date().getDate() % QUICK_PROMPTS.length]!, [])

  /** Saves the newest version of the page; edits made meanwhile are saved right after. */
  const flush = useCallback(async (): Promise<void> => {
    if (inFlight.current) {
      await inFlight.current
      if (!dirty.current) return
    }
    const p = latest.current
    if (!p || !hasWriting(p)) return
    dirty.current = false
    setSave('saving')
    const job = (async () => {
      try {
        const { id, attachments, ...draft } = p
        const saved = await window.api.journal.save(id, { ...draft, attachmentIds: attachments.map((a) => a.id) })
        if (latest.current && latest.current.id === null) latest.current = { ...latest.current, id: saved.id }
        setPage((cur) => (cur && cur.id === null ? { ...cur, id: saved.id } : cur))
        setSave('saved')
      } catch (err) {
        dirty.current = true
        setSave('error')
        shell.toast('error', 'This page did not save', err instanceof Error ? err.message : String(err))
      }
    })()
    inFlight.current = job
    await job
    inFlight.current = null
    if (dirty.current) await flush()
  }, [shell])

  const edit = (patch: Partial<Page>): void => {
    setPage((cur) => {
      if (!cur) return cur
      const next = { ...cur, ...patch }
      latest.current = next
      return next
    })
    dirty.current = true
    setSave('idle')
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void flush(), 1200)
  }

  // Leaving the screen saves what is on the page.
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
      if (dirty.current) void flush()
    },
    [flush]
  )

  const open = async (next: Page): Promise<void> => {
    if (timer.current) window.clearTimeout(timer.current)
    if (dirty.current) await flush()
    refetch()
    latest.current = next
    setPage(next)
    setSave('idle')
    setConfirmDelete(false)
    window.scrollTo({ top: 0 })
  }

  const addPhotos = async (): Promise<void> => {
    if (!page) return
    setBusy(true)
    try {
      const added = await window.api.attachments.import(null)
      const photos = added.filter((a) => a.isImage)
      if (photos.length) edit({ attachments: [...(latest.current?.attachments ?? []), ...photos] })
    } catch (err) {
      shell.toast('error', 'The photo was not added', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const removePhoto = (a: Attachment): void => {
    if (a.journalId === null) void window.api.attachments.discard(a.id)
    edit({ attachments: (latest.current?.attachments ?? []).filter((x) => x.id !== a.id) })
  }

  const deletePage = async (): Promise<void> => {
    if (!page) return
    if (timer.current) window.clearTimeout(timer.current)
    dirty.current = false
    setBusy(true)
    try {
      if (page.id !== null) await window.api.journal.remove(page.id)
      refetch()
      const fresh = blankPage()
      latest.current = fresh
      setPage(fresh)
      setConfirmDelete(false)
      setSave('idle')
    } catch (err) {
      shell.toast('error', 'The page was not deleted', err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  if (error) {
    return (
      <div className="k2-page">
        <p className="k2-alert">{error}</p>
        <button className="k2-btn is-quiet mt-4" onClick={refetch}>
          Try again
        </button>
      </div>
    )
  }
  if (!entries || !page) return <div className="k2-page" aria-busy="true" />

  const pages = entries.filter((e) => e.kind !== 'monthly')
  const promptKeys = Object.keys(page.prompts)
  const images = page.attachments.filter((a) => a.isImage)

  return (
    <div className="k2-page is-wide">
      <div className="k2-journal">
        <nav aria-label="Journal pages">
          <button className="k2-btn is-quiet w-full mb-4" onClick={() => void open(blankPage())}>
            <Plus size={16} /> New page
          </button>
          <div className="k2-pages">
            {page.id === null ? (
              <button aria-current="true">
                <b>{shortDate(page.date)}</b>
                <span>{page.title?.trim() || page.body.trim().split('\n')[0] || 'New page'}</span>
              </button>
            ) : null}
            {pages.map((e) => (
              <button key={e.id} aria-current={page.id === e.id ? 'true' : undefined} onClick={() => void open(fromEntry(e))}>
                <b>{shortDate(e.date)}</b>
                <span>{preview(e) || 'Untitled'}</span>
              </button>
            ))}
          </div>
        </nav>

        <article className="k2-paper" aria-label={`Journal page for ${writtenDate(page.date)}`}>
          <header className="k2-paper-head">
            <span className="k2-paper-date">{writtenDate(page.date)}</span>
            <span className="k2-saved" aria-live="polite">
              {save === 'saving' ? 'Saving' : save === 'saved' ? 'Saved' : save === 'error' ? 'Not saved' : ''}
            </span>
          </header>

          <input
            className="k2-paper-title"
            value={page.title ?? ''}
            placeholder="Title, if you like"
            aria-label="Title"
            onChange={(e) => edit({ title: e.target.value || null })}
          />

          {promptKeys.length > 0 ? (
            promptKeys.map((key) => (
              <div key={key}>
                <div className="k2-paper-foot !text-[15px] !text-[var(--k2-granite)] font-semibold">{PROMPT_LABEL.get(key) ?? key}</div>
                <Lines label={PROMPT_LABEL.get(key) ?? key} minRows={2} value={page.prompts[key] ?? ''} onChange={(v) => edit({ prompts: { ...page.prompts, [key]: v } })} />
              </div>
            ))
          ) : null}

          <Lines
            label="Write"
            minRows={promptKeys.length ? 3 : 12}
            value={page.body}
            placeholder={promptKeys.length ? 'Anything else' : prompt}
            onChange={(v) => edit({ body: v })}
          />

          {images.length > 0 ? (
            <div className="k2-prints">
              {images.map((a) => (
                <figure key={a.id} className="k2-print m-0">
                  <img src={a.url} alt={a.caption ?? a.originalName} loading="lazy" />
                  <button aria-label={`Remove ${a.originalName}`} onClick={() => removePhoto(a)}>
                    <X size={14} />
                  </button>
                </figure>
              ))}
            </div>
          ) : null}

          <div className="k2-paper-foot">
            <span>How did today feel?</span>
            {MOODS.map((m) => (
              <button key={m} className="k2-mood" aria-pressed={page.mood === m} onClick={() => edit({ mood: page.mood === m ? null : m })}>
                {MOOD_LABEL[m]}
              </button>
            ))}
          </div>
          <div className="k2-paper-foot mt-1">
            <button className="inline-flex items-center gap-1.5 hover:text-[var(--k2-granite)]" disabled={busy} onClick={() => void addPhotos()}>
              <ImagePlus size={16} /> Add a photo
            </button>
            {page.id !== null ? (
              confirmDelete ? (
                <span className="ml-auto inline-flex items-center gap-3">
                  Delete this page?
                  <button className="text-[var(--k2-alert)] font-semibold" disabled={busy} onClick={() => void deletePage()}>
                    Delete
                  </button>
                  <button className="font-semibold text-[var(--k2-granite)]" onClick={() => setConfirmDelete(false)}>
                    Keep
                  </button>
                </span>
              ) : (
                <button className="ml-auto hover:text-[var(--k2-alert)]" onClick={() => setConfirmDelete(true)}>
                  Delete page
                </button>
              )
            ) : null}
          </div>
        </article>
      </div>
    </div>
  )
}
