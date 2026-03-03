import React from 'react';
import './StatusIndicator.css';

interface StatusInfo {
  status: 'thinking' | 'tool' | null;
  text?: string;
  tool?: string;
}

interface StatusIndicatorProps {
  status: StatusInfo;
}

function StatusIndicator({ status }: StatusIndicatorProps) {
  const isThinking = status.status === 'thinking';

  return (
    <div className={`status-indicator ${isThinking ? 'thinking' : 'tool'}`}>
      <span className="status-dot" />
      <span className="status-text">{status.text}</span>
    </div>
  );
}

export default StatusIndicator;
