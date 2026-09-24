/**
 * Virtual IPP printer for end-to-end testing without hardware.
 * Decodes requests with the SAME `ipp` library PrintLoop's IppService uses
 * (guaranteed wire-compatible), writes each received document to
 * data/printed/, and returns a proper IPP success so the client is happy.
 *
 * Supports the following operations:
 * - GET_PRINTER_ATTRIBUTES
 * - PURGE_JOBS
 * - PAUSE_PRINTER
 * - RESUME_PRINTER
 * - PRINT_JOB (simple write to disk)
 * - PRINT_URI
 * - VALIDATE_JOB
 * - CREATE_JOB
 * - SEND_DOCUMENT
 * - SEND_URI
 * - CANCEL_JOB
 * - GET_JOB_ATTRIBUTES
 * - GET_JOBS
 * - HOLD_JOB
 * - RELEASE_JOB
 * - RESTART_JOB
 * - IDENTIFY_PRINTER (new)
 * - SET_PRINTER_ATTRIBUTES (new)
 * - CREATE_PRINTER_SUBSCRIPTIONS (new)
 * - CREATE_JOB_SUBSCRIPTION (new)
 * - GET_SUBSCRIPTION_ATTRIBUTES (new)
 * - GET_SUBSCRIPTIONS (new)
 * - RENEW_SUBSCRIPTION (new)
 * - CANCEL_SUBSCRIPTION (new)
 * - GET_NOTIFICATIONS (new)
 * - GET_DOCUMENT_ATTRIBUTES (new)
 * - SET_DOCUMENT_ATTRIBUTES (new)
 * - CANCEL_DOCUMENT (new)
 * - SET_JOB_ATTRIBUTES (new)
 * - CUPS_GET_DEFAULT (new)
 * - CUPS_GET_PRINTERS (new)
 * - CUPS_GET_CLASSES (new)
 * - CUPS_MOVE_JOB (new)
 * - CUPS_AUTHENTICATE_JOB (new)
 *
 *   node scripts/virtualPrinter.cjs                 # port 6310
 *   IPP_VPRINTER_PORT=9100 node scripts/virtualPrinter.cjs
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ipp = require('ipp');

// Patch ipp.serialize in-memory to support subscription-attributes-tag and event-notification-attributes-tag
function getPatchedSerializer() {
  const serializerPath = require.resolve('ipp/lib/serializer.js');
  let code = fs.readFileSync(serializerPath, 'utf8');

  // Replace group serialization to include subscription-attributes-tag and event-notification-attributes-tag
  code = code.replace(
    "writeGroup('document-attributes-tag');",
    "writeGroup('document-attributes-tag');\n\twriteGroup('subscription-attributes-tag');\n\twriteGroup('event-notification-attributes-tag');"
  );

  const dir = path.dirname(serializerPath);
  const wrapper = eval(`(function(exports, require, module, __filename, __dirname) {
    ${code}
  })`);

  const customModule = { exports: {} };
  const customRequire = (id) => {
    if (id.startsWith('.')) {
      return require(path.resolve(dir, id));
    }
    return require(id);
  };

  wrapper(customModule.exports, customRequire, customModule, serializerPath, dir);
  return customModule.exports;
}

ipp.serialize = getPatchedSerializer();

// Copy all attributes from Subscription Description, Subscription Template, and Event Notifications
// to Operation, Printer Description, and Subscription Description to bypass node-ipp's hardcoded group checks
const attributes = ipp.attributes;
if (attributes) {
  const sourceGroups = ['Subscription Description', 'Subscription Template', 'Event Notifications'];
  const targetGroups = ['Operation', 'Printer Description', 'Subscription Description'];
  for (const srcGroupName of sourceGroups) {
    const srcGroup = attributes[srcGroupName];
    if (srcGroup) {
      for (const key of Object.keys(srcGroup)) {
        for (const targetGroupName of targetGroups) {
          const targetGroup = attributes[targetGroupName];
          if (targetGroup && !targetGroup[key]) {
            targetGroup[key] = srcGroup[key];
          }
        }
      }
    }
  }
}

const PORT = Number(process.env.IPP_VPRINTER_PORT || 6310);
const OUT = path.resolve(__dirname, '..', 'data', 'printed');
fs.mkdirSync(OUT, { recursive: true });

const startTime = new Date();
let printerState = 'idle'; // 'idle' | 'processing' | 'stopped'
let jobSeq = 0;
const jobs = [];

let subSeq = 0;
const subscriptions = [];

/**
 * Byte-exact document extraction. Walk the IPP attribute groups from offset 8
 * (after version/op/request-id) to the end-of-attributes delimiter (0x03);
 * everything after that single byte is the document, untouched.
 * Delimiter tags: 0x00–0x05. Value tags (>=0x10) carry name+value.
 */
