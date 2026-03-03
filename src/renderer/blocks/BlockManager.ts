import { CommandBlock } from '../../shared/types';

/**
 * BlockManager handles Warp-style command blocks
 * Parses terminal output to detect command boundaries and renders blocks
 */
export class BlockManager {
  private container: HTMLElement;
  private blocks: CommandBlock[] = [];
  private currentBlock: CommandBlock | null = null;
  private inputBuffer: string = '';
  private promptPattern: RegExp;
  private lastPromptTime: number = 0;

  constructor(container: HTMLElement) {
    this.container = container;

    // Pattern to detect shell prompts (covers most common prompts)
    // Matches: user@host:path$, user@host path%, >, $, %, etc.
    this.promptPattern = /(\$|>|%|#)\s*$/;
  }

  /**
   * Process input from the user (keystrokes)
   */
  processInput(data: string): void {
    // Detect Enter key (command submission)
    if (data === '\r' || data === '\n') {
      if (this.inputBuffer.trim()) {
        this.startNewBlock(this.inputBuffer.trim());
        this.inputBuffer = '';
      }
    } else if (data === '\x7f' || data === '\b') {
      // Backspace
      this.inputBuffer = this.inputBuffer.slice(0, -1);
    } else if (data.length === 1 && data.charCodeAt(0) >= 32) {
      // Printable character
      this.inputBuffer += data;
    } else if (data.startsWith('\x1b')) {
      // Escape sequence (arrows, etc.) - ignore for command tracking
    } else {
      this.inputBuffer += data;
    }
  }

  /**
   * Process output from the shell
   */
  processOutput(data: string): void {
    if (this.currentBlock) {
      this.currentBlock.output += data;
      this.updateBlockElement(this.currentBlock);

      // Check if output ends with a prompt (command completed)
      const strippedOutput = this.stripAnsi(data);
      if (this.promptPattern.test(strippedOutput)) {
        const now = Date.now();
        // Debounce prompt detection
        if (now - this.lastPromptTime > 100) {
          this.completeCurrentBlock();
          this.lastPromptTime = now;
        }
      }
    }
  }

  /**
   * Start a new command block
   */
  private startNewBlock(command: string): void {
    // Complete any existing block
    if (this.currentBlock) {
      this.completeCurrentBlock();
    }

    const block: CommandBlock = {
      id: this.generateId(),
      command,
      output: '',
      startTime: Date.now(),
      isRunning: true,
      isCollapsed: false,
    };

    this.currentBlock = block;
    this.blocks.push(block);
    this.renderBlock(block);
  }

  /**
   * Mark the current block as complete
   */
  private completeCurrentBlock(exitCode?: number): void {
    if (this.currentBlock) {
      this.currentBlock.isRunning = false;
      this.currentBlock.endTime = Date.now();
      this.currentBlock.exitCode = exitCode ?? this.detectExitCode();
      this.updateBlockElement(this.currentBlock);
      this.currentBlock = null;
    }
  }

  /**
   * Called when the shell exits
   */
  markExited(exitCode: number): void {
    if (this.currentBlock) {
      this.currentBlock.exitCode = exitCode;
      this.completeCurrentBlock(exitCode);
    }
  }

  /**
   * Attempt to detect exit code from output patterns
   */
  private detectExitCode(): number {
    // Default to success if we can't detect
    // In real implementation, could parse for common error patterns
    return 0;
  }

  /**
   * Render a command block
   */
  private renderBlock(block: CommandBlock): void {
    const element = document.createElement('div');
    element.id = `block-${block.id}`;
    element.className = 'command-block';
    if (block.isRunning) {
      element.classList.add('running');
    }

    element.innerHTML = this.getBlockHTML(block);
    this.container.appendChild(element);

    // Scroll to the new block
    element.scrollIntoView({ behavior: 'smooth', block: 'end' });

    // Add event listeners
    this.attachBlockListeners(element, block);
  }

  /**
   * Update an existing block element
   */
  private updateBlockElement(block: CommandBlock): void {
    const element = document.getElementById(`block-${block.id}`);
    if (element) {
      element.innerHTML = this.getBlockHTML(block);
      element.className = 'command-block';

      if (block.isRunning) {
        element.classList.add('running');
      } else {
        element.classList.add('completed');
        if (block.exitCode !== undefined && block.exitCode !== 0) {
          element.classList.add('error');
        }
      }

      if (block.isCollapsed) {
        element.classList.add('collapsed');
      }

      this.attachBlockListeners(element, block);
    }
  }

  /**
   * Generate HTML for a block
   */
  private getBlockHTML(block: CommandBlock): string {
    const duration = block.endTime
      ? this.formatDuration(block.endTime - block.startTime)
      : '';

    const timestamp = this.formatTime(block.startTime);
    const statusClass = block.isRunning
      ? 'running'
      : block.exitCode === 0
      ? 'success'
      : 'error';

    return `
      <div class="block-energy-bar ${statusClass}"></div>
      <div class="block-header">
        <div class="block-command">
          <span class="block-prompt">$</span>
          <span class="block-command-text">${this.escapeHtml(block.command)}</span>
        </div>
        <div class="block-meta">
          ${duration ? `<span class="block-duration">${duration}</span>` : ''}
          <span class="block-timestamp">${timestamp}</span>
          <button class="block-collapse-btn" title="Toggle collapse">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
              <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="block-output">
        <pre>${this.formatOutput(block.output)}</pre>
      </div>
    `;
  }

  /**
   * Attach event listeners to a block
   */
  private attachBlockListeners(element: HTMLElement, block: CommandBlock): void {
    const collapseBtn = element.querySelector('.block-collapse-btn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleCollapse(block);
      });
    }

