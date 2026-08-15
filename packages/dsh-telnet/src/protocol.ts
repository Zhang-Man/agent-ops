/**
 * Wire contract for dsh-telnet — device store shape, summaries, and exec
 * results. Pure types only (mirrors dsh-ssh's protocol module).
 */

/** One stored network-device entry (the ~/.dsh/dsh-telnet.json shape). */
export interface TelnetDeviceEntry {
  /** Stable, user-chosen identifier used by every operation. */
  alias: string
  /** Hostname or IP of the device. */
  host: string
  /** Telnet port (default 23). */
  port: number
  /** Login user. */
  username: string
  /** Login password (plaintext, file 0600 — same trust model as dsh-ssh). */
  password: string
  /** Privileged-mode password when enable/super asks for one. */
  enablePassword?: string
  /** Command that enters privileged mode (default 'enable'; VRP often 'super'). */
  enableCommand?: string
  /** Vendor hint for prompt/paging quirks: cisco | huawei | h3c | generic. */
  deviceType?: string
  /** Free-form note. */
  description?: string
  /** Deployment environment label (production / test / ...). */
  environment?: string
  /** Free-form tags. */
  tags: string[]
  createdAt: number
  updatedAt: number
}

/** Secret-free projection of an entry, safe for the agent surfaces. */
export interface TelnetDeviceSummary {
  alias: string
  host: string
  port: number
  username: string
  deviceType?: string
  enableCommand?: string
  /** Whether an enable/super password is configured (never the value). */
  hasEnablePassword: boolean
  description?: string
  environment?: string
  tags: string[]
}

/** Payload accepted by create/update. */
export interface TelnetDevicePayload {
  alias?: string
  host: string
  port?: number
  username: string
  /** Required on create; on update an omitted password keeps the stored one. */
  password?: string
  enablePassword?: string
  enableCommand?: string
  deviceType?: string
  description?: string
  environment?: string
  tags?: string[]
}

/** Result of one telnet command batch. */
export interface TelnetExecResult {
  success: boolean
  /** null when the session died without a clean close. */
  exitCode: number | null
  timedOut: boolean
  /** Captured device output (login/prompt noise stripped where possible). */
  output: string
  /** Wall-clock duration of the round trip in ms. */
  durationMs: number
  /** Connection error message when the commands never ran. */
  error?: string
}
