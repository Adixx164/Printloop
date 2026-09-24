export interface KioskSettings {
    apiUrl: string;
    apiKey: string;
    tenantId: string;
    printerUri: string;
    heartbeatInterval: number;
    kioskName: string;
}
export interface PrintJobData {
    id: string;
    code: string;
    artifactKey: string;
    pageCount: number;
    colorPages: number;
    monoPages: number;
    cost: number;
    customerName: string;
    fileName: string;
}
export interface PrinterInfo {
    uri: string;
    name: string;
    makeAndModel: string;
    state: string;
    isDefault: boolean;
}
export interface TestPrintResult {
    success: boolean;
    error?: string;
}
export interface PrintResult {
    success: boolean;
    jobId: string;
    error?: string;
}
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
//# sourceMappingURL=types.d.ts.map