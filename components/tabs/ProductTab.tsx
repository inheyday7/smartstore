"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { Product, GenerateResult } from "@/lib/types"
import ProductCard from "@/components/ProductCard"
import CopyButton from "@/components/ui/CopyButton"

const MAX_IMAGES = 10

const BG_PRESETS = [
  "#b5835a", "#c4956a", "#8fad7a", "#d4a0b0",
  "#a89070", "#7a9bb5", "#c4a882", "#4a3728",
]

const EMPTY_FORM = { name: "", bg_color: "#b5835a", features: "" }

type Tone = "emotional" | "informative" | "premium"
const TONES: { id: Tone; label: string }[] = [
  { id: "emotional", label: "감성" },
  { id: "informative", label: "정보" },
  { id: "premium", label: "프리미엄" },
]

const wrapHtml = (inner: string) =>
  `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0">${inner}</body></html>`

export default function ProductTab() {
  // ── 기본 상태 ──────────────────────────────────────────────
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [tagInput, setTagInput] = useState("")
  const [tags, setTags] = useState<string[]>([])
  const [imageFiles, setImageFiles] = useState<File[]>([])
  const [imagePreviews, setImagePreviews] = useState<string[]>([])
  const [existingUrls, setExistingUrls] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── AI 태그 추천 ────────────────────────────────────────────
  const [suggestedTags, setSuggestedTags] = useState<string[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(false)

  // ── 합치기 모드 ─────────────────────────────────────────────
  const [mergeMode, setMergeMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mergeTone, setMergeTone] = useState<Tone>("emotional")
  const [merging, setMerging] = useState(false)
  const [mergeResult, setMergeResult] = useState<GenerateResult | null>(null)
  const [mergeError, setMergeError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false })
      if (mounted) { setProducts(data || []); setLoading(false) }
    })()
    return () => { mounted = false }
  }, [])

  // ── 상품 폼 ─────────────────────────────────────────────────
  const openNew = () => {
    setSelectedId(null)
    setIsNew(true)
    setForm(EMPTY_FORM)
    setTags([])
    imagePreviews.forEach((u) => URL.revokeObjectURL(u))
    setImageFiles([])
    setImagePreviews([])
    setExistingUrls([])
    setError(null)
    setSuggestedTags([])
  }

  const handleSelect = (p: Product) => {
    if (selectedId === p.id && !isNew) {
      setSelectedId(null)
      setIsNew(false)
      return
    }
    setSelectedId(p.id)
    setIsNew(false)
    setForm({ name: p.name, bg_color: p.bg_color, features: "" })
    setTags(p.features)
    setExistingUrls(p.image_urls)
    imagePreviews.forEach((u) => URL.revokeObjectURL(u))
    setImageFiles([])
    setImagePreviews([])
    setError(null)
    setSuggestedTags([])
  }

  const addImages = useCallback(
    (newFiles: File[]) => {
      const imgs = newFiles.filter((f) => f.type.startsWith("image/"))
      if (!imgs.length) return
      const total = existingUrls.length + imageFiles.length
      const allowed = Math.max(0, MAX_IMAGES - total)
      const toAdd = imgs.slice(0, allowed)
      const newPreviews = toAdd.map((f) => URL.createObjectURL(f))
      setImageFiles((prev) => [...prev, ...toAdd])
      setImagePreviews((prev) => [...prev, ...newPreviews])
    },
    [existingUrls.length, imageFiles.length]
  )

  const addTag = () => {
    const t = tagInput.trim()
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t])
    setTagInput("")
  }

  const removeTag = (t: string) => setTags((prev) => prev.filter((x) => x !== t))

  const handleSave = async () => {
    if (!form.name.trim()) { setError("상품명을 입력해주세요"); return }
    setSaving(true)
    setError(null)

    try {
      let allUrls = [...existingUrls]

      if (imageFiles.length > 0) {
        const pid = selectedId || `tmp-${Date.now()}`
        const newUrls = await Promise.all(
          imageFiles.map(async (file, idx) => {
            const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
            const path = `images/products/${pid}/${Date.now()}-${idx}-${safe}`
            const { error: upErr } = await supabase.storage
              .from("images")
              .upload(path, file, { contentType: file.type })
            if (upErr) throw new Error(`이미지 업로드 실패: ${upErr.message}`)
            return supabase.storage.from("images").getPublicUrl(path).data.publicUrl
          })
        )
        allUrls = [...allUrls, ...newUrls]
      }

      const payload = {
        name: form.name.trim(),
        bg_color: form.bg_color,
        features: tags,
        image_urls: allUrls,
      }

      if (selectedId && !isNew) {
        const { data: updated, error: dbErr } = await supabase
          .from("products").update(payload).eq("id", selectedId).select().single()
        if (dbErr) throw new Error(dbErr.message)
        setProducts((prev) => prev.map((p) => (p.id === selectedId ? updated : p)))
        setExistingUrls(updated.image_urls)
        setSuccessMsg("저장되었습니다")
      } else {
        const { data: created, error: dbErr } = await supabase
          .from("products").insert(payload).select().single()
        if (dbErr) throw new Error(dbErr.message)
        setProducts((prev) => [created, ...prev])
        setSelectedId(created.id)
        setIsNew(false)
        setExistingUrls(created.image_urls)
        setSuccessMsg("상품이 추가되었습니다")
      }

      imagePreviews.forEach((u) => URL.revokeObjectURL(u))
      setImageFiles([])
      setImagePreviews([])
      setTimeout(() => setSuccessMsg(null), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장 실패")
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("이 상품을 삭제할까요?")) return
    setDeleting(id)
    try {
      await supabase.from("products").delete().eq("id", id)
      setProducts((prev) => prev.filter((p) => p.id !== id))
      if (selectedId === id) { setSelectedId(null); setIsNew(false) }
    } catch (e) {
      setError(e instanceof Error ? e.message : "삭제 실패")
    } finally {
      setDeleting(null)
    }
  }

  // ── AI 태그 추천 ────────────────────────────────────────────
  const handleSuggestTags = async () => {
    if (!form.name.trim()) return
    setLoadingSuggestions(true)
    setSuggestedTags([])
    try {
      const res = await fetch("/api/suggest-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productName: form.name.trim(), imageUrls: existingUrls }),
      })
      const data = await res.json()
      if (Array.isArray(data.tags)) setSuggestedTags(data.tags)
    } catch {
      // silent
    } finally {
      setLoadingSuggestions(false)
    }
  }

  const addSuggestedTag = (tag: string) => {
    if (!tags.includes(tag)) setTags((prev) => [...prev, tag])
  }

  // ── 합치기 모드 ─────────────────────────────────────────────
  const toggleMergeMode = () => {
    const next = !mergeMode
    setMergeMode(next)
    setSelectedIds(new Set())
    setMergeResult(null)
    setMergeError(null)
    if (next) { setSelectedId(null); setIsNew(false) }
  }

  const toggleMergeSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleGenerateMerged = async () => {
    const selectedProducts = products.filter((p) => selectedIds.has(p.id))
    if (selectedProducts.length < 2) return
    setMerging(true)
    setMergeError(null)
    setMergeResult(null)
    try {
      const res = await fetch("/api/generate-combined", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ products: selectedProducts, tone: mergeTone }),
      })
      let data: Record<string, unknown> = {}
      try { data = await res.json() } catch { throw new Error("서버 응답 오류. 다시 시도해주세요") }
      if (!res.ok) throw new Error((data.error as string) || "생성 실패")
      const result = data as unknown as GenerateResult
      setMergeResult(result)
      const names = selectedProducts.map((p) => p.name).join(" + ")
      await supabase.from("generated_pages").insert({
        product_name: `[합치기] ${names}`,
        tone: mergeTone,
        result,
        html: result.htmlFull,
      })
    } catch (e) {
      setMergeError(e instanceof Error ? e.message : "오류 발생")
    } finally {
      setMerging(false)
    }
  }

  const showForm = !mergeMode && (selectedId !== null || isNew)
  const totalImages = existingUrls.length + imageFiles.length

  // ── 합치기 결과 뷰 ──────────────────────────────────────────
  if (mergeMode && mergeResult) {
    return (
      <div className="space-y-5 fade-in-up">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold" style={{ color: "rgba(255,220,180,0.7)" }}>합치기 결과</p>
          <div className="flex gap-2 flex-wrap justify-end">
            <button
              className="btn-ghost"
              onClick={() => { setMergeResult(null); setSelectedIds(new Set()) }}
            >
              다시 선택
            </button>
            <button
              className="btn-ghost"
              onClick={() => {
                const blob = new Blob([wrapHtml(mergeResult.htmlFull)], { type: "text/html;charset=utf-8" })
                window.open(URL.createObjectURL(blob), "_blank")
              }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              새 탭
            </button>
            <CopyButton text={mergeResult.htmlFull} label="HTML" />
            <button className="btn-ghost" onClick={toggleMergeMode}>나가기</button>
          </div>
        </div>

        {[
          { label: "헤드라인", value: mergeResult.headline },
          { label: "감성 소개", value: mergeResult.intro },
          { label: "재료 & 원산지", value: mergeResult.ingredients },
          { label: "보관 & 배송", value: mergeResult.storage },
          { label: "구매 유도 CTA", value: mergeResult.cta },
        ].map(({ label, value }) => (
          <div key={label} className="result-section">
            <p className="text-xs font-semibold mb-2" style={{ color: "rgba(245,158,11,0.8)" }}>{label}</p>
            <p className="text-sm whitespace-pre-line" style={{ color: "rgba(255,245,235,0.8)", lineHeight: 1.7 }}>
              {value}
            </p>
          </div>
        ))}

        {mergeResult.features?.length > 0 && (
          <div className="result-section">
            <p className="text-xs font-semibold mb-2" style={{ color: "rgba(245,158,11,0.8)" }}>핵심 특장점</p>
            <ul className="space-y-1.5">
              {mergeResult.features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "rgba(255,245,235,0.8)" }}>
                  <span style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }}>•</span>{f}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="result-section">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold" style={{ color: "rgba(245,158,11,0.8)" }}>HTML 미리보기</p>
            <CopyButton text={mergeResult.htmlFull} label="HTML 복사" />
          </div>
          <iframe
            srcDoc={mergeResult.htmlFull}
            style={{ width: "100%", minHeight: 600, border: "none", borderRadius: 8, background: "#fff" }}
            sandbox="allow-same-origin"
          />
        </div>

        <p className="text-xs text-center" style={{ color: "rgba(255,220,180,0.3)" }}>
          보관함에 자동 저장되었습니다
        </p>
      </div>
    )
  }

  // ── 메인 뷰 ────────────────────────────────────────────────
  return (
    <div className="space-y-5">

      {/* 상단 버튼 */}
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "rgba(255,220,180,0.5)" }}>
          상품 {products.length}개
        </p>
        <div className="flex gap-2">
          {!mergeMode && (
            <button
              className="btn-primary"
              style={{ padding: "9px 16px", fontSize: 13 }}
              onClick={openNew}
            >
              + 상품 추가
            </button>
          )}
          <button
            className="btn-ghost"
            style={{
              fontSize: 13, padding: "9px 14px",
              ...(mergeMode ? {
                borderColor: "rgba(245,158,11,0.4)",
                background: "rgba(245,158,11,0.07)",
                color: "#f59e0b",
              } : {}),
            }}
            onClick={toggleMergeMode}
          >
            {mergeMode ? "합치기 취소" : "상품 합치기"}
          </button>
        </div>
      </div>

      {/* 합치기 모드 안내 */}
      {mergeMode && (
        <div
          className="glass-card p-3 fade-in-up"
          style={{ borderColor: "rgba(245,158,11,0.2)", background: "rgba(245,158,11,0.04)" }}
        >
          <p className="text-xs" style={{ color: "rgba(245,158,11,0.75)" }}>
            합칠 상품을 선택하세요 — {selectedIds.size}개 선택됨
          </p>
        </div>
      )}

      {/* 상품 그리드 */}
      {loading ? (
        <p className="text-sm text-center py-8" style={{ color: "rgba(255,220,180,0.3)" }}>불러오는 중...</p>
      ) : products.length === 0 && !isNew ? (
        <div className="glass-card p-8 text-center">
          <p className="text-2xl mb-2">📦</p>
          <p className="text-sm" style={{ color: "rgba(255,220,180,0.4)" }}>
            등록된 상품이 없습니다. 상품을 추가해보세요.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {products.map((p) =>
            mergeMode ? (
              <ProductCard
                key={p.id}
                product={p}
                isSelected={selectedIds.has(p.id)}
                onSelect={() => toggleMergeSelect(p.id)}
              />
            ) : (
              <ProductCard
                key={p.id}
                product={p}
                isSelected={selectedId === p.id && !isNew}
                onSelect={() => handleSelect(p)}
                onDelete={() => handleDelete(p.id)}
                deleting={deleting === p.id}
                showDelete
              />
            )
          )}
        </div>
      )}

      {/* 합치기 컨트롤 패널 */}
      {mergeMode && (
        <div className="glass-card p-4 fade-in-up space-y-3">
          <p className="text-xs" style={{ color: "rgba(255,220,180,0.45)" }}>톤 선택</p>
          <div className="flex gap-2">
            {TONES.map((t) => (
              <button
                key={t.id}
                onClick={() => setMergeTone(t.id)}
                style={{
                  flex: 1, padding: "7px 4px", borderRadius: 8, fontSize: 12,
                  border: mergeTone === t.id
                    ? "1px solid rgba(245,158,11,0.5)"
                    : "1px solid rgba(255,220,180,0.12)",
                  background: mergeTone === t.id ? "rgba(245,158,11,0.1)" : "transparent",
                  color: mergeTone === t.id ? "#f59e0b" : "rgba(255,220,180,0.5)",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
          {mergeError && (
            <p className="text-xs" style={{ color: "rgb(248,113,113)" }}>{mergeError}</p>
          )}
          <button
            className="btn-primary justify-center"
            style={{ width: "100%", fontSize: 14, padding: "12px" }}
            onClick={handleGenerateMerged}
            disabled={selectedIds.size < 2 || merging}
          >
            {merging && <span className="spinner" />}
            {merging
              ? "생성 중..."
              : selectedIds.size < 2
                ? `상품을 2개 이상 선택하세요 (${selectedIds.size}개)`
                : `${selectedIds.size}개 상품 합치기 생성`}
          </button>
        </div>
      )}

      {/* 상품 편집 폼 */}
      {showForm && (
        <div className="glass-card p-5 space-y-4 fade-in-up">
          <p className="text-sm font-semibold" style={{ color: "rgba(255,220,180,0.8)" }}>
            {isNew ? "새 상품 추가" : "상품 편집"}
          </p>

          {/* 상품명 */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "rgba(255,220,180,0.5)" }}>상품명 *</label>
            <input
              className="glass-input"
              placeholder="예: 버터 소금빵"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          {/* 배경색 */}
          <div>
            <label className="text-xs mb-2 block" style={{ color: "rgba(255,220,180,0.5)" }}>배경색</label>
            <div className="flex flex-wrap gap-2 items-center">
              {BG_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm((f) => ({ ...f, bg_color: c }))}
                  style={{
                    width: 28, height: 28, borderRadius: "50%",
                    background: c, border: "none", cursor: "pointer",
                    outline: form.bg_color === c ? "2px solid #f59e0b" : "2px solid transparent",
                    outlineOffset: 2,
                  }}
                />
              ))}
              <input
                type="color"
                value={form.bg_color}
                onChange={(e) => setForm((f) => ({ ...f, bg_color: e.target.value }))}
                style={{
                  width: 28, height: 28, borderRadius: "50%",
                  border: "1px solid rgba(255,220,180,0.2)",
                  cursor: "pointer", padding: 0, background: "transparent",
                }}
                title="직접 선택"
              />
              <span className="text-xs" style={{ color: "rgba(255,220,180,0.35)" }}>{form.bg_color}</span>
            </div>
          </div>

          {/* 핵심 특징 태그 + AI 추천 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs" style={{ color: "rgba(255,220,180,0.5)" }}>
                핵심 특징 태그
              </label>
              <button
                onClick={handleSuggestTags}
                disabled={!form.name.trim() || loadingSuggestions}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  fontSize: 11, padding: "3px 9px", borderRadius: 6,
                  border: "1px solid rgba(245,158,11,0.3)",
                  background: "rgba(245,158,11,0.06)",
                  color: !form.name.trim() || loadingSuggestions
                    ? "rgba(245,158,11,0.35)"
                    : "rgba(245,158,11,0.85)",
                  cursor: !form.name.trim() || loadingSuggestions ? "not-allowed" : "pointer",
                  fontFamily: "inherit", transition: "all 0.15s",
                }}
              >
                {loadingSuggestions ? (
                  <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                ) : (
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 1l2.4 7.4H22l-6.2 4.5 2.4 7.3L12 15.7l-6.2 4.5 2.4-7.3L2 8.4h7.6z" />
                  </svg>
                )}
                AI 추천
              </button>
            </div>

            <div className="flex gap-2 mb-2">
              <input
                className="glass-input"
                placeholder="특징 입력 후 Enter"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag() } }}
                style={{ flex: 1 }}
              />
              <button className="btn-ghost" onClick={addTag}>추가</button>
            </div>

            {/* 현재 태그 */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                    <button
                      onClick={() => removeTag(t)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* AI 추천 태그 */}
            {suggestedTags.length > 0 && (
              <div className="fade-in-up">
                <p className="text-xs mb-2" style={{ color: "rgba(245,158,11,0.5)" }}>
                  AI 추천 — 클릭하여 추가
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {suggestedTags.map((t) => {
                    const added = tags.includes(t)
                    return (
                      <button
                        key={t}
                        onClick={() => addSuggestedTag(t)}
                        disabled={added}
                        style={{
                          display: "inline-flex", alignItems: "center", gap: 3,
                          padding: "3px 10px", borderRadius: 20, fontSize: 12,
                          border: added
                            ? "1px solid rgba(245,158,11,0.35)"
                            : "1px dashed rgba(245,158,11,0.4)",
                          background: added ? "rgba(245,158,11,0.1)" : "transparent",
                          color: added ? "rgba(245,158,11,0.45)" : "rgba(245,158,11,0.85)",
                          cursor: added ? "default" : "pointer",
                          fontFamily: "inherit", transition: "all 0.15s",
                        }}
                      >
                        {added ? (
                          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : "+"}
                        {t}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 이미지 업로드 */}
          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "rgba(255,220,180,0.5)" }}>
              상품 이미지 ({totalImages}/{MAX_IMAGES})
            </label>

            {existingUrls.length > 0 && (
              <div className="img-grid mb-2">
                {existingUrls.map((url, i) => (
                  <div key={i} className="img-item">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`existing-${i}`} />
                    <button
                      className="img-remove-btn"
                      onClick={() => setExistingUrls((prev) => prev.filter((_, j) => j !== i))}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            {totalImages < MAX_IMAGES && (
              <div
                className={`upload-zone p-4 text-center ${dragging ? "dragging" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => { e.preventDefault(); setDragging(false); addImages(Array.from(e.dataTransfer.files)) }}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => addImages(Array.from(e.target.files || []))}
                />
                <p className="text-xs" style={{ color: "rgba(255,220,180,0.4)" }}>
                  클릭 또는 드래그로 이미지 추가 (최대 {MAX_IMAGES - totalImages}장 더 추가 가능)
                </p>
              </div>
            )}

            {imagePreviews.length > 0 && (
              <div className="img-grid mt-2">
                {imagePreviews.map((url, i) => (
                  <div key={i} className="img-item">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`new-${i}`} />
                    <button
                      className="img-remove-btn"
                      onClick={() => {
                        URL.revokeObjectURL(url)
                        setImageFiles((prev) => prev.filter((_, j) => j !== i))
                        setImagePreviews((prev) => prev.filter((_, j) => j !== i))
                      }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm" style={{ color: "rgb(248,113,113)" }}>{error}</p>
          )}
          {successMsg && (
            <p className="text-sm" style={{ color: "rgb(134,239,172)" }}>✓ {successMsg}</p>
          )}

          <div className="flex gap-3 pt-1">
            <button className="btn-primary flex-1 justify-center" onClick={handleSave} disabled={saving}>
              {saving && <span className="spinner" />}
              {saving ? "저장 중..." : "저장"}
            </button>
            <button
              className="btn-ghost"
              onClick={() => { setSelectedId(null); setIsNew(false) }}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
