# Runbook: Render Failure Rate High

## Alert: PrintLoopRenderFailureRateHigh
**Severity:** Warning  
**Service:** printloop-render-worker  
**Team:** Platform

## Symptoms
- Render job failure rate > 10% over 5 minutes
- Customers experiencing failed prints
- Render queue may back up due to retries

## Diagnosis Steps

### 1. Check Render Worker Logs
```bash
# Check for error patterns
kubectl logs -n printloop -l app=printloop-render-worker --tail=500 | grep -iE "(error|fail|exception)"

# Check specific error types
kubectl logs -n printloop -l app=printloop-render-worker --tail=200 | grep -iE "(ghostscript|pdftopwg|s3|upload|timeout)"
```

### 2. Check Failure Types
```bash
# Categorize failures
kubectl logs -n printloop -l app=printloop-render-worker --tail=500 | grep -i "error" | sort | uniq -c | sort -rn
```

### 3. Check Specific Failure Types

#### Ghostscript Errors
```bash
# Check for Ghostscript errors
kubectl logs -n printloop -l app=printloop-render-worker --tail=200 | grep -i "ghostscript\|gs:"
```

#### pdftopwg Errors
```bash
# Check for pdftopwg errors
kubectl logs -n printloop -l app=printloop-render-worker --tail=200 | grep -i "pdftopwg"
```

#### S3 Upload Errors
```bash
# Check for S3 upload errors
kubectl logs -n printloop -l app=printloop-render-worker --tail=200 | grep -i "s3\|upload\|s3"
```

## Common Failure Types & Fixes

### 1. Ghostscript Errors
**Symptoms:** "gs: command not found", "Ghostscript failed", "gs: error"
**Fixes:**
```bash
# Check if Ghostscript is installed
kubectl exec -n printloop <pod-name> -- gs --version

# Install/update Ghostscript if missing
# In Dockerfile: apt-get install -y ghostscript
```

### 2. pdftopwg Errors
**Symptoms:** "pdftopwg failed", "pdftopwg: command not found"
**Fixes:**
```bash
# Check if pdftopwg is available
kubectl exec -n printloop <pod-name> -- which pdftopwg

# Ensure cups-filters is installed
# In Dockerfile: apt-get install -y cups-filters
```

### 3. S3 Upload Failures
**Symptoms:** "S3 upload failed", "AccessDenied", "RequestTimeout"
**Fixes:**
- Check AWS credentials and permissions
- Verify S3 bucket exists and is accessible
- Check network connectivity to S3 endpoint
- Verify bucket policy and IAM permissions

```bash
# Test S3 connectivity
aws s3 ls s3://printloop-dev --endpoint-url https://s3.amazonaws.com
```

### 4. Ghostscript Errors
**Symptoms:** "gs: error", "Ghostscript error", "Unrecoverable error"
**Fixes:**
- Check Ghostscript version: `gs --version`
- Update Ghostscript to latest version
- Check for corrupted PDF inputs

### 4. Memory/Resource Issues
**Symptoms:** OOM kills, "out of memory", "killed"
**Fixes:**
```yaml
# Increase memory limits
render-worker:
  deploy:
    resources:
      limits:
        memory: 2G  # Increase from 1G
        cpus: '2'
```

### 5. Corrupted/Invalid PDFs
**Symptoms:** "Invalid PDF", "corrupted PDF", "syntax error"
**Fixes:**
- Add input validation before render
- Skip corrupted files with alert
- Implement PDF validation pre-check

### 5. Font/Encoding Issues
**Symptoms:** "font not found", "encoding error"
**Fixes:**
- Install additional fonts
- Embed fonts in PDF before rendering
- Use fallback fonts

## Verification Steps

### 1. Check Recent Failure Rate
```bash
# Check failure rate metric
curl http://render-worker:9091/metrics | grep printloop_render_jobs_total
```

### 2. Check Error Distribution
```bash
# Categorize errors by type
kubectl logs -n printloop -l app=printloop-render-worker --tail=500 | \
  grep -i "error" | \
  sed 's/.*error[: ]*//' | \
  sort | uniq -c | sort -rn | head -20
```

### 3. Check Specific Job Failures
```bash
# Check failed jobs in DB
kubectl exec -n printloop <api-pod> -- psql -c "
  SELECT id, status, rendering_error, updated_at 
  FROM print_jobs 
  WHERE status = 'FAILED' 
  AND updated_at > NOW() - INTERVAL '1 hour'
  ORDER BY updated_at DESC 
  LIMIT 20;"
```

## Common Root Causes & Fixes

| Error Pattern | Likely Cause | Fix |
|---------------|--------------|-----|
| `pdftopwg: command not found` | Missing cups-filters | Install cups-filters package |
| `gs: command not found` | Ghostscript not installed | Install ghostscript |
| `S3 upload failed: AccessDenied` | IAM permissions | Check IAM policy for S3 bucket |
| `RequestTimeout` | S3 timeout | Increase timeout, use multipart upload |
| `OutOfMemoryError` | OOM kill | Increase memory limits |
| `Ghostscript error: undefinedfilename` | Missing font/file | Install fonts, check file paths |
| `pdftopwg: syntax error` | Corrupted PDF | Add PDF validation pre-check |

## Verification After Fix
1. Deploy fix
2. Monitor failure rate: `curl http://render-worker:9091/metrics | grep printloop_render_jobs_total`
3. Submit test jobs
4. Monitor for 15 minutes
4. Verify failure rate < 1%

## Escalation
If failure rate > 25% for 15 minutes:
1. Page on-call engineer
2. Consider rolling back render worker deployment
3. Scale down render workers to reduce load
4. Post in #incidents Slack channel
5. Create incident in PagerDuty