/**
 * Standalone real-sshd harness: spawns /usr/sbin/sshd as the current user
 * with a sandboxed config, host key, and a generated client keypair (key
 * auth only). Gives the SFTP tests a production-grade server.
 */

import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { chmodSync, createWriteStream, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { connect } from 'node:net'

/** Every spawned sshd (orphan cleanup if the test process dies early). */
const spawned: ChildProcess[] = []

/** Wait until the port accepts TCP connections (aborts on a spawn error). */
async function waitPort(port: number, timeoutMs: number, spawnError?: () => Error | undefined): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const error = spawnError?.()
    if (error !== undefined) throw error
    const ok = await new Promise<boolean>((resolve) => {
      const socket = connect({ host: '127.0.0.1', port })
      socket.once('connect', () => { socket.destroy(); resolve(true) })
      socket.once('error', () => { socket.destroy(); resolve(false) })
    })
    if (ok) return
    if (Date.now() > deadline) throw new Error('sshd did not start listening in time')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
}

/** The real-sshd harness. */
export class TestSshd {
  readonly port: number
  /** Absolute path of the client private key. */
  readonly clientKey: string
  /** The sandbox dir (also the writable remote filesystem area). */
  readonly root: string
  private readonly process: ChildProcess
  private readonly dir: string

  private constructor(port: number, clientKey: string, root: string, process: ChildProcess, dir: string) {
    this.port = port
    this.clientKey = clientKey
    this.root = root
    this.process = process
    this.dir = dir
  }

  /** Start sshd on a random high port. */
  static async start(): Promise<TestSshd> {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-ssh-sshd-'))
    const root = join(dir, 'remote')
    mkdirSync(join(dir, 'etc'), { recursive: true })
    mkdirSync(join(dir, 'home', '.ssh'), { recursive: true })
    mkdirSync(root, { recursive: true })
    // The SFTP session runs as the target user, so the writable remote area
    // must be writable by them (throwaway dir — 0777 is acceptable here).
    chmodSync(root, 0o777)
    execFileSync('ssh-keygen', ['-t', 'ed25519', '-f', join(dir, 'etc', 'host_key'), '-N', '', '-q'], { stdio: 'ignore' })
    execFileSync('ssh-keygen', ['-t', 'ed25519', '-f', join(dir, 'client'), '-N', '', '-q'], { stdio: 'ignore' })
    const authorized = join(dir, 'home', '.ssh', 'authorized_keys')
    writeFileSync(authorized, readFileSync(join(dir, 'client.pub'), 'utf8'), 'utf8')
    // OpenSSH checks the authorized_keys file AS the target user for non-root
    // accounts (temporarily_use_uid), so the whole path must be traversable
    // and the file readable by that user — the test process may run as root
    // while process.env.USER names a different account (e.g. under DSH).
    // These are throwaway keys in a throwaway dir, so 0644 is acceptable.
    chmodSync(dir, 0o755)
    chmodSync(join(dir, 'home'), 0o755)
    chmodSync(join(dir, 'home', '.ssh'), 0o755)
    chmodSync(authorized, 0o644)

    const port = 22_000 + Math.floor(Math.random() * 5_000)
    const config = [
      `Port ${port}`,
      'ListenAddress 127.0.0.1',
      `HostKey ${join(dir, 'etc', 'host_key')}`,
      `PidFile ${join(dir, 'sshd.pid')}`,
      `AuthorizedKeysFile ${authorized}`,
      'PasswordAuthentication no',
      'PubkeyAuthentication yes',
      'UsePAM no',
      'UsePrivilegeSeparation no',
      'StrictModes no',
      `AllowUsers ${process.env.USER}`,
      'Subsystem sftp internal-sftp',
      'LogLevel ERROR',
    ].join('\n')
    writeFileSync(join(dir, 'sshd_config'), config + '\n', 'utf8')
    const log = join(dir, 'sshd.log')
    const logStream = createWriteStream(log)
    const child = spawn('/usr/sbin/sshd', ['-D', '-e', '-f', join(dir, 'sshd_config')], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    spawned.push(child)
    // -e sends logs to stderr; capture them so failures are diagnosable.
    child.stderr?.pipe(logStream)
    let spawnError: Error | undefined
    child.once('error', (error) => { spawnError = error })
    try {
      await waitPort(port, 8_000, () => spawnError !== undefined
        ? new Error(`failed to spawn /usr/sbin/sshd: ${spawnError.message}`)
        : undefined)
    } catch (error) {
      child.kill()
      logStream.end()
      let detail = ''
      try {
        detail = readFileSync(log, 'utf8').slice(0, 2000)
      } catch { /* no log */ }
      rmSync(dir, { recursive: true, force: true })
      throw new Error(`sshd failed to start: ${String(error)} ${detail}`)
    }
    logStream.end()
    return new TestSshd(port, join(dir, 'client'), root, child, dir)
  }

  /** Stop sshd and clean up (kill is synchronous; dir removal follows exit). */
  stop(): void {
    try { this.process.kill() } catch { /* gone */ }
    void (async () => {
      if (this.process.exitCode === null) {
        await new Promise<void>((resolve) => {
          this.process.once('exit', () => resolve())
          setTimeout(resolve, 2_000)
        })
      }
      rmSync(this.dir, { recursive: true, force: true })
    })()
  }
}

// Best-effort orphan cleanup if the test process dies without stop().
process.on('exit', () => {
  for (const child of spawned) {
    try { child.kill() } catch { /* gone */ }
  }
})
