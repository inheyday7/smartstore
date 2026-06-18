"use client"

import { useState, useRef, useCallback, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import { LearnedPattern } from "@/lib/types"
import SkeletonCard from "@/components/ui/SkeletonCard"

type Status = "idle" | "uploading" | "analyzing" | "done" | "error"
type Mode = "image" | "url"

const PATTERN_LABELS: { key: keyof LearnedPattern; label: string }[] = [
  { key: "headline_pattern", label: "헤드라인 패턴" },
  { key: "trust_factors", label: "신뢰 요소" },
  { key: "layout_order", label: "레이아웃 순서" },
  { key: "copy_tone", label: "카피 톤" },
  { key: "differentiation", label: "차별화 포인트" },
]

interface Props {
  pageUrls: string[]
  setPageUrls: (urls: string[]) => void
}

export default function LearnTab({ pageUrls, setPageUrls }: Props) {
  const [mode, setMode] = useState<Mode>("url")

  // 이미지 모드
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)

  // URL 모드
  const [urlInput, setUrlInput] = useState("")

  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)
  const [latestPattern, setLatestPattern] = useState<LearnedPattern | null>(null)
  const [history, setHistory] = useState<LearnedPattern[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { data } = await supabase
        .from("learned_patterns")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(5)
      if (!mounted) return
      if (data && data.length > 0) {
        setLatestPattern(data[0])
        setHistory(data)
      }
      setLoadingHistory(false)
    })()
    return () => { mounted = false }
  }, [])

  // ── 이미지 관련 ────────────────────────────────────────────
  const addFiles = useCallback(
    (newFiles: File[]) => {
      const imgs = newFiles.filter((f) => f.type.startsWith("image/"))
      if (!imgs.length) return
      const merged = [...files, ...imgs].slice(0, 10)
      const addedCount = merged.length - files.length
      const newPreviews = imgs.slice(0, addedCount).map((f) => URL.createObjectURL(f))
      setFiles(merged)
      setPreviews((prev) => [...prev, ...newPreviews].slice(0, 10))
    },
    [files]
  )

  const removeFile = (idx: number) => {
    URL.revokeObjectURL(previews[idx])
    setFiles((prev) => prev.filter((_, i) => i !== idx))
    setPreviews((prev) => prev.filter((_, i) => i !== idx))
  }

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragging(false)
      addFiles(Array.from(e.dataTransfer.files))
    },
    [addFiles]
  )

  useEffect(() => {
    if (mode !== "image") return
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imageFiles: File[] = []
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile()
          if (file) imageFiles.push(file)
        }
      }
      if (imageFiles.length > 0) addFiles(imageFiles)
    }
    document.addEventListener("paste", handlePaste)
    return () => document.removeEventListener("paste", handlePaste)
  }, [mode, addFiles])

  // ── URL 관련 ────────────────────────────────────────────────
  const addUrl = () => {
    const url = urlInput.trim()
    if (!url) return
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      setError("http:// 또는 https://로 시작하는 URL을 입력해주세요")
      return
    }
    if (pageUrls.includes(url)) {
      setError("이미 추가된 URL입니다")
      return
    }
    if (pageUrls.length >= 5) {
      setError("URL은 최대 5개까지 추가할 수 있습니다")
      return
    }
    setPageUrls([...pageUrls, url])
    setUrlInput("")
    setError(null)
  }

  const removeUrl = (idx: number) => setPageUrls(pageUrls.filter((_, i) => i !== idx))

  // ── 분석 ────────────────────────────────────────────────────
  const handleAnalyze = async () => {
    const isImageMode = mode === "image"
    if (isImageMode && !files.length) return
    if (!isImageMode && !pageUrls.length) return

    setError(null)

    const uploadedUrls: string[] = []

    if (isImageMode) {
      setStatus("uploading")
      try {
        const timestamp = Date.now()
        await Promise.all(
          files.map(async (file, idx) => {
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_")
            const path = `images/learn/${timestamp}-${idx}-${safeName}`
            const { error: upErr } = await supabase.storage
              .from("images")
              .upload(path, file, { contentType: file.type })
            if (upErr) throw new Error(`업로드 실패: ${upErr.message}`)
            const { data: { publicUrl } } = supabase.storage.from("images").getPublicUrl(path)
            uploadedUrls[idx] = publicUrl
          })
        )
      } catch (e) {
        setError(e instanceof Error ? e.message : "업로드 실패")
        setStatus("error")
        return
      }
    }

    setStatus("analyzing")

    try {
      const body = isImageMode
        ? { imageUrls: uploadedUrls }
        : { pageUrls }

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const { error: apiErr } = await res.json()
        throw new Error(apiErr || "분석 실패")
      }

      const result = await res.json()

      const { data: saved, error: dbErr } = await supabase
        .from("learned_patterns")
        .insert({
          headline_pattern: result.headline_pattern,
          trust_factors: result.trust_factors,
          layout_order: result.layout_order,
          copy_tone: result.copy_tone,
          differentiation: result.differentiation,
        })
        .select()
        .single()

      if (dbErr) throw new Error(`저장 실패: ${dbErr.message}`)

      setLatestPattern(saved)
      setHistory((prev) => [saved, ...prev].slice(0, 5))
      setStatus("done")

      if (isImageMode) {
        previews.forEach((u) => URL.revokeObjectURL(u))
        setFiles([])
        setPreviews([])
      } else {
        setPageUrls([])
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류 발생")
      setStatus("error")
    }
  }

  const isBusy = status === "uploading" || status === "analyzing"
  const canAnalyze = mode === "image" ? files.length > 0 : pageUrls.length > 0

  const statusLabel = status === "uploading"
    ? "이미지 업로드 중..."
    : status === "analyzing"
    ? "AI 분석 중..."
    : mode === "image"
    ? `분석 시작 (${files.length}장)`
    : `분석 시작 (${pageUrls.length}개 URL)`

  return (
    <div className="space-y-5">
      {/* 모드 탭 */}
      <div className="flex gap-1 p-1 glass" style={{ borderRadius: "10px" }}>
        {([
          { id: "url" as Mode, icon: "🔗", label: "URL 입력" },
          { id: "image" as Mode, icon: "📸", label: "스크린샷" },
        ] as const).map((m) => (
          <button
            key={m.id}
            onClick={() => { setMode(m.id); setError(null) }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-sm font-medium transition-all duration-200"
            style={{
              background: mode === m.id ? "#f59e0b" : "transparent",
              color: mode === m.id ? "#1a0e00" : "rgba(255,220,180,0.5)",
            }}
          >
            <span>{m.icon}</span>
            <span>{m.label}</span>
          </button>
        ))}
      </div>

      {/* URL 입력 모드 */}
      {mode === "url" && (
        <div className="space-y-3">
          <div className="glass-card p-4">
            <p className="text-xs mb-3" style={{ color: "rgba(255,220,180,0.5)" }}>
              스마트스토어 상품 페이지 URL을 입력하면 AI가 텍스트를 분석합니다 (최대 5개)
            </p>
            <div className="flex gap-2">
              <input
                className="glass-input"
                placeholder="https://smartstore.naver.com/..."
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addUrl() } }}
                style={{ flex: 1 }}
              />
              <button
                className="btn-ghost"
                onClick={addUrl}
                style={{ flexShrink: 0 }}
              >
                추가
              </button>
            </div>
          </div>

          {pageUrls.length > 0 && (
            <div className="glass-card p-4 space-y-2">
              <p className="text-xs font-medium mb-2" style={{ color: "rgba(255,220,180,0.5)" }}>
                분석할 URL ({pageUrls.length}/5)
              </p>
              {pageUrls.map((url, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 py-2 px-3 rounded-lg"
                  style={{ background: "rgba(255,245,235,0.04)", border: "1px solid rgba(255,220,180,0.07)" }}
                >
                  <span className="text-xs" style={{ color: "rgba(245,158,11,0.6)", flexShrink: 0 }}>
                    {i + 1}
                  </span>
                  <span
                    className="text-xs flex-1 truncate"
                    style={{ color: "rgba(255,245,235,0.6)" }}
                    title={url}
                  >
                    {url}
                  </span>
                  <button
                    onClick={() => removeUrl(i)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      color: "rgba(255,220,180,0.3)", fontSize: 16, lineHeight: 1, flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          <div
            className="glass-card p-3"
            style={{ borderColor: "rgba(255,220,180,0.05)", background: "rgba(255,245,235,0.02)" }}
          >
            <p className="text-xs" style={{ color: "rgba(255,220,180,0.3)", lineHeight: 1.6 }}>
              💡 JS 렌더링 페이지(스마트스토어 상세 이미지)는 텍스트만 추출되므로
              이미지 기반 분석보다 정확도가 낮을 수 있습니다.
              상품 소개 텍스트가 풍부한 페이지일수록 분석이 정확합니다.
            </p>
          </div>
        </div>
      )}

      {/* 스크린샷 업로드 모드 */}
      {mode === "image" && (
        <div className="space-y-3">
          <div
            className={`upload-zone p-8 text-center ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => addFiles(Array.from(e.target.files || []))}
            />
            <div className="text-3xl mb-2">📸</div>
            <p className="text-sm font-medium" style={{ color: "rgba(255,220,180,0.7)" }}>
              드래그하거나 클릭해서 업로드
            </p>
            <p className="text-xs mt-1.5" style={{ color: "rgba(255,220,180,0.45)" }}>
              또는 <kbd style={{
                background: "rgba(255,220,180,0.1)",
                border: "1px solid rgba(255,220,180,0.2)",
                borderRadius: 4,
                padding: "1px 5px",
                fontSize: 11,
                fontFamily: "monospace",
              }}>Ctrl+V</kbd> 로 클립보드 이미지 붙여넣기
            </p>
            <p className="text-xs mt-1" style={{ color: "rgba(255,220,180,0.25)" }}>
              JPG, PNG 최대 10장
            </p>
          </div>

          {previews.length > 0 && (
            <div className="glass-card p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium" style={{ color: "rgba(255,220,180,0.7)" }}>
                  업로드 이미지 ({previews.length}/10)
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    previews.forEach((u) => URL.revokeObjectURL(u))
                    setFiles([])
                    setPreviews([])
                  }}
                  style={{ color: "rgba(255,220,180,0.35)", cursor: "pointer", background: "none", border: "none", fontSize: 12 }}
                >
                  전체 제거
                </button>
              </div>
              <div className="img-grid">
                {previews.map((url, i) => (
                  <div key={i} className="img-item">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`preview-${i}`} />
                    <button
                      className="img-remove-btn"
                      onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                    >×</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 분석 버튼 */}
      <button
        className="btn-primary w-full justify-center"
        onClick={handleAnalyze}
        disabled={!canAnalyze || isBusy}
      >
        {isBusy && <span className="spinner" />}
        {statusLabel}
      </button>

      {/* 에러 */}
      {error && (
        <div
          className="glass-card p-4"
          style={{ borderColor: "rgba(239,68,68,0.25)", background: "rgba(239,68,68,0.05)" }}
        >
          <p className="text-sm" style={{ color: "rgb(248,113,113)" }}>{error}</p>
          <button
            className="text-xs mt-2"
            style={{ color: "rgba(255,220,180,0.4)", background: "none", border: "none", cursor: "pointer" }}
            onClick={() => { setError(null); setStatus("idle") }}
          >
            닫기
          </button>
        </div>
      )}

      {/* 완료 메시지 */}
      {status === "done" && (
        <div
          className="glass-card p-4"
          style={{ borderColor: "rgba(134,239,172,0.2)", background: "rgba(134,239,172,0.04)" }}
        >
          <p className="text-sm" style={{ color: "rgb(134,239,172)" }}>✓ 분석이 완료되어 저장되었습니다</p>
        </div>
      )}

      {/* 분석 결과 */}
      <div>
        <p className="text-xs font-medium mb-3" style={{ color: "rgba(255,220,180,0.4)" }}>
          {loadingHistory
            ? "분석 결과 불러오는 중..."
            : latestPattern
            ? "최근 분석 결과"
            : "아직 분석한 데이터가 없습니다"}
        </p>

        {loadingHistory && (
          <div className="space-y-3">
            <SkeletonCard lines={3} />
            <SkeletonCard lines={2} />
          </div>
        )}

        {!loadingHistory && latestPattern && (
          <div className="space-y-3 fade-in-up">
            {PATTERN_LABELS.map(({ key, label }) => (
              <div key={key} className="glass-card p-4">
                <p className="text-xs font-semibold mb-2" style={{ color: "rgba(245,158,11,0.8)" }}>
                  {label}
                </p>
                <p className="text-sm" style={{ color: "rgba(255,245,235,0.75)", lineHeight: 1.6 }}>
                  {latestPattern[key] as string}
                </p>
              </div>
            ))}

            {history.length > 1 && (
              <div className="mt-4">
                <p className="text-xs mb-2" style={{ color: "rgba(255,220,180,0.3)" }}>
                  이전 분석 ({history.length - 1}건)
                </p>
                {history.slice(1).map((p) => (
                  <button
                    key={p.id}
                    className="w-full text-left glass-card p-3 mb-2 hover:opacity-80 transition-opacity"
                    style={{ cursor: "pointer" }}
                    onClick={() => setLatestPattern(p)}
                  >
                    <p className="text-xs" style={{ color: "rgba(255,220,180,0.5)" }}>
                      {new Date(p.created_at).toLocaleDateString("ko-KR", {
                        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                    <p className="text-xs mt-1 truncate" style={{ color: "rgba(255,245,235,0.5)" }}>
                      {p.headline_pattern}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
