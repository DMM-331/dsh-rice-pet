// Builds every artifact of the plugin into lib/:
//   index.js      – node half (ESM), loaded by the DSH host
//   client.js     – in-app browser half, wrapped in the DSH web loader handoff
//                   window.__ModuleLoader__.load({ id, factory: (require) => module.exports })
//   overlay.js/.html – desktop overlay page (macOS), served to the native helper
//   whale-overlay – native helper (macOS only; skipped when swiftc is unavailable)
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readFile } from 'node:fs/promises'

process.chdir(new URL('..', import.meta.url).pathname)   // repo root
const pkg = JSON.parse(await readFile('package.json', 'utf8'))
const id = pkg.name
await mkdir('lib', { recursive: true })

await build({
  entryPoints: ['src/host/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: ['@deepseek-ai/*'],
})

const browser = { bundle: true, platform: 'browser', target: 'es2022', loader: { '.css': 'text' } }

await build({
  ...browser,
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  format: 'cjs',
  sourcemap: 'inline',
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(id)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports; } });' },
})

await build({ ...browser, entryPoints: ['src/overlay/main.ts'], outfile: 'lib/overlay.js', format: 'iife' })
await copyFile('src/overlay/overlay.html', 'lib/overlay.html')

if (process.platform === 'darwin') {
  try {
    execFileSync('swiftc', ['-O', '-swift-version', '5', 'native/macos/WhaleOverlay.swift', '-o', 'lib/whale-overlay'], { stdio: 'inherit' })
  } catch {
    console.warn('swiftc unavailable: skipping the desktop overlay helper (the whale stays inside the DSH window)')
  }
}

console.log('built lib/')
