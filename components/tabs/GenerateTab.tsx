"use client"

import { useState, useEffect } from "react"
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

export default function GenerateTab() {
  const [products, setProducts] = useState<Product[]>([])
  const [loadingProducts, setLoadingProducts] = useState(true)
  const [selected, setSelected] = useState<Product | null>(null)
  const [tone, setTone] = useState<Tone>("emotional")
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<GenerateResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false })
      if (mounted) { setProducts(data || []); setLoadingProducts(false) }
    })()
    return () => { mounted = false }
  }, [])

  const handleGenerate = async () => {
    if (!selected) return
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
      })

      if (!res.ok) {
        const { error: apiErr } = await res.json()
        throw new Error(apiErr || "생성 실패")
      }

      const generated: GenerateResult = await res.json()
      setResult(generated)
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류 발생")
    } finally {
      setGenerating(false)
    }
  }

  const getSectionText = (key: keyof GenerateResult): string => {
    if (!result) return ""
    const val = result[key]
    if (Array.isArray(val)) return val.map((v, i) => `${i + 1}. ${v}`).join("\n")
    return val as string
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

      <button
        className="btn-primary w-full justify-center"
        onClick={handleGenerate}
        disabled={!selected || generating}
        style={{ fontSize: 15, padding: "14px 24px" }}
      >
        {generating && <span className="spinner" />}
        {generating ? "생성 중..." : "상세페이지 생성"}
      </button>

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
            <div className="flex gap-2">
              <button className="btn-ghost" onClick={handleGenerate}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
                </svg>
                재생성
              </button>
              <CopyButton text={result.htmlFull} label="HTML 전체 복사" />
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
              <p className="text-xs font-semibold" style={{ color: "rgba(245,158,11,0.8)" }}>완성 HTML</p>
              <CopyButton text={result.htmlFull} label="HTML 복사" />
            </div>
            <pre
              className="text-xs overflow-x-auto"
              style={{
                color: "rgba(255,245,235,0.45)",
                lineHeight: 1.5,
                maxHeight: 160,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {result.htmlFull}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
