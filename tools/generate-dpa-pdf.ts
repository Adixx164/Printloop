#!/usr/bin/env npx tsx
/**
 * Generate DPA PDF from Markdown
 * Run: npx tsx tools/generate-dpa-pdf.ts
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

async function main() {
  try {
    // Try to use @vercel/og or puppeteer for PDF generation
    // Fallback: use markdown-pdf if available
    const { default: markdownPdf } = await import('markdown-pdf');
    const { default: fs } = await import('node:fs');
    const { default: path } = await import('node:path');

    const mdPath = resolve(__dirname, '../01-backend/routes/legal.routes.ts');
    const content = readFileSync(mdPath, 'utf-8');

    // Extract DPA markdown from the legal.routes.ts file
    const dpaMatch = content.match(/const dpa = `([\s\S]*?)`;/);
    if (!dpaMatch) {
      console.error('Could not extract DPA markdown from legal.routes.ts');
      process.exit(1);
    }

    const dpaMarkdown = dpaMatch[1];
    const outputPath = resolve(__dirname, '../PrintLoop-DPA-v1.0.pdf');

    console.log('Generating DPA PDF...');
    console.log('Input: Markdown from legal.routes.ts');
    console.log(`Output: ${outputPath}`);

    await new Promise((resolve, reject) => {
      markdownPdf()
        .from.string(dpaMarkdown)
        .to(outputPath, () => {
          console.log('DPA PDF generated successfully!');
          resolve(true);
        })
        .on('error', reject);
    });

  } catch (err) {
    console.error('Failed to generate DPA PDF:', err);
    console.log('\nFallback: You can manually convert the DPA markdown to PDF using:');
    console.log('  pandoc -o PrintLoop-DPA-v1.0.pdf <(sed -n "/const dpa = `/,/^`;/p" 01-backend/routes/legal.routes.ts | sed "1d;$d")');
    console.log('\nOr copy the DPA markdown from 01-backend/routes/legal.routes.ts and use any Markdown-to-PDF tool.');
    process.exit(1);
  }
}

main();