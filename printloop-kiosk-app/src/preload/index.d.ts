import type { PrintJobData, PrintResult, KioskSettings, PrinterInfo, TestPrintResult } from '../renderer/types';
declare global {
    interface Window {
        electronAPI: {
            getVersion: () => Promise<string>;
            getPlatform: () => Promise<string>;
            quit: () => void;
            restart: () => void;
            onKioskEvent: (callback: (event: string, data: unknown) => void) => () => void;
            printJob: {
                fetch: (code: string) => Promise<PrintJobData>;
                print: (jobId: string, artifactKey: string) => Promise<PrintResult>;
            };
            settings: {
                get: () => Promise<KioskSettings>;
                set: (key: string, value: unknown) => Promise<void>;
            };
            printer: {
                list: () => Promise<PrinterInfo[]>;
                test: (printerUri: string) => Promise<TestPrintResult>;
            };
        };
    }
}
//# sourceMappingURL=index.d.ts.map