import React from 'react';

interface ErrorScreenProps {
  error: string;
  onRetry: () => void;
  onBack: () => void;
}

export function ErrorScreen({ error, onRetry, onBack }: ErrorScreenProps) {
  return (
    <div className="screen error">
      <header className="header">
        <button className="back-btn" onClick={onBack} aria-label="Back">←</button>
        <h1>Error</h1>
        <div className="spacer" />
      </header>
      
      <main className="main">
        <div className="card error-card">
          <div className="error-icon">⚠️</div>
          <h2>Something went wrong</h2>
          <p className="error-message">{error}</p>
          
          <div className="actions">
            <button className="btn btn-primary btn-large" onClick={onRetry}>
              Try Again
            </button>
            <button className="btn btn-secondary btn-large" onClick={onBack}>
              Go Back
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}