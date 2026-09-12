import { createMatchObject } from '../../src/index'
import { matchFetch } from '../../src/worker/index'
import { countAdapter } from './count-adapter'

export class TestMatch extends createMatchObject(countAdapter) {}

export interface Env {
  MATCH: DurableObjectNamespace<TestMatch>
  LAUNCH_TOKEN: string
  CLIENT_ORIGIN: string
  APP_VERSION: string
  TEST_KNOBS?: string
}

export default {
  fetch: (request: Request, env: Env) => matchFetch(request, env, { botsRequireTestKnobs: true }),
} satisfies ExportedHandler<Env>
