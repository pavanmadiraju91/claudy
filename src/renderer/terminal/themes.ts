import { TerminalTheme } from '../../shared/types';

/**
 * Emu Terminal - 16-bit Office RPG Theme
 * Warm, cozy pixel-art aesthetic
 */
export const obsidianDarkTheme: TerminalTheme = {
  background: '#3E5553',       // Teal dark (matches floor)
  foreground: '#E8E0D0',       // Cream (wall color)
  cursor: '#D4B07A',           // Brown light (wood accent)
  cursorAccent: '#3E5553',
  selectionBackground: 'rgba(184, 137, 92, 0.3)',  // Brown medium
  selectionForeground: '#FAFAF8',

  // Normal colors - warm palette
  black: '#3E5553',            // Teal dark
  red: '#B85878',              // Muted red
  green: '#58B868',            // Success green
  yellow: '#D4B07A',           // Brown light (wood)
  blue: '#6B8EB8',             // Soft blue
  magenta: '#A878B8',          // Soft purple
  cyan: '#78B8B8',             // Teal light
  white: '#E8E0D0',            // Cream

  // Bright colors
  brightBlack: '#5B7B7B',      // Teal medium
  brightRed: '#D88898',        // Light red
  brightGreen: '#88D8A8',      // Light green
  brightYellow: '#E8C898',     // Brown pale
  brightBlue: '#8EB0D0',       // Light blue
  brightMagenta: '#C8A0D0',    // Light purple
  brightCyan: '#A8D8D8',       // Pale teal
  brightWhite: '#FAFAF8',      // White
};

/**
 * Emu Terminal - Light Theme (cream variant)
 */
export const obsidianLightTheme: TerminalTheme = {
  background: '#E8E0D0',       // Cream (wall color)
  foreground: '#3E5553',       // Teal dark
  cursor: '#7A4A3A',           // Brown dark
  cursorAccent: '#E8E0D0',
  selectionBackground: 'rgba(107, 142, 184, 0.3)',
  selectionForeground: '#3E5553',

  // Normal colors
  black: '#3E5553',
  red: '#983860',
  green: '#48A868',
  yellow: '#B8895C',
  blue: '#5878A8',
  magenta: '#8858A8',
  cyan: '#5B7B7B',
  white: '#F5F0E8',

  // Bright colors
  brightBlack: '#5B7B7B',
  brightRed: '#B85878',
  brightGreen: '#58B868',
  brightYellow: '#D4B07A',
  brightBlue: '#6B8EB8',
  brightMagenta: '#A878B8',
  brightCyan: '#78B8B8',
  brightWhite: '#FAFAF8',
};

/**
 * Convert theme to xterm.js ITheme format
 */
export function toXtermTheme(theme: TerminalTheme): Record<string, string> {
  return {
    background: theme.background,
    foreground: theme.foreground,
    cursor: theme.cursor,
    cursorAccent: theme.cursorAccent,
    selectionBackground: theme.selectionBackground,
    selectionForeground: theme.selectionForeground,
    black: theme.black,
    red: theme.red,
    green: theme.green,
    yellow: theme.yellow,
    blue: theme.blue,
    magenta: theme.magenta,
    cyan: theme.cyan,
    white: theme.white,
    brightBlack: theme.brightBlack,
    brightRed: theme.brightRed,
    brightGreen: theme.brightGreen,
    brightYellow: theme.brightYellow,
    brightBlue: theme.brightBlue,
    brightMagenta: theme.brightMagenta,
    brightCyan: theme.brightCyan,
    brightWhite: theme.brightWhite,
  };
}
