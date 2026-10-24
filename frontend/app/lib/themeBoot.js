// Light / Dark theme constants (PLAN.md §15.5.3), shared by the server layout and the client hook.
export const THEME_KEY = 'chatter_theme';

// Runs in <head> before paint so a light-theme user never sees a dark flash
export const themeBootScript = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;}catch(e){}`;
