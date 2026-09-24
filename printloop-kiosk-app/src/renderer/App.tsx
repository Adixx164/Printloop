import React, { useState, useEffect, useCallback } from 'react';
import { CodeEntryScreen } from './screens/CodeEntryScreen';
import { JobDetailsScreen } from './screens/JobDetailsScreen';
import { PrintingScreen } from './screens/PrintingScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { ErrorScreen } from './screens/ErrorScreen';
import { useKiosk } from './hooks/useKiosk';

type Screen = 'code-entry' | 'job-details' | 'printing' | 'settings' | 'error';

const App: React.FC = () => {
  const [screen, setScreen] = useState<Screen>('code-entry');
  const [error, setError] = useState<string | null>(null);
  
  const {
    fetchJob,
    printJob: handlePrintJob,
    isConfigured,
    settings,
    printers,
    refreshPrinters,
    testPrinter,
    updateSetting,
  } = useKiosk();

  const handleCodeSubmit = useCallback(async (code: string) => {
    try {
      setError(null);
      await fetchJob(code);
      setScreen('job-details');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch job');
      setScreen('error');
    }
  }, [fetchJob]);

  const handlePrint = useCallback(async () => {
    setScreen('printing');
  }, []);

  const handlePrintComplete = useCallback((success: boolean, error?: string) => {
    if (success) {
      setScreen('code-entry');
    } else {
      setError(error || 'Print failed');
      setScreen('error');
    }
  }, []);

  const handleSettings = useCallback(() => {
    setScreen('settings');
  }, []);

  const handleBack = useCallback(() => {
    setScreen('code-entry');
    setError(null);
  }, []);

  const handleRetry = useCallback(() => {
    setError(null);
    setScreen('code-entry');
  }, []);

  const handleSettingsSaved = useCallback(() => {
    setScreen('code-entry');
  }, []);

  if (!isConfigured) {
    return <SettingsScreen onSave={handleSettingsSaved} settings={settings} onUpdateSetting={(key, value) => updateSetting(key as any, value)} printers={[]} onRefreshPrinters={() => {}} onTestPrinter={() => Promise.resolve({ success: false, error: 'Not configured' })} />;
  }

  switch (screen) {
    case 'code-entry':
      return <CodeEntryScreen onSubmit={handleCodeSubmit} onSettings={handleSettings} />;
    case 'job-details':
      return <JobDetailsScreen onPrint={handlePrint} onBack={handleBack} />;
    case 'printing':
      return <PrintingScreen onComplete={handlePrintComplete} />;
    case 'settings':
      return <SettingsScreen onSave={handleSettingsSaved} settings={settings} onUpdateSetting={(key, value) => updateSetting(key as any, value)} printers={printers} onRefreshPrinters={refreshPrinters} onTestPrinter={testPrinter} />;
    case 'error':
      return <ErrorScreen error={error || 'Unknown error'} onRetry={handleRetry} onBack={handleBack} />;
    default:
      return <CodeEntryScreen onSubmit={handleCodeSubmit} onSettings={handleSettings} />;
  }
};

export default App;