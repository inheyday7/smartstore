"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { SavedPage, GenerateResult } from "@/lib/types"
import SkeletonCard from "@/components/ui/SkeletonCard"
import CopyButton from "@/components/ui/CopyButton"

const TONE_LABELS: Record<string, string> = {
  emotional: "감성",
  informative: "정보",
  premium: "프리미엄",
}

const SECTIONS: { key: keyof GenerateResult; label: string }[] = [
  { key: "headline", label: "헤드라인" },
  { key: "intro", label: "감성 소개" },
  { key: "features", label: "핵심 특장점" },
  { key: "ingredients", label: "재료 & 원산지" },
  { key: "storage", label: "보관 & 배송" },
  { key: "cta", label: "구매 유도 CTA" },
]

const EMPTY_RESULT: GenerateResult = {
  headline: "", intro: "", features: [], ingredients: "", storage: "", cta: "", htmlFull: "",
}

const wrapHtml = (inner: string) =>
  `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"></head><body style="margin:0">${inner}</body></html>`

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function buildHtmlFromResult(result: GenerateResult): string {
  const headlineHtml = esc(result.headline || "").replace(/\n/g, "<br>")
  const features = (result.features || []).slice(0, 3)
  const featureCols = features
    .map(
      (f) => `<div style="flex:1;padding:28px 16px;text-align:center;"><div style="font-size:22px;margin-bottom:10px;">✦</div><p style="font-weight:700;font-size:14px;color:#fff;margin:0;line-height:1.5;">${esc(f)}</p></div>`
    )
    .join(`<div style="width:1px;background:rgba(255,255,255,0.1);"></div>`)

  return `<div style="max-width:860px;margin:0 auto;font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif;"><div style="background:#fff;padding:60px 40px;text-align:center;border-bottom:1px solid #f0ebe5;"><h1 style="font-size:52px;font-weight:900;line-height:1.35;color:#1a0e00;margin:0 0 16px;">${headlineHtml}</h1></div><div style="background:#f9f5f0;padding:60px 40px;text-align:center;"><p style="font-size:16px;line-height:2;color:#4a3520;margin:0;white-space:pre-line;">${esc(result.intro || "")}</p></div>${features.length > 0 ? `<div style="display:flex;background:#3d2b1f;padding:36px 24px;">${featureCols}</div>` : ""}<div style="background:#fff;padding:48px 40px;"><p style="font-size:11px;font-weight:700;color:#b5835a;margin:0 0 14px;letter-spacing:3px;">재료 &amp; 원산지</p><p style="font-size:15px;color:#3d2b1f;line-height:1.9;margin:0;white-space:pre-line;">${esc(result.ingredients || "")}</p></div><div style="background:#f0ede8;padding:36px 40px;"><p style="font-size:11px;font-weight:700;color:#b5835a;margin:0 0 14px;letter-spacing:3px;">📦 보관 &amp; 배송</p><p style="font-size:15px;color:#3d2b1f;line-height:1.9;margin:0;white-space:pre-line;">${esc(result.storage || "")}</p></div><div style="background:#1a0e00;padding:60px 40px;text-align:center;"><p style="font-size:20px;font-weight:700;color:#fff;line-height:1.7;margin:0;white-space:pre-line;">${esc(result.cta || "")}</p></div></div>`
}

