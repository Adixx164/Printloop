import 'reflect-metadata';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import ipp from 'ipp';

// Dynamically register CUPS operations in the local ipp library instance for serialization support
(ipp.operations as any)['CUPS-Get-Default'] = 0x4001;
(ipp.operations as any)['CUPS-Get-Printers'] = 0x4002;
(ipp.operations as any)['CUPS-Get-Classes'] = 0x4005;
(ipp.operations as any)['CUPS-Move-Job'] = 0x400D;
(ipp.operations as any)['CUPS-Authenticate-Job'] = 0x4016;

// Patch ipp.serialize in-memory in the test runner process
const getPatchedSerializer = () => {
  const fs = require('node:fs');
  const serializerPath = require.resolve('ipp/lib/serializer.js');
  let code = fs.readFileSync(serializerPath, 'utf8');

  code = code.replace(
    "writeGroup('document-attributes-tag');",
    "writeGroup('document-attributes-tag');\n\twriteGroup('subscription-attributes-tag');\n\twriteGroup('event-notification-attributes-tag');"
  );

  const dir = path.dirname(serializerPath);
  const wrapper = eval(`(function(exports, require, module, __filename, __dirname) {
    ${code}
  })`);

  const customModule = { exports: {} };
  const customRequire = (id: string) => {
    if (id.startsWith('.')) {
      return require(path.resolve(dir, id));
    }
    return require(id);
  };

  wrapper(customModule.exports, customRequire, customModule, serializerPath, dir);
  return customModule.exports;
};

ipp.serialize = getPatchedSerializer() as any;

const attrs = (ipp as any).attributes;
if (attrs) {
  const sourceGroups = ['Subscription Description', 'Subscription Template', 'Event Notifications'];
  const targetGroups = ['Operation', 'Printer Description', 'Subscription Description'];
  for (const srcGroupName of sourceGroups) {
    const srcGroup = attrs[srcGroupName];
    if (srcGroup) {
      for (const key of Object.keys(srcGroup)) {
        for (const targetGroupName of targetGroups) {
          const targetGroup = attrs[targetGroupName];
          if (targetGroup && !targetGroup[key]) {
            targetGroup[key] = srcGroup[key];
          }
        }
      }
    }
  }
}

