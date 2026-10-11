# Runbook: Kiosk Agent Down

## Alert: PrintLoopKioskAgentDown
**Severity:** Critical  
**Service:** printloop-kiosk-agent  
**Team:** Platform

## Symptoms
- Kiosk agent not checking in for 5+ minutes
- `up{job="printloop-kiosk-agent"} == 0`
- Shop unable to print
- No heartbeat from agent

## Diagnosis Steps

### 1. Check if agent pod/process is running
```bash
# Check if running as systemd service (Windows)
Get-Service -Name "PrintLoopKioskAgent"
# or on Linux
systemctl status printloop-kiosk-agent

# Check if process is running
ps aux | grep agent.ts
```

### 2. Check Connectivity to Cloud
```bash
# Test connectivity to API
curl -v https://api.printloop.app/health

# Check DNS resolution
nslookup api.printloop.app

# Check firewall/network
ping api.printloop.app
```

### 3. Check Agent Logs
```bash
# Windows (Event Viewer or log file)
type C:\ProgramData\PrintLoop\agent.log

# Linux (systemd)
journalctl -u printloop-kiosk-agent -f

# Direct log file
tail -f /var/log/printloop/agent.log
```

### 4. Check Configuration
```bash
# Verify .env file exists and has correct values
cat /path/to/printloop-agent/.env

# Key variables to verify:
# PRINTLOOP_BASE_URL
# KIOSK_API_KEY
# PRINTER_TRANSPORT
# PRINTER_IP
```

## Common Causes & Fixes

### 1. Agent Service Crashed/Stopped
**Symptoms:** Service not running, no process found
**Fix:**
```bash
# Windows
Start-Service PrintLoopKioskAgent
# or
.\install.ps1 -StartOnly

# Linux
systemctl restart printloop-kiosk-agent
systemctl status printloop-kiosk-agent
```

### 2. Network Connectivity Issues
**Symptoms:** Cannot reach API, DNS failures, timeouts
**Fixes:**
```bash
# Check DNS
nslookup api.printloop.app

# Check firewall
# Windows: Check Windows Defender Firewall
# Linux: iptables -L | grep 4000

# Test connectivity
curl -v https://api.printloop.app/health
```

### 3. Invalid/Expired Kiosk Key
**Symptoms:** 401 Unauthorized in logs
**Fix:** Regenerate kiosk key in admin panel and update .env

### 4. Printer Connectivity Lost
**Symptoms:** Agent running but printer not responding
**Fixes:**
- Check printer power and network
- Verify printer IP hasn't changed (DHCP lease)
- Test printer connectivity: `ping <printer-ip>`
- Reconfigure printer IP in .env if changed

### 5. Windows Updates/Restarts
**Symptoms:** Agent stopped after Windows Update
**Fix:** Configure agent as Windows Service with auto-restart
```powershell
# Ensure service is set to auto-start
Set-Service -Name "PrintLoopKioskAgent" -StartupType Automatic
```

### 6. Antivirus/EDR Blocking
**Symptoms:** Process killed, access denied errors
**Fix:** Add exclusions for:
- PrintLoop agent executable
- Working directory
- Node.js executable

## Verification Steps
1. Check agent status: `systemctl status printloop-kiosk-agent` or `Get-Service`
2. Check heartbeat: `curl -H "X-Kiosk-Key: <key>" https://api.printloop.app/api/agent/heartbeat`
3. Check logs: `tail -f /var/log/printloop/agent.log`
4. Test print job: Submit test job via API
5. Verify in admin panel: Kiosk shows "Online"

## Escalation
If unresolved in 10 minutes:
1. Page on-call engineer
2. Check if other kiosks affected (infrastructure issue)
3. Post in #incidents Slack channel
4. Consider remote restart via MDM/remote management tool