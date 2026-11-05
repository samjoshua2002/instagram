'use client';

import { AppRouterCacheProvider } from '@mui/material-nextjs/v14-appRouter';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// MUI buttons use the same shared icon size as the shadcn Button and plain <button>s.
const iconSize = { '& > *:nth-of-type(1)': { fontSize: 'var(--btn-icon-size)' }, '& svg': { width: 'var(--btn-icon-size)', height: 'var(--btn-icon-size)' } };

const theme = createTheme({
  cssVariables: true,
  typography: { fontFamily: 'var(--font-sans)', button: { textTransform: 'none', fontWeight: 600 } },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 6, gap: 8 },
        startIcon: { ...iconSize, margin: 0 },
        endIcon: { ...iconSize, margin: 0 },
        contained: { background: 'var(--color-text-primary)', color: 'var(--color-surface)', '&:hover': { background: 'var(--color-text-secondary)' } },
        outlined: { color: 'var(--color-text-primary)', borderColor: 'var(--color-border)', '&:hover': { borderColor: 'var(--color-border-strong)', background: 'var(--color-surface-hover)' } },
        text: { color: 'var(--color-text-primary)' },
      },
    },
    MuiIconButton: { styleOverrides: { root: { color: 'var(--color-text-primary)', '& svg': { width: 'var(--btn-icon-size)', height: 'var(--btn-icon-size)' } } } },
  },
});

export default function MuiProvider({ children }) {
  return (
    <AppRouterCacheProvider options={{ key: 'mui', enableCssLayer: true }}>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </AppRouterCacheProvider>
  );
}
