"use client"

import { useState, useEffect, useRef, type Dispatch, type SetStateAction } from "react"
import html2canvas from "html2canvas"
import { supabase } from "@/lib/supabase"
import { Product, LearnedPattern, GenerateResult } from "@/lib/types"
import ProductCard from "@/components/ProductCard"
import CopyButton from "@/components/ui/CopyButton"
import SkeletonCard from "@/components/ui/SkeletonCard"

type Tone = "emotional" | "informative" | "premium"

const TONES: { id: Tone; label: string; desc: string }[] = [
  { id: "emotional", label: "감성·따뜻함", desc: "정성과 추억을 담은 따뜻한 베이커리 이야기" },
  { id: "informative", label: "정보·신뢰감", desc: "재료, 원산지, 제조 과정을 구체적으로 강조" },
  { id: "premium", label: "고급·프리미엄", desc: "장인 정신과 엄선된 재료의 고급 브랜드 톤" },
]

const SECTIONS: { key: keyof GenerateResult; label: string }[] = [
  { key: "headline", label: "헤드라인" },
  { key: "intro", label: "감성 소개" },
  { key: "features", label: "핵심 특장점" },
  { key: "ingredients", label: "재료 & 원산지" },
  { key: "storage", label: "보관 & 배송" },
  { key: "cta", label: "구매 유도 CTA" },
]

interface Props {
  generating: boolean
  setGenerating: Dispatch<SetStateAction<boolean>>
  result: GenerateResult | null
  setResult: Dispatch<SetStateAction<GenerateResult | null>>
  error: string | null
  setError: Dispatch<SetStateAction<string | null>>
  abortRef: { current: AbortController | null }
}

