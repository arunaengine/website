// Runs before the portal: a desktop sign-in returning through this website is
// handed on without the portal's boot, which reads and writes storage.
import './assets/main.css'
import { handOffDesktop } from './lib/desktopHandoff'
import { handOffPopup } from './lib/popupHandoff'

// zod probes for eval with Function(''), which the node's content security policy reports.
const zodScope = globalThis as { __zod_globalConfig?: Record<string, unknown> }
zodScope.__zod_globalConfig = Object.assign(zodScope.__zod_globalConfig ?? {}, { jitless: true })

if (!handOffDesktop() && !handOffPopup()) void import('./main')
