import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "스마트스토어 베이커리 상세페이지 생성기",
  description: "AI로 스마트스토어 베이커리 상품 상세페이지를 자동 생성합니다",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
