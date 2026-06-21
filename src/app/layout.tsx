import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ClaimIt — Find benefits you actually qualify for',
  description:
    'ClaimIt is an AI navigator that helps you discover US government benefits you qualify for and understand exactly how to apply.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#FAFAF8',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full font-sans antialiased">
        {/* Mobile-first shell: full height on mobile, centered phone-width card on desktop */}
        <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-background md:my-6 md:min-h-[calc(100vh-3rem)] md:rounded-[2.5rem] md:border md:border-border md:shadow-floating">
          {children}
        </div>
      </body>
    </html>
  )
}