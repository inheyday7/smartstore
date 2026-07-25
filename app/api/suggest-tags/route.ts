import { NextRequest, NextResponse } from "next/server"
import { withKeyRotation } from "@/lib/gemini"

export const dynamic = "force-dynamic"
export const maxDuration = 30

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("JSON 파싱 실패")
  return JSON.parse(match[0])
}

export async function POST(req: NextRequest) {
  try {
    const { productName, imageUrls } = (await req.json()) as {
      productName: string
      imageUrls?: string[]
    }

    if (!productName) {
      return NextResponse.json({ error: "상품명이 없습니다" }, { status: 400 })
    }

    const imageParts: { inlineData: { data: string; mimeType: string } }[] = []
    if (Array.isArray(imageUrls) && imageUrls.length > 0) {
      const results = await Promise.allSettled(
        imageUrls.slice(0, 4).map(async (url) => {
          const res = await fetch(url)
          if (!res.ok) throw new Error(`이미지 다운로드 실패: ${url}`)
          const buf = await res.arrayBuffer()
          const base64 = Buffer.from(buf).toString("base64")
          const rawType = res.headers.get("content-type") || "image/jpeg"
          const mimeType = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(rawType)
            ? rawType : "image/jpeg"
          return { inlineData: { data: base64, mimeType } }
        })
      )
      for (const r of results) {
        if (r.status === "fulfilled") imageParts.push(r.value)
      }
    }

    const systemPrompt = `당신은 한국 스마트스토어 베이커리 상품 전문가입니다.
상품명과 이미지를 보고 스마트스토어 상세페이지 카피 작성에 유용한 핵심 키워드 태그를 추천해주세요.
키워드 유형 (다양하게 골고루): 식감(겉바속촉), 재료(천연버터, 국산밀), 맛·향(고소함, 달콤함), 용도(선물용, 간식), 제조방식(수제, 직화), 감성(정성, 홈베이킹), 외관(비주얼, 황금빛), 특징(무방부제, 냉동불필요)
규칙: 2~6글자 한국어, 상품과 직접 관련된 구체적인 단어, 중복 없이 다양한 유형으로
반드시 JSON으로만 응답 (다른 텍스트 없이):
{"tags": ["태그1", "태그2", "태그3", "태그4", "태그5", "태그6", "태그7", "태그8", "태그9", "태그10", "태그11", "태그12", "태그13", "태그14", "태그15", "태그16", "태그17", "태그18", "태그19", "태그20"]}`

    const parsed = await withKeyRotation(async (genAI, modelName) => {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt })
      const result = await model.generateContent([
        ...imageParts,
        { text: `상품명: ${productName}\n이 베이커리 상품의 핵심 키워드 태그 20개를 추천해주세요.` },
      ])
      return extractJson(result.response.text())
    })

    return NextResponse.json(parsed)
  } catch (e) {
    const message = e instanceof Error ? e.message : "서버 오류"
    console.error("[suggest-tags]", message)
    if (message.includes("quota") || message.includes("429")) {
      return NextResponse.json({ error: "API 요청 한도 초과" }, { status: 429 })
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
