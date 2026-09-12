import { defineConfig } from 'tsup'

export default defineConfig({
  entry: { index: 'src/index.ts', envelope: 'src/envelope.ts', 'worker/index': 'src/worker/index.ts', 'client/index': 'src/client/index.ts' },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
  external: ['cloudflare:workers'],
})
