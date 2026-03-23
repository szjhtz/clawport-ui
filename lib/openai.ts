import OpenAI from 'openai'
import { gatewayBaseUrl } from './env'

/**
 * Lazy-initialized OpenAI client routed through the OpenClaw gateway.
 *
 * Call inside route handlers, not at module top level, so builds don't
 * fail when environment variables aren't set.
 */
let _openai: OpenAI | null = null

export function getOpenAIClient(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      baseURL: gatewayBaseUrl(),
      apiKey: process.env.OPENCLAW_GATEWAY_TOKEN || '',
    })
  }
  return _openai
}
