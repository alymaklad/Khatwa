import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/newsreader/opsz-italic.css'
import '@fontsource-variable/plus-jakarta-sans/wght.css'
// Installs window.api before any screen asks for data.
import './lib/webApi'
import App from './App'
import './styles.css'

// The new design lives under /new; everything else is the classic app.
const V2App = lazy(() => import('./v2/V2App'))
const isNew = window.location.pathname === '/new' || window.location.pathname.startsWith('/new/')

const el = document.getElementById('root')
if (!el) throw new Error('root element missing')

createRoot(el).render(
  <StrictMode>
    {isNew ? (
      <Suspense fallback={null}>
        <V2App />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>
)
