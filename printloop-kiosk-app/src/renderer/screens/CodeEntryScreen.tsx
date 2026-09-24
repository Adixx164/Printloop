import React, { useState, useEffect, useRef } from 'react';

interface CodeEntryScreenProps {
  onSubmit: (code: string) => void;
  onSettings: () => void;
}

export function CodeEntryScreen({ onSubmit, onSettings }: CodeEntryScreenProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyPress = (key: string) => {
    if (key === 'backspace') {
      setCode((prev) => prev.slice(0, -1));
    } else if (key === 'enter') {
      if (code.length === 6) {
        onSubmit(code.toUpperCase());
      } else {
        setError('Please enter a 6-character code');
      }
    } else if (/^[A-Za-z0-9]$/.test(key) && code.length < 6) {
      setCode((prev) => prev + key.toUpperCase());
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setCode(value);
    if (value.length === 6) {
      onSubmit(value);
    }
  };

  return (
    <div className="screen code-entry">
      <header className="header">
        <h1>PrintLoop Kiosk</h1>
        <button className="settings-btn" onClick={onSettings} aria-label="Settings">
          ⚙
        </button>
      </header>
      
      <main className="main">
        <div className="card">
          <h2>Enter Your Code</h2>
          
          <div className="code-display">
            {code.split('').map((char, i) => (
              <span key={i} className="code-char">{char || '◻'}</span>
            ))}
            {code.length < 6 && (
              <span className="code-char cursor">▌</span>
            )}
          </div>
          
          {error && <div className="error">{error}</div>}
          
          <input
            ref={inputRef}
            type="text"
            value={code}
            onChange={handleInputChange}
            maxLength={6}
            className="hidden-input"
            autoComplete="off"
            spellCheck={false}
          />
          
          <div className="keypad">
            {['1','2','3','4','5','6','7','8','9','C','0','⌫'].map((key) => (
              <button
                key={key}
                className={`key ${key === 'C' ? 'clear' : ''} ${key === '⌫' ? 'backspace' : ''}`}
                onClick={() => {
                  if (key === 'C') setCode('');
                  else if (key === '⌫') setCode((prev) => prev.slice(0, -1));
                  else handleKeyPress(key);
                }}
              >
                {key}
              </button>
            ))}
          </div>
          
          <p className="hint">Enter the 6-character code from your receipt or SMS</p>
        </div>
      </main>
    </div>
  );
}