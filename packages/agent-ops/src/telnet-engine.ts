/**
 * The Telnet engine: a minimal RFC 854 client for network devices (switches,
 * routers, firewalls). Every telnet_exec opens one short-lived connection —
 * login (username/password), optional privileged mode (enable/super), the
 * requested commands, then logout/close — so vty sessions are never held
 * idle and a dead session cannot leak into the next call.
 *
 * Negotiation policy: refuse every DO/DONT (answer WONT/DONT) and skip
 * subnegotiations — enough for IOS / VRP / Comware login shells, which all
 * fall back to plain-text prompts.
 */

import { connect, type Socket } from 'node:net'
import type { TelnetDeviceEntry, TelnetDeviceSummary, TelnetExecResult } from './telnet-protocol.ts'
import type { TelnetDeviceStore } from './telnet-store.ts'

/** Engine knobs. */
export interface TelnetEngineOptions {
  /** TCP connect timeout (ms). */
  connectTimeoutMs?: number
  /** Per-stage login timeout (ms). */
  loginTimeoutMs?: number
  /** Per-command prompt timeout (ms). */
  promptTimeoutMs?: number
  /** Whole-session budget when the caller gives none (ms). */
  overallTimeoutMs?: number
  /** Cap on captured text bytes per session. */
  maxOutputBytes?: number
}

const DEFAULTS: Required<TelnetEngineOptions> = {
  connectTimeoutMs: 10_000,
  loginTimeoutMs: 20_000,
  promptTimeoutMs: 30_000,
  overallTimeoutMs: 60_000,
  maxOutputBytes: 2 * 1024 * 1024,
}

/** Per-call execution options. */
export interface TelnetExecOptions {
  /** CLI commands, one line each, executed in order. */
  commands: string[]
  /** Whole-session timeout (ms). */
  timeoutMs?: number
  /** Enter privileged mode (enable/super) after login. */
  enable?: boolean
  /** Reject config-write commands unless explicitly false (default true). */
  readOnly?: boolean
  /** Custom prompt regex (default chosen per deviceType). */
  promptRegex?: string
  /** Strip trailing prompt lines from the returned output (default true). */
  stripPromptLines?: boolean
}

/** Command prefixes treated as configuration writes (blocked in readOnly mode). */
const WRITE_PREFIX_RE = /^\s*(?:configure\s+terminal|conf(?:ig)?\s+t|config\s+t|system-view|sysview|\bsys(?:\s|$)|enable(?:\s|$)|write(?:\s|$)|wr(?:\s|$)|copy\s|save(?:\s|$)|commit|delete\s|undo\s|no\s|shutdown\s|reboot|reload|reset\s|format\s|erase\s|clear\s|interface\s|vlan\s|ip\s+route\s|route\s|user-interface\s|aaa\s|stp\s|lacp\s|snmp\s|ntp\s|dot1x\s|ospf\s|isis\s|bgp\s|acl\s)/i

/** Login prompts (tail-anchored, case-insensitive). */
const USER_RE = /(?:login|user\s*name|username)\s*[:>]?\s*$/i
const PASS_RE = /password\s*[:>]?\s*$/i

/** Authentication failure markers. */
const FAIL_RE = /(?:login\s+invalid|access\s+denied|authentication\s+failed|bad\s+secrets|incorrect\s+password|invalid\s+username|error:\s*(?:login|authentication))/i

/** Paging markers (IOS " --More-- ", VRP " ---- More ---- "). */
const PAGE_RE = /(?:--\s*[Mm]ore\s*--|----\s+[Mm]ore\s+----)\s*$/

/** Yes/No confirmation prompts (save/reboot style). */
const CONFIRM_RE = /(?:\[[Yy]\/[Nn]\]|\([Yy]\/[Nn]\)|\[confirm\])\s*:?\s*$/

/** Default shell-prompt regexes per vendor family (line-anchored at end). */
const PROMPTS: Record<string, RegExp> = {
  generic: /(?:^|\n)[^\r\n]*[>$%#\]][ \t]*\r?$/m,
  cisco: /(?:^|\n)[^\r\n]*[>#][ \t]*\r?$/m,
  huawei: /(?:^|\n)[^\r\n]*[>\]][ \t]*\r?$/m,
  h3c: /(?:^|\n)[^\r\n]*[>\]][ \t]*\r?$/m,
}

