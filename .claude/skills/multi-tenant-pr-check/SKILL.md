---
name: multi-tenant-pr-check
description: Scan PR diffs for missing tenantId scoping in queries, migrations, and repositories
---

# Multi-Tenant PR Check Skill

Scans pull request diffs to catch missing `tenantId` scoping — the #1 cause of data leakage in multi-tenant SaaS.

## What this skill checks

1. **TypeORM queries** - Missing `.andWhere('entity.tenantId = :tenantId')` or `where: { tenantId }`
2. **Raw SQL migrations** - Tables without `tenantId` column or `NOT NULL` constraint
3. **Repository methods** - `find()`, `findOne()`, `count()` without tenant filter
4. **QueryBuilder** - `getMany()`, `getOne()` without tenant condition
5. **Entity definitions** - Missing `@Index` on `tenantId`, missing `tenantId` column

## Usage

```
/multi-tenant-pr-check <pr-number>
```

Or run on current working directory changes:
```
/multi-tenant-pr-check
```

## Exit codes

- `0` - No issues found
- `1` - Warnings (non-blocking)
- `2` - Errors (blocking - missing tenant scoping)

## Configuration

Create `.claude/skills/multi-tenant-pr-check/config.json`:

```json
{
  "blockingPatterns": [
    "find\\([^)]*\\)",
    "findOne\\([^)]*\\)",
    "count\\([^)]*\\)",
    "createQueryBuilder\\([^)]*\\)\\.getMany\\(\\)",
    "createQueryBuilder\\([^)]*\\)\\.getOne\\(\\)"
  ],
  "allowedPaths": [
    "platform/",  // SUPER_ADMIN only
    "admin/",     // Platform admin
    "migrations/*PostgresBaseline*"  // Baseline migration
  ],
  "requiredTenantColumn": "tenantId"
}
```

## Files

- `scan-diff.ts` - Main scanner using git diff
- `patterns.ts` - Regex patterns for detection
- `config.json` - Configuration