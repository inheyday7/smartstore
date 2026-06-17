"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { supabase } from "@/lib/supabase"
import { Product } from "@/lib/types"
import ProductCard from "@/components/ProductCard"

const BG_PRESETS = [
  "#b5835a", "#c4956a", "#8fad7a", "#d4a0b0",
  "#a89070", "#7a9bb5", "#c4a882", "#4a3728",
]

const EMPTY_FORM = { name: "", bg_color: "#b5835a", features: "" }

export default function ProductTab() {
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
  }

  const addImages = useCallback(
    (newFiles: File[]) => {
      const imgs = newFiles.filter((f) => f.type.startsWith("image/"))
      if (!imgs.length) return
      const total = existingUrls.length + imageFiles.length
      const allowed = Math.max(0, 4 - total)
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
          .from("products")
          .update(payload)
          .eq("id", selectedId)
          .select()
          .single()
        if (dbErr) throw new Error(dbErr.message)
        setProducts((prev) => prev.map((p) => (p.id === selectedId ? updated : p)))
        setExistingUrls(updated.image_urls)
        setSuccessMsg("저장되었습니다")
      } else {
        const { data: created, error: dbErr } = await supabase
          .from("products")
          .insert(payload)
          .select()
          .single()
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

  const showForm = selectedId !== null || isNew
  const totalImages = existingUrls.length + imageFiles.length

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm" style={{ color: "rgba(255,220,180,0.5)" }}>
          상품 {products.length}개
        </p>
        <button className="btn-primary" style={{ padding: "9px 18px", fontSize: 13 }} onClick={openNew}>
          + 상품 추가
        </button>
      </div>

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
          {products.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              isSelected={selectedId === p.id && !isNew}
              onSelect={() => handleSelect(p)}
              onDelete={() => handleDelete(p.id)}
              deleting={deleting === p.id}
              showDelete
            />
          ))}
        </div>
      )}

      {showForm && (
        <div className="glass-card p-5 space-y-4 fade-in-up">
          <p className="text-sm font-semibold" style={{ color: "rgba(255,220,180,0.8)" }}>
            {isNew ? "새 상품 추가" : "상품 편집"}
          </p>

          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "rgba(255,220,180,0.5)" }}>상품명 *</label>
            <input
              className="glass-input"
              placeholder="예: 버터 소금빵"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

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
                  cursor: "pointer", padding: 0,
                  background: "transparent",
                }}
                title="직접 선택"
              />
              <span className="text-xs" style={{ color: "rgba(255,220,180,0.35)" }}>{form.bg_color}</span>
            </div>
          </div>

          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "rgba(255,220,180,0.5)" }}>
              핵심 특징 태그
            </label>
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
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
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
          </div>

          <div>
            <label className="text-xs mb-1.5 block" style={{ color: "rgba(255,220,180,0.5)" }}>
              상품 이미지 ({totalImages}/4)
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

            {totalImages < 4 && (
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
                  클릭 또는 드래그로 이미지 추가 (최대 {4 - totalImages}장)
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