export default function GenerateTab({ generating, setGenerating, result, setResult, error, setError, abortRef }: Props) {
  const [products, setProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [selected, setSelected] = useState<Product | null>(null)
  const [tone, setTone] = useState<Tone>("emotional")

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false })
      if (mounted) {
        const prods = data || []
        setProducts(prods)
        if (prods.length > 0) setSelected(prods[0])
        setLoadingProducts(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const handleGenerate = async () => {
    if (!selected) return
    const controller = new AbortController()
    abortRef.current = controller

    setGenerating(true)
    setError(null)
    setResult(null)

    try {
      const { data: patternData } = await supabase
        .from("learned_patterns")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single()

      const learnedPatterns: LearnedPattern | null = patternData || null

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: selected, tone, learnedPatterns }),
        signal: controller.signal,
      })

      if (!res.ok) {
        const { error: apiErr } = await res.json()
        throw new Error(apiErr || "생성 실패")
      }

      const generated: GenerateResult = await res.json()
      setResult(generated)
      await supabase.from("generated_pages").insert({
        product_name: selected.name,
        tone,
        result: generated,
        html: generated.htmlFull,
      })
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return
      setError(e instanceof Error ? e.message : "오류 발생")
    } finally {
      setGenerating(false)
    }
  }

  const handleStop = () => {
    abortRef.current?.abort()
    setGenerating(false)
  }

  const getSectionText = (key: keyof GenerateResult): string => {
    if (!result) return ""
    const val = result[key]
    if (Array.isArray(val)) return val.map((v, i) => `${i + 1}. ${v}`).join("\n")
    return val as string
  }

  const wrapHtml = (inner: string) =>
    `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">${inner}</body></html>`

  const handleOpenPreview = () => {
    if (!result) return
    const blob = new Blob([wrapHtml(result.htmlFull)], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    window.open(url, "_blank")
  }

  const handleDownloadPDF = () => {
    if (!result) return
    const win = window.open("", "_blank")
    if (!win) return
    win.document.write(wrapHtml(result.htmlFull))
    win.document.close()
    setTimeout(() => win.print(), 500)
  }

  const downloadContainerRef = useRef<HTMLDivElement | null>(null)

  const handleDownloadImage = async () => {
    if (!result) return
    const container = document.createElement("div")
    container.style.cssText = "position:fixed;left:-9999px;top:0;width:860px;background:#fff;"
    container.innerHTML = result.htmlFull
    document.body.appendChild(container)
    downloadContainerRef.current = container
    try {
      const canvas = await html2canvas(container, { useCORS: true, scale: 1.5, logging: false })
      const link = document.createElement("a")
      link.download = `${selected?.name || "상세페이지"}.png`
      link.href = canvas.toDataURL("image/png")
      link.click()
    } finally {
      document.body.removeChild(container)
      downloadContainerRef.current = null
    }
  }

  if (loadingProducts) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => <SkeletonCard key={i} lines={2} />)}
      </div>
    )
  }

  if (products.length === 0) {
    return (
      <div className="glass-card p-10 text-center">
        <p className="text-3xl mb-3">📦</p>
        <p className="text-sm font-medium mb-1" style={{ color: "rgba(255,220,180,0.7)" }}>
          등록된 상품이 없습니다
        </p>
        <p className="text-xs" style={{ color: "rgba(255,220,180,0.4)" }}>
          상품 관리 탭에서 상품을 먼저 등록해주세요
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium mb-3" style={{ color: "rgba(255,220,180,0.5)" }}>
          상품 선택
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              isSelected={selected?.id === p.id}
              onSelect={() => setSelected(selected?.id === p.id ? null : p)}
            />
          ))}
        </div>
      </div>

      {selected && (
        <div className="glass-card p-4 fade-in-up">
          <p className="text-xs mb-2" style={{ color: "rgba(255,220,180,0.4)" }}>선택된 상품</p>
          <p className="text-sm font-semibold" style={{ color: "#fff8f0" }}>{selected.name}</p>
          {selected.features.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {selected.features.map((f) => (
                <span key={f} className="tag">{f}</span>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <p className="text-xs font-medium mb-3" style={{ color: "rgba(255,220,180,0.5)" }}>톤 선택</p>
        <div className="space-y-2">
          {TONES.map((t) => (
            <button
              key={t.id}
              onClick={() => setTone(t.id)}
              className="w-full text-left glass-card p-3.5 transition-all"
              style={
                tone === t.id
                  ? { border: "1px solid rgba(245,158,11,0.45)", background: "rgba(245,158,11,0.06)" }
                  : undefined
              }
            >
              <div className="flex items-center gap-2">
                <div
                  style={{
                    width: 14, height: 14, borderRadius: "50%",
                    border: `2px solid ${tone === t.id ? "#f59e0b" : "rgba(255,220,180,0.25)"}`,
                    background: tone === t.id ? "#f59e0b" : "transparent",
                    flexShrink: 0,
                  }}
                />
                <p className="text-sm font-medium" style={{ color: tone === t.id ? "#f59e0b" : "rgba(255,245,235,0.7)" }}>
                  {t.label}
                </p>
              </div>
              <p className="text-xs mt-1 ml-5" style={{ color: "rgba(255,220,180,0.4)" }}>{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button
          className="btn-primary flex-1 justify-center"
          onClick={handleGenerate}
          disabled={!selected || generating}
          style={{ fontSize: 15, padding: "14px 24px" }}
        >
          {generating && <span className="spinner" />}
          {generating ? "생성 중..." : "상세페이지 생성"}
        </button>
        {generating && (
          <button
            onClick={handleStop}
            style={{
              padding: "14px 18px",
              borderRadius: 10,
              border: "1px solid rgba(239,68,68,0.35)",
              background: "rgba(239,68,68,0.08)",
              color: "rgb(248,113,113)",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            중단
          </button>
        )}
      </div>

      {error && (
        <div
          className="glass-card p-4"
          style={{ borderColor: "rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.05)" }}
        >
          <p className="text-sm" style={{ color: "rgb(248,113,113)" }}>{error}</p>
          <button
            className="text-xs mt-2"
            style={{ color: "rgba(255,220,180,0.4)", background: "none", border: "none", cursor: "pointer" }}
            onClick={() => setError(null)}
          >
            닫기
          </button>
        </div>
      )}

      {generating && !result && (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} lines={i < 2 ? 2 : 3} />)}
        </div>
      )}

      {result && (
        <div className="space-y-4 fade-in-up">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold" style={{ color: "rgba(255,220,180,0.7)" }}>생성 결과</p>
            <div className="flex gap-2 flex-wrap justify-end">
              <button className="btn-ghost" onClick={handleGenerate}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
                재생성
              </button>
              <button className="btn-ghost" onClick={handleOpenPreview}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                새 탭
              </button>
              <button className="btn-ghost" onClick={handleDownloadImage}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                PNG
              </button>
              <button className="btn-ghost" onClick={handleDownloadPDF}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
                </svg>
                PDF
              </button>
              <CopyButton text={result.htmlFull} label="HTML" />
            </div>
          </div>

          {SECTIONS.map(({ key, label }) => (
            <div key={key} className="result-section">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold" style={{ color: "rgba(245,158,11,0.8)" }}>{label}</p>
                <CopyButton text={getSectionText(key)} />
              </div>
              {key === "features" && Array.isArray(result.features) ? (
                <ul className="space-y-1.5">
                  {result.features.map((f: string, i: number) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "rgba(255,245,235,0.8)" }}>
                      <span style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }}>•</span>
                      {f}
                    </li>
                  ))}
                </ul>
              ) : (
                <p
                  className="text-sm whitespace-pre-line"
                  style={{ color: "rgba(255,245,235,0.8)", lineHeight: 1.7 }}
                >
                  {result[key] as string}
                </p>
              )}
            </div>
          ))}

          <div className="result-section">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold" style={{ color: "rgba(245,158,11,0.8)" }}>완성 HTML 미리보기</p>
              <CopyButton text={result.htmlFull} label="HTML 복사" />
            </div>
            <iframe
              srcDoc={result.htmlFull}
              style={{
                width: "100%",
                minHeight: 600,
                border: "none",
                borderRadius: 8,
                background: "#fff",
              }}
              sandbox="allow-same-origin"
            />
          </div>
        </div>
      )}
    </div>
  )
}
