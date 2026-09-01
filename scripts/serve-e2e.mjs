import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const workspace = resolve(import.meta.dirname, '..')
const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const child = spawn(executable, [
  'wrangler', 'dev', '--config', 'wrangler.e2e.jsonc', '--port', '8791',
  '--persist-to', resolve(workspace, '.wrangler', 'state', 'e2e'),
], { cwd: workspace, stdio: 'inherit', shell: process.platform === 'win32' })

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
child.on('exit', (code) => process.exit(code ?? 0))
