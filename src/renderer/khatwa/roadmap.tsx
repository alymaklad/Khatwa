import { ArrowUpRight, Check, Flag, Search } from 'lucide-react'
import type { GoalResource, LocalDate, RoadmapStage } from '@shared/types'
import { dayMonth, plural, today } from '../lib/khatwa'
import { Stamp } from './ui'

/** Where today falls against a stage: behind us, under way, or still ahead. */
function stateOf(stage: RoadmapStage, now: LocalDate): 'done' | 'current' | 'ahead' {
  if (now > stage.endDate) return 'done'
  if (now >= stage.startDate) return 'current'
  return 'ahead'
}

function host(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

function ResourceLine({ r }: { r: GoalResource }) {
  return (
    <li className="flex items-start gap-2.5 min-w-0">
      <span className="w-6 h-6 rounded-md grid place-items-center bg-[var(--docket)] text-ink-3 shrink-0 mt-px">
        {r.url ? <ArrowUpRight size={13} /> : <Search size={12} />}
      </span>
      <span className="flex flex-col min-w-0">
        {r.url ? (
          <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-[14px] font-semibold leading-5 text-laurel hover:underline [overflow-wrap:anywhere]">
            {r.title}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ) : (
          <span className="text-[14px] font-semibold leading-5">{r.title}</span>
        )}
        <span className="t-caption [text-wrap:pretty]">
          {r.url ? <span className="text-ink-4">{host(r.url)} · </span> : <span className="text-ink-4">Search for it · </span>}
          {r.note}
        </span>
      </span>
    </li>
  )
}

/**
 * The plan as a route: stages in order, each with what it covers, the concrete steps, how
 * to tell it is done, and the links to use. Every link was opened and judged on topic before
 * being shown; a resource without a verified link says what to search for instead.
 */
export function Roadmap({ stages, now = today() }: { stages: RoadmapStage[]; now?: LocalDate }) {
  if (stages.length === 0) return null
  return (
    <ol className="relative m-0 p-0 list-none flex flex-col gap-4" aria-label="Roadmap">
      <span className="absolute left-[17px] top-5 bottom-5 w-px bg-[var(--rule)]" aria-hidden="true" />
      {stages.map((stage, i) => {
        const state = stateOf(stage, now)
        return (
          <li key={i} className="relative flex gap-4">
            <span className="relative z-10 py-1">
              <span
                className={`w-[35px] h-[35px] rounded-full grid place-items-center font-serif text-[13px] ${
                  state === 'done'
                    ? 'bg-[var(--laurel)] text-[var(--on-solid)]'
                    : state === 'current'
                      ? 'bg-[var(--ochre-deep)] text-[var(--on-solid)]'
                      : 'bg-[var(--sheet)] border border-[var(--rule)] text-ink-3'
                }`}
                aria-hidden="true"
              >
                {state === 'done' ? <Check size={15} /> : String(i + 1).padStart(2, '0')}
              </span>
            </span>
            <article
              className={`flex-1 min-w-0 rounded-[12px] p-5 flex flex-col gap-3 ${state === 'current' ? 'kh-card ring-1 ring-[var(--ochre-tint)]' : 'bg-[var(--card)] border border-[var(--rule-soft)]'}`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="t-stamp !text-[10.5px] text-ink-4">Stage {i + 1}</span>
                <span className="t-stamp !text-[10.5px] text-ink-3">
                  {dayMonth(stage.startDate)} – {dayMonth(stage.endDate)}
                </span>
                {state === 'current' ? <Stamp tone="ochre-solid" className="!text-[10px]">You are here</Stamp> : null}
                {state === 'done' ? <Stamp tone="laurel" className="!text-[10px]">Behind you</Stamp> : null}
              </header>
              <h3 className="font-serif text-[21px] leading-7 m-0 [text-wrap:balance]">{stage.title}</h3>
              {stage.details ? <p className="m-0 text-[14.5px] leading-[23px] text-ink-2 [text-wrap:pretty]">{stage.details}</p> : null}

              {stage.steps.length ? (
                <div className="flex flex-col gap-1.5">
                  <span className="t-stamp !text-[10px] text-ink-4">{plural(stage.steps.length, 'step')}</span>
                  <ol className="m-0 pl-5 list-decimal flex flex-col gap-1 text-[14px] leading-[21px] marker:text-ink-4">
                    {stage.steps.map((step, j) => (
                      <li key={j} className="pl-1 [text-wrap:pretty]">
                        {step}
                      </li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {stage.outcome ? (
                <div className="kh-docket px-3.5 py-2.5 flex items-start gap-2.5 text-[13.5px] leading-[20px]">
                  <Flag size={14} className="mt-[3px] shrink-0 text-[var(--ochre-deep)]" />
                  <span className="[text-wrap:pretty]">
                    <b className="font-semibold">Done when</b> {stage.outcome}
                  </span>
                </div>
              ) : null}

              {stage.resources.length ? (
                <div className="flex flex-col gap-2 pt-1">
                  <span className="t-stamp !text-[10px] text-ink-4">Use for this stage</span>
                  <ul className="m-0 p-0 list-none flex flex-col gap-2.5">
                    {stage.resources.map((r, j) => (
                      <ResourceLine key={j} r={r} />
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          </li>
        )
      })}
    </ol>
  )
}
