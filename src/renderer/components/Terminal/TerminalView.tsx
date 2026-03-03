import React, { useEffect, useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { SearchAddon } from '@xterm/addon-search';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import './TerminalView.css';

interface TerminalViewProps {
  isVisible: boolean;
}

// Cyberpunk theme
const theme = {
  background: '#0D0D0F',
  foreground: '#E4E4E7',
  cursor: '#00FFE5',
  cursorAccent: '#0D0D0F',
  selectionBackground: 'rgba(0, 255, 229, 0.25)',
  selectionForeground: '#E4E4E7',
  black: '#16161A',
  red: '#FF00AA',
  green: '#00FFE5',
  yellow: '#FFE066',
  blue: '#8B5CF6',
  magenta: '#FF00AA',
  cyan: '#00FFE5',
  white: '#E4E4E7',
  brightBlack: '#71717A',
  brightRed: '#FF6BC2',
  brightGreen: '#66FFE5',
  brightYellow: '#FFE066',
  brightBlue: '#A78BFA',
  brightMagenta: '#FF6BC2',
  brightCyan: '#66FFE5',
  brightWhite: '#FFFFFF',
};

function TerminalView({ isVisible }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const cleanupDataRef = useRef<(() => void) | null>(null);
  const cleanupExitRef = useRef<(() => void) | null>(null);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current) return;

    // Create terminal
    const terminal = new Terminal({
      theme,
      fontFamily: '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, Monaco, monospace',
      fontSize: 14,
      fontWeight: '400',
      fontWeightBold: '600',
      lineHeight: 1.4,
      letterSpacing: 0,
      cursorStyle: 'bar',
      cursorBlink: true,
      cursorWidth: 2,
      scrollback: 10000,
      tabStopWidth: 4,
      allowProposedApi: true,
      allowTransparency: true,
    });

    // Initialize addons
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(webLinksAddon);

    // Open terminal
    terminal.open(containerRef.current);

    // Try WebGL
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      terminal.loadAddon(webglAddon);
      console.log('[TerminalView] WebGL enabled');
    } catch (error) {
      console.warn('[TerminalView] WebGL not available');
    }

    // Store refs
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    // Initial fit
    requestAnimationFrame(() => fitAddon.fit());

    // Set up PTY data listener
    cleanupDataRef.current = window.electronAPI.onPtyData((data) => {
      terminal.write(data);
    });

    // Set up PTY exit listener
    cleanupExitRef.current = window.electronAPI.onPtyExit((exitCode) => {
      terminal.writeln(`\r\n\x1b[33mClaude exited with code ${exitCode}\x1b[0m`);
    });

    // Forward terminal input to PTY
    terminal.onData((data) => {
      window.electronAPI.ptyWrite(data);
    });

    // Focus on first visible
    if (isVisible) {
      terminal.focus();
    }

    // Cleanup
    return () => {
      cleanupDataRef.current?.();
      cleanupExitRef.current?.();
      terminal.dispose();
    };
  }, []);

  // Handle resize
  useEffect(() => {
    if (!containerRef.current || !fitAddonRef.current || !terminalRef.current) return;

    const handleResize = () => {
      if (fitAddonRef.current && terminalRef.current) {
        fitAddonRef.current.fit();
        const { cols, rows } = terminalRef.current;
        window.electronAPI.ptyResize(cols, rows);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    window.addEventListener('resize', handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Focus when becoming visible
  useEffect(() => {
    if (isVisible && terminalRef.current) {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        terminalRef.current?.focus();
      });
    }
  }, [isVisible]);

  return (
    <div className="terminal-view">
      <div ref={containerRef} className="terminal-container" />
    </div>
  );
}

export default TerminalView;
