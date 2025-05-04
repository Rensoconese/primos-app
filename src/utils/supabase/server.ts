import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { type CookieOptions } from '@supabase/ssr'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          try {
            const cookie = cookieStore.get(name)
            return cookie?.value
          } catch (error) {
            // Si hay un error, retornamos undefined
            return undefined
          }
        },
        set(name: string, value: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value, ...options })
          } catch (error) {
            // La cookie solo se puede configurar en una respuesta. Si llegamos aquí, 
            // estamos en un middleware o similar donde no podemos establecer cookies.
          }
        },
        remove(name: string, options: CookieOptions) {
          try {
            cookieStore.set({ name, value: '', ...options })
          } catch (error) {
            // Mismo caso que arriba
          }
        },
      },
    }
  )
}
