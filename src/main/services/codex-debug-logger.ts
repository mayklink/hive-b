import { homedir } from 'node:os'
import { join } from 'node:path'
import { appendFileSync, mkdirSync, existsSync, writeFileSync } from 'node:fs'

const LOG_FILE_NAME = 'codex.jsonl'

let logFilePath: string | null = null
let initialized = false

function getLogFilePath(): string {
  if (!logFilePath) {
    const logDir = join(homedir(), '.hive', 'logs')
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }
    logFilePath = join(logDir, LOG_FILE_NAME)
  }
  return logFilePath
}

function ensureInitialized(): void {
  if (initialized) return
  initialized = true
  writeFileSync(getLogFilePath(), '') // truncate on first write per process
}

export function logCodexMessage(direction: 'outgoing' | 'incoming', rawData: unknown): void {
  ensureInitialized()
  const entry = {
    ts: new Date().toISOString(),
    request: direction === 'outgoing',
    data: rawData
  }
  appendFileSync(getLogFilePath(), JSON.stringify(entry) + '\n')
}

export function logCodexLifecycleEvent(event: string, detail?: Record<string, unknown>): void {
  ensureInitialized()
  const entry = {
    ts: new Date().toISOString(),
    lifecycle: true,
    event,
    ...(detail ?? {})
  }
  appendFileSync(getLogFilePath(), JSON.stringify(entry) + '\n')
}
