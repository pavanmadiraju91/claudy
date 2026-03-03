import React from 'react';
import './ActionPrompt.css';

interface QuestionOption {
  label: string;
  description: string;
}

interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

// PTY-parsed option with full details
interface PtyOption {
  label: string;
  description: string;
  selected: boolean;
}

// Progress step from PTY checkboxes (☐/✔)
interface ProgressStep {
  header: string;
  completed: boolean;
  active: boolean;
}

interface ActionPromptProps {
  type: 'plan-ready' | 'plan-execute' | 'permission' | 'confirm' | 'ask-user' | 'ask-user-submit' | 'ask-user-pty' | 'ask-user-terminal' | 'trust-folder';
  message?: string;
  options?: string[];
  questions?: Question[];
  questionText?: string;          // From PTY - actual question being shown
  ptyOptions?: PtyOption[];       // From PTY - options with descriptions
  progress?: ProgressStep[];      // From PTY - progress bar state
  onAction: (response: string) => void;
}

function ActionPrompt({ type, message, options, questions, questionText, ptyOptions, progress, onAction }: ActionPromptProps) {
  console.log('[ActionPrompt] type:', type, 'ptyOptions:', ptyOptions?.length, 'progress:', progress?.length, 'questionText:', questionText?.substring(0, 30));

  // Trust folder prompt - workspace security check
  if (type === 'trust-folder') {
    return (
      <div className="action-prompt trust-folder">
        <div className="action-prompt-icon">🔒</div>
        <div className="action-prompt-header">Workspace Security Check</div>
        <div className="action-prompt-text">
          Is this a project you created or one you trust?
        </div>
        <div className="action-prompt-hint">
          Claude will be able to read, edit, and execute files in this folder.
        </div>
        <div className="action-prompt-buttons">
          <button
            className="action-btn action-btn-primary"
            onClick={() => onAction('1')}
          >
            Yes, I trust this folder
          </button>
          <button
            className="action-btn action-btn-cancel"
            onClick={() => onAction('2')}
          >
            No, exit
          </button>
        </div>
      </div>
    );
  }

  // Multi-step wizard that requires Terminal for keyboard navigation (Tab/Arrow keys)
  if (type === 'ask-user-terminal') {
    return (
      <div className="action-prompt ask-user-terminal">
        <div className="action-prompt-icon">
          <span className="keyboard-icon">&#9000;</span>
        </div>
        <div className="action-prompt-text">
          This is a multi-step selection that requires keyboard navigation.
        </div>
        <div className="action-prompt-hint">
          Switch to the <strong>Terminal</strong> tab to complete this interaction,
          then return here.
        </div>
        {/* Show current progress for context */}
        {progress && progress.length > 1 && (
          <div className="ask-user-progress">
            {progress.map((step, idx) => (
              <span
                key={idx}
                className={`progress-step ${step.active ? 'active' : ''} ${step.completed ? 'completed' : ''}`}
              >
                {step.header}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  // AskUserQuestion from PTY - use PTY data directly (progress, question, options with descriptions)
  // This is the primary path - all data parsed from PTY output, no transcript dependency
  if (type === 'ask-user-pty' && ptyOptions && ptyOptions.length > 0) {
    return (
      <div className="action-prompt ask-user">
        {/* Progress from PTY checkboxes (☐/✔) */}
        {progress && progress.length > 1 && (
          <div className="ask-user-progress">
            {progress.map((step, idx) => (
              <span
                key={idx}
                className={`progress-step ${step.active ? 'active' : ''} ${step.completed ? 'completed' : ''}`}
              >
                {step.header}
              </span>
            ))}
          </div>
        )}

        {/* Question text from PTY */}
        <div className="action-prompt-text">{questionText || 'Select an option:'}</div>

        {/* Options from PTY with descriptions */}
        <div className="action-prompt-buttons ask-options">
          {ptyOptions.map((opt, idx) => (
            <button
              key={idx}
              className={`action-btn action-btn-option ${opt.selected ? 'selected' : ''}`}
              onClick={() => onAction(String(idx + 1))}
              title={opt.description}
            >
              <span className="option-label">{idx + 1}. {opt.label}</span>
              {opt.description && (
                <span className="option-desc">{opt.description}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Legacy: AskUserQuestion from transcript questions (fallback)
  if (type === 'ask-user-pty' && questions && questions.length > 0) {
    const currentQuestion = questions[0];
    const legacyProgress = questions.map((q, idx) => ({
      header: q.header,
      completed: false,
      active: idx === 0
    }));

    return (
      <div className="action-prompt ask-user">
        {questions.length > 1 && (
          <div className="ask-user-progress">
            {legacyProgress.map((step, idx) => (
              <span
                key={idx}
                className={`progress-step ${step.active ? 'active' : ''} ${step.completed ? 'completed' : ''}`}
              >
                {step.header}
              </span>
            ))}
          </div>
        )}

        <div className="action-prompt-header">{currentQuestion.header}</div>
        <div className="action-prompt-text">{currentQuestion.question}</div>
        <div className="action-prompt-buttons ask-options">
          {currentQuestion.options.map((opt, idx) => (
            <button
              key={idx}
              className="action-btn action-btn-option"
              onClick={() => onAction(String(idx + 1))}
              title={opt.description}
            >
              {idx + 1}. {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // AskUserQuestion - Submit confirmation (detected from PTY)
  if (type === 'ask-user-submit') {
    return (
      <div className="action-prompt ask-user-submit">
        <div className="action-prompt-header">Review Answers</div>
        <div className="action-prompt-text">Ready to submit your answers?</div>
        <div className="action-prompt-buttons ask-options">
          <button
            className="action-btn action-btn-primary"
            onClick={() => onAction('1')}
          >
            1. Submit answers
          </button>
          <button
            className="action-btn action-btn-secondary"
            onClick={() => onAction('2')}
          >
            2. Cancel
          </button>
        </div>
      </div>
    );
  }

  // AskUserQuestion from PTY (real-time question updates)
  if (type === 'ask-user-pty' && options && options.length > 0) {
    return (
      <div className="action-prompt ask-user">
        <div className="action-prompt-text">{message || 'Select an option:'}</div>
        <div className="action-prompt-buttons ask-options">
          {options.map((opt, idx) => (
            <button
              key={idx}
              className="action-btn action-btn-option"
              onClick={() => onAction(String(idx + 1))}
            >
              {idx + 1}. {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // AskUserQuestion - show structured options from transcript
  if (type === 'ask-user' && questions && questions.length > 0) {
    const q = questions[0]; // Handle first question
    const optionCount = q.options.length;

    return (
      <div className="action-prompt ask-user">
        <div className="action-prompt-header">{q.header}</div>
        <div className="action-prompt-text">{q.question}</div>
        <div className="action-prompt-buttons ask-options">
          {/* Options from transcript */}
          {q.options.map((opt, idx) => (
            <button
              key={idx}
              className="action-btn action-btn-option"
              onClick={() => onAction(String(idx + 1))}
              title={opt.description}
            >
              {idx + 1}. {opt.label}
            </button>
          ))}

          {/* Standard CLI options - always added after question options */}
          <button
            className="action-btn action-btn-option action-btn-cli-option"
            onClick={() => onAction(String(optionCount + 1))}
            title="Enter custom text response"
          >
            {optionCount + 1}. Type something...
          </button>
          <button
            className="action-btn action-btn-option action-btn-cli-option"
            onClick={() => onAction(String(optionCount + 2))}
            title="Discuss this question instead of answering"
          >
            {optionCount + 2}. Chat about this
          </button>
          <button
            className="action-btn action-btn-option action-btn-cli-option"
            onClick={() => onAction(String(optionCount + 3))}
            title="Skip this question and proceed"
          >
            {optionCount + 3}. Skip interview and plan immediately
          </button>
        </div>
      </div>
    );
  }
  // Plan mode with numbered options (1-4)
  if (type === 'plan-execute' && options?.includes('1')) {
    return (
      <div className="action-prompt plan-execute">
        <div className="action-prompt-text">
          Ready to execute plan?
        </div>
        <div className="action-prompt-buttons plan-options">
          <button
            className="action-btn action-btn-primary"
            onClick={() => onAction('1')}
            title="Clear context and auto-accept edits"
          >
            1. Execute (clear context)
          </button>
          <button
            className="action-btn action-btn-secondary"
            onClick={() => onAction('2')}
            title="Auto-accept edits"
          >
            2. Execute (auto-accept)
          </button>
          <button
            className="action-btn action-btn-tertiary"
            onClick={() => onAction('3')}
            title="Manually approve edits"
          >
            3. Execute (manual)
          </button>
          <button
            className="action-btn action-btn-cancel"
            onClick={() => onAction('4')}
            title="Tell Claude what to change"
          >
            4. Modify plan
          </button>
        </div>
      </div>
    );
  }

  if (type === 'plan-ready') {
    return (
      <div className="action-prompt plan-ready">
        <div className="action-prompt-text">
          {message || 'Plan ready. Execute it?'}
        </div>
        <div className="action-prompt-buttons">
          <button
            className="action-btn action-btn-primary"
            onClick={() => onAction('y')}
          >
            Yes, execute
          </button>
          <button
            className="action-btn action-btn-secondary"
            onClick={() => onAction('n')}
          >
            No
          </button>
        </div>
      </div>
    );
  }

  if (type === 'permission') {
    return (
      <div className="action-prompt permission">
        <div className="action-prompt-text">
          {message || 'Allow this action?'}
        </div>
        <div className="action-prompt-buttons">
          <button
            className="action-btn action-btn-primary"
            onClick={() => onAction('y')}
          >
            Allow
          </button>
          <button
            className="action-btn action-btn-secondary"
            onClick={() => onAction('n')}
          >
            Deny
          </button>
          <button
            className="action-btn action-btn-tertiary"
            onClick={() => onAction('a')}
          >
            Always allow
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="action-prompt confirm">
      <div className="action-prompt-text">
        {message || 'Confirm?'}
      </div>
      <div className="action-prompt-buttons">
        <button
          className="action-btn action-btn-primary"
          onClick={() => onAction('y')}
        >
          Yes
        </button>
        <button
          className="action-btn action-btn-secondary"
          onClick={() => onAction('n')}
        >
          No
        </button>
      </div>
    </div>
  );
}

export default ActionPrompt;
