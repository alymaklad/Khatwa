/**
 * Fills an account with six months of sample data, so the app can be seen the way it looks
 * after real use: three mountains (one reached), their habits with most past sessions done,
 * milestones reached along the way, journal pages with photos, a habit being let go, and
 * today's to-dos.
 *
 *   npm run seed:demo
 *     The local development database (PGlite), as used by `npm run dev -- --dev-user`.
 *     Stop the dev server first: PGlite allows one process at a time.
 *
 *   npm run dev:demo
 *     Runs the app on its own local demo database, filled by this script on the first run
 *     (`--demo`). Your own local data is left alone.
 *
 *   npm run seed:demo -- --live --email demo@example.com
 *     One account on the live site's database. Pull the production environment first with
 *     `npx vercel env pull .env.production.local --environment=production`; the script reads
 *     it from there. Create the account on the site and sign in once, so it exists. The
 *     script only fills an EMPTY account and refuses one that already has habits, mountains
 *     or journal pages, so it can never mix sample data into someone's real data.
 *
 * It writes through the app's own services, replaying each day with that day's date, so
 * streaks, points and achievements come out exactly as if they had been earned.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'
import type { GoalPlan, GoalView, JournalDraft, LocalDate, Mood } from '../src/shared/types'
import type { Connection } from '../src/server/http/database'

const root = resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const live = args.includes('--live')
const demo = args.includes('--demo')
const localDir = demo ? '.data/pglite-demo' : '.data/pglite'
const email = live ? (args[args.indexOf('--email') + 1] ?? '').trim() : ''

if (live) {
  if (!email || email.startsWith('--')) {
    console.error('Name the account to fill: npm run seed:demo -- --live --email demo@example.com')
    process.exit(1)
  }
  const file = resolve(root, '.env.production.local')
  if (!existsSync(file)) {
    console.error('No .env.production.local. Pull it first: npx vercel env pull .env.production.local --environment=production')
    process.exit(1)
  }
  process.loadEnvFile(file)
  if (!process.env.DATABASE_URL && !process.env.DATABASE_URL_UNPOOLED) {
    console.error('.env.production.local has no DATABASE_URL. Pull the production environment again.')
    process.exit(1)
  }
} else {
  for (const file of ['.env.local', '.env']) {
    if (existsSync(resolve(root, file))) process.loadEnvFile(resolve(root, file))
  }
  if (!demo && (process.env.DATABASE_URL || process.env.DATABASE_URL_UNPOOLED)) {
    console.error('DATABASE_URL is set. Without --live this script only seeds the local database; unset it and run again.')
    process.exit(1)
  }
}

const { setDriverFactory, withAccount, withSchema } = await import('../src/server/http/database')
const { createContext } = await import('../src/server/context')
const { addDays, todayIn } = await import('../src/server/domain/time')
const { expand } = await import('../src/server/domain/recurrence')
const { blobConfigured } = await import('../src/server/platform/attachmentStore')

/** The local database, opened only when seeding locally. */
let pg: { close(): Promise<void> } | null = null
if (!live) {
  const { PGlite } = await import('@electric-sql/pglite')
  mkdirSync(resolve(root, '.data'), { recursive: true })
  const local = new PGlite(resolve(root, localDir), { parsers: { 20: Number, 1700: Number } })
  pg = local
  setDriverFactory(async () => ({
    query: async (text, params) => {
      const r = await local.query<Record<string, unknown>>(text, params)
      return { rows: r.rows, rowCount: r.affectedRows ?? r.rows.length }
    },
    exec: async (text) => void (await local.exec(text)),
    close: async () => undefined
  }))
}

/** Runs `fn` on the account being filled: the local dev user, or the live account named by email. */
async function withTarget(fn: (c: Connection) => Promise<void>): Promise<void> {
  if (!live) return withAccount({ id: 'local', email: 'local@localhost' }, fn)
  const { databaseUrl, neonDriver } = await import('../src/server/persistence/neon')
  const driver = await neonDriver(databaseUrl())
  let schema: string | null = null
  try {
    const r = await driver.query('SELECT schema_name FROM public.khatwa_account WHERE lower(email) = lower($1)', [email])
    schema = r.rows[0] ? String(r.rows[0].schema_name) : null
  } finally {
    await driver.close()
  }
  if (!schema) {
    console.error(`No account for ${email} on the live site. Create it there and sign in once, then run this again.`)
    process.exit(1)
  }
  console.log(`Filling ${email} on the live site.`)
  return withSchema(schema, fn)
}