/** One trailing prompt line, for output cleanup. */
const PROMPT_LINE_RE = /^[^\r\n]*[>$%#\]][ \t]*$/

/** Timed-out waiting for a stage. */
class TelnetTimeoutError extends Error {}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** Wait-for spec shared by every stage. */
interface WaitSpec {
  /** Full-text (line-anchored) regex; a match resolves the wait. */
  done: RegExp
  /** Tail-anchored regex that rejects with a diagnostic message. */
  fail?: RegExp
  /** Tail-anchored paging marker → bytes to send (space), deduped by position. */
  page?: { regex: RegExp; bytes: string }
  /** Tail-anchored Y/N prompt → either bytes to send or 'done'. */
  confirm?: { regex: RegExp; action: string | 'done' }
  timeoutMs: number
  deadline: number
  label: string
}

interface ActiveCondition {
  done: RegExp
  fail?: RegExp
  page?: { regex: RegExp; bytes: string }
  confirm?: { regex: RegExp; action: string | 'done' }
  /** First text position this condition may match on (after the previous prompt). */
  scanFrom: number
  resolve: () => void
  reject: (error: Error) => void
  timer: NodeJS.Timeout
  lastPageSent: number
  lastConfirmSent: number
  label: string
}

/**
 * One live telnet session: raw socket, IAC filter, clean-text buffer, and
 * one active "wait for" condition at a time (stages are strictly sequential).
 */
class TelnetSession {
  /** Clean text collected since connect (latin1 — device output is ASCII). */
  text = ''
  private input = Buffer.alloc(0)
  private condition: ActiveCondition | null = null
  private closed = false
  private truncated = false
  /** Prompt matching scans only text after this position (the last resolved prompt). */
  private promptMark = 0

  constructor(
    private readonly socket: Socket,
    private readonly maxBytes: number,
  ) {
    socket.setNoDelay(true)
    socket.on('data', (chunk: Buffer) => { this.ingest(chunk) })
    // Keep a persistent no-op listener: an 'error' event with no listener
    // crashes the process. The 'close' handler below does the real reporting.
    socket.on('error', () => {})
    socket.on('close', () => {
      this.closed = true
      if (this.condition !== null) {
        const condition = this.condition
        this.condition = null
        clearTimeout(condition.timer)
        condition.reject(new Error('connection closed'))
      }
    })
  }

  /** Feed raw bytes: strip IAC negotiation, refuse options, append clean text. */
  private ingest(raw: Buffer): void {
    this.input = Buffer.concat([this.input, raw])
    const bytes = this.input
    const out: number[] = []
    const replies: Buffer[] = []
    let i = 0
    while (i < bytes.length) {
      const b = bytes[i]
      if (b !== 0xff) {
        out.push(b)
        i += 1
        continue
      }
      // IAC: need at least the command byte.
      if (i + 1 >= bytes.length) break
      const cmd = bytes[i + 1]
      if (cmd === 0xff) { // IAC IAC → literal 0xff
        out.push(0xff)
        i += 2
        continue
      }
      if (cmd === 0xfa) { // SB: skip until IAC SE
        let j = i + 2
        while (j + 1 < bytes.length && !(bytes[j] === 0xff && bytes[j + 1] === 0xf0)) j += 1
        if (j + 1 >= bytes.length) {
          i = bytes.length
          break
        }
        i = j + 2
        continue
      }
      if (cmd === 0xfb || cmd === 0xfc) { // WILL/WONT → DONT
        if (i + 2 >= bytes.length) {
          i = bytes.length
          break
        }
        replies.push(Buffer.from([0xff, 0xfe, bytes[i + 2]]))
        i += 3
        continue
      }
      if (cmd === 0xfd || cmd === 0xfe) { // DO/DONT → WONT
        if (i + 2 >= bytes.length) {
          i = bytes.length
          break
        }
        replies.push(Buffer.from([0xff, 0xfc, bytes[i + 2]]))
        i += 3
        continue
      }
      // Other IAC commands are two bytes (AYT/EC/EL/GA/NOP/...).
      i += 2
    }
    this.input = bytes.subarray(i)
    if (replies.length > 0) {
      try {
        this.socket.write(Buffer.concat(replies))
      } catch {
        // Socket already dying; nothing to do.
      }
    }
    if (out.length > 0) this.append(Buffer.from(out).toString('latin1'))
  }

  private append(text: string): void {
    if (this.text.length + text.length > this.maxBytes) {
      this.truncated = true
      text = text.slice(0, Math.max(0, this.maxBytes - this.text.length))
    }
    this.text += text
    if (this.condition !== null) this.evaluate(this.text)
  }

  /** Evaluate the active condition against fresh text. */
  private evaluate(text: string): void {
    const condition = this.condition
    if (condition === null) return
    const tail = text.slice(-1024)
    if (condition.confirm !== undefined && text.length > condition.lastConfirmSent) {
      if (condition.confirm.regex.test(tail)) {
        if (condition.confirm.action === 'done') {
          this.resolveCondition(condition)
          return
        }
        condition.lastConfirmSent = text.length
        this.send(condition.confirm.action)
        return
      }
    }
    if (condition.page !== undefined && text.length > condition.lastPageSent) {
      if (condition.page.regex.test(tail)) {
        condition.lastPageSent = text.length
        this.send(condition.page.bytes)
        return
      }
    }
    if (condition.fail !== undefined && condition.fail.test(tail)) {
      const label = condition.label
      this.condition = null
      clearTimeout(condition.timer)
      condition.reject(new Error(`${label}: authentication failed or access denied`))
      return
    }
    // Match only text after the previous resolved prompt: an old prompt line
    // still sitting at the end of the buffer must not satisfy a new command's
    // wait before the device has answered.
    if (condition.done.test(text.slice(Math.max(condition.scanFrom, text.length - 8192)))) {
      this.resolveCondition(condition)
    }
  }

  private resolveCondition(condition: ActiveCondition): void {
    if (this.condition !== condition) return
    this.condition = null
    clearTimeout(condition.timer)
    this.promptMark = this.text.length
    condition.resolve()
  }

  /** Wait until `spec.done` matches (with optional paging/confirm handling). */
  waitFor(spec: WaitSpec): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.closed) {
        reject(new Error(`${spec.label}: connection closed`))
        return
      }
      const ms = Math.min(spec.timeoutMs, Math.max(1, spec.deadline - Date.now()))
      if (ms <= 1) {
        reject(new TelnetTimeoutError(`${spec.label}: timed out`))
        return
      }
      const condition: ActiveCondition = {
        done: spec.done,
        fail: spec.fail,
        page: spec.page,
        confirm: spec.confirm,
        scanFrom: this.promptMark,
        resolve,
        reject,
        lastPageSent: -1,
        lastConfirmSent: -1,
        label: spec.label,
        timer: setTimeout(() => {
          if (this.condition === condition) {
            this.condition = null
            reject(new TelnetTimeoutError(`${spec.label}: timed out`))
          }
        }, ms),
      }
      this.condition = condition
      this.evaluate(this.text)
    })
  }

  /** Send one line (CRLF per the NVT convention). */
  send(line: string): void {
    try {
      this.socket.write(line + '\r\n', 'latin1')
    } catch {
      // Socket already dying; the close handler surfaces the error.
    }
  }

  /** Polite logout, then hard close. */
  async close(): Promise<void> {
    if (this.closed) return
    if (this.condition !== null) {
      clearTimeout(this.condition.timer)
      this.condition = null
    }
    try { this.socket.write('quit\r\n', 'latin1') } catch {}
    await delay(250)
    try { this.socket.write('exit\r\n', 'latin1') } catch {}
    await delay(250)
    this.socket.destroy()
  }

  /** Final captured text: prompt lines stripped, truncation noted. */
  finalize(stripPrompts: boolean): string {
    let text = this.text
    if (stripPrompts) {
      const lines = text.split('\n')
      // Drop trailing empty lines, then at most the final prompt line. The
      // intermediate prompts stay: they carry the session trail (user exec →
      // privileged → config mode) the agent reads to understand context.
      while (lines.length > 0 && lines[lines.length - 1]!.replace(/\r$/, '') === '') lines.pop()
      if (lines.length > 0 && PROMPT_LINE_RE.test(lines[lines.length - 1]!.replace(/\r$/, ''))) lines.pop()
      text = lines.join('\n')
    }
    if (this.truncated) text += '\n[output truncated]'
    return text
  }
}

