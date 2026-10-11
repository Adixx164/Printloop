# Runbook: Render High Latency (P95 > 300s)

## Alert: PrintLoopRenderHighLatency
**Severity:** Warning  
**Service:** printloop-render-worker  
**Team:** Platform

## Symptoms
- P95 render duration > 300 seconds for 5+ minutes
- Customers experiencing long wait times
- Render queue backing up

## Diagnosis Steps

### 1. Check Render Worker Resource Usage
```bash
# Check CPU/Memory usage
kubectl top pods -n printloop -l app=printloop-render-worker

# Check detailed resource usage
kubectl exec -n printloop <pod-name> -- htop
```

### 2. Check Render Worker Logs
```bash
# Check for slow operations
kubectl logs -n printloop -l app=printloop-render-worker --tail=200 | grep -E "(duration|slow|timeout)"

# Check render pipeline timing
kubectl logs -n printloop -l app=printloop-render-worker --tail=100 | grep -E "(pdfToPwgRaster|normalizeToPdfA|pdftopwg|gs)"
```

### 3. Check Resource Constraints
```bash
# Check resource limits
kubectl describe pod -n printloop -l app=printloop-render-worker | grep -A 10 "Limits:"

# Check current resource usage
kubectl top pods -n printloop -l app=printloop-render-worker
```

### 3. Check Render Pipeline Stages
```bash
# Check which stage is slow
kubectl logs -n printloop -l app=printloop-render-worker --tail=500 | grep -E "(normalizeToPdfA|pdfToPwgRaster|generatePreviewImages|uploadToS3)" | tail -20
```

## Common Causes & Fixes

### 1. Large/Complex PDFs
**Symptoms:** High render times for specific files
**Fix:** 
- Add file size/complexity limits
- Consider async processing for large files
- Increase worker timeout thresholds

### 2. Resource Constraints
**Symptoms:** High CPU/memory, OOM kills
**Fix:** Increase resource limits
```yaml
# docker-compose.prod.yml
render-worker:
  deploy:
    resources:
      limits:
        memory: 2G  # Increase from 1G
        cpus: '2'
```

### 3. Ghostscript/PDFlib Performance
**Symptoms:** pdftopwg or gs taking too long
**Fix:** 
- Update Ghostscript to latest version
- Consider lowering DPI for non-critical prints
- Enable parallel processing if supported

### 4. S3 Upload Bottleneck
**Symptoms:** Slow uploadToS3 in logs
**Fix:** 
- Check S3 endpoint latency
- Use multipart uploads for large files
- Consider regional S3 endpoint

### 5. Redis Queue Backup
**Symptoms:** Queue backing up, active jobs = concurrency limit
**Fix:** Scale render workers horizontally
```yaml
# docker-compose.prod.yml
render-worker:
  deploy:
    replicas: 3  # Scale horizontally
```

## Verification Steps
1. Check render duration metrics: `curl http://render-worker:9091/metrics | grep render_duration`
2. Submit test job, verify completion < 60s for typical docs
3. Check queue depth: `redis-cli LLEN bull:render:waiting`
3. Monitor for 15 minutes after fix

## Escalation
If unresolved in 30 minutes:
1. Page on-call engineer
2. Consider scaling render workers horizontally
3. Post in #incidents Slack channel
4. Consider failing over to backup render worker (if available)