/** Stores a photo where the app will look for it: Vercel Blob in production, else on disk. */
async function storePhoto(schema: string, storedName: string, body: Buffer): Promise<void> {
  if (blobConfigured()) {
    const { put } = await import('@vercel/blob')
    await put(`${schema}/${storedName}`, body, { access: 'private', contentType: 'image/png', addRandomSuffix: false })
    return
  }
  const folder = join(root, '.data', 'attachments', schema)
  mkdirSync(folder, { recursive: true })
  writeFileSync(join(folder, storedName), body)
}

// ------------------------------------------------------------------ helpers

/** Deterministic randomness, so every run makes the same history. */
let state = 20261014
function random(): number {
  state = (state * 1103515245 + 12345) % 2147483648
  return state / 2147483648
}

/** A moment on a local date, in this machine's timezone. */
const at = (date: LocalDate, time = '20:00'): Date => new Date(`${date}T${time}:00`)

/** A small PNG, drawn pixel by pixel: no image library needed. */
function png(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y)
      const o = y * (width * 3 + 1) + 1 + x * 3
      raw[o] = r
      raw[o + 1] = g
      raw[o + 2] = b
    }
  }
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body) >>> 0)
    return Buffer.concat([len, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
}

type Rgb = [number, number, number]
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as Rgb

/** A snapshot of a landscape: sky, a sun, two ridges and something in the foreground. */
function scene(sky: [Rgb, Rgb], sun: { x: number; y: number; c: Rgb }, far: Rgb, near: Rgb, ground: Rgb, seed: number): Buffer {
  const S = 360
  const ridge = (x: number, base: number, amp: number, f: number): number =>
    base - amp * (Math.sin(x * f + seed) * 0.6 + Math.sin(x * f * 2.3 + seed * 2) * 0.3 + Math.sin(x * f * 5.1 + seed) * 0.1)
  return png(S, S, (x, y) => {
    if (y > ridge(x, 300, 14, 0.02)) return mix(ground, [0, 0, 0], ((y - 280) / 160) * 0.35)
    if (y > ridge(x, 230, 50, 0.017)) return near
    if (y > ridge(x, 175, 60, 0.011)) return far
    const d = Math.hypot(x - sun.x, y - sun.y)
    if (d < 24) return sun.c
    return mix(mix(sky[0], sky[1], y / 230), sun.c, Math.max(0, 0.35 - d / 400))
  })
}

const PHOTOS: { name: string; data: () => Buffer }[] = [
  { name: 'morning-run.png', data: () => scene([[120, 170, 210], [250, 214, 165]], { x: 250, y: 150, c: [255, 236, 190] }, [98, 120, 140], [58, 84, 92], [86, 120, 74], 1) },
  { name: 'river-walk.png', data: () => scene([[150, 196, 222], [222, 236, 240]], { x: 90, y: 70, c: [255, 250, 230] }, [140, 160, 176], [84, 110, 104], [70, 120, 150], 2) },
  { name: 'sunset-hills.png', data: () => scene([[64, 72, 120], [244, 150, 102]], { x: 180, y: 200, c: [255, 200, 120] }, [96, 82, 112], [52, 46, 72], [40, 50, 50], 3) },
  { name: 'race-course.png', data: () => scene([[176, 210, 232], [236, 244, 246]], { x: 300, y: 60, c: [255, 252, 236] }, [160, 178, 186], [104, 140, 100], [196, 170, 120], 4) }
]

// ------------------------------------------------------------------ the story

const today = todayIn(Intl.DateTimeFormat().resolvedOptions().timeZone)
const d = (n: number): LocalDate => addDays(today, n)

type Mountain = {
  title: string
  description: string
  startedDaysAgo: number
  targetIn: number
  weeklyMinutes: number
  plan: GoalPlan
  /** How reliably the habits were kept, from the first week to now. */
  keep: [number, number]
  /** Reached on this day, relative to today. */
  summitedDaysAgo?: number
}

const link = (title: string, type: string, note: string, url: string | null) => ({ title, type, note, url })

const MOUNTAINS: Mountain[] = [
  {
    title: 'Run a half marathon',
    description: 'Finish the city half marathon in the spring, running the whole way.',
    startedDaysAgo: 160,
    targetIn: 70,
    weeklyMinutes: 180,
    keep: [0.55, 0.88],
    plan: {
      summary: 'Build from walk-runs to 21 km over seven months, with one long run a week.',
      sessions: [
        { name: 'Easy run', days: [2, 4], scheduledTime: '07:00', targetMinutes: 35, rationale: 'Easy pace builds the base without injury.' },
        { name: 'Strength and mobility', days: [1, 3], scheduledTime: '18:30', targetMinutes: 20, rationale: 'Strong hips and calves keep the knees safe.' },
        { name: 'Long run', days: [6], scheduledTime: '08:00', targetMinutes: 70, rationale: 'The long run is where the distance comes from.' }
      ],
      milestones: [
        { title: 'Run 5 km without stopping', dueDate: d(-128), description: null },
        { title: 'First 10 km', dueDate: d(-82), description: null },
        { title: 'Sign up for the race', dueDate: d(-45), description: null },
        { title: 'Run 15 km', dueDate: d(12), description: null },
        { title: 'Race day: 21.1 km', dueDate: d(70), description: null }
      ],
      roadmap: [
        {
          title: 'Stage 1 - From walking to running',
          startDate: d(-160),
          endDate: d(-110),
          details: 'Alternate walking and running until 30 minutes of running feels easy.',
          steps: ['Walk-run three times a week', 'Add one minute of running each week', 'Stretch calves and hips after each run'],
          outcome: 'You run 5 km without walking.',
          resources: [link('Couch to 5K', 'programme', 'Nine weeks of walk-run sessions', 'https://www.nhs.uk/live-well/exercise/running-and-aerobic-exercises/get-running-with-couch-to-5k/')]
        },
        {
          title: 'Stage 2 - Building the base',
          startDate: d(-109),
          endDate: d(-40),
          details: 'Raise weekly distance slowly, never more than ten percent a week.',
          steps: ['Two easy runs and one long run a week', 'Strength work twice a week', 'Grow the long run to 10 km'],
          outcome: 'You finish a 10 km run feeling you could keep going.',
          resources: [link('Hal Higdon novice half marathon plan', 'plan', 'A gentle 12-week schedule', 'https://www.halhigdon.com/training-programs/half-marathon-training/novice-1-half-marathon/')]
        },
        {
          title: 'Stage 3 - Going long',
          startDate: d(-39),
          endDate: d(30),
          details: 'The long run grows towards 18 km; practise fuelling and race pace.',
          steps: ['Long run up to 18 km', 'One run a week at race pace', 'Try race-day breakfast and gels on long runs'],
          outcome: 'You run 15 km at a steady pace.',
          resources: [link('Running pace calculator', 'tool', 'Find your easy and race paces', 'https://www.runnersworld.com/uk/training/a761681/rws-race-time-predictor/')]
        },
        {
          title: 'Stage 4 - Taper and race',
          startDate: d(31),
          endDate: d(70),
          details: 'Cut the distance back so you reach the start line rested.',
          steps: ['Halve the long run in the last two weeks', 'Lay out race kit the night before', 'Start slower than feels right'],
          outcome: 'You cross the finish line.',
          resources: []
        }
      ],
      mindMap: [],
      resources: [
        link('Couch to 5K', 'programme', 'Where it started', 'https://www.nhs.uk/live-well/exercise/running-and-aerobic-exercises/get-running-with-couch-to-5k/'),
        link('Hal Higdon training plans', 'plan', 'The main schedule', 'https://www.halhigdon.com/training-programs/half-marathon-training/')
      ]
    }
  },
  {
    title: 'Hold a conversation in Spanish',
    description: 'Talk with a native speaker for 30 minutes without switching to English.',
    startedDaysAgo: 105,
    targetIn: 150,
    weeklyMinutes: 150,
    keep: [0.6, 0.8],
    plan: {
      summary: 'Daily vocabulary, a weekly podcast and two conversation sessions a week.',
      sessions: [
        { name: 'Spanish vocabulary', days: [1, 2, 3, 4, 5, 6, 7], scheduledTime: '08:15', targetMinutes: 15, rationale: 'Little and often is how words stick.' },
        { name: 'Conversation practice', days: [2, 5], scheduledTime: '19:30', targetMinutes: 30, rationale: 'Speaking is the skill being trained.' },
        { name: 'Spanish podcast', days: [7], scheduledTime: '10:00', targetMinutes: 30, rationale: 'Listening to real speech at natural speed.' }
      ],
      milestones: [
        { title: 'Introduce yourself', dueDate: d(-75), description: null },
        { title: 'Order a meal in Spanish', dueDate: d(-28), description: null },
        { title: '10-minute conversation', dueDate: d(20), description: null },
        { title: 'Watch a film without subtitles', dueDate: d(90), description: null },
        { title: '30-minute conversation with a tutor', dueDate: d(150), description: null }
      ],
      roadmap: [
        {
          title: 'Stage 1 - Sounds and survival phrases',
          startDate: d(-105),
          endDate: d(-50),
          details: 'Get the sounds right and learn the phrases you need on day one.',
          steps: ['Language Transfer, tracks 1 to 40', 'The 300 most common words', 'Say your introduction out loud daily'],
          outcome: 'You can introduce yourself and ask simple questions.',
          resources: [link('Language Transfer: Complete Spanish', 'course', 'Free audio course', 'https://www.languagetransfer.org/complete-spanish')]
        },
        {
          title: 'Stage 2 - Everyday situations',
          startDate: d(-49),
          endDate: d(40),
          details: 'Practise the conversations of daily life: food, directions, plans.',
          steps: ['Two tutor sessions a week', 'Coffee Break Spanish, season 1', 'Keep a list of phrases you were missing'],
          outcome: 'You hold a 10-minute conversation about your day.',
          resources: [
            link('Coffee Break Spanish', 'podcast', 'Short lessons for beginners', 'https://coffeebreaklanguages.com/coffeebreakspanish/'),
            link('italki', 'practice site', 'Find a conversation tutor', 'https://www.italki.com/')
          ]
        },
        {
          title: 'Stage 3 - Real speed',
          startDate: d(41),
          endDate: d(150),
          details: 'Move to native-speed audio and longer conversations.',
          steps: ['Films with Spanish subtitles, then none', 'One 30-minute conversation a week', 'Read one short book'],
          outcome: 'Thirty minutes with a native speaker, no English.',
          resources: []
        }
      ],
      mindMap: [],
      resources: [link('Language Transfer', 'course', 'The core course', 'https://www.languagetransfer.org/')]
    }
  },
  {
    title: 'Build a calm morning routine',
    description: 'Start each day with ten quiet minutes before the phone.',
    startedDaysAgo: 175,
    targetIn: -40,
    weeklyMinutes: 70,
    keep: [0.5, 0.92],
    summitedDaysAgo: 48,
    plan: {
      summary: 'A short, fixed morning practice, repeated until it runs on its own.',
      sessions: [{ name: 'Morning pages', days: [1, 2, 3, 4, 5, 6, 7], scheduledTime: '06:45', targetMinutes: 10, rationale: 'Writing first thing clears the head.' }],
      milestones: [
        { title: 'One full week', dueDate: d(-160), description: null },
        { title: 'Phone stays out of the bedroom', dueDate: d(-120), description: null },
        { title: 'Thirty mornings in a row', dueDate: d(-60), description: null }
      ],
      roadmap: [],
      mindMap: [],
      resources: []
    }
  }
]

const PAGES: { day: number; title: string | null; body: string; mood: Mood; photo?: number; goal?: number }[] = [
  { day: -170, title: 'Starting small', body: 'First morning pages. Ten minutes felt long. Wrote about nothing in particular and still felt lighter after.', mood: 'okay' },
  { day: -158, title: 'The first run', body: 'Ran for one minute, walked for ninety seconds, eight times. Legs heavy, lungs on fire, but I finished the session.', mood: 'good', goal: 0 },
  { day: -141, title: null, body: 'Missed two mornings this week. Picked it back up today. Not breaking the chain twice is the rule now.', mood: 'low' },
  { day: -129, title: 'Five kilometres!', body: 'Ran the whole loop around the park without stopping. Thirty-four minutes. Sat on the bench afterwards and grinned at nobody.', mood: 'good', photo: 0, goal: 0 },
  { day: -110, title: null, body: 'Rain all week. Did the strength sessions indoors and skipped one run. Still counts as a decent week.', mood: 'okay' },
  { day: -104, title: 'Hola', body: 'Started Spanish today. Language Transfer is strange and good: the teacher makes you build sentences before you know any words.', mood: 'good', goal: 1 },
  { day: -96, title: null, body: 'Work deadline. Slept badly, skipped the long run. Wrote anyway, which helped more than I expected.', mood: 'stressed' },
  { day: -83, title: 'Ten kilometres', body: 'Long run went past 10 km for the first time. The last two were slow but steady. Walked home along the river.', mood: 'good', photo: 1, goal: 0 },
  { day: -76, title: 'Me llamo…', body: 'Introduced myself to my tutor without notes. She said my accent is better than I think it is.', mood: 'good', goal: 1 },
  { day: -64, title: null, body: 'Thirty mornings in a row. The routine doesn’t need willpower any more; it just happens before I think about it.', mood: 'good' },
  { day: -57, title: null, body: 'Tired week. Cut every session short and that was the right call.', mood: 'exhausted' },
  { day: -46, title: 'Signed up', body: 'Paid for the race. Now it is real. A bit scared, mostly excited.', mood: 'good', goal: 0 },
  { day: -39, title: 'Hills', body: 'Tried the hill route for the long run. Evening light over the ridge was worth every step uphill.', mood: 'good', photo: 2 },
  { day: -29, title: 'Tapas, in Spanish', body: 'Ordered for the whole table in Spanish. The waiter answered in Spanish too, which was the best part.', mood: 'good', goal: 1 },
  { day: -21, title: null, body: 'Knee felt tight after the long run. Iced it, swapped the next easy run for a walk.', mood: 'low' },
  { day: -15, title: null, body: 'Knee is fine. Back to normal. Learned that resting early beats resting long.', mood: 'okay' },
  { day: -9, title: 'Course recce', body: 'Ran the first eight kilometres of the race route. Flatter than I feared.', mood: 'good', photo: 3, goal: 0 },
  { day: -5, title: null, body: 'Conversation practice ran over by twenty minutes because we were actually talking, not practising.', mood: 'good' },
  { day: -2, title: null, body: 'Long week at work. Did the minimum on every habit. The minimum still counts.', mood: 'stressed' },
  { day: -1, title: 'Fourteen', body: 'Fourteen kilometres on the long run, the furthest yet. Fifteen next week and the milestone is done.', mood: 'good', goal: 0 }
]

// ------------------------------------------------------------------ run

await withTarget(async (c) => {
  const ctx = createContext({ db: c.db, schema: c.schema })

  // A live account must be empty: sample data is never mixed into real use.
  if (live && ((await ctx.habits.list()).length || (await ctx.goals.list()).length || (await ctx.repos.journal.list()).length)) {
    console.error(`${email} already has habits, mountains or journal pages. Use a new, empty account for the demo.`)
    process.exitCode = 1
    return
  }

  if ((await ctx.goals.list()).some((g) => g.title === MOUNTAINS[0]!.title)) {
    console.log('The sample data is already there. Nothing was added.')
    return
  }

  const made: GoalView[] = []
  for (const m of MOUNTAINS) {
    const start = d(-m.startedDaysAgo)
    // Planned on the day it began, so a target that has since passed was still ahead then.
    const goal = await ctx.goals.commit(
      { title: m.title, description: m.description, targetDate: d(m.targetIn), weeklyMinutesBudget: m.weeklyMinutes },
      m.plan,
      at(start, '09:00')
    )
    made.push(goal)
    console.log(`Mountain: ${m.title}`)

    // Replay every day since it began: most sessions done, more of them as the habit settles.
    const lastDay = m.summitedDaysAgo ? d(-m.summitedDaysAgo) : today
    const habits = (await ctx.habits.list()).filter((h) => h.goalId === goal.id)
    for (const h of habits) {
      for (const date of expand(h.recurrence, start, lastDay)) {
        await ctx.repos.occurrences.ensure(h.id, date, h.scheduledTime, h.targetMinutes)
        const occ = await ctx.repos.occurrences.getByHabitDate(h.id, date)
        if (!occ) continue
        // Today: only what was due before now is done.
        if (date === today && h.scheduledTime > new Date().toTimeString().slice(0, 5)) continue
        const t = (Date.parse(date) - Date.parse(start)) / 864e5 / m.startedDaysAgo
        const keep = m.keep[0] + (m.keep[1] - m.keep[0]) * Math.max(0, Math.min(1, t))
        if (random() > keep) continue
        await ctx.habits.setCompleted(occ.id, true, at(date, h.scheduledTime))
      }
    }

    // Milestones reached on their day.
    const view = (await ctx.goals.get(goal.id))!
    for (const ms of view.milestones) {
      if (ms.date && ms.date < today) await ctx.todos.setDone(ms.id, true, at(ms.date, '19:00'))
    }
    if (m.summitedDaysAgo) await ctx.goals.close(goal.id, 'achieved', at(d(-m.summitedDaysAgo), '20:00'))
  }

  // Journal pages, some with a photo taped in.
  for (const p of PAGES) {
    let attachmentIds: number[] | undefined
    if (p.photo !== undefined) {
      const photo = PHOTOS[p.photo]!
      const storedName = `${randomUUID()}.png`
      await storePhoto(c.schema, storedName, photo.data())
      const [a] = await ctx.reflect.registerAttachments([{ storedName, originalName: photo.name }])
      attachmentIds = a ? [a.id] : undefined
    }
    const draft: JournalDraft = {
      date: d(p.day),
      kind: 'free',
      title: p.title,
      body: p.body,
      mood: p.mood,
      stepToward: null,
      prompts: {},
      tags: [],
      goalId: p.goal === undefined ? null : made[p.goal]!.id,
      letGoId: null,
      attachmentIds
    }
    await ctx.reflect.journalSave(null, draft)
  }
  console.log(`Journal: ${PAGES.length} pages`)

  // Last month's memory page.
  const lastMonth = d(-new Date().getDate()).slice(0, 7)
  await ctx.reflect.journalSave(null, {
    date: `${lastMonth}-01`,
    kind: 'monthly',
    title: null,
    body: '',
    mood: null,
    stepToward: null,
    prompts: {
      proud: 'Signed up for the race and ordered a whole meal in Spanish.',
      learned: 'Resting early beats resting long.',
      difficult: 'The work deadline week, when everything shrank to the minimum.',
      next: 'Fifteen kilometres, and a ten-minute conversation.'
    },
    tags: [],
    goalId: null,
    letGoId: null
  })

  // A habit being let go, with a check-in most evenings.
  const letGo = await ctx.reflect.letGoCreate({
    title: 'Scrolling in bed',
    triggerContexts: ['before_sleep', 'boredom'],
    triggerNotes: 'Picking up the phone “just to check” and losing an hour.',
    replacement: 'Read a few pages of a book instead',
    goalId: made[2]!.id,
    weight: 'medium',
    startedOn: d(-60)
  })
  for (let n = -60; n <= -1; n++) {
    if (random() < 0.15) continue
    const resisted = random() < 0.55 + ((n + 60) / 60) * 0.35
    await ctx.reflect.checkIn(
      letGo.id,
      d(n),
      { resisted, feelings: resisted ? [] : [random() < 0.5 ? 'tired' : 'bored'], trigger: null, need: null, alternative: null, note: null },
      at(d(n), '23:00')
    )
  }
  console.log('Let go: Scrolling in bed')

  // Today's to-dos.
  for (const title of ['Book a sports massage', 'Buy new running socks', 'Message the tutor about Friday']) {
    await ctx.todos.addManual(title, today, new Date())
  }
  await ctx.schedule.expandHorizon()
  await ctx.engine.rebuildAll()
  console.log(live ? `Done. Sign in as ${email} on the live site to see it.` : demo ? 'Done.' : 'Done. Start the dev server and open http://localhost:5173')
})

await pg?.close()
