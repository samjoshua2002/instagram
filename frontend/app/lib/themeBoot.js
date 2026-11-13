// Light / Dark theme constants (PLAN.md §15.5.3), shared by the server layout and the client hook.
export const THEME_KEY = 'chatter_theme';
// Browser bar colour (meta theme-color) per theme: the page background
export const THEME_COLORS = { light: '#f6f6f6', dark: '#121212' };

// Runs in <head> before paint so a light-theme user never sees a dark flash
export const themeBootScript = `try{var t=localStorage.getItem('${THEME_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;var c=t==='light'?'${THEME_COLORS.light}':'${THEME_COLORS.dark}',m=function(){var e=document.querySelector('meta[name="theme-color"]');if(e)e.setAttribute('content',c);};m();document.addEventListener('DOMContentLoaded',m);}catch(e){}`;
