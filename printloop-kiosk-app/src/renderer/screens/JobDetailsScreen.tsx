import React from 'react';

interface JobDetailsScreenProps {
  onPrint: () => void;
  onBack: () => void;
}

export function JobDetailsScreen({ onPrint, onBack }: JobDetailsScreenProps) {
  return (
    <div className="screen job-details">
      <header className="header">
        <button className="back-btn" onClick={onBack} aria-label="Back">←</button>
        <h1>Print Job Details</h1>
        <div className="spacer" />
      </header>
      
      <main className="main">
        <div className="card">
          <div className="job-info">
            <div className="info-row">
              <span className="label">Document:</span>
              <span className="value">document.pdf</span>
            </div>
            <div className="info-row">
              <span className="label">Pages:</span>
              <span className="value">5 (3 color, 2 mono)</span>
            </div>
            <div className="info-row">
              <span className="label">Paper:</span>
              <span className="value">A4, Double-sided</span>
            </div>
            <div className="info-row total">
              <span className="label">Total Cost:</span>
              <span className="value">₦1,250</span>
            </div>
          </div>
          
          <div className="actions">
            <button className="btn btn-primary btn-large" onClick={onPrint}>
              Print Now
            </button>
            <button className="btn btn-secondary btn-large" onClick={onBack}>
              Cancel
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}