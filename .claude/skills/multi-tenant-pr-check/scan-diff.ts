import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

interface Config {
  blockingPatterns: string[];
  allowedPaths: string[];
  requiredTenantColumn: string;
}

function loadConfig(): Config {
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  }
  return {
    blockingPatterns: [
      'find\\([^)]*\\)',
      'findOne\\([^)]*\\)',
      'count\\([^)]*\\)',
      'createQueryBuilder\\([^)]*\\)\\.getMany\\(\\)',
      'createQueryBuilder\\([^)]*\\)\\.getOne\\(\\)',
    ],
    allowedPaths: [
      'platform/',
      'admin/',
      'migrations/*PostgresBaseline*',
    ],
    requiredTenantColumn: 'tenantId',
  };
}

function getDiff(prNumber?: string): string {
  if (prNumber) {
    // Fetch PR diff from GitHub
    try {
      return execSync(`gh pr diff ${prNumber}`, { encoding: 'utf-8' });
    } catch {
      console.error('Failed to fetch PR diff. Is gh CLI authenticated?');
      process.exit(1);
    }
  } else {
    // Use current working directory changes
    try {
      return execSync('git diff HEAD', { encoding: 'utf-8' });
    } catch {
      console.error('Not a git repo or no changes');
      process.exit(1);
    }
  }
}

function isAllowedPath(filePath: string, allowedPaths: string[]): boolean {
  return allowedPaths.some(allowed => {
    const regex = new RegExp('^' + allowed.replace('*', '.*') + '$');
    return regex.test(filePath);
  });
}

function checkFile(filePath: string, diff: string, config: Config): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (isAllowedPath(filePath, config.allowedPaths)) {
    return { errors, warnings };
  }
  
  // Only check TypeScript/TSX files
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) {
    return { errors, warnings };
  }
  
  // Extract added lines from diff for this file
  const fileDiffRegex = new RegExp(`^\\+\\+\\+ b/${filePath.replace(/\//g, '\\/')}`, 'm');
  const fileDiffMatch = diff.match(fileDiffRegex);
  
  if (!fileDiffMatch) return { errors, warnings };
  
  // Simple check: look for added lines with blocking patterns
  const lines = diff.split('\n');
  let inFile = false;
  
  for (const line of lines) {
    if (line.startsWith('+++ b/')) {
      inFile = line.includes(filePath);
      continue;
    }
    if (line.startsWith('--- a/')) {
      inFile = false;
      continue;
    }
    if (!inFile) continue;
    if (!line.startsWith('+')) continue;
    
    const addedLine = line.slice(1);
    
    // Check for blocking patterns
    for (const pattern of config.blockingPatterns) {
      const regex = new RegExp(pattern);
      if (regex.test(addedLine)) {
        // Check if tenantId is in the same line or context
        const hasTenantFilter = /tenantId\s*[=:]\s*[:$\w]/.test(addedLine) ||
                                /where\s*:\s*\{[^}]*tenantId/.test(addedLine) ||
                                /\.andWhere\([^)]*tenantId/.test(addedLine);
        
        if (!hasTenantFilter) {
          errors.push(`${filePath}: Possible missing tenantId filter`);
          errors.push(`  Line: ${addedLine.trim()}`);
          errors.push(`  Pattern matched: ${pattern}`);
        }
      }
    }
    
    // Check for migration creating tables without tenantId
    if (filePath.endsWith('.ts') && filePath.includes('migration')) {
      if (/createTable\(/.test(addedLine) || /CREATE TABLE/.test(addedLine)) {
        // This is a table creation - we'd need more context to verify
        warnings.push(`${filePath}: Table creation detected - verify tenantId column added`);
        warnings.push(`  Line: ${addedLine.trim()}`);
      }
    }
  }
  
  return { errors, warnings };
}

function main() {
  const prNumber = process.argv[2];
  const config = loadConfig();
  const diff = getDiff(prNumber);
  
  // Extract all file paths from diff
  const filePaths = Array.from(diff.matchAll(/^\+\+\+ b\/(.+)$/gm), m => m[1]);
  
  let totalErrors = 0;
  let totalWarnings = 0;
  
  for (const filePath of filePaths) {
    const { errors, warnings } = checkFile(filePath, diff, config);
    
    if (errors.length > 0) {
      console.log(`\n❌ ${filePath}:`);
      errors.forEach(e => console.log(`  ${e}`));
      totalErrors += errors.length;
    }
    
    if (warnings.length > 0) {
      console.log(`\n⚠️  ${filePath}:`);
      warnings.forEach(w => console.log(`  ${w}`));
      totalWarnings += warnings.length;
    }
  }
  
  console.log(`\n📊 Summary: ${totalErrors} errors, ${totalWarnings} warnings`);
  
  if (totalErrors > 0) {
    console.log('🚫 BLOCKING: Missing tenantId scoping detected');
    process.exit(2);
  } else if (totalWarnings > 0) {
    console.log('⚠️  WARNINGS: Review recommended');
    process.exit(1);
  } else {
    console.log('✅ No tenant scoping issues found');
    process.exit(0);
  }
}

main();