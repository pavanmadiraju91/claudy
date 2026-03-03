import React, { useState, useEffect } from 'react';
import './SplashScreen.css';

interface SplashScreenProps {
  onComplete?: () => void;
}

function SplashScreen({ onComplete }: SplashScreenProps) {
  const [bootPhase, setBootPhase] = useState(0);
  const [showCursor, setShowCursor] = useState(true);

  // Boot sequence phases
  const bootMessages = [
    { text: '> SYSTEM BOOT', delay: 200 },
    { text: '> LOADING CLAUDY v1.0', delay: 400 },
    { text: '> INITIALIZING CLAUDE...', delay: 600 },
    { text: '> ESTABLISHING PTY SESSION', delay: 800 },
    { text: '> READY', delay: 1000 },
  ];

  // Cursor blink
  useEffect(() => {
    const cursorInterval = setInterval(() => {
      setShowCursor(prev => !prev);
    }, 530);
    return () => clearInterval(cursorInterval);
  }, []);

  // Boot sequence progression
  useEffect(() => {
    bootMessages.forEach((_, index) => {
      setTimeout(() => {
        setBootPhase(index + 1);
      }, bootMessages[index].delay);
    });
  }, []);

  return (
    <div className="splash-screen">
      {/* Scanline overlay */}
      <div className="splash-scanlines" />

      {/* CRT vignette effect */}
      <div className="splash-vignette" />

      {/* Grid background */}
      <div className="splash-grid" />

      {/* Main content */}
      <div className="splash-content">
        {/* Logo */}
        <div className="splash-logo-container">
          <div className="splash-logo-glow" />
          <h1 className="splash-logo">
            <span className="logo-bracket">[</span>
            <span className="logo-text">CLAUDY</span>
            <span className="logo-bracket">]</span>
          </h1>
          <div className="splash-subtitle">CLAUDE CLI INTERFACE</div>
        </div>

        {/* Boot terminal */}
        <div className="splash-terminal">
          {bootMessages.map((msg, index) => (
            <div
              key={index}
              className={`boot-line ${index < bootPhase ? 'visible' : ''} ${index === bootPhase - 1 ? 'active' : ''}`}
            >
              <span className="boot-text">{msg.text}</span>
              {index === bootPhase - 1 && index < bootMessages.length - 1 && (
                <span className={`boot-cursor ${showCursor ? 'visible' : ''}`}>_</span>
              )}
              {index === bootMessages.length - 1 && index < bootPhase && (
                <span className="boot-check">✓</span>
              )}
            </div>
          ))}
        </div>

        {/* Loading bar */}
        <div className="splash-loader">
          <div className="loader-track">
            <div
              className="loader-fill"
              style={{ width: `${(bootPhase / bootMessages.length) * 100}%` }}
            />
            <div className="loader-segments">
              {[...Array(20)].map((_, i) => (
                <div key={i} className="loader-segment" />
              ))}
            </div>
          </div>
          <div className="loader-percent">
            {Math.round((bootPhase / bootMessages.length) * 100)}%
          </div>
        </div>
      </div>

      {/* Corner decorations */}
      <div className="splash-corner splash-corner-tl" />
      <div className="splash-corner splash-corner-tr" />
      <div className="splash-corner splash-corner-bl" />
      <div className="splash-corner splash-corner-br" />

      {/* Floating particles */}
      <div className="splash-particles">
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="particle"
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 4}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export default SplashScreen;
