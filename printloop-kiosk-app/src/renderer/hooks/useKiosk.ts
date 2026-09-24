import { useState, useEffect, useCallback, useMemo } from 'react';
import type { KioskSettings, PrintJobData, PrinterInfo, TestPrintResult, PrintResult } from '../types';

export function useKiosk() {
  const [settings, setSettings] = useState<KioskSettings>({
    apiUrl: '',
    apiKey: '',
    tenantId: '',
    printerUri: '',
    heartbeatInterval: 15000,
    kioskName: 'PrintLoop Kiosk',
  });
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [job, setJob] = useState<PrintJobData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConfigured = useMemo(() => 
    !!(settings.apiUrl && settings.apiKey && settings.tenantId && settings.printerUri),
    [settings]
  );

  const refreshPrinters = useCallback(async () => {
    try {
      const printerList = await window.electronAPI?.printer.list() || [];
      setPrinters(printerList);
    } catch (err) {
      console.error('Failed to refresh printers:', err);
    }
  }, []);

  const handleTestPrinter = useCallback(async (printerUri: string): Promise<TestPrintResult> => {
    try {
      const result = await window.electronAPI?.printer.test(printerUri);
      return result || { success: false, error: 'Test failed' };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Test failed' };
    }
  }, []);

  const updateSetting = useCallback(async (key: keyof KioskSettings, value: unknown) => {
    await window.electronAPI?.settings.set(key, String(value));
    // Settings will be reloaded from main process
  }, []);

  const fetchJob = useCallback(async (code: string): Promise<PrintJobData> => {
    setLoading(true);
    setError(null);
    try {
      const jobData = await window.electronAPI?.printJob.fetch(code);
      if (!jobData) throw new Error('No job data returned');
      setJob(jobData);
      return jobData;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch job';
      setError(msg);
      throw new Error(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const handlePrintJob = useCallback(async (): Promise<PrintResult> => {
    if (!job) return { success: false, jobId: '', error: 'No job loaded' };
    
    setLoading(true);
    try {
      const result = await window.electronAPI?.printJob.print(job.id, job.artifactKey);
      return result || { success: false, jobId: job.id, error: 'Print failed' };
    } catch (err) {
      return { success: false, jobId: job.id, error: err instanceof Error ? err.message : 'Print failed' };
    } finally {
      setLoading(false);
    }
  }, [job]);

  useEffect(() => {
    refreshPrinters();
  }, [refreshPrinters]);

  return {
    settings,
    printers,
    job,
    loading,
    error,
    isConfigured,
    fetchJob,
    printJob: handlePrintJob,
    refreshPrinters,
    testPrinter: handleTestPrinter,
    updateSetting,
  };
}