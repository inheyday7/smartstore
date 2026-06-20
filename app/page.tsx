"use client"

import { useState, useRef } from "react"
import LearnTab from "@/components/tabs/LearnTab"
import ProductTab from "@/components/tabs/ProductTab"
import GenerateTab from "@/components/tabs/GenerateTab"
import HistoryTab from "@/components/tabs/HistoryTab"
import type { GenerateResult } from "@/lib/types"

type TabId = "learn" | "product" | "generate" | "history"

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "learn", label: "학습", icon: "🧠" },
  { id: "product", label: "상품 관리", icon: "📦" },
  { id: "generate", label: "생성", icon: "✨" },
  { id: "history", label: "보관함", icon: "🗂️" },
]

export default function Home() {
  const [activeTab, setActiveTab] = useState<TabId>("learn")
  const [learnPageUrls, setLearnPageUrls] = useState<string[]>([])
  const [generating, setGenerating] = useState(false)
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const generateAbortRef = useRef<AbortController | null>(null)

  return (
    <main className="min-h-screen relative">
      <div className="bg-mesh" />

      <header className="relative z-10 px-4 sm:px-6 pt-8 pb-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🥐</span>
            <span
              className="text-xs tracking-widest font-medium uppercase"
              style={{ color: "rgba(255,220,180,0.4)" }}
            >
              Smartstore Bakery AI
            </span>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "#fff8f0" }}>
            상세페이지 자동 생성기
          </h1>
          <p className="mt-1 text-sm" style={{ color: "rgba(255,220,180,0.45)" }}>
            베이커리 상품 이미지를 학습하고 AI로 판매 페이지를 만들어보세요
          </p>
        </div>
      </header>

      <nav className="relative z-10 px-4 sm:px-6 mb-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex gap-1 p-1 glass" style={{ borderRadius: "12px" }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-200"
                style={{
                  background: activeTab === tab.id ? "#f59e0b" : "transparent",
                  color: activeTab === tab.id ? "#1a0e00" : "rgba(255,220,180,0.5)",
                }}
              >
                <span>{tab.icon}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </nav>

      <div className="relative z-10 px-4 sm:px-6 pb-16">
        <div className="max-w-2xl mx-auto">
          {activeTab === "learn" && (
            <LearnTab pageUrls={learnPageUrls} setPageUrls={setLearnPageUrls} />
          )}
          {activeTab === "product" && <ProductTab />}
          {activeTab === "generate" && (
            <GenerateTab
              generating={generating}
              setGenerating={setGenerating}
              result={generateResult}
              setResult={setGenerateResult}
              error={generateError}
              setError={setGenerateError}
              abortRef={generateAbortRef}
            />
          )}
          {activeTab === "history" && <HistoryTab />}
        </div>
      </div>

      <footer className="fixed bottom-0 inset-x-0 z-10 py-3 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <p className="text-xs" style={{ color: "rgba(255,220,180,0.2)" }}>
            Powered by Google Gemini (무료) · Supabase
          </p>
        </div>
      </footer>
    </main>
  )
}
