/**
 * Printer Manager - Handles USB, IPP, and AirPrint (Windows) communication
 */

import { DatabaseManager } from '../db/DatabaseManager';
import { EventEmitter } from 'events';

export interface PrinterConfig {
  id: string;
  name: string;
  type: 'usb' | 'ipp' | 'airprint';
  address: string; // USB device path, IP:port, or printer name
  capabilities: {
    color: boolean;
    duplex: boolean;
    paperSizes: string[];
    maxDpi: number;
  };
  isDefault: boolean;
  isActive: boolean;
}

export interface PrintJobData {
  pwgRasterUrl: string; // Presigned S3 URL
  copies: number;
  pageRange?: string;
  duplex: boolean;
  color: boolean;
  paperSize: string;
  dpi: number;
}

export interface PrintResult {
  success: boolean;
  jobId?: string;
  error?: string;
}

export class PrinterManager extends EventEmitter {
  private db: DatabaseManager;
  private usb: any = null;
  private ipp: any = null;
  private printers: Map<string, PrinterConfig> = new Map();
  
  constructor(db: DatabaseManager) {
    super();
    this.db = db;
  }
  
  async initialize(): Promise<void> {
    await this.loadPrinters();
    await this.initializeUSB();
    await this.initializeIPP();
    console.log('[PrinterManager] Initialized');
  }
  
  private async loadPrinters(): Promise<void> {
    const printers = await this.db.getPrinters();
    for (const p of printers) {
      this.printers.set(p.id, {
        ...p,
        capabilities: JSON.parse(p.capabilities || '{}'),
        isDefault: Boolean(p.isDefault),
        isActive: Boolean(p.isActive),
      });
    }
    console.log(`[PrinterManager] Loaded ${this.printers.size} printers`);
  }
  
  private async initializeUSB(): Promise<void> {
    try {
      this.usb = await import('usb');
      console.log('[PrinterManager] USB support loaded');
      
      // Listen for device attach/detach (using usb package's built-in events)
      this.usb.on('attach', (device: any) => this.handleUSBAttach(device));
      this.usb.on('detach', (device: any) => this.handleUSBDetach(device));
    } catch (error) {
      console.warn('[PrinterManager] USB support not available:', error);
    }
  }
  
  private async initializeIPP(): Promise<void> {
    try {
      // IPP printer discovery via mDNS
      const { Bonjour } = await import('bonjour-service');
      this.ipp = new Bonjour();
      console.log('[PrinterManager] IPP/Bonjour support loaded');
    } catch (error) {
      console.warn('[PrinterManager] IPP support not available:', error);
    }
  }
  
  private handleUSBAttach(device: any): void {
    console.log('[USB] Device attached:', device.deviceDescriptor);
    this.emit('device:attached', device);
  }
  
  private handleUSBDetach(device: any): void {
    console.log('[USB] Device detached:', device.deviceDescriptor);
    this.emit('device:detached', device);
  }
  
  // Discover printers
  async discoverPrinters(): Promise<PrinterConfig[]> {
    const discovered: PrinterConfig[] = [];
    
    // Discover USB printers
    if (this.usb) {
      const usbDevices = this.usb.getDeviceList();
      for (const device of usbDevices) {
        if (this.isPrinterDevice(device)) {
          const config = await this.createUSBPrinterConfig(device);
          if (config) discovered.push(config);
        }
      }
    }
    
    // Discover IPP printers via mDNS
    if (this.ipp) {
      const ippPrinters = await this.discoverIPPPrinters();
      discovered.push(...ippPrinters);
    }
    
    // Discover Windows printers (AirPrint fallback)
    const windowsPrinters = await this.discoverWindowsPrinters();
    discovered.push(...windowsPrinters);
    
    return discovered;
  }
  
  private isPrinterDevice(device: any): boolean {
    // Check if device is a printer class (0x07) or has printer interface
    const desc = device.deviceDescriptor;
    if (desc.bDeviceClass === 0x07) return true; // Printer class
    
    // Check interfaces
    for (const config of device.configDescriptor?.interfaces || []) {
      for (const iface of config) {
        if (iface.interfaceDescriptor?.bInterfaceClass === 0x07) return true;
      }
    }
    return false;
  }
  
