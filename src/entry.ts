// Runs before the portal: a desktop sign-in returning through this website is
// handed on without the portal's boot, which reads and writes storage.
import './assets/main.css'
import { handOffDesktop } from './lib/desktopHandoff'

if (!handOffDesktop()) void import('./main')