    // Double-click header to copy command
    const header = element.querySelector('.block-header');
    if (header) {
      header.addEventListener('dblclick', () => {
        navigator.clipboard.writeText(block.command);
        this.showToast('Command copied to clipboard');
      });
    }
  }

  /**
   * Toggle block collapse state
   */
  private toggleCollapse(block: CommandBlock): void {
    block.isCollapsed = !block.isCollapsed;
    this.updateBlockElement(block);
  }

  /**
   * Format terminal output for display
   */
  private formatOutput(output: string): string {
    // Convert ANSI codes to HTML spans
    return this.ansiToHtml(output);
  }

  /**
   * Convert ANSI escape codes to HTML
   */
  private ansiToHtml(text: string): string {
    // Basic ANSI to HTML conversion
    const ansiColors: Record<string, string> = {
      '30': 'ansi-black',
      '31': 'ansi-red',
      '32': 'ansi-green',
      '33': 'ansi-yellow',
      '34': 'ansi-blue',
      '35': 'ansi-magenta',
      '36': 'ansi-cyan',
      '37': 'ansi-white',
      '90': 'ansi-bright-black',
      '91': 'ansi-bright-red',
      '92': 'ansi-bright-green',
      '93': 'ansi-bright-yellow',
      '94': 'ansi-bright-blue',
      '95': 'ansi-bright-magenta',
      '96': 'ansi-bright-cyan',
      '97': 'ansi-bright-white',
      '1': 'ansi-bold',
      '3': 'ansi-italic',
      '4': 'ansi-underline',
    };

    let result = this.escapeHtml(text);
    let openTags: string[] = [];

    // Replace ANSI sequences with spans
    result = result.replace(/\x1b\[([0-9;]+)m/g, (_, codes) => {
      const codeArray = codes.split(';');
      let html = '';

      for (const code of codeArray) {
        if (code === '0') {
          // Reset - close all open tags
          html += openTags.map(() => '</span>').join('');
          openTags = [];
        } else if (ansiColors[code]) {
          html += `<span class="${ansiColors[code]}">`;
          openTags.push(code);
        }
      }

      return html;
    });

    // Close any remaining open tags
    result += openTags.map(() => '</span>').join('');

    return result;
  }

  /**
   * Strip ANSI codes from text
   */
  private stripAnsi(text: string): string {
    return text.replace(/\x1b\[[0-9;]*m/g, '');
  }

  /**
   * Escape HTML special characters
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (m) => map[m]);
  }

  /**
   * Format duration in human-readable form
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  }

  /**
   * Format timestamp
   */
  private formatTime(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Show a toast notification
   */
  private showToast(message: string): void {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  /**
   * Clear all blocks
   */
  clear(): void {
    this.blocks = [];
    this.currentBlock = null;
    this.container.innerHTML = '';
  }

  /**
   * Get all blocks
   */
  getBlocks(): CommandBlock[] {
    return [...this.blocks];
  }

  /**
   * Get a specific block
   */
  getBlock(id: string): CommandBlock | undefined {
    return this.blocks.find((b) => b.id === id);
  }
}
