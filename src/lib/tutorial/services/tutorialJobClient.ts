// The job surfaces inside a tutorial talk to the session's fixtures, never to
// the realm the portal signed into. The interceptor answers before this client
// is ever used to build a URL.
import type { JobClient } from '@/composables/useJobs'

export const tutorialJobClient: JobClient = () => ({ baseUrl: '/api/v1', token: 'tutorial' })
