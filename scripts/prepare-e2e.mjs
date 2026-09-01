import { execFileSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { resolve, sep } from 'node:path'

const workspace = resolve(import.meta.dirname, '..')
const stateDirectory = resolve(workspace, '.wrangler', 'state', 'e2e')
if (!stateDirectory.startsWith(`${workspace}${sep}`)) throw new Error('E2E state path escaped workspace')
rmSync(stateDirectory, { recursive: true, force: true })

const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx'
execFileSync(executable, [
  'wrangler', 'd1', 'migrations', 'apply', 'social-studio-e2e-db',
  '--local', '--persist-to', stateDirectory, '--config', 'wrangler.e2e.jsonc',
], { cwd: workspace, stdio: 'inherit', shell: process.platform === 'win32' })
