import { useState, type FormEvent } from 'react'
import type { AccountUser } from '@shared/types'
import { ContourMountain } from '../Contour'

type Mode = 'sign-in' | 'sign-up'

const clean = (err: unknown): string => (err instanceof Error ? err.message.replace(/^(\w*Error: )/, '') : String(err))

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.6 14.6 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.7l7.9-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.9 6C6.6 42.6 14.6 48 24 48z" />
    </svg>
  )
}

export default function SignIn({ onSignedIn }: { onSignedIn: (user: AccountUser) => void }) {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'email' | 'google' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (kind: 'email' | 'google', fn: () => Promise<AccountUser>): Promise<void> => {
    setBusy(kind)
    setError(null)
    try {
      onSignedIn(await fn())
    } catch (err) {
      setError(clean(err))
    } finally {
      setBusy(null)
    }
  }

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    void run('email', () => (mode === 'sign-up' ? window.api.account.signUp(name, email, password) : window.api.account.signIn(email, password)))
  }

  return (
    <main className="k2-page !max-w-[440px] !pt-12">
      <div className="k2-mark !text-[22px] justify-center">
        <span className="k2-blaze" aria-hidden="true" />
        Khatwa
      </div>
      <div className="mt-6 -mx-6">
        <ContourMountain seed={7} title="" waypoints={[{ title: '', done: true }, { title: '', done: true }, { title: '', done: false }]} compact />
      </div>
      <h1 className="k2-title !text-[30px] text-center mt-4">{mode === 'sign-up' ? 'Start your climb' : 'Welcome back'}</h1>
      <p className="k2-lede text-center">Big goals, one small step at a time.</p>

      <div className="flex flex-col gap-4 mt-8">
        <button className="k2-btn is-quiet w-full" disabled={busy !== null} onClick={() => void run('google', () => window.api.account.signInWithGoogle())}>
          <GoogleMark />
          {busy === 'google' ? 'Opening Google' : 'Continue with Google'}
        </button>
        <div className="k2-small text-center">or with email</div>
        <form className="flex flex-col gap-4" onSubmit={submit}>
          {mode === 'sign-up' ? (
            <label className="k2-field">
              Name
              <input className="k2-input" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            </label>
          ) : null}
          <label className="k2-field">
            Email
            <input className="k2-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="k2-field">
            Password
            <input
              className="k2-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              minLength={mode === 'sign-up' ? 8 : undefined}
              required
            />
          </label>
          {error ? <p className="k2-alert m-0">{error}</p> : null}
          <button type="submit" className="k2-btn w-full" disabled={busy !== null}>
            {busy === 'email' ? (mode === 'sign-up' ? 'Creating account' : 'Signing in') : mode === 'sign-up' ? 'Create account' : 'Sign in'}
          </button>
        </form>
        <p className="k2-small text-center m-0">
          {mode === 'sign-up' ? 'Already have an account? ' : 'New to Khatwa? '}
          <button
            className="k2-link"
            onClick={() => {
              setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up')
              setError(null)
            }}
          >
            {mode === 'sign-up' ? 'Sign in' : 'Create an account'}
          </button>
        </p>
        <p className="k2-small text-center m-0">
          <a className="k2-link" href="/classic">
            Use the classic design
          </a>
        </p>
      </div>
    </main>
  )
}
