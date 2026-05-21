/**
 * Probe a real / CUPS / IPP printer with Get-Printer-Attributes.
 * Confirms reachability and prints state before you wire it to a kiosk.
 *
 *   node scripts/probePrinter.cjs <host> [--port=631] [--path=/ipp/print]
 *                                 [--ipps] [--insecure] [--ca=/path/ca.pem]
 *
 * Examples:
 *   node scripts/probePrinter.cjs 192.168.1.50                       # IPP Everywhere
 *   node scripts/probePrinter.cjs cups.lan --path=/printers/HP_Laser # CUPS queue
 *   node scripts/probePrinter.cjs 10.0.0.9 --ipps --insecure          # self-signed IPPS
 */
const fs = require('node:fs');
const ipp = require('ipp');

const args = process.argv.slice(2);
const host = args.find((a) => !a.startsWith('--'));
const opt = (k, d) => {
  const m = args.find((a) => a.startsWith(`--${k}=`));
  return m ? m.split('=')[1] : d;
};
const has = (k) => args.includes(`--${k}`);

if (!host) {
  console.error('Usage: node scripts/probePrinter.cjs <host> [--port=631] [--path=/ipp/print] [--ipps] [--insecure] [--ca=ca.pem]');
  process.exit(2);
}

const secure = has('ipps');
const port = Number(opt('port', 631));
// Git-Bash/MSYS rewrites a leading "/printers/x" arg into
// "C:/Program Files/Git/printers/x" — repair it back to the real IPP path.
let path = opt('path', '/ipp/print');
const km = path.match(/(\/(?:ipp\/print|printers\/[^\s]+))\s*$/i);
if (km) path = km[1];
else if (!path.startsWith('/')) path = '/' + path;
const caPath = opt('ca', '');
const ca = caPath && fs.existsSync(caPath) ? fs.readFileSync(caPath) : undefined;

const printer = secure
  ? new ipp.Printer(
      {
        protocol: 'https:',
        hostname: host,
        host: `${host}:${port}`,
        port,
        path,
        rejectUnauthorized: !has('insecure'),
        ca,
      },
      { uri: `ipps://${host}:${port}${path}` }
    )
  : new ipp.Printer(`http://${host}:${port}${path}`);

const url = `${secure ? 'ipps' : 'ipp'}://${host}:${port}${path}`;
console.log(`Probing ${url} …`);

const msg = {
  'operation-attributes-tag': {
    'requesting-user-name': 'PrintLoop-Probe',
    'requested-attributes': [
      'printer-state',
      'printer-state-reasons',
      'printer-is-accepting-jobs',
      'printer-make-and-model',
      'document-format-supported',
    ],
  },
};

const timer = setTimeout(() => {
  console.error('❌ UNREACHABLE — no response in 8s (wrong host/port/path, or printer offline).');
  process.exit(1);
}, 8000);

printer.execute('Get-Printer-Attributes', msg, (err, res) => {
  clearTimeout(timer);
  if (err) {
    console.error(`❌ ERROR: ${err.message}`);
    process.exit(1);
  }
  const p = (res && res['printer-attributes-tag']) || {};
  console.log('✅ REACHABLE — printer responded:');
  console.log(`   state:            ${p['printer-state']}`);
  console.log(`   state-reasons:    ${[].concat(p['printer-state-reasons'] || ['n/a']).join(', ')}`);
  console.log(`   accepting-jobs:   ${p['printer-is-accepting-jobs']}`);
  console.log(`   make-and-model:   ${p['printer-make-and-model'] || 'n/a'}`);
  const fmts = [].concat(p['document-format-supported'] || []);
  console.log(`   pdf-supported:    ${fmts.includes('application/pdf') ? 'yes' : `(formats: ${fmts.join(', ') || 'n/a'})`}`);
  process.exit(0);
});
