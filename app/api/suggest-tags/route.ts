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

    const systemPrompt = `당신은 한국 네이버 스마트스토어 베이커리 카테고리 SEO 전문가입니다.
상품명과 이미지를 보고 실제로 고객이 네이버에서 검색할 키워드를 추천해주세요.
검색 노출과 구매 전환에 직접적으로 도움이 되는 단어 위주로 뽑아주세요.

키워드 유형 (다양하게 골고루):
- 구매 상황: 생일선물, 답례품, 명절선물, 집들이선물, 크리스마스선물
- 카테고리 검색어: 수제쿠키, 베이커리선물, 쿠키세트, 디저트선물세트
- 트렌드 검색어: 수제베이커리, 홈베이킹, 아티장베이커리
- 특징/차별화: 무방부제, 천연버터, 국산밀가루, 당일생산
- 맛/식감 검색어: 겉바속촉, 촉촉한쿠키, 고소한마들렌 (실제 검색되는 형태)
- 용도/타겟: 아이간식, 직장인간식, 카페디저트
- 비교 키워드: 수제빵, 건강빵, 천연재료빵

규칙: 2~8글자 한국어, 실제 네이버 검색창에 입력할 법한 단어, 중복 없이 다양한 유형으로
반드시 JSON으로만 응답 (다른 텍스트 없이):
{"tags": ["태그1", "태그2", "태그3", "태그4", "태그5", "태그6", "태그7", "태그8", "태그9", "태그10", "태그11", "태그12", "태그13", "태그14", "태그15", "태그16", "태그17", "태그18", "태그19", "태그20"]}`

    const parsed = await withKeyRotation(async (genAI, modelName) => {
      const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt })
      const result = await model.generateContent([
        ...imageParts,
        { text: `상품명: ${productName}\n이 베이커리 상품의 네이버 검색 노출에 도움이 되는 키워드 태그 20개를 추천해주세요.` },
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
