import { ref } from 'vue'
import type { SignInOptions } from '@/composables/useAuth'

// Kept apart from useAuth so the app shell can show the chooser without loading sign-in.
/** The pending sign-in while the login chooser is open; null when closed. */
export const signInChoice = ref<SignInOptions | null>(null)
