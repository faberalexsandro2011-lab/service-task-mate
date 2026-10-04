// Server-side Supabase client with secret key - bypasses RLS.
// Use this for admin operations in server functions and server routes only.
// For user-authenticated queries (with RLS), use the auth middleware instead.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

function createSupabaseAdminClient() {
  const SUPABASE_URL = (process.env['SUPABASE_URL'] || process.env['VITE_SUPABASE_URL'])?.trim();
  const SUPABASE_SECRET_KEY = process.env['SUPABASE_SECRET_KEY']?.trim();

  if (!SUPABASE_URL || !SUPABASE_SECRET_KEY) {
    const missing = [
      ...(!SUPABASE_URL ? ['SUPABASE_URL'] : []),
      ...(!SUPABASE_SECRET_KEY ? ['SUPABASE_SECRET_KEY'] : []),
    ];
    const message = `Missing Supabase environment variable(s): ${missing.join(', ')}. Configure the server secret key in Vercel.`;
    console.error(`[Supabase] ${message}`);
    throw new Error(message);
  }

  // Supabase's server-side admin client accepts the sb_secret_* key directly.
  // Do not manually override Authorization/apikey headers: supabase-js handles
  // the API-key transport and auth headers for the current key format.
  return createClient<Database>(SUPABASE_URL, SUPABASE_SECRET_KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

let _supabaseAdmin: ReturnType<typeof createSupabaseAdminClient> | undefined;

// Server-side Supabase client with secret key - bypasses RLS.
// SECURITY: Only use this for trusted server-side operations, never expose to client code.
// Load inside server handlers: const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
// Top-level import is safe only in other .server.ts modules - route files and *.functions.ts ship to the client bundle.
export const supabaseAdmin = new Proxy({} as ReturnType<typeof createSupabaseAdminClient>, {
  get(_, prop, receiver) {
    if (!_supabaseAdmin) _supabaseAdmin = createSupabaseAdminClient();
    return Reflect.get(_supabaseAdmin, prop, receiver);
  },
});
