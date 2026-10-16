import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/newsreader/opsz-italic.css'
import '@fontsource-variable/plus-jakarta-sans/wght.css'
// Installs window.api before any screen asks for data.
import './lib/webApi'
// Tailwind first: it fixes the cascade-layer order the new design's styles slot into.
import './styles.css'
import V2App from './v2/V2App'

// The new design is the app. The classic design is kept, as it was, at /classic.
const ClassicApp = lazy(() => import('./App'))
const { pathname, search } = window.location
const isClassic = pathname === '/classic' || pathname.startsWith('/classic/')

// Addresses from when the new design lived under /new open the same screen.
if (pathname === '/new' || pathname.startsWith('/new/')) {
  window.history.replaceState(null, '', `${pathname.slice(4) || '/'}${search}`)
}

const el = document.getElementById('root')
if (!el) throw new Error('root element missing')

createRoot(el).render(
  <StrictMode>
    {isClassic ? (
      <Suspense fallback={null}>
        <ClassicApp />
      </Suspense>
    ) : (
      <V2App />
    )}
  </StrictMode>
)
