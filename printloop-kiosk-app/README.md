# PrintLoop Kiosk App

Electron-based touchscreen UI for PrintLoop self-service printing kiosks.

## Features

- Full-screen kiosk mode
- 6-character code entry via on-screen keypad
- Job details display (pages, cost, paper size)
- PWG-Raster printing via IPP to local CUPS
- Heartbeat to cloud backend
- Settings management (API URL, API key, printer selection)
- Cross-platform: Windows (NSIS installer), Linux (AppImage), macOS (DMG)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ PrintLoop Kiosk App (Electron)                                  │
│ ┌─────────────────┐    ┌─────────────────┐    ┌──────────────┐ │
│ │ Main Process    │    │ Renderer        │    │ Preload      │ │
│ │ - Heartbeat     │◄───│ (React UI)      │◄───│ (IPC Bridge) │ │
│ │ - IPP Printing  │    │ - Code Entry    │    │              │ │
│ │ - S3 Download   │    │ - Job Details   │    │              │ │
│ │ - Printer Enum  │    │ - Printing      │    │              │ │
│ │ - Settings      │    │ - Settings      │    │              │ │
│ └────────┬────────┘    └─────────────────┘    └──────────────┘ │
│          │                                                │      │
│          ▼                                                ▼      │
│ ┌─────────────────┐                              ┌──────────┐ │
│ │ Local CUPS      │◄────────────── IPP ──────────│ Printer  │ │
│ │ (cups-local,    │                              │ (Network │ │
│ │  cups-browsed,  │                              │  or USB) │ │
│ │  ipp-usb)       │                              └──────────┘ │
│ └─────────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
```

## Development

```bash
# Install dependencies
npm install

# Start development (with hot reload)
npm run dev

# Build for production
npm run build

# Package for Windows
npm run package

# Package for Linux
npm run package:linux
```

## Configuration

The kiosk stores settings in `kiosk-settings.json` in the app data directory:

```json
{
  "apiUrl": "https://api.printloop.app",
  "apiKey": "kiosk_...",
  "tenantId": "tenant-uuid",
  "printerUri": "ipp://localhost:60000/ipp/print",
  "heartbeatInterval": 15000,
  "kioskName": "Main Kiosk"
}
```

First run will show the settings screen for configuration.

## Environment Variables

See `.env.example` for S3 configuration (used for downloading rendered PWG-Raster artifacts).

## Building Installers

### Windows (NSIS)
```bash
npm run package
# Output: dist/PrintLoop Kiosk Setup x.x.x.exe
```

### Linux (AppImage)
```bash
npm run package:linux
# Output: dist/PrintLoop-Kiosk-x.x.x.AppImage
```

## Printing Flow

1. Customer enters 6-character code on kiosk touchscreen
2. Kiosk fetches job manifest from cloud API
3. Kiosk downloads pre-rendered PWG-Raster from S3
4. Kiosk submits PWG-Raster to local CUPS via IPP
5. CUPS prints to configured printer
6. Kiosk shows completion status

## Printer Discovery

The kiosk uses `cups-browsed` for automatic network printer discovery and `ipp-usb` for USB printer support. Printers appear in the settings dropdown automatically.

## License

Proprietary - PrintLoop SaaS v2