  private async createUSBPrinterConfig(device: any): Promise<PrinterConfig | null> {
    try {
      const id = `usb-${device.deviceDescriptor.idVendor}-${device.deviceDescriptor.idProduct}`;
      return {
        id,
        name: `USB Printer (${device.deviceDescriptor.idVendor}:${device.deviceDescriptor.idProduct})`,
        type: 'usb',
        address: device.deviceDescriptor.idVendor + ':' + device.deviceDescriptor.idProduct,
        capabilities: {
          color: true,
          duplex: false,
          paperSizes: ['A4', 'A3'],
          maxDpi: 600,
        },
        isDefault: false,
        isActive: true,
      };
    } catch {
      return null;
    }
  }
  
  private async discoverIPPPrinters(): Promise<PrinterConfig[]> {
    return new Promise((resolve) => {
      const printers: PrinterConfig[] = [];
      const browser = this.ipp.find({ type: 'ipp' });
      
      browser.on('up', (service: any) => {
        const config: PrinterConfig = {
          id: `ipp-${service.name.replace(/\s+/g, '-')}`,
          name: service.name,
          type: 'ipp',
          address: `${service.addresses[0]}:${service.port}`,
          capabilities: {
            color: true,
            duplex: true,
            paperSizes: ['A4', 'A3'],
            maxDpi: 600,
          },
          isDefault: false,
          isActive: true,
        };
        printers.push(config);
      });
      
      browser.on('error', (err: any) => console.error('[IPP] Browser error:', err));
      
      setTimeout(() => {
        browser.stop();
        resolve(printers);
      }, 5000);
    });
  }
  
