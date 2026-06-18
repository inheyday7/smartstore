import { GoogleGenerativeAI } from "@google/generative-ai"

const FALLBACK_MODELS = [
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
]

function getApiKeys(): string[] {
  return [
    process.env.GOOGLE_API_KEY,
    process.env.GOOGLE_API_KEY_2,
    process.env.GOOGLE_API_KEY_3,
    process.env.GOOGLE_API_KEY_4,
    process.env.GOOGLE_API_KEY_5,
  ].filter(Boolean) as string[]
}

function isRateLimitError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes("429") || msg.toLowerCase().includes("quota") || msg.includes("RESOURCE_EXHAUSTED")
}

export async function withKeyRotation<T>(
  fn: (genAI: GoogleGenerativeAI, modelName: string) => Promise<T>
): Promise<T> {
  const keys = getApiKeys()
  if (keys.length === 0) throw new Error("GOOGLE_API_KEY가 설정되지 않았습니다")

  let lastError: unknown

  for (let ki = 0; ki < keys.length; ki++) {
    const genAI = new GoogleGenerativeAI(keys[ki])

    for (const modelName of FALLBACK_MODELS) {
      try {
        return await fn(genAI, modelName)
      } catch (e) {
        lastError = e
        const msg = e instanceof Error ? e.message : String(e)
        console.error(`[gemini] key[${ki}]/${modelName} 실패:`, msg.slice(0, 200))

        // 429: 이 모델만 한도 초과 → 다음 모델 시도 (모델별 한도는 독립적)
        // 404, 503, 기타 → 다음 모델 시도
      }
    }

    if (ki < keys.length - 1) await new Promise((r) => setTimeout(r, 500))
  }

  if (isRateLimitError(lastError)) {
    throw new Error("모든 API 키의 요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요")
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}
