# PrintLoop Virtual IPP Printer

The Virtual IPP Printer (`virtualPrinter.cjs`) is a fully featured, compliant in-memory mock IPP printer server designed to support end-to-end testing, local development, and workflow validation without physical hardware.

It listens on port `6310` by default (configurable via `IPP_VPRINTER_PORT`) and exposes an `/ipp/print` endpoint.

---

## 🛠️ Usage

### Starting the Server
Run the following command in the `01-backend` directory:
```bash
node scripts/virtualPrinter.cjs
```

To run on a different port (e.g., standard JetDirect/raw `9100` or standard IPP `631`):
```bash
IPP_VPRINTER_PORT=9100 node scripts/virtualPrinter.cjs
```

---

## 📋 Supported IPP & CUPS Operations

The virtual printer supports a complete set of standard Internet Printing Protocol (IPP) and Common UNIX Printing System (CUPS) operations:

### 1. Printer Object & Methods
- **`Get-Printer-Attributes`**: Returns state, supported formats, supported operations, and endpoints.
- **`Purge-Jobs`**: Clears all jobs from the queue and deletes printed documents on disk.
- **`Pause-Printer`**: Pauses printing, placing subsequent jobs in a `pending-held` state.
- **`Resume-Printer`**: Resumes printing, putting the queue back in `idle` mode.
- **`Print-Job`**: Directly prints a document, saving it to `data/printed/` and completing it.
- **`Print-URI`**: Simulates printing a document from a URI reference, writing details to disk.
- **`Validate-Job`**: Checks the structural integrity of request attributes without initiating a job.
- **`Create-Job`**: Pre-registers a print job slot and returns a unique `job-id`.
- **`Identify-Printer`**: Acknowledges printer identification commands.
- **`Set-Printer-Attributes`**: Simulates configuring printer settings.

### 2. Printer Administration Methods (CUPS & Subscriptions)
- **`CUPS-Get-Default`** (opcode `0x4001`): Returns the virtual printer's configuration as the default printer.
- **`CUPS-Get-Printers`** (opcode `0x4002`): Returns a list of available printers (exposing the virtual printer).
- **`CUPS-Get-Classes`** (opcode `0x4005`): Returns empty list since no classes exist.
- **`Create-Printer-Subscriptions`**: Creates a printer event listener subscription.
- **`Get-Subscriptions`**: Returns list of all active subscriptions.
- **`Get-Notifications`**: Queries active events/notifications.

### 3. Subscription Object & Methods
- **`Get-Subscription-Attributes`**: Returns subscription events and target addresses.
- **`Renew-Subscription`**: Extends active subscription leases.
- **`Cancel-Subscription`**: Cancels/revokes a subscription.

### 4. Document Object & Methods
- **`Get-Document-Attributes`**: Returns mock document configuration and state.
- **`Set-Document-Attributes`**: Acknowledges changes.
- **`Cancel-Document`**: Cancels documents inside multi-document print jobs.

### 5. Job Object & Methods
- **`Send-Document`**: Receives document content for a pre-registered job, completing it upon matching `last-document`.
- **`Send-URI`**: Receives document URI references for a pre-registered job.
- **`Cancel-Job`**: Cancels a specific job, changing its status to `canceled`.
- **`Get-Job-Attributes`**: Returns detailed metadata for a specific job.
- **`Hold-Job`**: Transitions active jobs to `'pending-held'`.
- **`Release-Job`**: Releases held jobs back into the active queue.
- **`Restart-Job`**: Resubmits terminated/completed/canceled jobs back into the queue.
- **`Set-Job-Attributes`**: Sets print properties on active jobs.
- **`Create-Job-Subscription`**: Registers an event subscription linked to a specific job ID.
- **`CUPS-Move-Job`** (opcode `0x400D`): Simulates moving a job to another queue.
- **`CUPS-Authenticate-Job`** (opcode `0x4016`): Authenticates a job.

---

## ⚙️ How it Works

### 1. In-Memory State Tracking
The server tracks the following state variables during its execution lifecycle:
- `printerState`: Current state of the print engine (`'idle'`, `'processing'`, or `'stopped'`).
- `jobs`: A database array containing record descriptors for all jobs sent to the server.
- `subscriptions`: Active event subscription registry.
- `jobSeq`, `subSeq`: Monotonically increasing ID counters.
- `startTime`: Startup time of the daemon.

### 2. Spliced-Buffer Multi-Group Serialization
The default Node `ipp.serialize` function does not natively support array-like repetition of tag delimiters (such as multiple `'job-attributes-tag'` groups for `Get-Jobs`). 

To address this, the virtual printer utilizes a reusable helper:
```javascript
function serializeMultiGroups(version, statusCode, reqId, groupTag, items)
```
This helper serializes each element individually, slices off their mock header and footer tags, concatenates the byte groups into the main response body, and signs it with a single `0x03` terminator.
This results in standard-compliant multi-group binary responses parseable by any standard IPP client.