export default function HistoryTab() {
  const [pages, setPages] = useState<SavedPage[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  const [editingPage, setEditingPage] = useState<SavedPage | null>(null)
  const [editingResult, setEditingResult] = useState<GenerateResult | null>(null)
  const [editingKey, setEditingKey] = useState<keyof GenerateResult | null>(null)
  const [editDraft, setEditDraft] = useState<string>("")
  const [saving, setSaving] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase
        .from("generated_pages")
        .select("*")
        .order("created_at", { ascending: false })
      if (mounted) {
        setPages((data as SavedPage[]) || [])
        setLoading(false)
      }
    })()
    return () => { mounted = false }
  }, [])

  const handleOpen = (html: string) => {
    const blob = new Blob([wrapHtml(html)], { type: "text/html;charset=utf-8" })
    window.open(URL.createObjectURL(blob), "_blank")
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    await supabase.from("generated_pages").delete().eq("id", id)
    setPages((prev) => prev.filter((p) => p.id !== id))
    setDeleting(null)
  }

  // ── 편집 뷰 헬퍼 ──────────────────────────────────────────

  const getSectionText = (key: keyof GenerateResult): string => {
    if (!editingResult) return ""
    const val = editingResult[key]
    return Array.isArray(val) ? val.map((v, i) => `${i + 1}. ${v}`).join("\n") : (val as string)
  }

  const startEditPage = (page: SavedPage) => {
    setEditingPage(page)
    setEditingResult(page.result ? { ...page.result } : { ...EMPTY_RESULT })
    setEditingKey(null)
    setEditDraft("")
  }

  const startEdit = (key: keyof GenerateResult) => {
    setEditingKey(key)
    setEditDraft(getSectionText(key))
  }

  const cancelEdit = () => {
    setEditingKey(null)
    setEditDraft("")
  }

  const saveEdit = async (key: keyof GenerateResult) => {
    if (!editingResult || !editingPage) return
    setSaving(true)
    const updatedResult: GenerateResult =
      key === "features"
        ? { ...editingResult, features: editDraft.split("\n").map((l) => l.replace(/^\d+\.\s*/, "").trim()).filter(Boolean) }
        : { ...editingResult, [key]: editDraft }

    setEditingResult(updatedResult)
    setEditingKey(null)

    await supabase.from("generated_pages").update({ result: updatedResult }).eq("id", editingPage.id)
    setPages((prev) => prev.map((p) => p.id === editingPage.id ? { ...p, result: updatedResult } : p))
    setSaving(false)
  }

  const exitEditView = () => {
    setEditingPage(null)
    setEditingResult(null)
    setEditingKey(null)
    setEditDraft("")
  }

  const handleApply = async () => {
    if (!editingResult || !editingPage) return
    setApplying(true)
    const newHtml = buildHtmlFromResult(editingResult)
    const updatedPage = { ...editingPage, html: newHtml }
    setEditingPage(updatedPage)
    setPages((prev) => prev.map((p) => p.id === editingPage.id ? updatedPage : p))
    await supabase.from("generated_pages").update({ html: newHtml }).eq("id", editingPage.id)
    setApplying(false)
    setApplied(true)
    setTimeout(() => setApplied(false), 2500)
  }

  // ── 편집 뷰 ───────────────────────────────────────────────

  if (editingPage && editingResult) {
    return (
      <div className="space-y-4 fade-in-up">
        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <button className="btn-ghost" style={{ padding: "6px 12px", fontSize: 12, flexShrink: 0 }} onClick={exitEditView}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            목록으로
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "#fff8f0" }}>
              {editingPage.product_name}
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="tag" style={{ fontSize: 10, padding: "2px 8px" }}>
                {TONE_LABELS[editingPage.tone] || editingPage.tone}
              </span>
              <span className="text-xs" style={{ color: "rgba(255,220,180,0.35)" }}>
                {new Date(editingPage.created_at).toLocaleDateString("ko-KR", {
                  year: "numeric", month: "numeric", day: "numeric",
                })}
              </span>
            </div>
          </div>
          <button
            onClick={handleApply}
            disabled={applying || !!editingKey}
            style={{
              flexShrink: 0, fontSize: 11, padding: "6px 12px", borderRadius: 8,
              border: "none", fontWeight: 700, fontFamily: "inherit", cursor: applying || editingKey ? "not-allowed" : "pointer",
              background: applied ? "rgba(134,239,172,0.85)" : applying ? "rgba(245,158,11,0.5)" : "#f59e0b",
              color: applied ? "#064e3b" : "#1a0e00",
              transition: "all 0.2s", display: "flex", alignItems: "center", gap: 4,
            }}
          >
            {applying ? (
              <><span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5, borderTopColor: "#1a0e00", borderColor: "rgba(26,14,0,0.25)" }} />적용 중...</>
            ) : applied ? (
              <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>적용됨</>
            ) : (
              <><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 11 12 14 22 4" /><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" /></svg>HTML 적용</>
            )}
          </button>
          <button
            className="btn-ghost"
            style={{ padding: "6px 10px", fontSize: 11, flexShrink: 0 }}
            onClick={() => handleOpen(editingPage.html)}
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            새 탭
          </button>
        </div>

        {/* 섹션 편집 */}
        {SECTIONS.map(({ key, label }) => (
          <div key={key} className="result-section">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-semibold" style={{ color: "rgba(245,158,11,0.8)" }}>{label}</p>
              <div className="flex items-center gap-1.5">
                {editingKey !== key && <CopyButton text={getSectionText(key)} />}
                {editingKey === key ? (
                  <>
                    <button
                      onClick={() => saveEdit(key)}
                      disabled={saving}
                      style={{
                        fontSize: 11, padding: "3px 10px", borderRadius: 6, border: "none",
                        background: saving ? "rgba(245,158,11,0.5)" : "#f59e0b",
                        color: "#1a0e00", fontWeight: 700,
                        cursor: saving ? "not-allowed" : "pointer",
                      }}
                    >
                      {saving ? "저장 중..." : "저장"}
                    </button>
                    <button
                      onClick={cancelEdit}
                      disabled={saving}
                      style={{
                        fontSize: 11, padding: "3px 8px", borderRadius: 6,
                        border: "1px solid rgba(255,220,180,0.15)", background: "transparent",
                        color: "rgba(255,220,180,0.45)", cursor: "pointer",
                      }}
                    >
                      취소
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => startEdit(key)}
                    style={{
                      display: "flex", alignItems: "center", gap: 3,
                      fontSize: 11, padding: "3px 8px", borderRadius: 6,
                      border: "1px solid rgba(255,220,180,0.15)", background: "transparent",
                      color: "rgba(255,220,180,0.45)", cursor: "pointer",
                    }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    편집
                  </button>
                )}
              </div>
            </div>

            {editingKey === key ? (
              <textarea
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value)}
                autoFocus
                className="glass-textarea"
                style={{
                  minHeight: key === "features" ? 100 : key === "headline" ? 72 : 80,
                  fontSize: 13,
                  lineHeight: 1.7,
                }}
              />
            ) : key === "features" && Array.isArray(editingResult.features) ? (
              <ul className="space-y-1.5">
                {editingResult.features.map((f: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "rgba(255,245,235,0.8)" }}>
                    <span style={{ color: "#f59e0b", flexShrink: 0, marginTop: 1 }}>•</span>
                    {f}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm whitespace-pre-line" style={{ color: "rgba(255,245,235,0.8)", lineHeight: 1.7 }}>
                {editingResult[key] as string}
              </p>
            )}
          </div>
        ))}

        {/* HTML 미리보기 */}
        <div className="result-section">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold" style={{ color: "rgba(245,158,11,0.8)" }}>완성 HTML 미리보기</p>
            <CopyButton text={editingPage.html} label="HTML 복사" />
          </div>
          <iframe
            srcDoc={wrapHtml(editingPage.html)}
            style={{ width: "100%", minHeight: 600, border: "none", borderRadius: 8, background: "#fff" }}
            sandbox="allow-same-origin"
          />
        </div>
      </div>
    )
  }

  // ── 목록 뷰 ───────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} lines={2} />)}
      </div>
    )
  }

  if (pages.length === 0) {
    return (
      <div className="glass-card p-10 text-center">
        <p className="text-3xl mb-3">🗂️</p>
        <p className="text-sm font-medium mb-1" style={{ color: "rgba(255,220,180,0.7)" }}>
          저장된 상세페이지가 없습니다
        </p>
        <p className="text-xs" style={{ color: "rgba(255,220,180,0.4)" }}>
          생성 탭에서 만들면 자동으로 여기에 저장됩니다
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-xs" style={{ color: "rgba(255,220,180,0.35)" }}>
        총 {pages.length}개 저장됨
      </p>
      <div className="grid grid-cols-2 gap-3">
        {pages.map((page) => (
          <div key={page.id} className="glass-card overflow-hidden">
            {/* 썸네일 */}
            <div
              onClick={() => handleOpen(page.html)}
              style={{
                height: 150,
                overflow: "hidden",
                background: "#fff",
                cursor: "pointer",
                position: "relative",
              }}
            >
              <iframe
                srcDoc={wrapHtml(page.html)}
                sandbox="allow-same-origin"
                style={{
                  width: 860,
                  height: 2000,
                  border: "none",
                  transform: "scale(0.22)",
                  transformOrigin: "top left",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "rgba(245,158,11,0)",
                  transition: "background 0.2s",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                className="hover:bg-amber-400/10"
              />
            </div>

            {/* 정보 */}
            <div className="p-3 space-y-2">
              <p className="text-sm font-semibold truncate" style={{ color: "#fff8f0" }} title={page.product_name}>
                {page.product_name}
              </p>
              <div className="flex items-center justify-between">
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(245,158,11,0.12)", color: "rgba(245,158,11,0.8)" }}
                >
                  {TONE_LABELS[page.tone] || page.tone}
                </span>
                <span className="text-xs" style={{ color: "rgba(255,220,180,0.3)" }}>
                  {new Date(page.created_at).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                </span>
              </div>
              <div className="flex gap-1.5">
                <button
                  className="btn-ghost flex-1 justify-center"
                  style={{ fontSize: 11, padding: "5px 6px" }}
                  onClick={() => handleOpen(page.html)}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                    <polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
                  </svg>
                  새 탭
                </button>
                <button
                  className="btn-ghost flex-1 justify-center"
                  style={{ fontSize: 11, padding: "5px 6px" }}
                  onClick={() => startEditPage(page)}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                  편집
                </button>
                <button
                  onClick={() => handleDelete(page.id)}
                  disabled={deleting === page.id}
                  style={{
                    padding: "5px 10px",
                    borderRadius: 8,
                    border: "1px solid rgba(239,68,68,0.2)",
                    background: "rgba(239,68,68,0.06)",
                    color: "rgba(248,113,113,0.65)",
                    fontSize: 11,
                    cursor: "pointer",
                    opacity: deleting === page.id ? 0.5 : 1,
                  }}
                >
                  삭제
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
