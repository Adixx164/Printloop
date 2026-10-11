#!/usr/bin/env npx tsx
/**
 * Extract DPA markdown from legal.routes.ts
 * Outputs to stdout for piping to pandoc or markdown-pdf
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const filePath = resolve(__dirname, '../01-backend/routes/legal.routes.ts');
const content = readFileSync(filePath, 'utf-8');

// Extract the DPA template literal
const match = content.match(/const dpa = `([\s\S]*?)`;/);
if (!match) {
  console.error('Could not find DPA template literal in legal.routes.ts');
  process.exit(1);
}

console.log(match[1]);