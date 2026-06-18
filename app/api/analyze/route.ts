import { NextRequest, NextResponse } from "next/server"
import { withKeyRotation } from "@/lib/gemini"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const IMAGE_SYSTEM_PROMPT = `당신은 한국 스마트스토어 베이커리 카테고리 상세페이지 전문 분석가입니다.
업로드된 경쟁사 상세페이지 스크린샷들을 분석해서 아래 항목을 추출해주세요.

반드시 JSON으로만 응답 (다른 텍스트 없이):
{
  "headline_pattern": "헤드라인 패턴 분석 (감각적 표현, 키워드 배치 방식 등)",
  "trust_factors": "신뢰 요소 분석 (원산지, 수제, 인증, 무방부제 등)",
  "layout_order": "레이아웃 순서 분석 (섹션 배치 순서)",
  "copy_tone": "카피 톤 분석 (감성적/정보적/고급스러운 등)",
  "differentiation": "차별화 포인트 분석 (경쟁사 대비 강조 요소)"
}`

const URL_SYSTEM_PROMPT = `당신은 한국 스마트스토어 베이커리 카테고리 상세페이지 전문 분석가입니다.
아래에 제공된 베이커리 스마트스토어 상품 페이지의 텍스트 내용을 분석해서 마케팅 패턴을 추출해주세요.
텍스트에서 상품명, 소개 문구, 특징, 재료, 보관법, CTA 등을 파악하고 패턴화하세요.

반드시 JSON으로만 응답 (다른 텍스트 없이):
{
  "headline_pattern": "헤드라인 패턴 분석 (감각적 표현, 키워드 배치 방식 등)",
  "trust_factors": "신뢰 요소 분석 (원산지, 수제, 인증, 무방부제 등)",
  "layout_order": "콘텐츠 구성 순서 분석 (어떤 정보가 어떤 순서로 배치됐는지)",
  "copy_tone": "카피 톤 분석 (감성적/정보적/고급스러운 등)",
  "differentiation": "차별화 포인트 분석 (경쟁사 대비 강조 요소)"
}`

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) throw new Error("JSON 파싱 실패: 응답에서 JSON을 찾을 수 없습니다")
  return JSON.parse(match[0])
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#[0-9]+;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
}

async function fetchPageText(url: string): Promise<{ url: string; text: string; title: string }> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "ko-KR,ko;q=0.9",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(10000),
  })

  if (!res.ok) throw new Error(`페이지 접근 실패 (${res.status}): ${url}`)

  const html = await res.text()

  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  const title = titleMatch ? stripHtml(titleMatch[1]) : url

  // meta description, og:description 추출
  const metaMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
  const ogDescMatch =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i)

  const metaText = [metaMatch?.[1], ogDescMatch?.[1]].filter(Boolean).join(" ")

  // body 텍스트 추출 (앞 12000자)
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
  const bodyText = bodyMatch ? stripHtml(bodyMatch[1]).slice(0, 12000) : stripHtml(html).slice(0, 12000)

  const text = `[페이지 제목] ${title}\n[메타 설명] ${metaText}\n[본문 내용]\n${bodyText}`

  return { url, title, text }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { imageUrls, pageUrls } = body as {
      imageUrls?: string[]
      pageUrls?: string[]
    }

    const hasImages = Array.isArray(imageUrls) && imageUrls.length > 0
    const hasPages = Array.isArray(pageUrls) && pageUrls.length > 0

    if (!hasImages && !hasPages) {
      return NextResponse.json({ error: "이미지 또는 URL을 입력해주세요" }, { status: 400 })
    }

    // ── URL 모드 ──────────────────────────────────────────────
    if (hasPages && !hasImages) {
      const pages = await Promise.allSettled(
        pageUrls!.slice(0, 5).map((url) => fetchPageText(url))
      )

      const successPages = pages
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r as PromiseFulfilledResult<{ url: string; title: string; text: string }>).value)

      if (successPages.length === 0) {
        const firstError = pages.find((r) => r.status === "rejected") as PromiseRejectedResult
        throw new Error(firstError?.reason?.message || "모든 페이지 접근에 실패했습니다")
      }

      const combinedText = successPages
        .map((p, i) => `\n\n=== 상품 ${i + 1} (${p.title}) ===\n${p.text}`)
        .join("")

      const parsed = await withKeyRotation(async (genAI) => {
        const model = genAI.getGenerativeModel({
          model: "gemini-2.0-flash",
          systemInstruction: URL_SYSTEM_PROMPT,
        })
        const result = await model.generateContent([
          { text: `아래는 베이커리 스마트스토어 상품 페이지 ${successPages.length}개의 텍스트 내용입니다. 분석해서 JSON으로 패턴을 추출해주세요.\n${combinedText}` },
        ])
        return extractJson(result.response.text())
      })

      return NextResponse.json(parsed)
    }

    // ── 이미지 모드 ────────────────────────────────────────────
    const imageParts = await Promise.all(
      imageUrls!.slice(0, 10).map(async (url: string) => {
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

    const parsed = await withKeyRotation(async (genAI) => {
      const model = genAI.getGenerativeModel({
        model: "gemini-2.0-flash",
        systemInstruction: IMAGE_SYSTEM_PROMPT,
      })
      const result = await model.generateContent([
        ...imageParts,
        { text: "위 베이커리 상세페이지 이미지들을 분석해서 JSON으로 패턴을 추출해주세요." },
      ])
      return extractJson(result.response.text())
    })

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