describe('Virtual IPP Printer Operations Tests', () => {
  let vprinter: ChildProcess;
  const testPort = 6319;
  const url = `http://127.0.0.1:${testPort}/ipp/print`;

  beforeAll(async () => {
    vprinter = spawn('node', [path.resolve(__dirname, '../scripts/virtualPrinter.cjs')], {
      env: { ...process.env, IPP_VPRINTER_PORT: String(testPort) }
    });

    vprinter.stdout?.on('data', (d) => console.log('[vprinter-out]', d.toString().trim()));
    vprinter.stderr?.on('data', (d) => console.error('[vprinter-err]', d.toString().trim()));

    // Wait a brief moment for the server to start
    await new Promise((resolve) => setTimeout(resolve, 500));
  });

  afterAll(() => {
    if (vprinter) {
      vprinter.kill('SIGKILL');
    }
  });

  const sendIpp = (operation: string, body: any = {}, data?: Buffer): Promise<any> => {
    return new Promise((resolve, reject) => {
      const opAttrs: any = {
        'attributes-charset': 'utf-8',
        'attributes-natural-language': 'en-us',
        'printer-uri': url
      };
      const msg: any = {
        version: '2.0',
        operation,
        id: 1,
        'operation-attributes-tag': opAttrs
      };

      for (const k of Object.keys(body)) {
        if (k.endsWith('-tag')) {
          msg[k] = body[k];
        } else {
          opAttrs[k] = body[k];
        }
      }

      if (data) {
        msg.data = data;
      }
      ipp.request(url, ipp.serialize(msg), (err, res) => {
        if (err) return reject(err);
        resolve(res);
      });
    });
  };

  it('supports Get-Printer-Attributes', async () => {
    const res = await sendIpp('Get-Printer-Attributes');
    expect(res.statusCode).toBe('successful-ok');
    const pat = res['printer-attributes-tag'];
    expect(pat).toBeDefined();
    expect(pat['printer-state']).toBe('idle');
    expect(pat['printer-is-accepting-jobs']).toBe(true);
    expect(pat['operations-supported']).toContain('Print-Job');
  });

  it('supports Validate-Job', async () => {
    const res = await sendIpp('Validate-Job', {
      'requesting-user-name': 'TestUser',
      'job-name': 'ValidateTest'
    });
    expect(res.statusCode).toBe('successful-ok');
  });

  it('supports Print-Job', async () => {
    const doc = Buffer.from('%PDF-1.4 print job test data');
    const res = await sendIpp('Print-Job', {
      'requesting-user-name': 'TestUser',
      'job-name': 'PrintJobTest'
    }, doc);

    expect(res.statusCode).toBe('successful-ok');
    const jat = res['job-attributes-tag'];
    expect(jat).toBeDefined();
    expect(jat['job-id']).toBeGreaterThan(0);
    expect(jat['job-state']).toBe('completed');
  });

  it('supports Print-URI', async () => {
    const res = await sendIpp('Print-URI', {
      'requesting-user-name': 'TestUser',
      'job-name': 'PrintUriTest',
      'document-uri': 'http://example.com/doc.pdf'
    });

    expect(res.statusCode).toBe('successful-ok');
    const jat = res['job-attributes-tag'];
    expect(jat).toBeDefined();
    expect(jat['job-state']).toBe('completed');
  });

  it('supports Create-Job, Send-Document and Get-Job-Attributes', async () => {
    const createRes = await sendIpp('Create-Job', {
      'requesting-user-name': 'TestUser',
      'job-name': 'CreateJobTest'
    });
    expect(createRes.statusCode).toBe('successful-ok');
    const jobId = createRes['job-attributes-tag']['job-id'];
    expect(jobId).toBeDefined();
    expect(createRes['job-attributes-tag']['job-state']).toBe('pending');

    const docPart1 = Buffer.from('PDF part 1');
    const sendRes1 = await sendIpp('Send-Document', {
      'job-id': jobId,
      'last-document': false
    }, docPart1);
    expect(sendRes1.statusCode).toBe('successful-ok');

    const docPart2 = Buffer.from('PDF part 2');
    const sendRes2 = await sendIpp('Send-Document', {
      'job-id': jobId,
      'last-document': true
    }, docPart2);
    expect(sendRes2.statusCode).toBe('successful-ok');
    expect(sendRes2['job-attributes-tag']['job-state']).toBe('completed');

    const getAttrRes = await sendIpp('Get-Job-Attributes', {
      'job-id': jobId
    });
    expect(getAttrRes.statusCode).toBe('successful-ok');
  });

  it('supports Cancel-Job, Hold-Job, Release-Job, and Restart-Job', async () => {
    const createRes = await sendIpp('Create-Job', {
      'requesting-user-name': 'TestUser',
      'job-name': 'StateTestJob'
    });
    const jobId = createRes['job-attributes-tag']['job-id'];

    const holdRes = await sendIpp('Hold-Job', { 'job-id': jobId });
    expect(holdRes.statusCode).toBe('successful-ok');
    expect(holdRes['job-attributes-tag']['job-state']).toBe('pending-held');

    const releaseRes = await sendIpp('Release-Job', { 'job-id': jobId });
    expect(releaseRes.statusCode).toBe('successful-ok');

    const restartRes = await sendIpp('Restart-Job', { 'job-id': jobId });
    expect(restartRes.statusCode).toBe('successful-ok');

    const cancelRes = await sendIpp('Cancel-Job', { 'job-id': jobId });
    expect(cancelRes.statusCode).toBe('successful-ok');
    expect(cancelRes['job-attributes-tag']['job-state']).toBe('canceled');
  });

  it('supports Get-Jobs list retrieval', async () => {
    const res = await sendIpp('Get-Jobs', {
      'which-jobs': 'all'
    });
    expect(res.statusCode).toBe('successful-ok');
    const jobsList = res['job-attributes-tag'];
    expect(Array.isArray(jobsList)).toBe(true);
  });

  it('supports Pause-Printer and Resume-Printer states', async () => {
    const pauseRes = await sendIpp('Pause-Printer');
    expect(pauseRes.statusCode).toBe('successful-ok');

    const attrRes1 = await sendIpp('Get-Printer-Attributes');
    expect(attrRes1['printer-attributes-tag']['printer-state']).toBe('stopped');

    const resumeRes = await sendIpp('Resume-Printer');
    expect(resumeRes.statusCode).toBe('successful-ok');
  });

  it('supports Identify-Printer and Set-Printer-Attributes', async () => {
    const identifyRes = await sendIpp('Identify-Printer');
    expect(identifyRes.statusCode).toBe('successful-ok');

    const setAttrRes = await sendIpp('Set-Printer-Attributes');
    expect(setAttrRes.statusCode).toBe('successful-ok');
  });

  it('supports printer and job Subscriptions', async () => {
    // 1. Create printer subscription
    const subRes = await sendIpp('Create-Printer-Subscriptions', {
      'subscription-attributes-tag': {
        'notify-events': ['printer-state-changed'],
        'notify-recipient-uri': 'mailto:admin@example.com'
      }
    });
    expect(subRes.statusCode).toBe('successful-ok');
    const subId = subRes['subscription-attributes-tag']['notify-subscription-id'];
    expect(subId).toBeDefined();

    // 2. Create job subscription
    const jobRes = await sendIpp('Create-Job-Subscription', {
      'job-id': 1,
      'subscription-attributes-tag': {
        'notify-events': ['job-state-changed'],
        'notify-recipient-uri': 'mailto:admin@example.com'
      }
    });
    expect(jobRes.statusCode).toBe('successful-ok');

    // 3. Get Subscription Attributes
    const getSubAttrRes = await sendIpp('Get-Subscription-Attributes', {
      'notify-subscription-id': subId
    });
    expect(getSubAttrRes.statusCode).toBe('successful-ok');
    expect(getSubAttrRes['subscription-attributes-tag']['notify-recipient-uri']).toBe('mailto:admin@example.com');

    // 4. Get Subscriptions
    const listRes = await sendIpp('Get-Subscriptions');
    expect(listRes.statusCode).toBe('successful-ok');
    const subList = listRes['subscription-attributes-tag'];
    const subListArr = Array.isArray(subList) ? subList : [subList];
    expect(subListArr.length).toBeGreaterThan(0);

    // 5. Renew Subscription
    const renewRes = await sendIpp('Renew-Subscription', {
      'notify-subscription-id': subId
    });
    expect(renewRes.statusCode).toBe('successful-ok');

    // 6. Get Notifications
    const notifyRes = await sendIpp('Get-Notifications');
    expect(notifyRes.statusCode).toBe('successful-ok');

    // 7. Cancel Subscription
    const cancelSubRes = await sendIpp('Cancel-Subscription', {
      'notify-subscription-id': subId
    });
    expect(cancelSubRes.statusCode).toBe('successful-ok');
  });

  it('supports Document operations and Set-Job-Attributes', async () => {
    // 1. Get Document Attributes
    const getDocAttrRes = await sendIpp('Get-Document-Attributes', {
      'job-id': 1
    });
    expect(getDocAttrRes.statusCode).toBe('successful-ok');
    expect(getDocAttrRes['document-attributes-tag']['document-format']).toBe('application/pdf');

    // 2. Set Document Attributes
    const setDocAttrRes = await sendIpp('Set-Document-Attributes', {
      'job-id': 1
    });
    expect(setDocAttrRes.statusCode).toBe('successful-ok');

    // 3. Cancel Document
    const cancelDocRes = await sendIpp('Cancel-Document', {
      'job-id': 1
    });
    expect(cancelDocRes.statusCode).toBe('successful-ok');

    // 4. Set Job Attributes
    const setJobAttrRes = await sendIpp('Set-Job-Attributes', {
      'job-id': 1
    });
    expect(setJobAttrRes.statusCode).toBe('successful-ok');
  });

  it('supports CUPS administration operations', async () => {
    // 1. CUPS-Get-Default
    const defRes = await sendIpp('CUPS-Get-Default');
    expect(defRes.statusCode).toBe('successful-ok');
    expect(defRes['printer-attributes-tag']['printer-name']).toBe('Virtual IPP Printer');

    // 2. CUPS-Get-Printers
    const printersRes = await sendIpp('CUPS-Get-Printers');
    expect(printersRes.statusCode).toBe('successful-ok');
    const printers = printersRes['printer-attributes-tag'];
    const printersArr = Array.isArray(printers) ? printers : [printers];
    expect(printersArr[0]['printer-name']).toBe('Virtual IPP Printer');

    // 3. CUPS-Get-Classes
    const classesRes = await sendIpp('CUPS-Get-Classes');
    expect(classesRes.statusCode).toBe('successful-ok');

    // 4. CUPS-Move-Job
    const moveRes = await sendIpp('CUPS-Move-Job', {
      'job-id': 1
    });
    expect(moveRes.statusCode).toBe('successful-ok');

    // 5. CUPS-Authenticate-Job
    const authRes = await sendIpp('CUPS-Authenticate-Job', {
      'job-id': 1
    });
    expect(authRes.statusCode).toBe('successful-ok');
  });

  it('supports Purge-Jobs', async () => {
    const purgeRes = await sendIpp('Purge-Jobs');
    expect(purgeRes.statusCode).toBe('successful-ok');

    // Verify get jobs is empty
    const res = await sendIpp('Get-Jobs', {
      'which-jobs': 'all'
    });
    expect(res.statusCode).toBe('successful-ok');
    expect(res['job-attributes-tag'] || []).toEqual([]);
  });
});
