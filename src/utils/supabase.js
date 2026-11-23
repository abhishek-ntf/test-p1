/**
 * Lazy Supabase client.
 *  - Credentials come from Vite env (see .env): VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
 *  - The Supabase SDK is loaded from a CDN as an ES module at runtime, so NO
 *    `npm install` is required and Vite's import-analysis never tries to resolve
 *    a bare package specifier (which was causing the build error).
 *  - If credentials are blank, the import is never attempted and the game runs in
 *    offline / local-rival mode.
 */
let _client = null;
let _initPromise = null;

// esm.sh serves the package as a browser-ready ES module with named exports.
const SUPABASE_CDN = 'https://esm.sh/@supabase/supabase-js@2';

export function supabaseEnabled() {
  return !!(import.meta.env?.VITE_SUPABASE_URL && import.meta.env?.VITE_SUPABASE_ANON_KEY);
}

/** Resolves to a Supabase client, or null if not configured/unavailable. */
export function getSupabase() {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const url = import.meta.env?.VITE_SUPABASE_URL;
    const anon = import.meta.env?.VITE_SUPABASE_ANON_KEY;
    if (!url || !anon) { _client = null; console.info('[Supabase] offline mode — .env credentials blank'); return null; }
    try {
      // @vite-ignore keeps Vite from trying to resolve/bundle this at build time;
      // the browser fetches it at runtime only when Supabase is configured.
      const mod = await import(/* @vite-ignore */ SUPABASE_CDN);
      _client = mod.createClient(url, anon, { realtime: { params: { eventsPerSecond: 2 } } });
      console.info('[Supabase] connected ✓');
    } catch (e) {
      console.warn('[Supabase] SDK load failed — using local scores.', e);
      _client = null;
    }
    return _client;
  })();
  return _initPromise;
}
