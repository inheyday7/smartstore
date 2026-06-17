import { createClient, SupabaseClient } from "@supabase/supabase-js"

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    const client = getClient()
    const val = (client as unknown as Record<string | symbol, unknown>)[prop]
    return typeof val === "function" ? (val as (...args: unknown[]) => unknown).bind(client) : val
  },
})
