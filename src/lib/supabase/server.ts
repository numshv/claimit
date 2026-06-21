import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Use inside Server Components, Route Handlers, and Server Actions.
// Must be called fresh each time (cookies() is request-scoped).
export async function createClient() {
  // In Next.js 16, cookies() returns Promise<ReadonlyRequestCookies>.
  // We use `as any` to bypass a TypeScript inference bug where the awaited
  // type is not properly unwrapped — the runtime value is always correct.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cookieStore = await cookies() as any

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: object }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Called from a Server Component — safe to ignore because
            // middleware refreshes the session on every request.
          }
        },
      },
    }
  )
}
