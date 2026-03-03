import { existsSync } from 'fs'
import { readFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { createLogger } from './logger'

const log = createLogger({ component: 'UsageService' })

export interface UsageData {
  five_hour: { utilization: number; resets_at: string }
  seven_day: { utilization: number; resets_at: string }
  extra_usage?: {
    is_enabled: boolean
    utilization: number
    used_credits: number
    monthly_limit: number
  }
}

interface UsageResult {
  success: boolean
  data?: UsageData
  error?: string
}

async function readAccessToken(): Promise<string | null> {
  const credsPath = join(homedir(), '.claude', '.credentials.json')
  if (!existsSync(credsPath)) {
    log.warn('Credentials file not found')
    return null
  }
  try {
    const raw = await readFile(credsPath, 'utf-8')
    const creds = JSON.parse(raw)
    return creds?.claudeAiOauth?.accessToken || null
  } catch {
    return null
  }
}

export async function fetchClaudeUsage(): Promise<UsageResult> {
  const token = await readAccessToken()
  if (!token) {
    log.warn('No Claude OAuth access token found in ~/.claude/.credentials.json')
    return { success: false, error: 'No access token found' }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const response = await fetch('https://api.anthropic.com/api/oauth/usage', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    })

    clearTimeout(timeout)

    if (!response.ok) {
      const message = `Usage API returned ${response.status}: ${response.statusText}`
      log.warn(message)
      return { success: false, error: message }
    }

    const data = (await response.json()) as UsageData
    return { success: true, data }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn('Failed to fetch Claude usage', { error: message })
    return { success: false, error: message }
  }
}
