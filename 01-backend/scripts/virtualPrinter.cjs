/**
 * Virtual IPP printer for end-to-end testing without hardware.
 * Decodes requests with the SAME `ipp` library PrintLoop's IppService uses
 * (guaranteed wire-compatible), writes each received document to
 * data/printed/, and returns a proper IPP success so the client is happy.
 *
 *   node scripts/virtualPrinter.cjs                 # port 6310
 *   IPP_VPRINTER_PORT=9100 node scripts/virtualPrinter.cjs
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const ipp = require('ipp');

const PORT = Number(process.env.IPP_VPRINTER_PORT || 6310);
const OUT = path.resolve(__dirname, '..', 'data', 'printed');
fs.mkdirSync(OUT, { recursive: true });
let jobSeq = 0;

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
      msg = ipp.parse(raw); // metadata only (operation, job-name, user)
    } catch (e) {
      console.error('[vprinter] could not parse IPP request:', e.message);
      res.writeHead(400).end();
      return;
    }

    const opAttrs = msg['operation-attributes-tag'] || {};
    const op = msg.operation;
    let jobAttrs = {};

    if (op === 'Print-Job') {
      jobSeq += 1;
      const jobName = String(attr(opAttrs, 'job-name') || `job-${jobSeq}`);
      const user = String(attr(opAttrs, 'requesting-user-name') || 'unknown');
      const safe = jobName.replace(/[^\w.-]+/g, '_').slice(0, 60) || 'document';
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const file = path.join(OUT, `${stamp}__${safe}.pdf`);
      const data = extractIppDocument(raw); // byte-exact, untouched
      fs.writeFileSync(file, data);
      const valid = data.subarray(0, 5).toString() === '%PDF-';
      console.log(
        `[vprinter] ✓ PRINTED job#${jobSeq} "${jobName}" by "${user}" — ${data.length} bytes, validPDF=${valid} → ${path.basename(file)}`
      );
      jobAttrs = {
        'job-id': jobSeq,
        'job-uri': `ipp://localhost:${PORT}/jobs/${jobSeq}`,
        'job-state': 'completed',
        'job-state-reasons': 'job-completed-successfully',
      };
    } else {
      console.log(`[vprinter] op=${op} (ack)`);
    }

    const body = ipp.serialize({
      version: msg.version || '2.0',
      statusCode: 'successful-ok',
      id: msg.id || 1,
      'operation-attributes-tag': {
        'attributes-charset': 'utf-8',
        'attributes-natural-language': 'en-us',
      },
      ...(op === 'Print-Job' ? { 'job-attributes-tag': jobAttrs } : {}),
      ...(op === 'Get-Printer-Attributes'
        ? {
            'printer-attributes-tag': {
              'printer-state': 'idle',
              'printer-state-reasons': 'none',
              'printer-is-accepting-jobs': true,
            },
          }
        : {}),
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
