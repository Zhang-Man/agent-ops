#!/usr/bin/env node
/**
 * Install every agent-ops plugin into a dsh profile from source.
 *
 * For each bundle package under packages/ (package.json carries
 * "dsh.bundle.patch"): `dsh plugin --profile <name> add link:<absolute path>`
 * — the same official flow a user runs by hand per package.
 *
 * Compatibility guard: the profile must NOT depend on
 * @linxin666/dsh-web-ui-all. That aggregate inserts its own `ssh` row (name
 * @linxin666/dsh-ssh), which collides with this family's `ssh` row id — the
 * dsh loader rejects duplicate row ids. Install the individual web-ui
 * packages (skins, panels) instead; the guard prints the exact commands.
 *
 * Then verification: `dsh --profile <name> --dump-config` must show exactly
 * one `ssh` row and one `telnet` row.
 *
 * The agent-ops-all aggregate is NOT linked from source: its workspace:*
 * dependencies only resolve after publishing, so source installs link the
 * individual bundle packages; npm installs use the aggregate instead.
 *
 * Idempotent and safe to rerun. The dsh CLI must be on PATH.
 *
 * Usage:
 *   node scripts/install.mjs                 # profile: web
 *   node scripts/install.mjs --profile tui   # another profile
 *   node scripts/install.mjs --dry-run       # report without changing
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve as resolvePath } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolvePath(SCRIPT_DIR, '..')

const args = process.argv.slice(2)
const profileIndex = args.indexOf('--profile')
const profile = profileIndex >= 0 && args[profileIndex + 1] !== undefined ? args[profileIndex + 1] : 'web'
const dryRun = args.includes('--dry-run')

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const PROFILE_DIR = join(DSH_HOME, 'profiles', profile)
const PROFILE_PKG = join(PROFILE_DIR, 'package.json')

/** The web-ui aggregate that conflicts with this family's ssh row. */
const WEB_UI_ALL = '@linxin666/dsh-web-ui-all'

/** The individual web-ui packages that replace the aggregate in coexistence
 * setups (everything the aggregate bundles except its dsh-ssh child). */
const WEB_UI_INDIVIDUAL = [
  '@linxin666/dsh-client-ui-web-ui-settings',
  '@linxin666/dsh-client-ui-aionui-panel',
  '@linxin666/dsh-client-ui-task-board',
  '@linxin666/dsh-client-ui-git-graph',
  '@linxin666/dsh-pet',
  '@linxin666/dsh-remote-web-ui',
  '@linxin666/dsh-live-stats',
  '@linxin666/dsh-tool-describe-image',
  '@linxin666/dsh-liangshen',
  '@linxin666/dsh-skins',
]

/** Every standalone bundle package under packages/ (a package.json with
 * dsh.bundle.patch, excluding aggregate carriers — those exist for npm
 * installs; from source the individual packages are linked instead). */
export function bundlePackages(repoRoot = REPO_ROOT) {
  const out = []
  const packagesDir = join(repoRoot, 'packages')
  if (!existsSync(packagesDir)) return out
  for (const name of readdirSync(packagesDir).sort()) {
    const dir = join(packagesDir, name)
    try {
      if (!statSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    if (existsSync(join(dir, 'aggregate.yml'))) continue // aggregate carrier
    const pkgPath = join(dir, 'package.json')
    if (!existsSync(pkgPath)) continue
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      if (pkg.dsh?.bundle?.patch !== undefined) out.push({ name, dir, pkgName: pkg.name, pkgPath })
    } catch {
      // Unreadable package.json: skip.
    }
  }
  return out
}

/**
 * Pure coexistence decision: whether the profile dependencies block the
 * install (they contain the conflicting web-ui aggregate) and, when they do,
 * the guidance lines explaining how to replace it. Pure so it can be
 * unit-tested without a dsh installation.
 *
 * @param {string[]} dependencyNames current dependencies object keys
 * @returns {{ blocked: boolean, reason: string, commands: string[] }}
 */
export function webUiAllGuard(dependencyNames, profile = 'web') {
  if (!dependencyNames.includes(WEB_UI_ALL)) return { blocked: false, reason: '', commands: [] }
  return {
    blocked: true,
    reason: `${WEB_UI_ALL} inserts its own ssh row (name @linxin666/dsh-ssh), which collides with this family's ssh row id; install the individual web-ui packages instead`,
    commands: [
      `dsh plugin --profile ${profile} remove ${WEB_UI_ALL}`,
      `dsh plugin --profile ${profile} add ${WEB_UI_INDIVIDUAL.join(' ')}`,
    ],
  }
}

function readProfileManifest() {
  if (!existsSync(PROFILE_PKG)) {
    console.error(`install: profile '${profile}' not found at ${PROFILE_DIR}; boot it once with \`dsh ${profile === 'web' ? 'web' : `--profile ${profile}`}\` first`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(PROFILE_PKG, 'utf8'))
}

function main() {
  const packages = bundlePackages()
  if (packages.length === 0) {
    console.error('install: no bundle packages found under packages/')
    process.exit(1)
  }
  console.log(`install: profile '${profile}' (${PROFILE_DIR})${dryRun ? ' [dry-run]' : ''}`)

  // 0. Compatibility guard against the web-ui aggregate.
  const manifest = readProfileManifest()
  const deps = Object.keys(manifest.dependencies ?? {})
  const guard = webUiAllGuard(deps, profile)
  if (guard.blocked) {
    console.error(`install: blocked: ${guard.reason}`)
    console.error('install: replace it with the individual web-ui packages, then rerun:')
    for (const command of guard.commands) console.error(`  ${command}`)
    process.exit(1)
  }

  // 1. Link every bundle package through the official dsh CLI.
  for (const pkg of packages) {
    const link = `link:${pkg.dir}`
    console.log(`install: dsh plugin --profile ${profile} add ${link}  (${pkg.pkgName})`)
    if (dryRun) continue
    const result = spawnSync('dsh', ['plugin', '--profile', profile, 'add', link], { stdio: 'inherit' })
    if (result.status !== 0) {
      console.error(`install: dsh plugin add failed for ${pkg.pkgName} (exit ${result.status})`)
      process.exit(result.status ?? 1)
    }
  }

  // 2. Verification: exactly one row per agent-ops plugin id.
  if (dryRun) {
    console.log('install: dry-run finished; no changes made')
    return
  }
  console.log(`install: verifying composition via dsh --profile ${profile} --dump-config`)
  let dump
  try {
    dump = execFileSync('dsh', ['--profile', profile, '--dump-config'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch (error) {
    console.error('install: dump-config failed; review the profile composition manually')
    process.exit(1)
  }
  let failed = false
  for (const id of ['ssh', 'telnet']) {
    const occurrences = dump.split('\n').filter((line) => line.trim() === `- id: ${id}`).length
    const ok = occurrences === 1
    console.log(`install: row '${id}' occurrences: ${occurrences} ${ok ? '(ok)' : '(expected exactly 1)'}`)
    if (!ok) failed = true
  }
  if (failed) {
    console.error('install: composition verification failed — fix duplicates, then restart dsh')
    process.exit(1)
  }
  console.log('install: done. Restart `dsh web` to load the agent-ops plugins.')
}

if (import.meta.main) main()
