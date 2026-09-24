import React, { useEffect, useState } from 'react';

interface PrintingScreenProps {
  onComplete: (success: boolean, error?: string) => void;
}

export function PrintingScreen({ onComplete }: PrintingScreenProps) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('Preparing print job...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const steps = [
      { progress: 10, status: 'Connecting to printer...', delay: 1000 },
      { progress: 30, status: 'Sending document...', delay: 2000 },
      { progress: 60, status: 'Processing...', delay: 3000 },
      { progress: 90, status: 'Printing...', delay: 5000 },
      { progress: 100, status: 'Complete!', delay: 1000 },
    ];

    let currentStep = 0;

    const runSteps = async () => {
      for (const step of steps) {
        setProgress(step.progress);
        setStatus(step.status);
        await new Promise((resolve) => setTimeout(resolve, step.delay));
      }
      
      // Simulate print job submission
      try {
        // In real implementation, this would call the print API
        await new Promise((resolve) => setTimeout(resolve, 2000));
        onComplete(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Print failed');
        onComplete(false, err instanceof Error ? err.message : 'Print failed');
      }
    };

    runSteps();
  }, [onComplete]);

  return (
    <div className="screen printing">
      <header className="header">
        <h1>Printing</h1>
      </header>
      
      <main className="main">
        <div className="card printing-card">
          <div className="printer-icon">🖨️</div>
          
          <div className="progress-container">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div className="progress-text">{progress}%</div>
          </div>
          
          <p className="status">{status}</p>
          
          {error && <div className="error">{error}</div>}
        </div>
      </main>
    </div>
  );
}