/**
 * The telnet engine: per-exec connect → login → (enable) → commands → close.
 */
export class TelnetEngine {
  private readonly options: Required<TelnetEngineOptions>

  constructor(
    private readonly store: TelnetDeviceStore,
    options?: TelnetEngineOptions,
  ) {
    this.options = { ...DEFAULTS, ...options }
  }

  /** List devices (optionally filtered by a fuzzy query). */
  list(query?: string): TelnetDeviceSummary[] {
    const q = query?.trim().toLowerCase()
    return this.store.list()
      .filter(entry => q === undefined || q === ''
        || entry.alias.toLowerCase().includes(q)
        || entry.host.toLowerCase().includes(q)
        || entry.tags.some(tag => tag.toLowerCase().includes(q))
        || (entry.description ?? '').toLowerCase().includes(q))
      .map(entry => this.store.summarize(entry))
  }

  /** Connect one TCP socket (reject on timeout/error). */
  private connect(entry: TelnetDeviceEntry, deadline: number): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = connect({ host: entry.host, port: entry.port })
      const ms = Math.min(this.options.connectTimeoutMs, Math.max(1, deadline - Date.now()))
      const timer = setTimeout(() => {
        socket.destroy()
        reject(new Error(`connect to ${entry.host}:${entry.port} timed out`))
      }, ms)
      socket.once('connect', () => {
        clearTimeout(timer)
        resolve(socket)
      })
      socket.once('error', (error: Error) => {
        clearTimeout(timer)
        reject(new Error(`connect to ${entry.host}:${entry.port} failed: ${error.message}`))
      })
    })
  }

  /** Run one command batch against one device. */
  async exec(alias: string, options: TelnetExecOptions): Promise<TelnetExecResult> {
    const startedAt = Date.now()
    let session: TelnetSession | undefined
    try {
      const entry = this.store.find(alias)
      if (entry === undefined) throw new Error(`device '${alias}' not found`)
      const commands = options.commands
        .map(command => command.replace(/[\r\n]/g, ' ').trim())
        .filter(command => command !== '')
      if (commands.length === 0) throw new Error('commands must contain at least one non-empty line')
      const readOnly = options.readOnly !== false
      if (readOnly) {
        const blocked = commands.find(command => WRITE_PREFIX_RE.test(command))
        if (blocked !== undefined) {
          throw new Error(`readOnly mode rejects config-write command: '${blocked}'. Set readOnly:false only after the user confirmed the exact commands.`)
        }
      }
      const overallMs = options.timeoutMs ?? this.options.overallTimeoutMs
      const deadline = startedAt + overallMs
      const deviceType = entry.deviceType ?? 'generic'
      const promptRe = options.promptRegex !== undefined
        ? new RegExp(options.promptRegex, 'm')
        : (PROMPTS[deviceType] ?? PROMPTS.generic)
      const page = { regex: PAGE_RE, bytes: ' ' }
      const confirm = {
        regex: CONFIRM_RE,
        action: readOnly ? 'done' as const : ('y\r\n' as const),
      }

      const socket = await this.connect(entry, deadline)
      session = new TelnetSession(socket, this.options.maxOutputBytes)

      // 1. Login username.
      await session.waitFor({ done: USER_RE, fail: FAIL_RE, label: 'login username prompt', timeoutMs: this.options.loginTimeoutMs, deadline })
      session.send(entry.username)
      // 2. Login password.
      await session.waitFor({ done: PASS_RE, fail: FAIL_RE, label: 'login password prompt', timeoutMs: this.options.loginTimeoutMs, deadline })
      session.send(entry.password)
      // 3. First shell prompt (after MOTD/banners).
      await session.waitFor({ done: promptRe, fail: FAIL_RE, page, confirm, label: 'shell prompt', timeoutMs: this.options.promptTimeoutMs, deadline })

      // 4. Optional privileged mode.
      if (options.enable === true) {
        const enableCommand = entry.enableCommand ?? 'enable'
        session.send(enableCommand)
        // Either the device asks for the enable password or drops straight to
        // the privileged prompt (keep the i/m flags the sources rely on).
        const combined = new RegExp(`(?:${PASS_RE.source}|${promptRe.source})`, 'im')
        await session.waitFor({ done: combined, label: `enable (${enableCommand})`, timeoutMs: this.options.promptTimeoutMs, deadline })
        if (PASS_RE.test(session.text.slice(-1024))) {
          const enablePassword = entry.enablePassword
          if (enablePassword === undefined || enablePassword === '') {
            throw new Error(`device '${alias}' asks for an enable password but none is configured`)
          }
          session.send(enablePassword)
          await session.waitFor({ done: promptRe, page, confirm, label: 'privileged prompt', timeoutMs: this.options.promptTimeoutMs, deadline })
        }
      }

      // 5. Run the commands in order.
      for (const command of commands) {
        session.send(command)
        await session.waitFor({ done: promptRe, page, confirm, label: `command '${command}'`, timeoutMs: this.options.promptTimeoutMs, deadline })
      }

      const output = session.finalize(options.stripPromptLines !== false)
      return {
        success: true,
        exitCode: 0,
        timedOut: false,
        output,
        durationMs: Date.now() - startedAt,
      }
    } catch (error) {
      return {
        success: false,
        exitCode: null,
        timedOut: error instanceof TelnetTimeoutError,
        output: session === undefined ? '' : session.text,
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      }
    } finally {
      if (session !== undefined) await session.close().catch(() => {})
    }
  }

  /** No pooled resources — connections are per-exec by design. */
  dispose(): void {}
}
