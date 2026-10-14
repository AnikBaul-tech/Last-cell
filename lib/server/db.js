import { createClient } from '@supabase/supabase-js';
import { ApiError } from './http.js';

let client;

/** Service-role client. Server only: bypasses RLS, so keep it inside /api routes. */
export function admin() {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new ApiError(500, 'Server is missing Supabase environment variables');
    client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return client;
}

/** Unwrap a supabase response or throw. */
export function must(res) {
  if (res.error) {
    console.error('Supabase error:', res.error);
    throw new ApiError(500, 'Database error');
  }
  return res.data;
}
