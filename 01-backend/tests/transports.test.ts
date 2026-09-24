import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import net from 'node:net';
import { IppService } from '../services/ipp.service.js';

// Mock SMS and Email services to avoid timeouts
vi.mock('../services/sms.service', () => {
  return {
    SMSService: vi.fn().mockImplementation(() => ({
      sendPrintJobCode: vi.fn().mockResolvedValue({ success: true }),
      sendOTP: vi.fn().mockResolvedValue({ success: true }),
    })),
  };
});

vi.mock('../services/email.service', () => {
  return {
    EmailService: vi.fn().mockImplementation(() => ({
      send: vi.fn().mockResolvedValue(true),
      sendPrintJobReceipt: vi.fn().mockResolvedValue(true),
      sendGroupInvitation: vi.fn().mockResolvedValue(true),
      sendTenantOwnerVerification: vi.fn().mockResolvedValue(true),
      sendPasswordReset: vi.fn().mockResolvedValue(true),
    })),
  };
});

describe('Print Transports Integration Tests', () => {
  it('should successfully transmit a job to a mock LPD server using LPR/LPD protocol', async () => {
    const ippService = new IppService();
    const mockPdfBuffer = Buffer.from('%PDF-1.4 mock pdf data');

    // Create a mock LPD server to verify the RFC 1179 byte sequences
    let receiveJobCommandReceived = false;
    let controlFileHeaderReceived = false;
    let controlFileContentsReceived = false;
    let dataFileHeaderReceived = false;
    let dataFileContentsReceived = false;
    let finalAckSent = false;

    const server = net.createServer((socket) => {
      let state = 0;
      socket.on('data', (data) => {
        try {
          if (state === 0) {
            // Step 1: Receive job command (starts with 0x02)
            if (data[0] === 2) {
              receiveJobCommandReceived = true;
              socket.write(Buffer.from('\x00')); // ACK
              state = 1;
            }
          } else if (state === 1) {
            // Step 2: Receive control file command (starts with 0x02)
            if (data[0] === 2) {
              controlFileHeaderReceived = true;
              socket.write(Buffer.from('\x00')); // ACK
              state = 2;
            }
          } else if (state === 2) {
            // Step 3: Receive control file contents (ends with 0x00)
            if (data[data.length - 1] === 0) {
              controlFileContentsReceived = true;
              socket.write(Buffer.from('\x00')); // ACK
              state = 3;
            }
          } else if (state === 3) {
            // Step 4: Receive data file command (starts with 0x03)
            if (data[0] === 3) {
              dataFileHeaderReceived = true;
              socket.write(Buffer.from('\x00')); // ACK
              state = 4;
            }
          } else if (state === 4) {
            // Step 5: Receive data file contents (ends with 0x00)
            if (data[data.length - 1] === 0) {
              dataFileContentsReceived = true;
              socket.write(Buffer.from('\x00')); // ACK
              finalAckSent = true;
            }
          }
        } catch (err) {
          console.error('[Mock LPD Server Error]', err);
        }
      });
    });

    // Start LPD server on a random ephemeral port
    const port = await new Promise<number>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as net.AddressInfo;
        resolve(addr.port);
      });
    });

    try {
      // Execute print Job
      const result = await ippService.lprPrint(
        '127.0.0.1',
        { buffer: mockPdfBuffer },
        'Test Job LPR',
        { path: '/raw' },
        port
      );

      expect(result).toEqual({
        lpr: true,
        transport: 'lpr',
        bytes: mockPdfBuffer.length
      });

      // Verify server received all LPR packets and responded correctly
      expect(receiveJobCommandReceived).toBe(true);
      expect(controlFileHeaderReceived).toBe(true);
      expect(controlFileContentsReceived).toBe(true);
      expect(dataFileHeaderReceived).toBe(true);
      expect(dataFileContentsReceived).toBe(true);
      expect(finalAckSent).toBe(true);
    } finally {
      server.close();
    }
  });

  it('should support email transport mode with mocked/disabled SMTP service', async () => {
    const ippService = new IppService();
    const mockPdfBuffer = Buffer.from('%PDF-1.4 mock pdf data for email');

    // With SMTP disabled, it should log a mock dispatch and return success: false / mock
    const result = await ippService.emailPrint(
      'printer@hpeprint.com',
      { buffer: mockPdfBuffer },
      'Test Job Email'
    );

    // If SMTP_HOST is not set (typical dev/testing), EmailService send() returns false.
    // Our wrapper should still resolve nicely.
    expect(result).toHaveProperty('email', true);
    expect(result).toHaveProperty('transport', 'email');
    expect(result).toHaveProperty('success');
  });
});