  private async discoverWindowsPrinters(): Promise<PrinterConfig[]> {
    // Use PowerShell to get Windows printers
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const ps = spawn('powershell', [
        '-Command',
        'Get-Printer | Select-Object Name, PortName, DriverName, Shared, Published | ConvertTo-Json'
      ]);
      
      let output = '';
      ps.stdout.on('data', (data: any) => output += data);
      ps.on('close', () => {
        try {
          const printers = JSON.parse(output);
          const config = Array.isArray(printers) ? printers : [printers];
          const discovered = config.map((p: any) => ({
            id: `win-${p.Name.replace(/\s+/g, '-')}`,
            name: p.Name,
            type: 'airprint' as const,
            address: p.Name,
            capabilities: {
              color: true,
              duplex: true,
              paperSizes: ['A4', 'A3'],
              maxDpi: 600,
            },
            isDefault: false,
            isActive: true,
          }));
          resolve(discovered);
        } catch {
          resolve([]);
        }
      });
    });
  }
  
  // Pair a printer
  async pairPrinter(config: PrinterConfig): Promise<void> {
    // Test print first
    const testResult = await this.testPrint(config);
    if (!testResult.success) {
      throw new Error(`Test print failed: ${testResult.error}`);
    }
    
    // Save to database
    this.db.savePrinter({
      ...config,
      capabilities: JSON.stringify(config.capabilities),
      isDefault: config.isDefault,
      isActive: true,
    });
    
    this.printers.set(config.id, config);
    this.emit('printer:paired', config);
  }
  
  // Print a job
  async print(config: PrinterConfig, job: PrintJobData): Promise<PrintResult> {
    try {
      switch (config.type) {
        case 'usb':
          return await this.printUSB(config, job);
        case 'ipp':
          return await this.printIPP(config, job);
        case 'airprint':
          return await this.printAirPrint(config, job);
        default:
          throw new Error(`Unknown printer type: ${config.type}`);
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
  
  private async printUSB(config: PrinterConfig, job: PrintJobData): Promise<PrintResult> {
    if (!this.usb) throw new Error('USB not available');
    
    // Find USB device
    const devices = this.usb.getDeviceList();
    const device = devices.find((d: any) => 
      `${d.deviceDescriptor.idVendor}:${d.deviceDescriptor.idProduct}` === config.address
    );
    
    if (!device) throw new Error('USB device not found');
    
    // Open device
    device.open();
    
    // Claim interface
    const interfaceNum = 0; // Usually interface 0 for printers
    if (device.interfaces[interfaceNum].isKernelDriverActive()) {
      device.detachKernelDriver(interfaceNum);
    }
    device.claimInterface(interfaceNum);
    
    // Download PWG-Raster
    const rasterBuffer = await this.downloadRaster(job.pwgRasterUrl);
    
    // Send to printer (bulk endpoint)
    const outEndpoint = this.findOutEndpoint(device, interfaceNum);
    await this.writeToEndpoint(device, outEndpoint, rasterBuffer);
    
    // Release
    device.releaseInterface(interfaceNum);
    device.close();
    
    return { success: true };
  }
  
  private async printIPP(config: PrinterConfig, job: PrintJobData): Promise<PrintResult> {
    const ipp = await import('ipp-printer');
    const printer = new ipp.Printer(config.address);
    
    const rasterBuffer = await this.downloadRaster(job.pwgRasterUrl);
    
    await printer.print(rasterBuffer, {
      copies: job.copies,
      duplex: job.duplex,
      color: job.color,
      media: job.paperSize,
    });
    
    return { success: true };
  }
  
  private async printAirPrint(config: PrinterConfig, job: PrintJobData): Promise<PrintResult> {
    // Windows PrintDocument approach
    return new Promise((resolve) => {
      const { spawn } = require('child_process');
      const ps = spawn('powershell', [
        '-Command',
        `
        Add-Type -AssemblyName System.Drawing
        Add-Type -AssemblyName System.Windows.Forms
        
        $doc = New-Object System.Drawing.Printing.PrintDocument
        $doc.PrinterSettings.PrinterName = "${config.address.replace(/"/g, '\\"')}"
        $doc.PrinterSettings.Copies = ${job.copies}
        $doc.PrinterSettings.Duplex = [System.Drawing.Printing.Duplex]::${job.duplex ? 'Vertical' : 'Simplex'}
        $doc.DefaultPageSettings.Color = $${job.color}
        $doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize("Custom", ${job.paperSize === 'A3' ? '297' : '210'}, ${job.paperSize === 'A3' ? '420' : '297'})
        
        # Download and print raster
        $wc = New-Object System.Net.WebClient
        $bytes = $wc.DownloadData("${job.pwgRasterUrl}")
        $ms = New-Object System.IO.MemoryStream($bytes)
        $img = [System.Drawing.Image]::FromStream($ms)
        
        $doc.PrintPage += {
          param($sender, $e)
          $e.Graphics.DrawImage($img, 0, 0, $e.PageBounds.Width, $e.PageBounds.Height)
          $e.HasMorePages = \$false
        }
        
        try {
          $doc.Print()
          Write-Host "SUCCESS"
        } catch {
          Write-Host "ERROR: $_"
        }
        `
      ]);
      
      let output = '';
      ps.stdout.on('data', (data: any) => output += data);
      ps.stderr.on('data', (data: any) => output += data);
      ps.on('close', (code: number) => {
        if (output.includes('SUCCESS')) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: output || 'Print failed' });
        }
      });
    });
  }
  
  private async downloadRaster(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to download raster: ${response.statusText}`);
    return Buffer.from(await response.arrayBuffer());
  }
  
  private findOutEndpoint(device: any, interfaceNum: number): any {
    const iface = device.interfaces[interfaceNum];
    for (const endpoint of iface.endpoints) {
      if (endpoint.direction === 'out') return endpoint;
    }
    throw new Error('No OUT endpoint found');
  }
  
  private async writeToEndpoint(device: any, endpoint: any, data: Buffer): Promise<void> {
    return new Promise((resolve, reject) => {
      device.transfer(endpoint.address, data, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
  
  async testPrint(config: PrinterConfig): Promise<{ success: boolean; error?: string }> {
    // Create a simple test page
    const testJob: PrintJobData = {
      pwgRasterUrl: 'data:application/pwg-raster;base64,AAAA', // Minimal test
      copies: 1,
      duplex: false,
      color: false,
      paperSize: 'A4',
      dpi: 300,
    };
    
    return this.print(config, testJob);
  }
  
  getPrinters(): PrinterConfig[] {
    return Array.from(this.printers.values());
  }
  
  getPrinter(id: string): PrinterConfig | undefined {
    return this.printers.get(id);
  }
  
  deletePrinter(id: string): void {
    this.printers.delete(id);
    this.db.deletePrinter(id);
  }
  
  setDefaultPrinter(id: string): void {
    for (const [, printer] of this.printers) {
      printer.isDefault = printer.id === id;
    }
    // Update in database
    for (const [, printer] of this.printers) {
      this.db.savePrinter({
        ...printer,
        capabilities: JSON.stringify(printer.capabilities),
        isDefault: printer.isDefault,
        isActive: printer.isActive,
      });
    }
  }
  
  async shutdown(): Promise<void> {
    if (this.ipp) {
      this.ipp.destroy();
    }
    this.removeAllListeners();
    console.log('[PrinterManager] Shutdown complete');
  }
}