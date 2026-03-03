import React, { useRef, useEffect } from 'react';
import './GodotGameView.css';

interface GodotGameViewProps {
  isVisible: boolean;
}

function GodotGameView({ isVisible }: GodotGameViewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Forward GAME_MOVE events to the Godot iframe
  // Events are now in full Godot message format from transcript-watcher
  useEffect(() => {
    const unsub = window.electronAPI.onGameMove((event) => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) return;

      // Call the Godot bridge function directly
      // The game registers window.godotReceiveMessage in JSBridge.gd
      try {
        const godotWindow = iframe.contentWindow as any;
        if (godotWindow.godotReceiveMessage) {
          // Event is already in Godot format, just stringify and send
          godotWindow.godotReceiveMessage(JSON.stringify(event));
          const actionInfo = event.type === 'ui_instruction'
            ? event.payload.character_action
            : event.type === 'agent_event'
            ? `${event.payload.agent_type}:${event.payload.agent_id}`
            : `planning:${event.payload.status}`;
          console.log('[GodotGameView] Sent:', event.type, actionInfo);
        } else {
          console.log('[GodotGameView] godotReceiveMessage not ready yet');
        }
      } catch (e) {
        console.error('[GodotGameView] Error sending message:', e);
      }
    });

    return unsub;
  }, []);

  return (
    <div className="godot-game-view">
      <iframe
        ref={iframeRef}
        src="./godot/index.html"
        className="godot-iframe"
        tabIndex={-1} /* Prevent focus stealing from chat input */
        allow="autoplay"
        title="Office Explorer Game"
      />
    </div>
  );
}

export default GodotGameView;
