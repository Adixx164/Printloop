# Runbook: Render Worker Down

## Alert: PrintLoopRenderWorkerDown
**Severity:** Critical  
**Service:** printloop-render-worker  
**Team:** Platform

## Symptoms
- No render jobs processed for 5+ minutes
- `up{job="printloop-render-worker"} == 0`
- Render queue backing up
- Customers unable to print

## Diagnosis Steps

### 1. Check if render worker pod is running
```bash
# Check pod status
kubectl get pods -n printloop -l app=printloop-render-worker

# Check logs
kubectl logs -n printloop -l app=printloop-render-worker --tail=100
```

### 2. Check Redis connectivity
```bash
# Check Redis connectivity
redis-cli -h redis -p 6379 ping

# Check queue status
redis-cli -h redis -p 6379 LLEN bull:render:waiting
redis-cli -h redis -p 6379 LLEN bull:render:active
```

### 3. Check render worker logs
```bash
# Check for errors
kubectl logs -n printloop -l app=printloop-render-worker --tail=200 | grep -i error

# Check for OOM kills
kubectl describe pod -n printloop -l app=printloop-render-worker | grep -A 10 "OOMKilled"
```

### 4. Check resource usage
```bash
# Check resource usage
kubectl top pods -n printloop -l app=printloop-render-worker

# Check for OOM kills
kubectl describe pod -n printloop -l app=printloop-render-worker | grep -A 10 "OOMKilled"
```

## Common Causes & Fixes

### 1. Render Worker Crashed (OOM)
**Symptoms:** Pod restarts frequently, OOMKilled in describe
**Fix:** Increase memory limit in `docker-compose.prod.yml` or `render-worker` deployment

```yaml
# docker-compose.prod.yml
render-worker:
  deploy:
    resources:
      limits:
        memory: 2G  # Increase from 1G
        cpus: '2'
```

### 2. Redis Connection Issues
**Symptoms:** Connection refused, timeout errors in logs
**Fix:** Check Redis connectivity and credentials

```bash
# Test Redis connection
redis-cli -h redis -p 6379 ping
# Should return PONG
```

### 3. Ghostscript/pdftopwg Missing
**Symptoms:** "binary not found" errors in logs
**Fix:** Ensure vendor binaries are present

```bash
# Check binaries
ls -la /app/vendor/openprinting/cups-filters/src/pdftopwg
ls -la /usr/bin/gs
```

### 4. S3 Upload Failures
**Symptoms:** Callback fails, S3 upload errors in logs
**Fix:** Check S3 credentials and bucket permissions

```bash
# Test S3 access
aws s3 ls s3://printloop-dev --endpoint-url https://s3.amazonaws.com
```

### 5. Redis Queue Stuck
**Symptoms:** Jobs pile up in waiting, active=0
**Fix:** Check worker concurrency and restart worker

```bash
# Restart render worker
kubectl rollout restart deployment/printloop-render-worker -n printloop
```

## Verification Steps After Fix
1. Check render worker is running: `kubectl get pods -n printloop -l app=printloop-render-worker`
2. Verify metrics: `curl http://render-worker:9091/metrics | grep printloop_render_jobs_total`
3. Submit test print job via API
4. Verify job completes and callback fires
5. Check metrics: `curl http://render-worker:9091/metrics | grep printloop_render_jobs_total`

## Escalation
If unable to resolve within 15 minutes:
1. Page on-call engineer
2. Create incident in PagerDuty
3. Post in #incidents Slack channel
4. Consider failing over to backup render worker (if available)