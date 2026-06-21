import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: "ClaimIt — Temukan Bantuan Sosial yang Tepat",
  description:
    "AI-powered assistant yang membantu orang Indonesia menemukan program bantuan pemerintah berdasarkan kondisi hidup mereka.",
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#fbf6ef',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="id" className="h-full">
      <body className="min-h-full font-sans antialiased">
        {/* Mobile-first shell: full-height on phone, centered card on desktop */}
        <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-background md:my-6 md:min-h-[calc(100vh-3rem)] md:rounded-[2.5rem] md:border md:border-[#efe6d8] md:shadow-[0_8px_30px_rgba(20,20,20,0.1)]">
          {children}
        </div>
      </body>
    </html>
  )
}
