import { describe, it, expect, afterEach } from 'vitest';
import {
  isOfficeDocument,
  conversionEnabled,
  acceptedDocsLabel,
  convertOfficeToPdf,
  OfficeConversionError,
} from '../services/documentConversion.service';

/**
 * Pure-logic coverage for the Office→PDF black box (V2-48). The actual
 * conversion (Gotenberg/LibreOffice) is exercised end-to-end against a
 * stub converter in scripts/e2eOfficeConvertTest.cjs — here we lock the
 * detection + env-gating, which is what decides whether an office upload
 * is accepted at all.
 */
describe('Office→PDF conversion black box (V2-48)', () => {
  const saved = { DOC_CONVERTER: process.env.DOC_CONVERTER, GOTENBERG_URL: process.env.GOTENBERG_URL };
  afterEach(() => {
    process.env.DOC_CONVERTER = saved.DOC_CONVERTER;
    process.env.GOTENBERG_URL = saved.GOTENBERG_URL;
  });

  it('detects office documents by extension (case-insensitive)', () => {
    expect(isOfficeDocument('thesis.docx')).toBe(true);
    expect(isOfficeDocument('Slides.PPTX')).toBe(true);
    expect(isOfficeDocument('budget.xlsx')).toBe(true);
    expect(isOfficeDocument('notes.rtf')).toBe(true);
    expect(isOfficeDocument('scan.pdf')).toBe(false);
    expect(isOfficeDocument('photo.png')).toBe(false);
  });

  it('detects office documents by MIME when the name is unhelpful', () => {
    expect(
      isOfficeDocument('upload', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
    ).toBe(true);
    expect(isOfficeDocument('upload', 'application/pdf')).toBe(false);
  });

  it('is OFF by default (no DOC_CONVERTER, no GOTENBERG_URL)', () => {
    delete process.env.DOC_CONVERTER;
    delete process.env.GOTENBERG_URL;
    expect(conversionEnabled()).toBe(false);
    expect(acceptedDocsLabel()).toBe('PDF, JPG, PNG');
  });

  it('auto-enables Gotenberg when GOTENBERG_URL is set', () => {
    delete process.env.DOC_CONVERTER;
    process.env.GOTENBERG_URL = 'http://localhost:3000';
    expect(conversionEnabled()).toBe(true);
    expect(acceptedDocsLabel()).toContain('Word');
  });

  it('honours DOC_CONVERTER=none even when a URL is present', () => {
    process.env.DOC_CONVERTER = 'none';
    process.env.GOTENBERG_URL = 'http://localhost:3000';
    expect(conversionEnabled()).toBe(false);
  });

  it('convertOfficeToPdf rejects with OfficeConversionError when disabled', async () => {
    process.env.DOC_CONVERTER = 'none';
    await expect(convertOfficeToPdf(Buffer.from('x'), 'a.docx')).rejects.toBeInstanceOf(
      OfficeConversionError,
    );
  });
});
