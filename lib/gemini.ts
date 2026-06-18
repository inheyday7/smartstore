import { GoogleGenerativeAI } from "@google/generative-ai"

function getApiKeys(): string[] {
  return [
    process.env.GOOGLE_API_KEY,
    process.env.GOOGLE_API_KEY_2,
    process.env.GOOGLE_API_KEY_3,
  ].filter(Boolean) as string[]
}

function isRateLimitError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")
}

export async function withKeyRotation<T>(
  fn: (genAI: GoogleGenerativeAI) => Promise<T>
): Promise<T> {
  const keys = getApiKeys()
  if (keys.length === 0) throw new Error("GOOGLE_API_KEY가 설정되지 않았습니다")

  let lastError: unknown
  for (let i = 0; i < keys.length; i++) {
    try {
      return await fn(new GoogleGenerativeAI(keys[i]))
    } catch (e) {
      lastError = e
      if (i < keys.length - 1) continue
    }
  }

  if (isRateLimitError(lastError)) {
    throw new Error("모든 API 키의 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요")
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
