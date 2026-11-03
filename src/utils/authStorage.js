// "Stay signed in" support for the Supabase client. The session is kept in
// localStorage (survives closing the browser) when the box is ticked, otherwise in
// sessionStorage (gone when the browser closes). The choice is remembered in localStorage.
export const STAY_KEY = 'qrap_stay';

export const readStayPreference = (local) => local.getItem(STAY_KEY) !== '0';
export const writeStayPreference = (local, stay) => local.setItem(STAY_KEY, stay ? '1' : '0');

// A storage object in the shape Supabase's auth client expects.
export function createAuthStorage(local, session) {
  return {
    getItem: (key) => session.getItem(key) ?? local.getItem(key),
    setItem: (key, value) => {
      const [use, other] = readStayPreference(local) ? [local, session] : [session, local];
      use.setItem(key, value);
      other.removeItem(key);
    },
    removeItem: (key) => {
      local.removeItem(key);
      session.removeItem(key);
    }
  };
}
