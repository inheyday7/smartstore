import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI } from "@google/generative-ai"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const SYSTEM_PROMPT = `당신은 한국 스마트스토어 베이커리 카테고리 상세페이지 전문 분석가입니다.
업로드된 경쟁사 상세페이지 스크린샷들을 분석해서 아래 항목을 추출해주세요.

반드시 JSON으로만 응답 (다른 텍스트 없이):
{
  "headline_pattern": "헤드라인 패턴 분석 (감각적 표현, 키워드 배치 방식 등)",
  "trust_factors": "신뢰 요소 분석 (원산지, 수제, 인증, 무방부제 등)",
  "layout_order": "레이아웃 순서 분석 (섹션 배치 순서)",
  "copy_tone": "카피 톤 분석 (감성적/정보적/고급스러운 등)",
  "differentiation": "차별화 포인트 분석 (경쟁사 대비 강조 요소)"
}`

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("JSON 파싱 실패: 응답에서 JSON을 찾을 수 없습니다")
  return JSON.parse(match[0])
}

export async function POST(req: NextRequest) {
  try {
    const { imageUrls } = await req.json()

    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json({ error: "이미지 URL이 없습니다" }, { status: 400 })
    }

    const limited = imageUrls.slice(0, 10)

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!)
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
      systemInstruction: SYSTEM_PROMPT,
    })

    const imageParts = await Promise.all(
      limited.map(async (url: string) => {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`이미지 다운로드 실패: ${url}`)
        const buf = await res.arrayBuffer()
        const base64 = Buffer.from(buf).toString("base64")
        const rawType = res.headers.get("content-type") || "image/jpeg"
        const mimeType = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(rawType)
          ? rawType
          : "image/jpeg"
        return { inlineData: { data: base64, mimeType } }
      })
    )

    const result = await model.generateContent([
      ...imageParts,
      { text: "위 베이커리 상세페이지 이미지들을 분석해서 JSON으로 패턴을 추출해주세요." },
    ])

    const text = result.response.text()
    const parsed = extractJson(text)

    return NextResponse.json(parsed)
  } catch (e) {
    const message = e instanceof Error ? e.message : "서버 오류"
    console.error("[analyze]", message)

    if (message.includes("quota") || message.includes("429")) {
      return NextResponse.json({ error: "API 요청 한도 초과. 잠시 후 다시 시도해주세요" }, { status: 429 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
