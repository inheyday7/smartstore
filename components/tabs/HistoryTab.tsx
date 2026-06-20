"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { SavedPage } from "@/lib/types"
import SkeletonCard from "@/components/ui/SkeletonCard"

const TONE_LABELS: Record<string, string> = {
  emotional: "감성",
  informative: "정보",
  premium: "프리미엄",
}

const wrapHtml = (inner: string) =>
  `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"></head><body style="margin:0">${inner}</body></html>`

export default function HistoryTab() {
  const [pages, setPages] = useState<SavedPage[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

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
              {/* 호버 오버레이 */}
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
              <p
                className="text-sm font-semibold truncate"
                style={{ color: "#fff8f0" }}
                title={page.product_name}
              >
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
