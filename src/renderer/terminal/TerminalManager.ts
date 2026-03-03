// Use require for node modules in Electron renderer
const { Terminal } = require('@xterm/xterm');
const { FitAddon } = require('@xterm/addon-fit');
const { WebLinksAddon } = require('@xterm/addon-web-links');
const { SearchAddon } = require('@xterm/addon-search');
const { WebglAddon } = require('@xterm/addon-webgl');
import { obsidianDarkTheme, toXtermTheme } from './themes';
import { BlockManager } from '../blocks/BlockManager';

export class TerminalManager {
  private terminal: Terminal;
  private fitAddon: FitAddon;
  private searchAddon: SearchAddon;
  private webglAddon: WebglAddon | null = null;
  private container: HTMLElement;
  private resizeObserver: ResizeObserver;
  private cleanupData: (() => void) | null = null;
  private cleanupExit: (() => void) | null = null;
  private blockManager: BlockManager;

  constructor(container: HTMLElement, blockContainer: HTMLElement) {
    this.container = container;
    this.blockManager = new BlockManager(blockContainer);

    // Initialize xterm.js
    this.terminal = new Terminal({
      theme: toXtermTheme(obsidianDarkTheme),
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
    this.fitAddon = new FitAddon();
    this.searchAddon = new SearchAddon();
    const webLinksAddon = new WebLinksAddon();

    // Load addons
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.loadAddon(this.searchAddon);
    this.terminal.loadAddon(webLinksAddon);

    // Open terminal in container
    this.terminal.open(container);

    // Try to load WebGL addon for GPU acceleration
    this.initWebGL();

    // Set up resize observer
    this.resizeObserver = new ResizeObserver(() => {
      this.fit();
    });
    this.resizeObserver.observe(container);

    // Initial fit
    requestAnimationFrame(() => {
      this.fit();
    });
  }

  /**
   * Initialize WebGL addon for GPU-accelerated rendering
   */
  private initWebGL(): void {
    try {
      this.webglAddon = new WebglAddon();
      this.webglAddon.onContextLoss(() => {
        this.webglAddon?.dispose();
        this.webglAddon = null;
      });
      this.terminal.loadAddon(this.webglAddon);
      console.log('[Terminal] WebGL rendering enabled');
    } catch (error) {
      console.warn('[Terminal] WebGL not available, using canvas renderer:', error);
    }
  }

  /**
   * Connect to the PTY backend
   */
  async connect(): Promise<void> {
    const { cols, rows } = this.getDimensions();

    // Spawn the PTY process
    const result = await window.terminalAPI.spawn({ cols, rows });

    if (!result.success) {
      console.error('[Terminal] Failed to spawn PTY:', result.error);
      this.terminal.writeln(`\x1b[31mFailed to start shell: ${result.error}\x1b[0m`);
      return;
    }

    // Set up data listener
    this.cleanupData = window.terminalAPI.onData((data: string) => {
      this.terminal.write(data);
      this.blockManager.processOutput(data);
    });

    // Set up exit listener
    this.cleanupExit = window.terminalAPI.onExit((exitCode: number) => {
      this.terminal.writeln(`\r\n\x1b[33mShell exited with code ${exitCode}\x1b[0m`);
      this.blockManager.markExited(exitCode);
    });

    // Forward terminal input to PTY
    this.terminal.onData((data: string) => {
      window.terminalAPI.write(data);
      this.blockManager.processInput(data);
    });

    // Focus the terminal
    this.terminal.focus();
  }

  /**
   * Get terminal dimensions
   */
  private getDimensions(): { cols: number; rows: number } {
    return {
      cols: this.terminal.cols || 80,
      rows: this.terminal.rows || 24,
    };
  }

  /**
   * Fit terminal to container and sync with PTY
   */
  fit(): void {
    try {
      this.fitAddon.fit();
      const { cols, rows } = this.getDimensions();
      window.terminalAPI.resize(cols, rows);
    } catch (error) {
      console.error('[Terminal] Fit error:', error);
    }
  }

  /**
   * Search functionality
   */
  search(term: string, options?: { caseSensitive?: boolean; wholeWord?: boolean; regex?: boolean }): boolean {
    return this.searchAddon.findNext(term, {
      caseSensitive: options?.caseSensitive ?? false,
      wholeWord: options?.wholeWord ?? false,
      regex: options?.regex ?? false,
      decorations: {
        matchBackground: 'rgba(212, 176, 122, 0.3)',  // Brown light
        matchBorder: '#D4B07A',
        matchOverviewRuler: '#D4B07A',
        activeMatchBackground: 'rgba(88, 184, 104, 0.4)',  // Green
        activeMatchBorder: '#58B868',
        activeMatchColorOverviewRuler: '#58B868',
      },
    });
  }

  searchPrevious(term: string): boolean {
    return this.searchAddon.findPrevious(term);
  }

  searchNext(term: string): boolean {
    return this.searchAddon.findNext(term);
  }

  clearSearch(): void {
    this.searchAddon.clearDecorations();
  }

  /**
   * Focus the terminal
   */
  focus(): void {
    this.terminal.focus();
  }

  /**
   * Clear the terminal
   */
  clear(): void {
    this.terminal.clear();
    this.blockManager.clear();
  }

  /**
   * Get the block manager
   */
  getBlockManager(): BlockManager {
    return this.blockManager;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.cleanupData?.();
    this.cleanupExit?.();
    this.resizeObserver.disconnect();
    this.webglAddon?.dispose();
    this.terminal.dispose();
    window.terminalAPI.kill();
  }
}
