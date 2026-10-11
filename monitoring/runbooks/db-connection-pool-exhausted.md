# Runbook: Database Connection Pool Exhausted

## Alert: PrintLoopDatabaseConnectionPoolExhausted
**Severity:** Warning  
**Service:** printloop-api  
**Component:** database  
**Team:** Platform

## Symptoms
- Database connection pool > 85% utilized
- New requests timing out waiting for connections
- API latency spikes
- New requests fail with "connection pool exhausted"

## Diagnosis Steps

### 1. Check Current Connection Usage
```bash
# Check current connections
kubectl exec -n printloop <api-pod> -- psql -c "
  SELECT 
    count(*) as active_connections,
    current_setting('max_connections')::int as max_connections,
    round(count(*)::numeric / current_setting('max_connections')::int * 100, 2) as usage_pct
  FROM pg_stat_activity;
"

# Check per-database breakdown
kubectl exec -n printloop <api-pod> -- psql -c "
  SELECT datname, count(*) as connections
  FROM pg_stat_activity
  GROUP BY datname
  ORDER BY connections DESC;
"
```

### 2. Check Long-Running Queries
```bash
# Find long-running queries
kubectl exec -n printloop <api-pod> -- psql -c "
  SELECT 
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query,
    state,
    usename
  FROM pg_stat_activity
  WHERE state != 'idle'
    AND now() - pg_stat_activity.query_start > interval '30 seconds'
  ORDER BY duration DESC;
"
```

### 3. Check Connection Pool Settings
```bash
# Check current pool settings
kubectl exec -n printloop <api-pod> -- cat .env | grep -E "(DB_POOL|DATABASE_URL)"

# Check Node.js pool config
kubectl exec -n printloop <api-pod> -- node -e "
  const { config } = require('./config');
  console.log('Pool max:', config.database.poolMax);
"
```

## Common Causes & Fixes

### 1. Connection Leaks (Most Common)
**Symptoms:** Pool grows over time, never releases
**Root Cause:** Queries not releasing connections, missing `finally` blocks
**Fix:** Audit code for proper connection release
```typescript
// Bad
const result = await query('SELECT * FROM users');
// Connection never returned to pool!

// Good
const client = await pool.connect();
try {
  const result = await client.query('SELECT * FROM users');
  return result;
} finally {
  client.release(); // Always release!
}
```

### 2. Long-Running Queries Blocking Pool
**Symptoms:** Queries running > 30s, blocking pool
**Fix:** 
- Add query timeouts
- Optimize slow queries with indexes
- Move heavy queries to background jobs

```typescript
// Add query timeout
const result = await pool.query({
  text: 'SELECT * FROM large_table',
  timeout: 30000 // 30s timeout
});
```

### 3. Connection Pool Too Small
**Symptoms:** High utilization even with no leaks
**Fix:** Increase pool size
```bash
# In .env
DB_POOL_MAX=20  # Increase from default 10
```
```typescript
// In config/database.ts
extra: {
  max: config.database.poolMax,  // Increase from 10 to 20-30
}
```

### 4. Zombie Connections (Client Disconnects)
**Symptoms:** Connections stuck in "idle in transaction"
**Fix:** Set idle transaction timeout
```sql
-- In postgresql.conf or per-session
SET idle_in_transaction_session_timeout = '30s';
```

### 5. Too Many API Replicas
**Symptoms:** Too many API pods, each with own pool
**Fix:** Reduce replicas or pool size per pod
```yaml
# docker-compose.prod.yml
api:
  deploy:
    replicas: 2  # Reduce if too many
  environment:
    DB_POOL_MAX: 10  # Reduce per-pod pool
```

## Quick Fixes

### Emergency: Increase Pool Size (Temporary)
```bash
# Update configmap/env and restart
kubectl set env deployment/printloop-api DB_POOL_MAX=30 -n printloop
kubectl rollout restart deployment/printloop-api -n printloop
```

### Emergency: Kill Long-Running Queries
```bash
# Kill queries > 60s
kubectl exec -n printloop <api-pod> -- psql -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE state != 'idle'
    AND now() - query_start > interval '60 seconds';
"
```

## Verification Steps
1. Check pool usage: `curl http://api:4000/metrics | grep pool`
2. Monitor for 15 minutes after fix
3. Verify connection count stable < 70%

## Escalation
If pool exhaustion recurs:
1. Page on-call engineer
2. Enable query logging temporarily
3. Review recent deployments for connection leaks
4. Consider upgrading DB instance class
5. Post in #incidents Slack channel