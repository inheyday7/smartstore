import { NextRequest, NextResponse } from "next/server"
import { withKeyRotation } from "@/lib/gemini"
import { Product } from "@/lib/types"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const TONE_MAP: Record<string, string> = {
  emotional: "따뜻하고 감성적인 톤. 엄마의 정성, 추억, 따뜻함을 강조",
  informative: "정보 중심 톤. 재료 원산지, 제조 과정, 성분을 구체적으로 강조",
  premium: "고급스럽고 신뢰감 있는 톤. 장인 정신, 엄선된 재료, 품질 보증 강조",
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("JSON 파싱 실패")
  return JSON.parse(match[0])
}

export async function POST(req: NextRequest) {
  try {
    const { products, tone } = (await req.json()) as { products: Product[]; tone: string }

    if (!products || products.length < 2) {
      return NextResponse.json({ error: "2개 이상의 상품을 선택해주세요" }, { status: 400 })
    }

    const imageParts: { inlineData: { data: string; mimeType: string } }[] = []
    for (const product of products) {
      if (imageParts.length >= 8) break
      const results = await Promise.allSettled(
        product.image_urls.slice(0, 2).map(async (url) => {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`fetch 실패: ${url}`)
          const buf = await res.arrayBuffer()
          const base64 = Buffer.from(buf).toString("base64")
          const rawType = res.headers.get("content-type") || "image/jpeg"
          const mimeType = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(rawType)
            ? rawType : "image/jpeg"
          return { inlineData: { data: base64, mimeType } }
        })
      )
      for (const r of results) {
        if (r.status === "fulfilled" && imageParts.length < 8) imageParts.push(r.value)
      }
    }

    const productListText = products
      .map((p, i) =>
        `[상품 ${i + 1}] ${p.name}\n특징: ${p.features.join(", ") || "없음"}\n이미지URL: ${p.image_urls.slice(0, 2).join(", ") || "없음"}`
      )
      .join("\n\n")

    const systemPrompt = `당신은 한국 스마트스토어 베이커리 전문 카피라이터 겸 HTML 디자이너입니다.
작성 톤: ${TONE_MAP[tone] || TONE_MAP.emotional}

여러 베이커리 상품을 한 페이지에서 소개하는 기획전/모음전 스타일 상세페이지를 제작해주세요.
전체가 하나의 브랜드처럼 보이되, 각 상품은 개별 섹션으로 명확히 구분해주세요.

반드시 JSON으로만 응답 (다른 텍스트 없이):
{
  "headline": "전체를 아우르는 메인 헤드라인 2~3줄 (줄바꿈은 \\n 사용)",
  "intro": "모든 상품을 함께 소개하는 감성 소개 2~3문장",
  "features": ["공통 핵심 특장점1", "공통 핵심 특장점2", "공통 핵심 특장점3"],
  "ingredients": "상품별 재료 및 원산지 (각 상품명과 함께 설명)",
  "storage": "공통 보관법과 배송 안내",
  "cta": "여러 상품을 함께 구매하도록 유도하는 CTA 문구",
  "htmlFull": "기획전 스타일 완성 HTML. 규칙:\\n1. 전체를 <div style='max-width:860px;margin:0 auto;font-family:Apple SD Gothic Neo,Noto Sans KR,sans-serif;'>으로 감쌀 것\\n2. 섹션: ①브랜드헤더(전체타이틀) ②각상품섹션(상품마다 서브헤더+이미지+특징) ③공통소개 ④핵심특장점3개(flex) ⑤재료원산지 ⑥보관배송 ⑦CTA\\n3. ①: 배경흰색, 전체 타이틀 크게(48~64px,900), 패딩 60px\\n4. ②각상품: 배경 교차(흰색/#f9f5f0), 상품명 서브헤더(32px,700), 이미지 width:100%, 특징 나열\\n5. 나머지 섹션은 기존 베이커리 상세페이지 스타일 동일\\n6. 모든 스타일 인라인, 한 줄로"
}`

    const parsed = await withKeyRotation(async (genAI, modelName) => {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt })
      const result = await model.generateContent([
        ...imageParts,
        { text: `아래 ${products.length}개 베이커리 상품을 하나의 기획전 상세페이지로 만들어주세요:\n\n${productListText}` },
      ])
      return extractJson(result.response.text())
    })

    return NextResponse.json(parsed)
  } catch (e) {
    const message = e instanceof Error ? e.message : "서버 오류"
    console.error("[generate-combined]", message)
    if (message.includes("quota") || message.includes("429")) {
      return NextResponse.json({ error: "API 요청 한도 초과. 잠시 후 다시 시도해주세요" }, { status: 429 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
