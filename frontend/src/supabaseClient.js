import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

console.log("SUPABASE_URL:", supabaseUrl);
console.log("SUPABASE_KEY exists:", !!supabaseKey);

let portalSupabaseAccessToken = null;

export function setPortalSupabaseAccessToken(token) {
  portalSupabaseAccessToken = token || null;
}

export function clearPortalSupabaseAccessToken() {
  portalSupabaseAccessToken = null;
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  global: {
    fetch: async (url, options = {}) => {
      const nextOptions = { ...options };
      const headers = new Headers(nextOptions.headers || {});

      if (portalSupabaseAccessToken) {
        headers.set("Authorization", `Bearer ${portalSupabaseAccessToken}`);
      }

      nextOptions.headers = headers;
      return fetch(url, nextOptions);
    },
  },
});
