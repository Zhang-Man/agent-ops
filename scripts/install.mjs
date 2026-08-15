#!/usr/bin/env node
/**
 * Install every agent-ops plugin into a dsh profile from source.
 *
 * For each bundle package under packages/ (package.json carries
 * "dsh.bundle.patch"): `dsh plugin --profile <name> add link:<absolute path>`
 * — the same official flow a user runs by hand per package.
 *
 * Then two fixups the official flow does not cover:
 *   1. Coexistence with @linxin666/dsh-web-ui-all: that aggregate already
 *      inserts the `ssh` row, so the standalone dsh-ssh bundle row would be a
 *      duplicate (the dsh loader rejects duplicate row ids). The fix drops
 *      '@linxin666/dsh-ssh' from dsh.profile.bundles but keeps it in
 *      dependencies — the row inserted by web-ui-all then resolves to the
 *      top-level (agent-ops) copy because the loader resolves row package
 *      names from the profile root.
 *   2. Verification: `dsh --profile <name> --dump-config` must show exactly
 *      one `ssh` row and one `telnet` row.
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
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
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
 * Pure fixup decision: drop the standalone dsh-ssh bundle row when the
 * profile already depends on the dsh-web-ui-all aggregate (whose own patch
 * inserts the same row id). Returns the fixed bundles list and whether it
 * changed. Pure so it can be unit-tested without a dsh installation.
 *
 * @param {string[]} bundles current dsh.profile.bundles
 * @param {string[]} dependencyNames current dependencies object keys
 * @returns {{ bundles: string[], changed: boolean, removed: string[] }}
 */
export function fixBundles(bundles, dependencyNames) {
  const hasWebUiAll = dependencyNames.includes('@linxin666/dsh-web-ui-all')
  if (!hasWebUiAll) return { bundles: [...bundles], changed: false, removed: [] }
  const next = bundles.filter((entry) => entry !== '@linxin666/dsh-ssh')
  return { bundles: next, changed: next.length !== bundles.length, removed: ['@linxin666/dsh-ssh'] }
}

function readProfileManifest() {
  if (!existsSync(PROFILE_PKG)) {
    console.error(`install: profile '${profile}' not found at ${PROFILE_DIR}; boot it once with \`dsh ${profile === 'web' ? 'web' : `--profile ${profile}`}\` first`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(PROFILE_PKG, 'utf8'))
}

function writeProfileManifest(manifest) {
  writeFileSync(PROFILE_PKG, JSON.stringify(manifest, null, 2) + '\n')
}

function main() {
  const packages = bundlePackages()
  if (packages.length === 0) {
    console.error('install: no bundle packages found under packages/')
    process.exit(1)
  }
  console.log(`install: profile '${profile}' (${PROFILE_DIR})${dryRun ? ' [dry-run]' : ''}`)

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

  // 2. Coexistence fixup with the dsh-web-ui-all aggregate.
  const manifest = readProfileManifest()
  const bundles = manifest.dsh?.profile?.bundles ?? []
  const deps = Object.keys(manifest.dependencies ?? {})
  const fixed = fixBundles(bundles, deps)
  if (fixed.changed) {
    console.log('install: profile depends on @linxin666/dsh-web-ui-all (its patch already inserts the ssh row); removing the duplicate standalone dsh-ssh bundle entry (dependency kept, resolution stays on this repo)')
    if (!dryRun) {
      manifest.dsh.profile.bundles = fixed.bundles
      writeProfileManifest(manifest)
    }
  }

  // 3. Verification: exactly one row per agent-ops plugin id.
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

main()
