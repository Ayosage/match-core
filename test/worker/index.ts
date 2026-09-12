import { createMatchObject } from '../../src/index'
import { countAdapter } from './count-adapter'

export class TestMatch extends createMatchObject(countAdapter) {}

export interface Env {
  MATCH: DurableObjectNamespace<TestMatch>
  LAUNCH_TOKEN: string
  CLIENT_ORIGIN: string
  APP_VERSION: string
  TEST_KNOBS?: string
}

// Routes arrive in Task 3 (matchFetch). Until then the test worker only hosts the object.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const m = new URL(request.url).pathname.match(/^\/matches\/([A-Z0-9]{1,12})\/ws$/)
    if (m) return env.MATCH.getByName(m[1]!).fetch(request)
    return new Response('not found', { status: 404 })
  },
} satisfies ExportedHandler<Env>