function extractIppDocument(buf) {
  let i = 8;
  while (i < buf.length) {
    const tag = buf[i];
    if (tag === 0x03) return buf.subarray(i + 1); // end-of-attributes → doc
    if (tag <= 0x05) { i += 1; continue; }        // group delimiter
    // value tag: [tag(1)][nameLen(2)][name][valueLen(2)][value]
    const nameLen = buf.readUInt16BE(i + 1);
    const valueLen = buf.readUInt16BE(i + 1 + 2 + nameLen);
    i += 1 + 2 + nameLen + 2 + valueLen;
  }
  return Buffer.alloc(0);
}

function attr(group, name) {
  const g = group || {};
  const v = g[name];
  return Array.isArray(v) ? v[0] : v;
}

function createJobRecord(name, user, originOp) {
  jobSeq += 1;
  const job = {
    id: jobSeq,
    uri: `ipp://localhost:${PORT}/jobs/${jobSeq}`,
    name: name || `job-${jobSeq}`,
    user: user || 'unknown',
    state: printerState === 'stopped' ? 'pending-held' : 'pending',
    reasons: printerState === 'stopped' ? 'printer-stopped' : 'none',
    createdTime: new Date(),
    completedTime: null,
    documents: [],
    uris: [],
    originOp: originOp
  };
  jobs.push(job);
  return job;
}

function completeJobRecord(job) {
  job.state = 'completed';
  job.reasons = 'job-completed-successfully';
  job.completedTime = new Date();
}

function getJobAttributes(job) {
  const attrs = {
    'job-id': job.id,
    'job-uri': job.uri,
    'job-printer-uri': `ipp://localhost:${PORT}/ipp/print`,
    'job-name': job.name,
    'job-originating-user-name': job.user,
    'job-state': job.state,
    'job-state-reasons': job.reasons,
  };
  return attrs;
}

/**
 * Reusable multi-group buffer splicing helper to bypass node-ipp's 
 * single group restriction and missing subscription tag support.
 */
