// Runs before the portal: a desktop sign-in returning through this website is
// handed on without the portal's boot, which reads and writes storage.
import './assets/main.css'
import { handOffDesktop } from './lib/desktopHandoff'
import { handOffPopup } from './lib/popupHandoff'

if (!handOffDesktop() && !handOffPopup()) void import('./main')
