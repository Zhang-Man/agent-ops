/**
 * Test helper: a fake network device over node:net — banner + IAC
 * negotiation + Username/Password login + optional enable/super + a few
 * canned commands (including a paged 'show run'). Enough to exercise the
 * TelnetEngine end to end without real hardware.
 */

import { createServer, type Server, type Socket } from 'node:net'

export interface FakeDeviceOptions {
  username: string
  password: string
  enablePassword?: string
  /** cisco (IOS-style) or huawei (VRP-style) prompt grammar. */
  vendor?: 'cisco' | 'huawei'
}

export interface FakeDevice {
  server: Server
  port: number
  connections: number
}

/** Strip IAC negotiation bytes from client input, keep the rest as text. */
function cleanInput(raw: Buffer): string {
  const bytes = [...raw]
  const out: number[] = []
  let i = 0
  while (i < bytes.length) {
    const b = bytes[i]
    if (b !== 0xff) {
      out.push(b)
      i += 1
      continue
    }
    if (i + 1 >= bytes.length) break
    const cmd = bytes[i + 1]
    if (cmd === 0xff) {
      out.push(0xff)
      i += 2
      continue
    }
    if (cmd === 0xfa) { // SB: skip until IAC SE
      let j = i + 2
      while (j + 1 < bytes.length && !(bytes[j] === 0xff && bytes[j + 1] === 0xf0)) j += 1
      i = j + 1 < bytes.length ? j + 2 : bytes.length
      continue
    }
    if (cmd === 0xfb || cmd === 0xfc || cmd === 0xfd || cmd === 0xfe) { // 3-byte negotiation
      if (i + 2 >= bytes.length) {
        i = bytes.length
        break
      }
      i += 3
      continue
    }
    i += 2
  }
  return Buffer.from(out).toString('latin1')
}

/**
 * A line-oriented session: feeds clean text into a parser that resolves when
 * a full line arrives, and a `send` helper for server output.
 */
class FakeSession {
  private pending: string[] = []
  private waiters: Array<(line: string) => void> = []
  private rawWaiters: Array<(text: string) => void> = []
  private buffer = ''
  prompt = ''

  constructor(readonly socket: Socket) {
    // Reject outstanding waits when the peer hangs up instead of letting
    // them sit until their timers expire.
    socket.on('close', () => {
      const error = new Error('connection closed')
      for (const waiter of this.waiters.splice(0)) waiter(error.message)
      for (const waiter of this.rawWaiters.splice(0)) waiter(error.message)
    })
  }

  feed(text: string): void {
    this.buffer += text
    const lines = this.buffer.split(/\r\n|\n|\r/)
    this.buffer = lines.pop() ?? ''
    for (const line of lines) {
      const waiter = this.waiters.shift()
      if (waiter !== undefined) waiter(line)
      else this.pending.push(line)
    }
    const rawWaiter = this.rawWaiters.shift()
    if (rawWaiter !== undefined) rawWaiter(text)
  }

  nextLine(timeoutMs = 5000): Promise<string> {
    const queued = this.pending.shift()
    if (queued !== undefined) return Promise.resolve(queued)
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for a line')), timeoutMs)
      this.waiters.push((line) => {
        clearTimeout(timer)
        resolve(line)
      })
    })
  }

  /** Resolve with the next raw chunk (paging answers a bare space, no newline). */
  nextRaw(timeoutMs = 5000): Promise<string> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for raw input')), timeoutMs)
      this.rawWaiters.push((text) => {
        clearTimeout(timer)
        resolve(text)
      })
    })
  }

  send(text: string): void {
    this.socket.write(text, 'latin1')
  }
}

/** Start a fake device on an ephemeral port. */
export function startFakeDevice(options: FakeDeviceOptions): Promise<FakeDevice> {
  const vendor = options.vendor ?? 'cisco'
  const device: FakeDevice = { connections: 0, port: 0, server: null as unknown as Server }
  const userPrompt = vendor === 'huawei' ? '<SW1>' : 'SW1> '
  const privPrompt = vendor === 'huawei' ? '[SW1]' : 'SW1# '
  const configPrompt = vendor === 'huawei' ? '[SW1]' : 'SW1(config)# '

  const server = createServer((socket) => {
    device.connections += 1
    const session = new FakeSession(socket)
    socket.on('data', (chunk: Buffer) => { session.feed(cleanInput(chunk)) })
    socket.on('error', () => {})

    void (async () => {
      // Banner + a little IAC negotiation (WILL ECHO, DO SUPPRESS-GO-AHEAD).
      session.send('User Access Verification\r\n')
      session.send(Buffer.from([0xff, 0xfb, 0x01, 0xff, 0xfd, 0x03]).toString('latin1'))
      session.send('\r\nUsername: ')
      const username = await session.nextLine().catch(() => '')
      session.send('Password: ')
      const password = await session.nextLine().catch(() => '')
      if (username !== options.username || password !== options.password) {
        session.send('\r\n% Login invalid\r\n\r\nUsername: ')
        session.socket.end()
        return
      }
      session.send('\r\nWelcome to FakeIOS\r\n')
      session.prompt = userPrompt
      session.send(session.prompt)

      let priv = false
      let config = false
      for (;;) {
        const line = await session.nextLine().catch(() => null)
        if (line === null) return
        const command = line.trim()
        if (command === 'quit' || command === 'exit') {
          session.socket.end()
          return
        }
        if (command === 'enable' || command === 'super') {
          if (options.enablePassword !== undefined && options.enablePassword !== '') {
            session.send('Password: ')
            const enablePassword = await session.nextLine().catch(() => '')
            if (enablePassword !== options.enablePassword) {
              session.send('\r\n% Bad secrets\r\n' + session.prompt)
              continue
            }
          }
          priv = true
          session.prompt = privPrompt
          session.send('\r\n' + session.prompt)
          continue
        }
        if (vendor === 'cisco' && command === 'configure terminal' && priv) {
          config = true
          session.prompt = configPrompt
          session.send('\r\n' + session.prompt)
          continue
        }
        if (vendor === 'cisco' && command.startsWith('hostname ') && config) {
          const name = command.slice('hostname '.length).trim() || 'Router'
          session.prompt = `${name}(config)# `
          session.send('\r\n' + session.prompt)
          continue
        }
        if (command === 'show version') {
          session.send('\r\nCisco IOS Software, Version 15.2(4)M, RELEASE SOFTWARE\r\n')
          session.send(session.prompt)
          continue
        }
        if (vendor === 'huawei' && command === 'display version') {
          session.send('\r\nHuawei Versatile Routing Platform Software\r\n')
          session.send(session.prompt)
          continue
        }
        if (command === 'show run') {
          session.send('\r\nBuilding configuration...\r\n\r\ninterface GigabitEthernet0/0\r\n description uplink\r\n!\r\n--More-- ')
          const space = await session.nextRaw().catch(() => null)
          if (space === null) return
          session.send('\rinterface GigabitEthernet0/1\r\n description access\r\n!\r\nend\r\n')
          session.send(session.prompt)
          continue
        }
        session.send('\r\n% Invalid input detected\r\n' + session.prompt)
      }
    })().catch(() => {})
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') throw new Error('no port assigned')
      device.port = address.port
      device.server = server
      resolve(device)
    })
  })
}

/** Close the fake device and free the port. */
export function stopFakeDevice(device: FakeDevice): Promise<void> {
  return new Promise((resolve) => {
    device.server.close(() => resolve())
  })
}