function serializeMultiGroups(version, statusCode, reqId, groupTag, items) {
  const serializeTag = groupTag === 'subscription-attributes-tag' ? 'printer-attributes-tag' : groupTag;

  const base = ipp.serialize({
    version: version || '2.0',
    statusCode: statusCode || 'successful-ok',
    id: reqId || 1,
    'operation-attributes-tag': {
      'attributes-charset': 'utf-8',
      'attributes-natural-language': 'en-us',
    }
  });

  const slicedBase = base.slice(0, base.length - 1); // remove 0x03
  const chunks = [slicedBase];

  for (const item of items) {
    const itemBuf = ipp.serialize({
      version: '2.0',
      statusCode: 'successful-ok',
      id: 1,
      [serializeTag]: item
    });
    // Slice: headers (8 bytes) + end tag (1 byte)
    const slicedItem = itemBuf.slice(8, itemBuf.length - 1);

    // Byte-patch the group delimiter byte at index 0 of the slicedItem (which is index 8 of the full itemBuf)
    if (groupTag === 'subscription-attributes-tag') {
      slicedItem[0] = 0x06; // subscription-attributes-tag delimiter
    }

    chunks.push(slicedItem);
  }

  chunks.push(Buffer.from([0x03])); // add 0x03
  return Buffer.concat(chunks);
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(405).end();
    return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const raw = Buffer.concat(chunks);
    let msg;
    try {
      msg = ipp.parse(raw); // metadata only
    } catch (e) {
      console.error('[vprinter] could not parse IPP request:', e.message);
      res.writeHead(400).end();
      return;
    }

    const opAttrs = msg['operation-attributes-tag'] || {};
    let op = msg.operation;

    // Route CUPS operations which are not mapped to strings in node-ipp by default
    if (!op && raw.length >= 4) {
      const opCode = raw.readUInt16BE(2);
      if (opCode === 0x4001) op = 'CUPS-Get-Default';
      else if (opCode === 0x4002) op = 'CUPS-Get-Printers';
      else if (opCode === 0x4005) op = 'CUPS-Get-Classes';
      else if (opCode === 0x400D) op = 'CUPS-Move-Job';
      else if (opCode === 0x4016) op = 'CUPS-Authenticate-Job';
    }

    console.log(`[vprinter] <-- Received operation: ${op}`);

    const printerAttrs = {
      'printer-state': printerState,
      'printer-state-reasons': printerState === 'stopped' ? 'printer-stopped' : 'none',
      'printer-is-accepting-jobs': printerState !== 'stopped',
      'operations-supported': [
        'Print-Job', 'Print-URI', 'Validate-Job', 'Create-Job',
        'Send-Document', 'Send-URI', 'Cancel-Job', 'Get-Job-Attributes',
        'Get-Jobs', 'Get-Printer-Attributes', 'Hold-Job', 'Release-Job',
        'Restart-Job', 'Pause-Printer', 'Resume-Printer', 'Purge-Jobs',
        'Identify-Printer', 'Set-Printer-Attributes', 'Create-Printer-Subscriptions',
        'Create-Job-Subscription', 'Get-Subscription-Attributes', 'Get-Subscriptions',
        'Renew-Subscription', 'Cancel-Subscription', 'Get-Notifications',
        'Get-Document-Attributes', 'Set-Document-Attributes', 'Cancel-Document',
        'Set-Job-Attributes'
      ],
      'charset-configured': 'utf-8',
      'charset-supported': ['utf-8'],
      'natural-language-configured': 'en-us',
      'generated-natural-language-supported': ['en-us'],
      'document-format-supported': ['application/pdf', 'image/jpeg', 'image/png'],
      'printer-name': 'Virtual IPP Printer',
      'printer-info': 'PrintLoop Virtual Test Printer',
      'printer-make-and-model': 'PrintLoop Virtual Printer v2.0',
      'printer-uuid': 'urn:uuid:12345678-1234-5678-1234-567812345678',
      'printer-uri-supported': [`ipp://localhost:${PORT}/ipp/print`],
      'uri-authentication-supported': ['none'],
      'uri-security-supported': ['none']
    };

    if (op === 'Get-Printer-Attributes' || op === 'CUPS-Get-Default') {
      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        },
        'printer-attributes-tag': printerAttrs
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'CUPS-Get-Printers') {
      console.log(`[vprinter] CUPS-Get-Printers returning single printer.`);
      const body = serializeMultiGroups(
        msg.version,
        'successful-ok',
        msg.id,
        'printer-attributes-tag',
        [printerAttrs]
      );
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'CUPS-Get-Classes') {
      console.log(`[vprinter] CUPS-Get-Classes returning empty classes list.`);
      const body = serializeMultiGroups(
        msg.version,
        'successful-ok',
        msg.id,
        'printer-attributes-tag',
        []
      );
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'CUPS-Move-Job') {
      const jobId = Number(attr(opAttrs, 'job-id'));
      console.log(`[vprinter] CUPS-Move-Job requested for job#${jobId}`);
      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'CUPS-Authenticate-Job') {
      const jobId = Number(attr(opAttrs, 'job-id'));
      console.log(`[vprinter] CUPS-Authenticate-Job requested for job#${jobId}`);
      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Identify-Printer') {
      console.log('[vprinter] Beep! Printer identified (Identify-Printer command).');
      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Set-Printer-Attributes') {
      console.log('[vprinter] Set-Printer-Attributes called.');
      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Create-Printer-Subscriptions') {
      const subTag = msg['subscription-attributes-tag'] || opAttrs;
      subSeq += 1;
      const sub = {
        id: subSeq,
        uri: `ipp://localhost:${PORT}/subscriptions/${subSeq}`,
        events: attr(subTag, 'notify-events') || ['all'],
        recipient: attr(subTag, 'notify-recipient-uri') || 'mailto:admin@localhost'
      };
      subscriptions.push(sub);
      console.log(`[vprinter] Created printer subscription#${sub.id}`);

      const body = serializeMultiGroups(
        msg.version,
        'successful-ok',
        msg.id,
        'subscription-attributes-tag',
        [{ 'notify-subscription-id': sub.id }]
      );
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Create-Job-Subscription') {
      const subTag = msg['subscription-attributes-tag'] || opAttrs;
      const jobId = Number(attr(opAttrs, 'job-id'));
      subSeq += 1;
      const sub = {
        id: subSeq,
        uri: `ipp://localhost:${PORT}/subscriptions/${subSeq}`,
        jobId,
        events: attr(subTag, 'notify-events') || ['all'],
        recipient: attr(subTag, 'notify-recipient-uri') || 'mailto:admin@localhost'
      };
      subscriptions.push(sub);
      console.log(`[vprinter] Created job subscription#${sub.id} for job#${jobId}`);

      const body = serializeMultiGroups(
        msg.version,
        'successful-ok',
        msg.id,
        'subscription-attributes-tag',
        [{ 'notify-subscription-id': sub.id }]
      );
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Get-Subscription-Attributes') {
      const subId = Number(attr(opAttrs, 'notify-subscription-id'));
      const sub = subscriptions.find(s => s.id === subId);
      if (!sub) {
        const body = ipp.serialize({
          version: msg.version || '2.0',
          statusCode: 'client-error-not-found',
          id: msg.id || 1,
          'operation-attributes-tag': {
            'attributes-charset': 'utf-8',
            'attributes-natural-language': 'en-us',
          }
        });
        res.writeHead(404, { 'Content-Type': 'application/ipp' });
        res.end(body);
        return;
      }

      const body = serializeMultiGroups(
        msg.version,
        'successful-ok',
        msg.id,
        'subscription-attributes-tag',
        [{
          'notify-subscription-id': sub.id,
          'notify-events': sub.events,
          'notify-recipient-uri': sub.recipient
        }]
      );
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Get-Subscriptions') {
      console.log(`[vprinter] Get-Subscriptions returning ${subscriptions.length} items`);
      const list = subscriptions.map(s => ({
        'notify-subscription-id': s.id,
        'notify-events': s.events,
        'notify-recipient-uri': s.recipient
      }));
      const body = serializeMultiGroups(
        msg.version,
        'successful-ok',
        msg.id,
        'subscription-attributes-tag',
        list
      );
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Renew-Subscription') {
      const subId = Number(attr(opAttrs, 'notify-subscription-id'));
      const sub = subscriptions.find(s => s.id === subId);
      if (!sub) {
        const body = ipp.serialize({
          version: msg.version || '2.0',
          statusCode: 'client-error-not-found',
          id: msg.id || 1,
          'operation-attributes-tag': {
            'attributes-charset': 'utf-8',
            'attributes-natural-language': 'en-us',
          }
        });
        res.writeHead(404, { 'Content-Type': 'application/ipp' });
        res.end(body);
        return;
      }
      console.log(`[vprinter] Renewed subscription#${subId}`);
      const body = serializeMultiGroups(
        msg.version,
        'successful-ok',
        msg.id,
        'subscription-attributes-tag',
        [{ 'notify-subscription-id': sub.id }]
      );
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Cancel-Subscription') {
      const subId = Number(attr(opAttrs, 'notify-subscription-id'));
      const idx = subscriptions.findIndex(s => s.id === subId);
      if (idx === -1) {
        const body = ipp.serialize({
          version: msg.version || '2.0',
          statusCode: 'client-error-not-found',
          id: msg.id || 1,
          'operation-attributes-tag': {
            'attributes-charset': 'utf-8',
            'attributes-natural-language': 'en-us',
          }
        });
        res.writeHead(404, { 'Content-Type': 'application/ipp' });
        res.end(body);
        return;
      }
      subscriptions.splice(idx, 1);
      console.log(`[vprinter] Cancelled subscription#${subId}`);
      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Get-Notifications') {
      console.log('[vprinter] Get-Notifications called. Returning empty event list.');
      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Get-Document-Attributes') {
      const jobId = Number(attr(opAttrs, 'job-id'));
      console.log(`[vprinter] Get-Document-Attributes called for job#${jobId}`);
      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        },
        'document-attributes-tag': {
          'document-name': 'print-job.pdf',
          'document-format': 'application/pdf',
          'document-state': 'completed'
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Set-Document-Attributes') {
      const jobId = Number(attr(opAttrs, 'job-id'));
      console.log(`[vprinter] Set-Document-Attributes called for job#${jobId}`);
      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Cancel-Document') {
      const jobId = Number(attr(opAttrs, 'job-id'));
      console.log(`[vprinter] Cancel-Document called for job#${jobId}`);
      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Pause-Printer') {
      printerState = 'stopped';
      console.log(`[vprinter] Printer paused (state: ${printerState})`);

      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Resume-Printer') {
      printerState = 'idle';
      console.log(`[vprinter] Printer resumed (state: ${printerState})`);

      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Purge-Jobs') {
      console.log(`[vprinter] Purging all ${jobs.length} jobs.`);
      jobs.length = 0;
      jobSeq = 0;

      try {
        const files = fs.readdirSync(OUT);
        for (const file of files) {
          fs.unlinkSync(path.join(OUT, file));
        }
      } catch (err) {
        console.error('[vprinter] error clearing output files:', err.message);
      }

      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Print-Job') {
      const jobName = String(attr(opAttrs, 'job-name') || `job-${jobSeq + 1}`);
      const user = String(attr(opAttrs, 'requesting-user-name') || 'unknown');

      const job = createJobRecord(jobName, user, 'Print-Job');
      const data = extractIppDocument(raw);
      job.documents.push(data);

      const safe = jobName.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'document';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(OUT, `${stamp}__${safe}.pdf`);
      fs.writeFileSync(file, data);

      const valid = data.subarray(0, 5).toString() === '%PDF-';

      if (printerState !== 'stopped') {
        completeJobRecord(job);
        console.log(
          `[vprinter] ✓ PRINTED job#${job.id} "${jobName}" by "${user}" — ${data.length} bytes, validPDF=${valid} → ${path.basename(file)}`
        );
      } else {
        console.log(
          `[vprinter] Queue paused. Accepted job#${job.id} "${jobName}" by "${user}" (state: ${job.state}) — ${data.length} bytes → ${path.basename(file)}`
        );
      }

      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        },
        'job-attributes-tag': getJobAttributes(job)
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Print-URI') {
      const jobName = String(attr(opAttrs, 'job-name') || `job-${jobSeq + 1}`);
      const user = String(attr(opAttrs, 'requesting-user-name') || 'unknown');
      const docUri = String(attr(opAttrs, 'document-uri') || 'unknown-uri');

      const job = createJobRecord(jobName, user, 'Print-URI');
      job.uris.push(docUri);

      const safe = jobName.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'document';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(OUT, `${stamp}__${safe}_uri.txt`);
      fs.writeFileSync(file, `PRINT_URI: ${docUri}\n`);

      if (printerState !== 'stopped') {
        completeJobRecord(job);
        console.log(
          `[vprinter] ✓ PRINT_URI job#${job.id} "${jobName}" by "${user}" — URI: ${docUri} → ${path.basename(file)}`
        );
      } else {
        console.log(
          `[vprinter] Queue paused. Accepted PRINT_URI job#${job.id} "${jobName}" by "${user}" (state: ${job.state}) — URI: ${docUri} → ${path.basename(file)}`
        );
      }

      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        },
        'job-attributes-tag': getJobAttributes(job)
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Validate-Job') {
      console.log(`[vprinter] Validating job attributes.`);

      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        }
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Create-Job') {
      const jobName = String(attr(opAttrs, 'job-name') || `job-${jobSeq + 1}`);
      const user = String(attr(opAttrs, 'requesting-user-name') || 'unknown');

      const job = createJobRecord(jobName, user, 'Create-Job');
      console.log(`[vprinter] Created job#${job.id} "${jobName}" by "${user}" (state: ${job.state}) - awaiting documents.`);

      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        },
        'job-attributes-tag': getJobAttributes(job)
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Send-Document') {
      const jobId = Number(attr(opAttrs, 'job-id'));
      const lastDoc = attr(opAttrs, 'last-document') === true || attr(opAttrs, 'last-document') === 'true';

      const job = jobs.find(j => j.id === jobId);
      if (!job) {
        console.error(`[vprinter] Send-Document failed: job#${jobId} not found.`);
        const body = ipp.serialize({
          version: msg.version || '2.0',
          statusCode: 'client-error-not-found',
          id: msg.id || 1,
          'operation-attributes-tag': {
            'attributes-charset': 'utf-8',
            'attributes-natural-language': 'en-us',
          }
        });
        res.writeHead(404, { 'Content-Type': 'application/ipp' });
        res.end(body);
        return;
      }

      const data = extractIppDocument(raw);
      job.documents.push(data);

      const safe = job.name.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'document';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(OUT, `${stamp}__${safe}_part${job.documents.length}.pdf`);
      fs.writeFileSync(file, data);

      console.log(`[vprinter] Received document part ${job.documents.length} for job#${job.id} — ${data.length} bytes`);

      if (lastDoc) {
        if (printerState !== 'stopped' && job.state !== 'pending-held') {
          completeJobRecord(job);
        }
        console.log(`[vprinter] Completed all document parts for job#${job.id} (state: ${job.state})`);
      }

      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        },
        'job-attributes-tag': getJobAttributes(job)
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Send-URI') {
      const jobId = Number(attr(opAttrs, 'job-id'));
      const lastDoc = attr(opAttrs, 'last-document') === true || attr(opAttrs, 'last-document') === 'true';
      const docUri = String(attr(opAttrs, 'document-uri') || 'unknown-uri');

      const job = jobs.find(j => j.id === jobId);
      if (!job) {
        console.error(`[vprinter] Send-URI failed: job#${jobId} not found.`);
        const body = ipp.serialize({
          version: msg.version || '2.0',
          statusCode: 'client-error-not-found',
          id: msg.id || 1,
          'operation-attributes-tag': {
            'attributes-charset': 'utf-8',
            'attributes-natural-language': 'en-us',
          }
        });
        res.writeHead(404, { 'Content-Type': 'application/ipp' });
        res.end(body);
        return;
      }

      job.uris.push(docUri);
      const safe = job.name.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'document';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(OUT, `${stamp}__${safe}_uri_part${job.uris.length}.txt`);
      fs.writeFileSync(file, `SEND_URI: ${docUri}\n`);

      console.log(`[vprinter] Received URI part ${job.uris.length} for job#${job.id} — URI: ${docUri}`);

      if (lastDoc) {
        if (printerState !== 'stopped' && job.state !== 'pending-held') {
          completeJobRecord(job);
        }
        console.log(`[vprinter] Completed all URI parts for job#${job.id} (state: ${job.state})`);
      }

      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        },
        'job-attributes-tag': getJobAttributes(job)
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Cancel-Job') {
      const jobId = Number(attr(opAttrs, 'job-id'));
      const job = jobs.find(j => j.id === jobId);
      if (!job) {
        const body = ipp.serialize({
          version: msg.version || '2.0',
          statusCode: 'client-error-not-found',
          id: msg.id || 1,
          'operation-attributes-tag': {
            'attributes-charset': 'utf-8',
            'attributes-natural-language': 'en-us',
          }
        });
        res.writeHead(404, { 'Content-Type': 'application/ipp' });
        res.end(body);
        return;
      }

      job.state = 'canceled';
      job.reasons = 'job-canceled-by-user';
      console.log(`[vprinter] Cancelled job#${jobId}`);

      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        },
        'job-attributes-tag': getJobAttributes(job)
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Get-Job-Attributes') {
      const jobId = Number(attr(opAttrs, 'job-id'));
      const job = jobs.find(j => j.id === jobId);
      if (!job) {
        const body = ipp.serialize({
          version: msg.version || '2.0',
          statusCode: 'client-error-not-found',
          id: msg.id || 1,
          'operation-attributes-tag': {
            'attributes-charset': 'utf-8',
            'attributes-natural-language': 'en-us',
          }
        });
        res.writeHead(404, { 'Content-Type': 'application/ipp' });
        res.end(body);
        return;
      }

      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        },
        'job-attributes-tag': getJobAttributes(job)
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Get-Jobs') {
      const whichJobs = attr(opAttrs, 'which-jobs') || 'not-completed';

      const filtered = jobs.filter(j => {
        const isCompleted = ['completed', 'canceled', 'aborted'].includes(j.state);
        if (whichJobs === 'completed') return isCompleted;
        if (whichJobs === 'not-completed') return !isCompleted;
        return true;
      });

      console.log(`[vprinter] Get-Jobs returning ${filtered.length} jobs (filter: ${whichJobs})`);

      const list = filtered.map(getJobAttributes);
      const body = serializeMultiGroups(
        msg.version,
        'successful-ok',
        msg.id,
        'job-attributes-tag',
        list
      );
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Hold-Job') {
      const jobId = Number(attr(opAttrs, 'job-id'));
      const job = jobs.find(j => j.id === jobId);
      if (!job) {
        const body = ipp.serialize({
          version: msg.version || '2.0',
          statusCode: 'client-error-not-found',
          id: msg.id || 1,
          'operation-attributes-tag': {
            'attributes-charset': 'utf-8',
            'attributes-natural-language': 'en-us',
          }
        });
        res.writeHead(404, { 'Content-Type': 'application/ipp' });
        res.end(body);
        return;
      }

      job.state = 'pending-held';
      job.reasons = 'job-held-by-user';
      console.log(`[vprinter] Held job#${jobId}`);

      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        },
        'job-attributes-tag': getJobAttributes(job)
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Release-Job') {
      const jobId = Number(attr(opAttrs, 'job-id'));
      const job = jobs.find(j => j.id === jobId);
      if (!job) {
        const body = ipp.serialize({
          version: msg.version || '2.0',
          statusCode: 'client-error-not-found',
          id: msg.id || 1,
          'operation-attributes-tag': {
            'attributes-charset': 'utf-8',
            'attributes-natural-language': 'en-us',
          }
        });
        res.writeHead(404, { 'Content-Type': 'application/ipp' });
        res.end(body);
        return;
      }

      if (printerState !== 'stopped') {
        completeJobRecord(job);
      } else {
        job.state = 'pending';
        job.reasons = 'none';
      }
      console.log(`[vprinter] Released job#${jobId} (state: ${job.state})`);

      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        },
        'job-attributes-tag': getJobAttributes(job)
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Restart-Job') {
      const jobId = Number(attr(opAttrs, 'job-id'));
      const job = jobs.find(j => j.id === jobId);
      if (!job) {
        const body = ipp.serialize({
          version: msg.version || '2.0',
          statusCode: 'client-error-not-found',
          id: msg.id || 1,
          'operation-attributes-tag': {
            'attributes-charset': 'utf-8',
            'attributes-natural-language': 'en-us',
          }
        });
        res.writeHead(404, { 'Content-Type': 'application/ipp' });
        res.end(body);
        return;
      }

      if (printerState !== 'stopped') {
        completeJobRecord(job);
      } else {
        job.state = 'pending';
        job.reasons = 'none';
      }
      console.log(`[vprinter] Restarted job#${jobId} (state: ${job.state})`);

      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        },
        'job-attributes-tag': getJobAttributes(job)
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    if (op === 'Set-Job-Attributes') {
      const jobId = Number(attr(opAttrs, 'job-id'));
      const job = jobs.find(j => j.id === jobId);
      if (!job) {
        const body = ipp.serialize({
          version: msg.version || '2.0',
          statusCode: 'client-error-not-found',
          id: msg.id || 1,
          'operation-attributes-tag': {
            'attributes-charset': 'utf-8',
            'attributes-natural-language': 'en-us',
          }
        });
        res.writeHead(404, { 'Content-Type': 'application/ipp' });
        res.end(body);
        return;
      }
      console.log(`[vprinter] Set-Job-Attributes called for job#${jobId}`);
      const body = ipp.serialize({
        version: msg.version || '2.0',
        statusCode: 'successful-ok',
        id: msg.id || 1,
        'operation-attributes-tag': {
          'attributes-charset': 'utf-8',
          'attributes-natural-language': 'en-us',
        },
        'job-attributes-tag': getJobAttributes(job)
      });
      res.writeHead(200, { 'Content-Type': 'application/ipp' });
      res.end(body);
      return;
    }

    // Default handler for unsupported operations
    console.log(`[vprinter] op=${op} (ack-default)`);
    const body = ipp.serialize({
      version: msg.version || '2.0',
      statusCode: 'successful-ok',
      id: msg.id || 1,
      'operation-attributes-tag': {
        'attributes-charset': 'utf-8',
        'attributes-natural-language': 'en-us',
      }
    });
    res.writeHead(200, { 'Content-Type': 'application/ipp' });
    res.end(body);
  });
});

server.listen(PORT, () => {
  console.log(`[vprinter] IPP printer listening on http://0.0.0.0:${PORT}/ipp/print`);
  console.log(`[vprinter] received documents → ${OUT}`);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
