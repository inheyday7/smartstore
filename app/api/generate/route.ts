import { NextRequest, NextResponse } from "next/server"
import { withKeyRotation } from "@/lib/gemini"
import { Product, LearnedPattern } from "@/lib/types"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const TONE_MAP: Record<string, string> = {
  emotional: "따뜻하고 감성적인 톤. 엄마의 정성, 추억, 따뜻함을 강조",
  informative: "정보 중심 톤. 재료 원산지, 제조 과정, 성분을 구체적으로 강조",
  premium: "고급스럽고 신뢰감 있는 톤. 장인 정신, 엄선된 재료, 품질 보증 강조",
}

function buildSystemPrompt(learnedPatterns: LearnedPattern | null, tone: string): string {
  const patternSection = learnedPatterns
    ? `
[경쟁사 분석으로 학습된 추가 패턴]
헤드라인 패턴: ${learnedPatterns.headline_pattern}
신뢰 요소: ${learnedPatterns.trust_factors}
레이아웃 순서: ${learnedPatterns.layout_order}
카피 톤: ${learnedPatterns.copy_tone}
차별화 포인트: ${learnedPatterns.differentiation}
`
    : ""

  return `당신은 한국 스마트스토어 베이커리 전문 카피라이터입니다.
작성 톤: ${TONE_MAP[tone] || TONE_MAP.emotional}

[베이커리 상세페이지 기본 패턴]
- 헤드라인: 식감·향 등 감각적 경험 먼저 ("겉바속촉", "버터향이", "한 입에")
- 재료 신뢰: 국산·무방부제·수제 강조
- 스토리: 매일 굽는다, 직접 만든다는 수제 이미지
- 보관법: 베이커리 필수 항목 (실온/냉동, 해동법)
- CTA: 선물·특별한 날 연결로 구매 동기 자극
${patternSection}
반드시 JSON으로만 응답 (다른 텍스트 없이):
{
  "headline": "메인 헤드라인 2~3줄 (줄바꿈은 \\n 사용)",
  "intro": "감성 소개 2~3문장",
  "features": ["핵심 특장점1", "핵심 특장점2", "핵심 특장점3"],
  "ingredients": "재료 및 원산지 설명",
  "storage": "보관법과 배송 안내",
  "cta": "구매 유도 CTA 문구",
  "htmlFull": "위 6개 섹션을 합친 완성 HTML. 인라인 스타일로 스마트스토어에 바로 붙여넣기 가능한 형태. 배경색 적용 포함."
}`
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("JSON 파싱 실패")
  return JSON.parse(match[0])
}

export async function POST(req: NextRequest) {
  try {
    const { product, tone, learnedPatterns } = (await req.json()) as {
      product: Product
      tone: string
      learnedPatterns: LearnedPattern | null
    }

    if (!product?.name) {
      return NextResponse.json({ error: "상품 정보가 없습니다" }, { status: 400 })
    }

    const imageParts: { inlineData: { data: string; mimeType: string } }[] = []

    if (product.image_urls?.length > 0) {
      const results = await Promise.allSettled(
        product.image_urls.slice(0, 4).map(async (url) => {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`fetch 실패: ${url}`)
          const buf = await res.arrayBuffer()
          const base64 = Buffer.from(buf).toString("base64")
          const rawType = res.headers.get("content-type") || "image/jpeg"
          const mimeType = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(rawType)
            ? rawType
            : "image/jpeg"
          return { inlineData: { data: base64, mimeType } }
        })
      )
      for (const r of results) {
        if (r.status === "fulfilled") imageParts.push(r.value)
      }
    }

    const userText = `상품명: ${product.name}
브랜드 컬러: ${product.bg_color}
핵심 특징: ${product.features.join(", ")}

위 상품의 스마트스토어 베이커리 상세페이지 카피를 JSON으로 작성해주세요.`

    const parsed = await withKeyRotation(async (genAI) => {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction: buildSystemPrompt(learnedPatterns, tone),
      })
      const result = await model.generateContent([
        ...imageParts,
        { text: userText },
      ])
      return extractJson(result.response.text())
    })

    return NextResponse.json(parsed)
  } catch (e) {
    const message = e instanceof Error ? e.message : "서버 오류"
    console.error("[generate]", message)

    if (message.includes("quota") || message.includes("429")) {
      return NextResponse.json({ error: "API 요청 한도 초과. 잠시 후 다시 시도해주세요" }, { status: 429 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
