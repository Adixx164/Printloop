"""Generate PrintLoop Architecture Diagram as PNG using PIL."""
from PIL import Image, ImageDraw, ImageFont
import math

WIDTH = 1800
MARGIN = 40
MARGIN_TOP = 80

# Colors
BG = (249, 251, 255)  # sheet
INK = (23, 20, 15)  # toner
MUTED = (110, 106, 97)
HAIRLINE = (227, 232, 240)
PROCESS = (0, 119, 200)
PROCESS_INK = (0, 94, 158)
PAPER = (255, 255, 255)
REGISTER = (206, 43, 55)
HIGHLIGHT = (255, 212, 0)
PASS = (23, 114, 69)

# Service colors
C_FRONTEND = (0, 119, 200)
C_BACKEND = (23, 20, 15)
C_RENDER = (0, 119, 200)
C_AGENT = (23, 114, 69)
C_KIOSK = (199, 148, 74)
C_DB = (110, 106, 97)

try:
    font_bold = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 16)
    font_reg = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 14)
    font_small = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 12)
    font_title = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 28)
    font_section = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 20)
    font_label = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 11)
except:
    font_bold = font_reg = font_small = font_title = font_section = font_label = ImageFont.load_default()

def text_center(draw, x, y, w, h, text, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((x + (w - tw) // 2, y + (h - th) // 2 - 1), text, fill=fill, font=font)

def text_wrap(draw, x, y, text, font, fill, max_width, line_spacing=4):
    """Draw wrapped text, return total height used."""
    words = text.split()
    lines = []
    current = ""
    for word in words:
        test = f"{current} {word}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] > max_width:
            if current:
                lines.append(current)
            current = word
        else:
            current = test
    if current:
        lines.append(current)

    cy = y
    for line in lines:
        draw.text((x, cy), line, fill=fill, font=font)
        cy += font.size + line_spacing
    return cy - y

def draw_box(draw, x, y, w, h, text, fill=PAPER, stroke=INK, font=font_bold, text_color=INK, radius=6):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=radius, fill=fill, outline=stroke, width=2)
    # Handle multiline
    lines = text.split('\n')
    total_h = len(lines) * (font.size + 2)
    start_y = y + (h - total_h) // 2
    for i, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font)
        tw = bbox[2] - bbox[0]
        draw.text((x + (w - tw) // 2, start_y + i * (font.size + 2)), line, fill=text_color, font=font)

def draw_diamond(draw, cx, cy, w, h, text, fill=HIGHLIGHT, stroke=INK):
    points = [(cx, cy - h // 2), (cx + w // 2, cy), (cx, cy + h // 2), (cx - w // 2, cy)]
    draw.polygon(points, fill=fill, outline=stroke, width=2)
    text_center(draw, cx - w // 2, cy - h // 2, w, h, text, font_bold, INK)

def arrow(draw, x1, y1, x2, y2, color=INK, width=2, dashed=False):
    if dashed:
        # Draw dashed line
        dx = x2 - x1
        dy = y2 - y1
        length = math.sqrt(dx * dx + dy * dy)
        ux, uy = dx / length, dy / length
        dash_len = 8
        pos = 0
        while pos < length:
            sx = x1 + ux * pos
            sy = y1 + uy * pos
            end = min(pos + dash_len, length)
            ex = x1 + ux * end
            ey = y1 + uy * end
            draw.line([(int(sx), int(sy)), (int(ex), int(ey))], fill=color, width=width)
            pos += dash_len * 2
    else:
        draw.line([(x1, y1), (x2, y2)], fill=color, width=width)

    # Arrowhead
    angle = math.atan2(y2 - y1, x2 - x1)
    arrow_len = 10
    arrow_angle = 0.4
    ax1 = x2 - arrow_len * math.cos(angle - arrow_angle)
    ay1 = y2 - arrow_len * math.sin(angle - arrow_angle)
    ax2 = x2 - arrow_len * math.cos(angle + arrow_angle)
    ay2 = y2 - arrow_len * math.sin(angle + arrow_angle)
    draw.polygon([(x2, y2), (int(ax1), int(ay1)), (int(ax2), int(ay2))], fill=color)

def arrow_label(draw, x, y, text, color=MUTED, font=font_label):
    draw.text((x, y), text, fill=color, font=font)

# Pre-compute total height estimate (we'll crop at the end)
TOTAL_H_ESTIMATE = 4500
img = Image.new("RGB", (WIDTH, TOTAL_H_ESTIMATE), BG)
draw = ImageDraw.Draw(img)

def section_header(draw, x, y, text, width):
    """Draw a section header bar."""
    draw.rounded_rectangle([x, y, x + width, y + 36], radius=4, fill=INK)
    text_center(draw, x, y, width, 36, text, font_section, PAPER)
    return y + 50

# Layout calculation
y = MARGIN_TOP

# ─── HIGH-LEVEL ARCHITECTURE ───────────────────────────────────────
# Row 1: Frontend | Backend | Render Worker | Agent | Kiosk
ROW1_Y = y + 10
BOX_H = 60
BOX_W = 280
GAP = 60
total_w = 5 * BOX_W + 4 * GAP
start_x = (WIDTH - total_w) // 2

services = [
    ("CUSTOMER\nFRONTEND\n(React)", C_FRONTEND, PAPER),
    ("BACKEND API\n(Express)", C_BACKEND, PAPER),
    ("RENDER WORKER\n(BullMQ)", C_RENDER, PAPER),
    ("KIOSK AGENT\n(Node.js)", C_AGENT, PAPER),
    ("KIOSK PRINTER\n(LAN)", C_KIOSK, PAPER),
]

service_x = []
for i, (name, color, fg) in enumerate(services):
    sx = start_x + i * (BOX_W + GAP)
    service_x.append(sx)
    draw_box(draw, sx, ROW1_Y, BOX_W, BOX_H, name, fill=color, font=font_bold, text_color=fg)

# Arrows between services
for i in range(len(services) - 1):
    ax1 = service_x[i] + BOX_W
    ax2 = service_x[i + 1]
    arrow(draw, ax1, ROW1_Y + BOX_H // 2, ax2, ROW1_Y + BOX_H // 2, color=INK, width=2)
    # Bidirectional arrow
    arrow(draw, ax2, ROW1_Y + BOX_H // 2 + 4, ax1, ROW1_Y + BOX_H // 2 + 4, color=MUTED, width=1)

# ─── SHARED INFRASTRUCTURE ─────────────────────────────────────────
INFRA_Y = ROW1_Y + BOX_H + 60
INFRA_H = 140
infra_w = WIDTH - 2 * MARGIN

# Background panel
draw.rounded_rectangle([MARGIN, INFRA_Y, MARGIN + infra_w, INFRA_Y + INFRA_H], radius=8, fill=(241, 245, 252), outline=HAIRLINE, width=1)

# Infrastructure items
infra_items = [
    ("DATABASE", "SQLite / Postgres"),
    ("REDIS", "BullMQ Queues"),
    ("S3", "Artifact Storage"),
    ("PAYSTACK", "Payments & Splits"),
    ("WEBHOOKS", "Dimension 14"),
]

item_w = (infra_w - 40) // 5
for i, (name, desc) in enumerate(infra_items):
    ix = MARGIN + 20 + i * item_w
    # Icon box
    draw.rounded_rectangle([ix, INFRA_Y + 20, ix + item_w - 20, INFRA_Y + 80], radius=6, fill=PAPER, outline=HAIRLINE, width=1)
    text_center(draw, ix, INFRA_Y + 25, item_w - 20, 25, name, font_bold, INK)
    text_center(draw, ix, INFRA_Y + 55, item_w - 20, 20, desc, font_small, MUTED)

# Label
draw.text((MARGIN + 10, INFRA_Y + 110), "SHARED INFRASTRUCTURE", fill=MUTED, font=font_label)

# Arrows from services to infra
for i, sx in enumerate(service_x):
    cx = sx + BOX_W // 2
    arrow(draw, cx, ROW1_Y + BOX_H, cx, INFRA_Y, color=HAIRLINE, width=1)

y = INFRA_Y + INFRA_H + 40

# ─── SERVICE DECOMPOSITION ─────────────────────────────────────────
y = section_header(draw, MARGIN, y, "SERVICE DECOMPOSITION — 14 SERVICES", WIDTH - 2 * MARGIN)

services_list = [
    ("API Gateway", "HTTP routing, auth, tenant resolution", "Express.js"),
    ("Customer Print API", "Customer uploads, pricing, jobs", "Express"),
    ("Agent API", "Kiosk agent polling, file dispatch", "Express"),
    ("CUPS Ingress", "Laptop printing via CUPS", "Express"),
    ("SaaS Onboarding", "Shop signup, subaccounts", "Express"),
    ("Payments", "Paystack integration, webhooks", "Service"),
    ("Render Enqueue", "Cloud render queue management", "Service"),
    ("Cost Reconciliation", "Pricing → render → final cost", "Service"),
    ("Tenant Balance", "Per-tenant ledger", "Service"),
    ("Commission", "Bolt-style split math", "Service"),
    ("Render Worker", "PDF → PWG-Raster", "Node.js"),
    ("Kiosk Agent", "Cloud → LAN printer bridge", "Node.js"),
    ("Kiosk App", "Touchscreen UI", "Electron"),
    ("Frontend", "Customer/shop UI", "React"),
]

# Draw as grid of cards
card_w = (WIDTH - 2 * MARGIN - 4 * 15) // 5
card_h = 80
for i, (name, desc, tech) in enumerate(services_list):
    col = i % 5
    row = i // 5
    cx = MARGIN + col * (card_w + 15)
    cy = y + row * (card_h + 12)
    draw.rounded_rectangle([cx, cy, cx + card_w, cy + card_h], radius=4, fill=PAPER, outline=HAIRLINE, width=1)
    draw.text((cx + 8, cy + 6), name, fill=INK, font=font_bold)
    text_wrap(draw, cx + 8, cy + 26, desc, font_small, MUTED, card_w - 16)
    draw.text((cx + 8, cy + card_h - 20), tech, fill=PROCESS, font=font_label)

y += 3 * (card_h + 12) + 30

# ─── JOB LIFECYCLE STATE MACHINE ──────────────────────────────────
y = section_header(draw, MARGIN, y, "JOB LIFECYCLE STATE MACHINE", WIDTH - 2 * MARGIN)

state_box_w = 180
state_box_h = 50
state_gap = 40

# Level 0: PENDING
l0_x = WIDTH // 2 - state_box_w // 2
draw_box(draw, l0_x, y, state_box_w, state_box_h, "PENDING", fill=(255, 248, 220), stroke=HIGHLIGHT)
y += state_box_h + state_gap

# Level 1: RENDERING
l1_x = WIDTH // 2 - state_box_w // 2
draw_box(draw, l1_x, y, state_box_w, state_box_h, "RENDERING", fill=(233, 242, 250), stroke=PROCESS)
arrow(draw, WIDTH // 2, y - state_gap, WIDTH // 2, y)
arrow_label(draw, WIDTH // 2 + 10, y - state_gap // 2 - 6, "payment webhook")
y += state_box_h + state_gap

# Level 2: Two branches
branch_y = y
branch_w = 200
left_x = WIDTH // 2 - branch_w - 30
right_x = WIDTH // 2 + 30

draw_box(draw, left_x, branch_y, branch_w, state_box_h, "AWAITING ACCEPT", fill=(255, 248, 220), stroke=HIGHLIGHT)
draw_box(draw, right_x, branch_y, branch_w, state_box_h, "READY", fill=(233, 243, 238), stroke=PASS)

arrow(draw, WIDTH // 2, branch_y - state_gap, left_x + branch_w // 2, branch_y)
arrow(draw, WIDTH // 2, branch_y - state_gap, right_x + branch_w // 2, branch_y)

# Special states
special_x = WIDTH // 2 - state_box_w // 2
special_y = branch_y + state_box_h + 30
special_states = ["AWAITING_EDIT", "EDIT_COMPLETE", "AWAITING_PAYMENT", "PAID"]
for i, state in enumerate(special_states):
    sx = MARGIN + 10 + i * ((WIDTH - 2 * MARGIN - 20) // 4)
    draw.rounded_rectangle([sx, special_y, sx + 120, special_y + 36], radius=4, fill=PAPER, outline=HAIRLINE, width=1)
    text_center(draw, sx, special_y, 120, 36, state, font_small, INK)

y = special_y + 36 + state_gap

# Level 3: RELEASING / PRINTING
l3_y = y
draw_box(draw, left_x, l3_y, branch_w, state_box_h, "RELEASING", fill=(255, 248, 220), stroke=HIGHLIGHT)
draw_box(draw, right_x, l3_y, branch_w, state_box_h, "PRINTING", fill=(233, 242, 250), stroke=PROCESS)

arrow(draw, left_x + branch_w // 2, branch_y + state_box_h, left_x + branch_w // 2, l3_y)
arrow_label(draw, left_x + branch_w // 2 + 8, branch_y + state_box_h + 8, "operator accepts")

arrow(draw, right_x + branch_w // 2, branch_y + state_box_h, right_x + branch_w // 2, l3_y)
arrow_label(draw, right_x + branch_w // 2 + 8, branch_y + state_box_h + 8, "kiosk agent polls")

y = l3_y + state_box_h + state_gap

# Level 4: DONE / FAILED
l4_y = y
done_x = WIDTH // 2 - state_box_w - 20
fail_x = WIDTH // 2 + 20

draw_box(draw, done_x, l4_y, state_box_w, state_box_h, "DONE", fill=(233, 243, 238), stroke=PASS)
draw_box(draw, fail_x, l4_y, state_box_w, state_box_h, "FAILED", fill=(253, 240, 241), stroke=REGISTER)

arrow(draw, left_x + branch_w // 2, l3_y + state_box_h, done_x + state_box_w // 2, l4_y)
arrow(draw, right_x + branch_w // 2, l3_y + state_box_h, fail_x + state_box_w // 2, l4_y)

y = l4_y + state_box_h + state_gap

# Level 5: EXPIRED / REFUNDED
l5_y = y
draw_box(draw, WIDTH // 2 - state_box_w // 2, l5_y, state_box_w, state_box_h, "EXPIRED / REFUNDED", fill=(253, 240, 241), stroke=REGISTER)
arrow(draw, WIDTH // 2, l4_y + state_box_h, WIDTH // 2, l5_y)

y = l5_y + state_box_h + 40

# ─── PAYMENT & COMMISSION ──────────────────────────────────────────
y = section_header(draw, MARGIN, y, "PAYMENT & COMMISSION FLOW", WIDTH - 2 * MARGIN)

pay_y = y + 10
pay_h = 50

# Paystack flow
pay_steps = [
    ("Customer", "Pays via Paystack"),
    ("Paystack", "charge.success webhook"),
    ("Webhook Handler", "Verify HMAC → completePrintJobPayment"),
    ("Commission Engine", "Split: commission = gross × 10%"),
    ("Tenant Ledger", "Update balance → fire webhook"),
]

pay_box_w = (WIDTH - 2 * MARGIN - 4 * 20) // 5
for i, (name, desc) in enumerate(pay_steps):
    px = MARGIN + i * (pay_box_w + 20)
    draw.rounded_rectangle([px, pay_y, px + pay_box_w, pay_y + pay_h + 20], radius=4, fill=PAPER, outline=HAIRLINE, width=1)
    draw.text((px + 8, pay_y + 4), name, fill=INK, font=font_bold)
    text_wrap(draw, px + 8, pay_y + 22, desc, font_small, MUTED, pay_box_w - 16)
    if i < len(pay_steps) - 1:
        arrow(draw, px + pay_box_w, pay_y + pay_h // 2 + 10, px + pay_box_w + 20, pay_y + pay_h // 2 + 10)

# Commission formula
formula_y = pay_y + pay_h + 40
draw.rounded_rectangle([MARGIN, formula_y, MARGIN + 400, formula_y + 60], radius=4, fill=(241, 245, 252), outline=HAIRLINE, width=1)
draw.text((MARGIN + 12, formula_y + 8), "COMMISSION:", fill=INK, font=font_bold)
draw.text((MARGIN + 12, formula_y + 28), "commission = gross × rate (default 10%, clamped 0-50%)", fill=MUTED, font=font_reg)
draw.text((MARGIN + 12, formula_y + 44), "tenant_net = gross - commission", fill=MUTED, font=font_reg)

y = formula_y + 80

# ─── MULTI-TENANCY RESOLUTION ──────────────────────────────────────
y = section_header(draw, MARGIN, y, "TENANT RESOLUTION CHAIN", WIDTH - 2 * MARGIN)

tenant_steps = [
    "JWT token\n(tenantId claim)",
    "Subdomain\n(tenant.printloop.app)",
    "Custom domain\n(print.shop.com)",
    "X-Tenant-Slug header\n(API integrations)",
    "Legacy fallback\n(tenantId = null)",
]

tenant_box_w = (WIDTH - 2 * MARGIN - 4 * 25) // 5
tenant_y = y + 10
for i, step in enumerate(tenant_steps):
    tx = MARGIN + i * (tenant_box_w + 25)
    is_last = i == len(tenant_steps) - 1
    fill_color = (253, 240, 241) if is_last else PAPER
    stroke_color = REGISTER if is_last else HAIRLINE
    draw.rounded_rectangle([tx, tenant_y, tx + tenant_box_w, tenant_y + 70], radius=4, fill=fill_color, outline=stroke_color, width=1)
    text_center(draw, tx, tenant_y + 10, tenant_box_w, 25, step.split('\n')[0], font_bold, INK)
    text_center(draw, tx, tenant_y + 40, tenant_box_w, 20, step.split('\n')[1], font_small, MUTED)
    if i < len(tenant_steps) - 1:
        arrow(draw, tx + tenant_box_w, tenant_y + 35, tx + tenant_box_w + 25, tenant_y + 35)

y = tenant_y + 100

# ─── PRINT TRANSPORT MATRIX ────────────────────────────────────────
y = section_header(draw, MARGIN, y, "PRINT TRANSPORT MATRIX", WIDTH - 2 * MARGIN)

transports = [
    ("ipp", "IPP/HTTP", "631", "Modern network printers", "IPP Get-Job-Attributes", "Job-state=completed"),
    ("raw9100", "JetDirect", "9100", "HP/Brother/Lexmark", "None (fire-forget)", "None"),
    ("spooler", "OS Print Queue", "OS", "USB/Bluetooth/local", "OS queue drain", "Queue drained"),
    ("printnode", "HTTPS/PrintNode", "443", "Behind NAT/firewall", "PrintNode API", "Polling (planned)"),
    ("lpd", "LPR/LPD", "515", "Legacy Unix/Enterprise", "None", "None"),
    ("email", "SMTP", "587", "HP ePrint, Canon, Epson", "SMTP 250 OK", "None"),
]

# Table header
header_y = y
col_widths = [120, 150, 80, 250, 250, 250]
col_x = [MARGIN + 10]
for w in col_widths[:-1]:
    col_x.append(col_x[-1] + w)

headers = ["Transport", "Protocol", "Port", "Use Case", "Feedback", "Confirmation"]
draw.rounded_rectangle([MARGIN, header_y, MARGIN + sum(col_widths) + 20, header_y + 30], radius=4, fill=INK)
for i, (hdr, cx) in enumerate(zip(headers, col_x)):
    draw.text((cx + 5, header_y + 6), hdr, fill=PAPER, font=font_bold)

row_y = header_y + 30
for transport in transports:
    for i, (val, cx) in enumerate(zip(transport, col_x)):
        draw.text((cx + 5, row_y + 4), val, fill=INK, font=font_reg)
    row_y += 28
    draw.line([(MARGIN, row_y), (MARGIN + sum(col_widths) + 20, row_y)], fill=HAIRLINE, width=1)

y = row_y + 30

# ─── BULLMQ QUEUES ─────────────────────────────────────────────────
y = section_header(draw, MARGIN, y, "BULLMQ QUEUE TOPOLOGY", WIDTH - 2 * MARGIN)

queues = [
    ("render queue", "{printJobId, tenantId, sourceKey, profileId}", "render-worker (Railway)"),
    ("webhook-deliveries queue", "{webhookId, url, secret, event, body}", "webhook-worker (local)"),
    ("notifications queue", "{template, to, data, channel}", "email/sms worker (Termii)"),
]

queue_w = (WIDTH - 2 * MARGIN - 2 * 20) // 3
queue_y = y + 10
for i, (name, payload, consumer) in enumerate(queues):
    qx = MARGIN + i * (queue_w + 20)
    draw.rounded_rectangle([qx, queue_y, qx + queue_w, queue_y + 100], radius=4, fill=PAPER, outline=HAIRLINE, width=1)
    draw.text((qx + 10, queue_y + 8), name, fill=PROCESS, font=font_bold)
    text_wrap(draw, qx + 10, queue_y + 30, payload, font_small, MUTED, queue_w - 20)
    draw.text((qx + 10, queue_y + 70), consumer, fill=PASS, font=font_label)

# Scheduled jobs
sched_y = queue_y + 130
draw.text((MARGIN, sched_y), "SCHEDULED JOBS:", fill=INK, font=font_bold)
sched_jobs = [
    ("auto-close-group-sessions", "every 15min"),
    ("mark-offline-kiosks", "every 5min"),
    ("daily-cleanup", "03:00 UTC"),
    ("db-backup", "02:30 UTC"),
    ("process-payouts", "04:00 UTC"),
    ("reconcile-stuck-renders", "every 10min"),
]

for i, (job, cron) in enumerate(sched_jobs):
    sx = MARGIN + (i % 3) * ((WIDTH - 2 * MARGIN) // 3)
    sy = sched_y + 30 + (i // 3) * 30
    draw.rounded_rectangle([sx, sy, sx + 300, sy + 26], radius=4, fill=(241, 245, 252), outline=HAIRLINE, width=1)
    draw.text((sx + 8, sy + 5), job, fill=INK, font=font_reg)
    draw.text((sx + 220, sy + 5), cron, fill=PROCESS, font=font_small)

y = sched_y + 100

# ─── AUTH LAYERS ──────────────────────────────────────────────────
y = section_header(draw, MARGIN, y, "AUTHENTICATION & AUTHORIZATION", WIDTH - 2 * MARGIN)

auth_layers = [
    ("Customer API", "JWT (HttpOnly cookie) + optionalTenant"),
    ("Admin API", "JWT + authenticate + resolveTenant"),
    ("SaaS API", "JWT + optionalTenant (onboarding)"),
    ("Agent API", "X-Kiosk-Key header (long-lived)"),
    ("CUPS Ingress", "PrintToken (Bearer / X-PrintLoop-Token)"),
    ("Render Callback", "HMAC-SHA256 (RENDER_CALLBACK_SECRET)"),
    ("Webhooks", "HMAC-SHA256 (secret per webhook)"),
    ("Paystack", "HMAC-SHA512 (PAYSTACK_WEBHOOK_SECRET)"),
]

auth_w = (WIDTH - 2 * MARGIN - 3 * 15) // 4
auth_h = 60
for i, (layer, method) in enumerate(auth_layers):
    col = i % 4
    row = i // 4
    ax = MARGIN + col * (auth_w + 15)
    ay = y + row * (auth_h + 12)
    draw.rounded_rectangle([ax, ay, ax + auth_w, ay + auth_h], radius=4, fill=PAPER, outline=HAIRLINE, width=1)
    draw.text((ax + 8, ay + 6), layer, fill=INK, font=font_bold)
    text_wrap(draw, ax + 8, ay + 26, method, font_small, MUTED, auth_w - 16)

y += 2 * (auth_h + 12) + 30

# ─── END-TO-END FLOW SUMMARY ──────────────────────────────────────
y = section_header(draw, MARGIN, y, "END-TO-END FLOW SUMMARY", WIDTH - 2 * MARGIN)

e2e_steps = [
    ("1. CUSTOMER UPLOAD", "Browser → /api/customer/print-jobs (multipart) → flatten → countPages → computeCost → saveBuffer → create PrintJob (PENDING)"),
    ("2. PAYMENT", "Customer → Paystack Checkout → charge.success webhook"),
    ("3. COMPLETE PAYMENT", "Mint code → record Payment → update tenant balance → send SMS/Email → enqueueRender → arm accept window"),
    ("4. RENDER (async)", "BullMQ → render-worker → download PDF → Ghostscript PDF/A → pdftopwg → preview JPGs → upload S3 → HMAC callback"),
    ("5. CALLBACK & RECONCILE", "applyRenderCostReconciliation → finalCost from actual pages → delta → status=READY → fire webhook"),
    ("6. KIOSK AGENT PICKUP", "Poll /jobs/ready (4s) → signed JWT download → dispatch via transport → POST /complete"),
    ("7. COMPLETION", "agentConfirmation → completePrintJob → kiosk counters → cleanup → audit log"),
]

e2e_y = y + 10
for title, desc in e2e_steps:
    draw.rounded_rectangle([MARGIN, e2e_y, WIDTH - MARGIN, e2e_y + 50], radius=4, fill=PAPER, outline=HAIRLINE, width=1)
    draw.text((MARGIN + 10, e2e_y + 4), title, fill=PROCESS, font=font_bold)
    text_wrap(draw, MARGIN + 220, e2e_y + 6, desc, font_small, INK, WIDTH - MARGIN - 240)
    e2e_y += 58

# ─── DATA MODEL ────────────────────────────────────────────────────
y = e2e_y + 40
y = section_header(draw, MARGIN, y, "KEY ENTITIES & RELATIONSHIPS", WIDTH - 2 * MARGIN)

entities = [
    ("Tenant", "TenantMember, TenantBranding, TenantDomain\nTenantWebhook, TenantBalance, Kiosk\nPricingConfig, PrinterProfile, PrintJob"),
    ("User", "Wallet, Transaction, File\nPrintJob, PrintToken (CUPS)"),
    ("PrintJob", "PrintJobItem, File, Kiosk\nPrinterProfile, DocumentEdit, Payment"),
    ("Payment", "Transaction (ledger entry)"),
    ("Payout", "PayoutSchedule"),
]

ent_w = (WIDTH - 2 * MARGIN - 4 * 15) // 5
ent_h = 120
for i, (name, rels) in enumerate(entities):
    ex = MARGIN + i * (ent_w + 15)
    draw.rounded_rectangle([ex, y, ex + ent_w, y + ent_h], radius=4, fill=PAPER, outline=HAIRLINE, width=1)
    draw.text((ex + 10, y + 8), name, fill=PROCESS, font=font_bold)
    text_wrap(draw, ex + 10, y + 30, rels, font_small, MUTED, ent_w - 20)

y += ent_h + 30

# ─── KEY ENUMS ─────────────────────────────────────────────────────
y = section_header(draw, MARGIN, y, "KEY ENUMS", WIDTH - 2 * MARGIN)

# PrintJobStatus
draw.text((MARGIN + 10, y), "PrintJobStatus:", fill=INK, font=font_bold)
statuses = ["PENDING", "RENDERING", "AWAITING_ACCEPT", "READY", "AWAITING_EDIT", "EDIT_COMPLETE", "AWAITING_PAYMENT", "PAID", "RELEASING", "PRINTING", "DONE", "FAILED", "EXPIRED", "REFUNDED"]
sx = MARGIN + 180
for s in statuses:
    bbox = draw.textbbox((0, 0), s, font=font_small)
    sw = bbox[2] - bbox[0] + 16
    if sx + sw > WIDTH - MARGIN:
        sx = MARGIN + 180
        y += 24
    draw.rounded_rectangle([sx, y, sx + sw, y + 20], radius=4, fill=(233, 242, 250), outline=PROCESS, width=1)
    draw.text((sx + 8, y + 3), s, fill=PROCESS_INK, font=font_small)
    sx += sw + 8

y += 40

# PrintJobType
draw.text((MARGIN + 10, y), "PrintJobType:", fill=INK, font=font_bold)
types = ["single", "personal_batch", "group_batch"]
sx = MARGIN + 180
for t in types:
    bbox = draw.textbbox((0, 0), t, font=font_small)
    sw = bbox[2] - bbox[0] + 16
    draw.rounded_rectangle([sx, y, sx + sw, y + 20], radius=4, fill=(233, 243, 238), outline=PASS, width=1)
    draw.text((sx + 8, y + 3), t, fill=PASS, font=font_small)
    sx += sw + 8

y += 30

# TransportMode
draw.text((MARGIN + 10, y), "TransportMode:", fill=INK, font=font_bold)
modes = ["ipp", "raw9100", "spooler", "printnode", "lpd", "email"]
sx = MARGIN + 180
for m in modes:
    bbox = draw.textbbox((0, 0), m, font=font_small)
    sw = bbox[2] - bbox[0] + 16
    draw.rounded_rectangle([sx, y, sx + sw, y + 20], radius=4, fill=(255, 248, 220), outline=HIGHLIGHT, width=1)
    draw.text((sx + 8, y + 3), m, fill=(138, 106, 46), font=font_small)
    sx += sw + 8

y += 50

# ─── DEPLOYMENT TOPOLOGY ───────────────────────────────────────────
y = section_header(draw, MARGIN, y, "DEPLOYMENT TOPOLOGY", WIDTH - 2 * MARGIN)

deploy_y = y + 10

# Frontend + Backend
fe_w = 300
draw_box(draw, MARGIN, deploy_y, fe_w, 60, "FRONTEND\n(Vercel/Railway Static)", fill=C_FRONTEND, text_color=PAPER)
draw_box(draw, MARGIN + fe_w + 20, deploy_y, fe_w, 60, "BACKEND API\n(Railway/Render/Fly.io)", fill=C_BACKEND, text_color=PAPER)

# Shared infra
infra2_y = deploy_y + 80
draw.rounded_rectangle([MARGIN, infra2_y, WIDTH - MARGIN, infra2_y + 50], radius=4, fill=(241, 245, 252), outline=HAIRLINE, width=1)
draw.text((MARGIN + 10, infra2_y + 15), "SHARED: Postgres (Neon/Railway) | Redis (Upstash/Rail) | S3 (AWS/R2/MinIO) | Paystack (Split Payments)", fill=INK, font=font_reg)

# Render Worker
rw_y = infra2_y + 70
draw_box(draw, MARGIN, rw_y, fe_w, 50, "RENDER WORKER (Railway)", fill=C_RENDER, text_color=PAPER)
draw.text((MARGIN + fe_w + 30, rw_y + 15), "Consumes 'render' queue | Ghostscript + cups-filters | Outputs PWG-Raster → S3 | HMAC callback", fill=MUTED, font=font_small)

# Kiosk Agent
ka_y = rw_y + 70
draw_box(draw, MARGIN, ka_y, fe_w, 50, "KIOSK AGENT (per shop)", fill=C_AGENT, text_color=PAPER)
draw.text((MARGIN + fe_w + 30, ka_y + 15), "Windows/Linux service | Outbound HTTPS only | Auto-discovery: USB + mDNS | 6 transports", fill=MUTED, font=font_small)

# Kiosk App
kapp_y = ka_y + 70
draw_box(draw, MARGIN, kapp_y, fe_w, 50, "KIOSK APP (Electron)", fill=C_KIOSK, text_color=PAPER)
draw.text((MARGIN + fe_w + 30, kapp_y + 15), "Fullscreen touchscreen UI | Polls /api/agent/jobs/ready | Displays release code + job status", fill=MUTED, font=font_small)

y = kapp_y + 80

# ─── FILE STORAGE ──────────────────────────────────────────────────
y = section_header(draw, MARGIN, y, "FILE STORAGE ARCHITECTURE", WIDTH - 2 * MARGIN)

storage_layers = [
    ("UPLOAD", "multer.memoryStorage() → saveBuffer() → S3 / local | File entity: fileURL, sizeBytes, pageCount, mimeType"),
    ("RENDER OUTPUT", "render-worker → S3 key: renders/{tenantId}/{jobId}.pwg | File entity or PrintJob.renderedKey"),
    ("AGENT DOWNLOAD", "Signed JWT (5min TTL) → GET /api/agent/jobs/:id/file → loadDocumentBytes() → S3 presigned"),
    ("CUPS INGRESS", "upload.single('file') → memoryStorage → saveBuffer()"),
]

stor_y = y + 10
for name, desc in storage_layers:
    draw.rounded_rectangle([MARGIN, stor_y, WIDTH - MARGIN, stor_y + 45], radius=4, fill=PAPER, outline=HAIRLINE, width=1)
    draw.text((MARGIN + 10, stor_y + 4), name, fill=PROCESS, font=font_bold)
    draw.text((MARGIN + 150, stor_y + 6), desc, fill=MUTED, font=font_small)
    stor_y += 52

y = stor_y + 30

# ─── OBSERVABILITY ─────────────────────────────────────────────────
y = section_header(draw, MARGIN, y, "OBSERVABILITY & OPERATIONS", WIDTH - 2 * MARGIN)

obs = [
    ("API", "Request context middleware → req.log, req.requestId, structured logs"),
    ("Errors", "Sentry (initSentry at bootstrap) → Error capture with tenant context"),
    ("Metrics", "Structured JSON logs → JSON per-request, per-job"),
    ("Render", "Logger (pino) → Pipeline stages, timing"),
    ("Agent", "Rolling file log → %ProgramData%\\PrintLoop\\agent.log"),
    ("Scheduled", "Console logs → Job start/end, counts"),
]

obs_y = y + 10
for layer, tool in obs:
    draw.rounded_rectangle([MARGIN, obs_y, MARGIN + 150, obs_y + 30], radius=4, fill=INK)
    text_center(draw, MARGIN, obs_y, 150, 30, layer, font_bold, PAPER)
    draw.text((MARGIN + 160, obs_y + 7), tool, fill=MUTED, font=font_reg)
    obs_y += 36

y = obs_y + 30

# ─── FOOTER ────────────────────────────────────────────────────────
draw.text((WIDTH // 2, y + 20), "PrintLoop SaaS v2 — Complete Architectural Mapping", fill=MUTED, font=font_small)
draw.text((WIDTH // 2, y + 40), "Generated from codebase analysis — every service, data flow, integration point, and operational component mapped.", fill=MUTED, font=font_small)

# ─── CREATE IMAGE ──────────────────────────────────────────────────
TOTAL_H = y + 80
img = Image.new("RGB", (WIDTH, TOTAL_H), BG)
draw = ImageDraw.Draw(img)

# Re-run all drawing on the actual image
# (The code above was drawing on a dummy draw object, now we redo it properly)

# Actually, let me restructure - draw directly on img from the start
# Reset and redraw everything on the real image

img = Image.new("RGB", (WIDTH, TOTAL_H), BG)
draw = ImageDraw.Draw(img)

# Redraw all sections...
# Title
title = "PrintLoop SaaS v2 - Complete Architecture"
bbox = draw.textbbox((0, 0), title, font=font_title)
tw = bbox[2] - bbox[0]
draw.text(((WIDTH - tw) // 2, 20), title, fill=INK, font=font_title)

# Dashed separator
for x in range(MARGIN, WIDTH - MARGIN, 12):
    draw.line([(x, 60), (x + 6, 60)], fill=HAIRLINE, width=2)

y = MARGIN_TOP

# ─── HIGH-LEVEL ARCHITECTURE ───────────────────────────────────────
ROW1_Y = y + 10
BOX_H = 60
BOX_W = 280
GAP = 60
total_w = 5 * BOX_W + 4 * GAP
start_x = (WIDTH - total_w) // 2

services = [
    ("CUSTOMER\nFRONTEND\n(React)", C_FRONTEND, PAPER),
    ("BACKEND API\n(Express)", C_BACKEND, PAPER),
    ("RENDER WORKER\n(BullMQ)", C_RENDER, PAPER),
    ("KIOSK AGENT\n(Node.js)", C_AGENT, PAPER),
    ("KIOSK PRINTER\n(LAN)", C_KIOSK, PAPER),
]

service_x = []
for i, (name, color, fg) in enumerate(services):
    sx = start_x + i * (BOX_W + GAP)
    service_x.append(sx)
    draw.rounded_rectangle([sx, ROW1_Y, sx + BOX_W, ROW1_Y + BOX_H], radius=6, fill=color, outline=INK, width=2)
    lines = name.split('\n')
    for j, line in enumerate(lines):
        bbox = draw.textbbox((0, 0), line, font=font_bold)
        lw = bbox[2] - bbox[0]
        lh = bbox[3] - bbox[1]
        draw.text((sx + (BOX_W - lw) // 2, ROW1_Y + 10 + j * 18), line, fill=fg, font=font_bold)

for i in range(len(services) - 1):
    ax1 = service_x[i] + BOX_W
    ax2 = service_x[i + 1]
    arrow(draw, ax1, ROW1_Y + BOX_H // 2, ax2, ROW1_Y + BOX_H // 2, color=INK, width=2)
    arrow(draw, ax2, ROW1_Y + BOX_H // 2 + 4, ax1, ROW1_Y + BOX_H // 2 + 4, color=MUTED, width=1)

INFRA_Y = ROW1_Y + BOX_H + 60
INFRA_H = 140
infra_w = WIDTH - 2 * MARGIN

draw.rounded_rectangle([MARGIN, INFRA_Y, MARGIN + infra_w, INFRA_Y + INFRA_H], radius=8, fill=(241, 245, 252), outline=HAIRLINE, width=1)

infra_items = [
    ("DATABASE", "SQLite / Postgres"),
    ("REDIS", "BullMQ Queues"),
    ("S3", "Artifact Storage"),
    ("PAYSTACK", "Payments & Splits"),
    ("WEBHOOKS", "Dimension 14"),
]

item_w = (infra_w - 40) // 5
for i, (name, desc) in enumerate(infra_items):
    ix = MARGIN + 20 + i * item_w
    draw.rounded_rectangle([ix, INFRA_Y + 20, ix + item_w - 20, INFRA_Y + 80], radius=6, fill=PAPER, outline=HAIRLINE, width=1)
    text_center(draw, ix, INFRA_Y + 25, item_w - 20, 25, name, font_bold, INK)
    text_center(draw, ix, INFRA_Y + 55, item_w - 20, 20, desc, font_small, MUTED)

draw.text((MARGIN + 10, INFRA_Y + 110), "SHARED INFRASTRUCTURE", fill=MUTED, font=font_label)

for i, sx in enumerate(service_x):
    cx = sx + BOX_W // 2
    arrow(draw, cx, ROW1_Y + BOX_H, cx, INFRA_Y, color=HAIRLINE, width=1)

y = INFRA_Y + INFRA_H + 40

# ─── SERVICE DECOMPOSITION ─────────────────────────────────────────
draw.rounded_rectangle([MARGIN, y, WIDTH - MARGIN, y + 36], radius=4, fill=INK)
text_center(draw, MARGIN, y, WIDTH - 2 * MARGIN, 36, "SERVICE DECOMPOSITION — 14 SERVICES", font_section, PAPER)
y += 50

services_list = [
    ("API Gateway", "HTTP routing, auth, tenant resolution", "Express.js"),
    ("Customer Print API", "Customer uploads, pricing, jobs", "Express"),
    ("Agent API", "Kiosk agent polling, file dispatch", "Express"),
    ("CUPS Ingress", "Laptop printing via CUPS", "Express"),
    ("SaaS Onboarding", "Shop signup, subaccounts", "Express"),
    ("Payments", "Paystack integration, webhooks", "Service"),
    ("Render Enqueue", "Cloud render queue management", "Service"),
    ("Cost Reconciliation", "Pricing → render → final cost", "Service"),
    ("Tenant Balance", "Per-tenant ledger", "Service"),
    ("Commission", "Bolt-style split math", "Service"),
    ("Render Worker", "PDF → PWG-Raster", "Node.js"),
    ("Kiosk Agent", "Cloud → LAN printer bridge", "Node.js"),
    ("Kiosk App", "Touchscreen UI", "Electron"),
    ("Frontend", "Customer/shop UI", "React"),
]

card_w = (WIDTH - 2 * MARGIN - 4 * 15) // 5
card_h = 80
for i, (name, desc, tech) in enumerate(services_list):
    col = i % 5
    row = i // 5
    cx = MARGIN + col * (card_w + 15)
    cy = y + row * (card_h + 12)
    draw.rounded_rectangle([cx, cy, cx + card_w, cy + card_h], radius=4, fill=PAPER, outline=HAIRLINE, width=1)
    draw.text((cx + 8, cy + 6), name, fill=INK, font=font_bold)
    text_wrap(draw, cx + 8, cy + 26, desc, font_small, MUTED, card_w - 16)
    draw.text((cx + 8, cy + card_h - 20), tech, fill=PROCESS, font=font_label)

y += 3 * (card_h + 12) + 30

# ─── JOB LIFECYCLE STATE MACHINE ──────────────────────────────────
draw.rounded_rectangle([MARGIN, y, WIDTH - MARGIN, y + 36], radius=4, fill=INK)
text_center(draw, MARGIN, y, WIDTH - 2 * MARGIN, 36, "JOB LIFECYCLE STATE MACHINE", font_section, PAPER)
y += 50

state_box_w = 180
state_box_h = 50
state_gap = 40

l0_x = WIDTH // 2 - state_box_w // 2
draw_box(draw, l0_x, y, state_box_w, state_box_h, "PENDING", fill=(255, 248, 220), stroke=HIGHLIGHT)
y += state_box_h + state_gap

l1_x = WIDTH // 2 - state_box_w // 2
draw_box(draw, l1_x, y, state_box_w, state_box_h, "RENDERING", fill=(233, 242, 250), stroke=PROCESS)
arrow(draw, WIDTH // 2, y - state_gap, WIDTH // 2, y)
arrow_label(draw, WIDTH // 2 + 10, y - state_gap // 2 - 6, "payment webhook")
y += state_box_h + state_gap

branch_y = y
branch_w = 200
left_x = WIDTH // 2 - branch_w - 30
right_x = WIDTH // 2 + 30

draw_box(draw, left_x, branch_y, branch_w, state_box_h, "AWAITING ACCEPT", fill=(255, 248, 220), stroke=HIGHLIGHT)
draw_box(draw, right_x, branch_y, branch_w, state_box_h, "READY", fill=(233, 243, 238), stroke=PASS)

arrow(draw, WIDTH // 2, branch_y - state_gap, left_x + branch_w // 2, branch_y)
arrow(draw, WIDTH // 2, branch_y - state_gap, right_x + branch_w // 2, branch_y)

special_x = WIDTH // 2 - state_box_w // 2
special_y = branch_y + state_box_h + 30
special_states = ["AWAITING_EDIT", "EDIT_COMPLETE", "AWAITING_PAYMENT", "PAID"]
for i, state in enumerate(special_states):
    sx = MARGIN + 10 + i * ((WIDTH - 2 * MARGIN - 20) // 4)
    draw.rounded_rectangle([sx, special_y, sx + 120, special_y + 36], radius=4, fill=PAPER, outline=HAIRLINE, width=1)
    text_center(draw, sx, special_y, 120, 36, state, font_small, INK)

y = special_y + 36 + state_gap

l3_y = y
draw_box(draw, left_x, l3_y, branch_w, state_box_h, "RELEASING", fill=(255, 248, 220), stroke=HIGHLIGHT)
draw_box(draw, right_x, l3_y, branch_w, state_box_h, "PRINTING", fill=(233, 242, 250), stroke=PROCESS)

arrow(draw, left_x + branch_w // 2, branch_y + state_box_h, left_x + branch_w // 2, l3_y)
arrow_label(draw, left_x + branch_w // 2 + 8, branch_y + state_box_h + 8, "operator accepts")

arrow(draw, right_x + branch_w // 2, branch_y + state_box_h, right_x + branch_w // 2, l3_y)
arrow_label(draw, right_x + branch_w // 2 + 8, branch_y + state_box_h + 8, "kiosk agent polls")

y = l3_y + state_box_h + state_gap

l4_y = y
done_x = WIDTH // 2 - state_box_w - 20
fail_x = WIDTH // 2 + 20

draw_box(draw, done_x, l4_y, state_box_w, state_box_h, "DONE", fill=(233, 243, 238), stroke=PASS)
draw_box(draw, fail_x, l4_y, state_box_w, state_box_h, "FAILED", fill=(253, 240, 241), stroke=REGISTER)

arrow(draw, left_x + branch_w // 2, l3_y + state_box_h, done_x + state_box_w // 2, l4_y)
arrow(draw, right_x + branch_w // 2, l3_y + state_box_h, fail_x + state_box_w // 2, l4_y)

y = l4_y + state_box_h + state_gap

l5_y = y
draw_box(draw, WIDTH // 2 - state_box_w // 2, l5_y, state_box_w, state_box_h, "EXPIRED / REFUNDED", fill=(253, 240, 241), stroke=REGISTER)
arrow(draw, WIDTH // 2, l4_y + state_box_h, WIDTH // 2, l5_y)

y = l5_y + state_box_h + 40

# ─── PAYMENT & COMMISSION ──────────────────────────────────────────
draw.rounded_rectangle([MARGIN, y, WIDTH - MARGIN, y + 36], radius=4, fill=INK)
text_center(draw, MARGIN, y, WIDTH - 2 * MARGIN, 36, "PAYMENT & COMMISSION FLOW", font_section, PAPER)
y += 50

pay_y = y + 10
pay_h = 50

pay_steps = [
    ("Customer", "Pays via Paystack"),
    ("Paystack", "charge.success webhook"),
    ("Webhook Handler", "Verify HMAC → completePrintJobPayment"),
    ("Commission Engine", "Split: commission = gross × 10%"),
    ("Tenant Ledger", "Update balance → fire webhook"),
]

pay_box_w = (WIDTH - 2 * MARGIN - 4 * 20) // 5
for i, (name, desc) in enumerate(pay_steps):
    px = MARGIN + i * (pay_box_w + 20)
    draw.rounded_rectangle([px, pay_y, px + pay_box_w, pay_y + pay_h + 20], radius=4, fill=PAPER, outline=HAIRLINE, width=1)
    draw.text((px + 8, pay_y + 4), name, fill=INK, font=font_bold)
    text_wrap(draw, px + 8, pay_y + 22, desc, font_small, MUTED, pay_box_w - 16)
    if i < len(pay_steps) - 1:
        arrow(draw, px + pay_box_w, pay_y + pay_h // 2 + 10, px + pay_box_w + 20, pay_y + pay_h // 2 + 10)

formula_y = pay_y + pay_h + 40
draw.rounded_rectangle([MARGIN, formula_y, MARGIN + 400, formula_y + 60], radius=4, fill=(241, 245, 252), outline=HAIRLINE, width=1)
draw.text((MARGIN + 12, formula_y + 8), "COMMISSION:", fill=INK, font=font_bold)
draw.text((MARGIN + 12, formula_y + 28), "commission = gross × rate (default 10%, clamped 0-50%)", fill=MUTED, font=font_reg)
draw.text((MARGIN + 12, formula_y + 44), "tenant_net = gross - commission", fill=MUTED, font=font_reg)

y = formula_y + 80

# ─── MULTI-TENANCY RESOLUTION ──────────────────────────────────────
draw.rounded_rectangle([MARGIN, y, WIDTH - MARGIN, y + 36], radius=4, fill=INK)
text_center(draw, MARGIN, y, WIDTH - 2 * MARGIN, 36, "TENANT RESOLUTION CHAIN", font_section, PAPER)
y += 50

tenant_steps = [
    "JWT token\n(tenantId claim)",
    "Subdomain\n(tenant.printloop.app)",
    "Custom domain\n(print.shop.com)",
    "X-Tenant-Slug header\n(API integrations)",
    "Legacy fallback\n(tenantId = null)",
]

tenant_box_w = (WIDTH - 2 * MARGIN - 4 * 25) // 5
tenant_y = y + 10
for i, step in enumerate(tenant_steps):
    tx = MARGIN + i * (tenant_box_w + 25)
    is_last = i == len(tenant_steps) - 1
    fill_color = (253, 240, 241) if is_last else PAPER
    stroke_color = REGISTER if is_last else HAIRLINE
    draw.rounded_rectangle([tx, tenant_y, tx + tenant_box_w, tenant_y + 70], radius=4, fill=fill_color, outline=stroke_color, width=1)
    text_center(draw, tx, tenant_y + 10, tenant_box_w, 25, step.split('\n')[0], font_bold, INK)
    text_center(draw, tx, tenant_y + 40, tenant_box_w, 20, step.split('\n')[1], font_small, MUTED)
    if i < len(tenant_steps) - 1:
        arrow(draw, tx + tenant_box_w, tenant_y + 35, tx + tenant_box_w + 25, tenant_y + 35)

y = tenant_y + 100

# ─── PRINT TRANSPORT MATRIX ────────────────────────────────────────
draw.rounded_rectangle([MARGIN, y, WIDTH - MARGIN, y + 36], radius=4, fill=INK)
text_center(draw, MARGIN, y, WIDTH - 2 * MARGIN, 36, "PRINT TRANSPORT MATRIX", font_section, PAPER)
y += 50

transports = [
    ("ipp", "IPP/HTTP", "631", "Modern network printers", "IPP Get-Job-Attributes", "Job-state=completed"),
    ("raw9100", "JetDirect", "9100", "HP/Brother/Lexmark", "None (fire-forget)", "None"),
    ("spooler", "OS Print Queue", "OS", "USB/Bluetooth/local", "OS queue drain", "Queue drained"),
    ("printnode", "HTTPS/PrintNode", "443", "Behind NAT/firewall", "PrintNode API", "Polling (planned)"),
    ("lpd", "LPR/LPD", "515", "Legacy Unix/Enterprise", "None", "None"),
    ("email", "SMTP", "587", "HP ePrint, Canon, Epson", "SMTP 250 OK", "None"),
]

header_y = y
col_widths = [120, 150, 80, 250, 250, 250]
col_x = [MARGIN + 10]
for w in col_widths[:-1]:
    col_x.append(col_x[-1] + w)

headers = ["Transport", "Protocol", "Port", "Use Case", "Feedback", "Confirmation"]
draw.rounded_rectangle([MARGIN, header_y, MARGIN + sum(col_widths) + 20, header_y + 30], radius=4, fill=INK)
for i, (hdr, cx) in enumerate(zip(headers, col_x)):
    draw.text((cx + 5, header_y + 6), hdr, fill=PAPER, font=font_bold)

row_y = header_y + 30
for transport in transports:
    for i, (val, cx) in enumerate(zip(transport, col_x)):
        draw.text((cx + 5, row_y + 4), val, fill=INK, font=font_reg)
    row_y += 28
    draw.line([(MARGIN, row_y), (MARGIN + sum(col_widths) + 20, row_y)], fill=HAIRLINE, width=1)

y = row_y + 30

# ─── BULLMQ QUEUES ─────────────────────────────────────────────────
draw.rounded_rectangle([MARGIN, y, WIDTH - MARGIN, y + 36], radius=4, fill=INK)
text_center(draw, MARGIN, y, WIDTH - 2 * MARGIN, 36, "BULLMQ QUEUE TOPOLOGY", font_section, PAPER)
y += 50

queues = [
    ("render queue", "{printJobId, tenantId, sourceKey, profileId}", "render-worker (Railway)"),
    ("webhook-deliveries queue", "{webhookId, url, secret, event, body}", "webhook-worker (local)"),
    ("notifications queue", "{template, to, data, channel}", "email/sms worker (Termii)"),
]

queue_w = (WIDTH - 2 * MARGIN - 2 * 20) // 3
queue_y = y + 10
for i, (name, payload, consumer) in enumerate(queues):
    qx = MARGIN + i * (queue_w + 20)
    draw.rounded_rectangle([qx, queue_y, qx + queue_w, queue_y + 100], radius=4, fill=PAPER, outline=HAIRLINE, width=1)
    draw.text((qx + 10, queue_y + 8), name, fill=PROCESS, font=font_bold)
    text_wrap(draw, qx + 10, queue_y + 30, payload, font_small, MUTED, queue_w - 20)
    draw.text((qx + 10, queue_y + 70), consumer, fill=PASS, font=font_label)

sched_y = queue_y + 130
draw.text((MARGIN, sched_y), "SCHEDULED JOBS:", fill=INK, font=font_bold)
sched_jobs = [
    ("auto-close-group-sessions", "every 15min"),
    ("mark-offline-kiosks", "every 5min"),
    ("daily-cleanup", "03:00 UTC"),
    ("db-backup", "02:30 UTC"),
    ("process-payouts", "04:00 UTC"),
    ("reconcile-stuck-renders", "every 10min"),
]

for i, (job, cron) in enumerate(sched_jobs):
    sx = MARGIN + (i % 3) * ((WIDTH - 2 * MARGIN) // 3)
    sy = sched_y + 30 + (i // 3) * 30
    draw.rounded_rectangle([sx, sy, sx + 300, sy + 26], radius=4, fill=(241, 245, 252), outline=HAIRLINE, width=1)
    draw.text((sx + 8, sy + 5), job, fill=INK, font=font_reg)
    draw.text((sx + 220, sy + 5), cron, fill=PROCESS, font=font_small)

y = sched_y + 100

# ─── AUTH LAYERS ──────────────────────────────────────────────────
draw.rounded_rectangle([MARGIN, y, WIDTH - MARGIN, y + 36], radius=4, fill=INK)
text_center(draw, MARGIN, y, WIDTH - 2 * MARGIN, 36, "AUTHENTICATION & AUTHORIZATION", font_section, PAPER)
y += 50

auth_layers = [
    ("Customer API", "JWT (HttpOnly cookie) + optionalTenant"),
    ("Admin API", "JWT + authenticate + resolveTenant"),
    ("SaaS API", "JWT + optionalTenant (onboarding)"),
    ("Agent API", "X-Kiosk-Key header (long-lived)"),
    ("CUPS Ingress", "PrintToken (Bearer / X-PrintLoop-Token)"),
    ("Render Callback", "HMAC-SHA256 (RENDER_CALLBACK_SECRET)"),
    ("Webhooks", "HMAC-SHA256 (secret per webhook)"),
    ("Paystack", "HMAC-SHA512 (PAYSTACK_WEBHOOK_SECRET)"),
]

auth_w = (WIDTH - 2 * MARGIN - 3 * 15) // 4
auth_h = 60
for i, (layer, method) in enumerate(auth_layers):
    col = i % 4
    row = i // 4
    ax = MARGIN + col * (auth_w + 15)
    ay = y + row * (auth_h + 12)
    draw.rounded_rectangle([ax, ay, ax + auth_w, ay + auth_h], radius=4, fill=PAPER, outline=HAIRLINE, width=1)
    draw.text((ax + 8, ay + 6), layer, fill=INK, font=font_bold)
    text_wrap(draw, ax + 8, ay + 26, method, font_small, MUTED, auth_w - 16)

y += 2 * (auth_h + 12) + 30

# ─── END-TO-END FLOW SUMMARY ──────────────────────────────────────
draw.rounded_rectangle([MARGIN, y, WIDTH - MARGIN, y + 36], radius=4, fill=INK)
text_center(draw, MARGIN, y, WIDTH - 2 * MARGIN, 36, "END-TO-END FLOW SUMMARY", font_section, PAPER)
y += 50

e2e_steps = [
    ("1. CUSTOMER UPLOAD", "Browser → /api/customer/print-jobs (multipart) → flatten → countPages → computeCost → saveBuffer → create PrintJob (PENDING)"),
    ("2. PAYMENT", "Customer → Paystack Checkout → charge.success webhook"),
    ("3. COMPLETE PAYMENT", "Mint code → record Payment → update tenant balance → send SMS/Email → enqueueRender → arm accept window"),
    ("4. RENDER (async)", "BullMQ → render-worker → download PDF → Ghostscript PDF/A → pdftopwg → preview JPGs → upload S3 → HMAC callback"),
    ("5. CALLBACK & RECONCILE", "applyRenderCostReconciliation → finalCost from actual pages → delta → status=READY → fire webhook"),
    ("6. KIOSK AGENT PICKUP", "Poll /jobs/ready (4s) → signed JWT download → dispatch via transport → POST /complete"),
    ("7. COMPLETION", "agentConfirmation → completePrintJob → kiosk counters → cleanup → audit log"),
]

e2e_y = y + 10
for title, desc in e2e_steps:
    draw.rounded_rectangle([MARGIN, e2e_y, WIDTH - MARGIN, e2e_y + 50], radius=4, fill=PAPER, outline=HAIRLINE, width=1)
    draw.text((MARGIN + 10, e2e_y + 4), title, fill=PROCESS, font=font_bold)
    text_wrap(draw, MARGIN + 220, e2e_y + 6, desc, font_small, INK, WIDTH - MARGIN - 240)
    e2e_y += 58

y = e2e_y + 40

# ─── DATA MODEL ────────────────────────────────────────────────────
draw.rounded_rectangle([MARGIN, y, WIDTH - MARGIN, y + 36], radius=4, fill=INK)
text_center(draw, MARGIN, y, WIDTH - 2 * MARGIN, 36, "KEY ENTITIES & RELATIONSHIPS", font_section, PAPER)
y += 50

entities = [
    ("Tenant", "TenantMember, TenantBranding, TenantDomain\nTenantWebhook, TenantBalance, Kiosk\nPricingConfig, PrinterProfile, PrintJob"),
    ("User", "Wallet, Transaction, File\nPrintJob, PrintToken (CUPS)"),
    ("PrintJob", "PrintJobItem, File, Kiosk\nPrinterProfile, DocumentEdit, Payment"),
    ("Payment", "Transaction (ledger entry)"),
    ("Payout", "PayoutSchedule"),
]

ent_w = (WIDTH - 2 * MARGIN - 4 * 15) // 5
ent_h = 120
for i, (name, rels) in enumerate(entities):
    ex = MARGIN + i * (ent_w + 15)
    draw.rounded_rectangle([ex, y, ex + ent_w, y + ent_h], radius=4, fill=PAPER, outline=HAIRLINE, width=1)
    draw.text((ex + 10, y + 8), name, fill=PROCESS, font=font_bold)
    text_wrap(draw, ex + 10, y + 30, rels, font_small, MUTED, ent_w - 20)

y += ent_h + 30

# ─── KEY ENUMS ─────────────────────────────────────────────────────
draw.rounded_rectangle([MARGIN, y, WIDTH - MARGIN, y + 36], radius=4, fill=INK)
text_center(draw, MARGIN, y, WIDTH - 2 * MARGIN, 36, "KEY ENUMS", font_section, PAPER)
y += 50

draw.text((MARGIN + 10, y), "PrintJobStatus:", fill=INK, font=font_bold)
statuses = ["PENDING", "RENDERING", "AWAITING_ACCEPT", "READY", "AWAITING_EDIT", "EDIT_COMPLETE", "AWAITING_PAYMENT", "PAID", "RELEASING", "PRINTING", "DONE", "FAILED", "EXPIRED", "REFUNDED"]
sx = MARGIN + 180
for s in statuses:
    bbox = draw.textbbox((0, 0), s, font=font_small)
    sw = bbox[2] - bbox[0] + 16
    if sx + sw > WIDTH - MARGIN:
        sx = MARGIN + 180
        y += 24
    draw.rounded_rectangle([sx, y, sx + sw, y + 20], radius=4, fill=(233, 242, 250), outline=PROCESS, width=1)
    draw.text((sx + 8, y + 3), s, fill=PROCESS_INK, font=font_small)
    sx += sw + 8

y += 40

draw.text((MARGIN + 10, y), "PrintJobType:", fill=INK, font=font_bold)
types = ["single", "personal_batch", "group_batch"]
sx = MARGIN + 180
for t in types:
    bbox = draw.textbbox((0, 0), t, font=font_small)
    sw = bbox[2] - bbox[0] + 16
    draw.rounded_rectangle([sx, y, sx + sw, y + 20], radius=4, fill=(233, 243, 238), outline=PASS, width=1)
    draw.text((sx + 8, y + 3), t, fill=PASS, font=font_small)
    sx += sw + 8

y += 30

draw.text((MARGIN + 10, y), "TransportMode:", fill=INK, font=font_bold)
modes = ["ipp", "raw9100", "spooler", "printnode", "lpd", "email"]
sx = MARGIN + 180
for m in modes:
    bbox = draw.textbbox((0, 0), m, font=font_small)
    sw = bbox[2] - bbox[0] + 16
    draw.rounded_rectangle([sx, y, sx + sw, y + 20], radius=4, fill=(255, 248, 220), outline=HIGHLIGHT, width=1)
    draw.text((sx + 8, y + 3), m, fill=(138, 106, 46), font=font_small)
    sx += sw + 8

y += 50

# ─── DEPLOYMENT TOPOLOGY ───────────────────────────────────────────
draw.rounded_rectangle([MARGIN, y, WIDTH - MARGIN, y + 36], radius=4, fill=INK)
text_center(draw, MARGIN, y, WIDTH - 2 * MARGIN, 36, "DEPLOYMENT TOPOLOGY", font_section, PAPER)
y += 50

deploy_y = y + 10

fe_w = 300
draw_box(draw, MARGIN, deploy_y, fe_w, 60, "FRONTEND\n(Vercel/Railway Static)", fill=C_FRONTEND, text_color=PAPER)
draw_box(draw, MARGIN + fe_w + 20, deploy_y, fe_w, 60, "BACKEND API\n(Railway/Render/Fly.io)", fill=C_BACKEND, text_color=PAPER)

infra2_y = deploy_y + 80
draw.rounded_rectangle([MARGIN, infra2_y, WIDTH - MARGIN, infra2_y + 50], radius=4, fill=(241, 245, 252), outline=HAIRLINE, width=1)
draw.text((MARGIN + 10, infra2_y + 15), "SHARED: Postgres (Neon/Railway) | Redis (Upstash/Rail) | S3 (AWS/R2/MinIO) | Paystack (Split Payments)", fill=INK, font=font_reg)

rw_y = infra2_y + 70
draw_box(draw, MARGIN, rw_y, fe_w, 50, "RENDER WORKER (Railway)", fill=C_RENDER, text_color=PAPER)
draw.text((MARGIN + fe_w + 30, rw_y + 15), "Consumes 'render' queue | Ghostscript + cups-filters | Outputs PWG-Raster → S3 | HMAC callback", fill=MUTED, font=font_small)

ka_y = rw_y + 70
draw_box(draw, MARGIN, ka_y, fe_w, 50, "KIOSK AGENT (per shop)", fill=C_AGENT, text_color=PAPER)
draw.text((MARGIN + fe_w + 30, ka_y + 15), "Windows/Linux service | Outbound HTTPS only | Auto-discovery: USB + mDNS | 6 transports", fill=MUTED, font=font_small)

kapp_y = ka_y + 70
draw_box(draw, MARGIN, kapp_y, fe_w, 50, "KIOSK APP (Electron)", fill=C_KIOSK, text_color=PAPER)
draw.text((MARGIN + fe_w + 30, kapp_y + 15), "Fullscreen touchscreen UI | Polls /api/agent/jobs/ready | Displays release code + job status", fill=MUTED, font=font_small)

y = kapp_y + 80

# ─── FILE STORAGE ──────────────────────────────────────────────────
draw.rounded_rectangle([MARGIN, y, WIDTH - MARGIN, y + 36], radius=4, fill=INK)
text_center(draw, MARGIN, y, WIDTH - 2 * MARGIN, 36, "FILE STORAGE ARCHITECTURE", font_section, PAPER)
y += 50

storage_layers = [
    ("UPLOAD", "multer.memoryStorage() → saveBuffer() → S3 / local | File entity: fileURL, sizeBytes, pageCount, mimeType"),
    ("RENDER OUTPUT", "render-worker → S3 key: renders/{tenantId}/{jobId}.pwg | File entity or PrintJob.renderedKey"),
    ("AGENT DOWNLOAD", "Signed JWT (5min TTL) → GET /api/agent/jobs/:id/file → loadDocumentBytes() → S3 presigned"),
    ("CUPS INGRESS", "upload.single('file') → memoryStorage → saveBuffer()"),
]

stor_y = y + 10
for name, desc in storage_layers:
    draw.rounded_rectangle([MARGIN, stor_y, WIDTH - MARGIN, stor_y + 45], radius=4, fill=PAPER, outline=HAIRLINE, width=1)
    draw.text((MARGIN + 10, stor_y + 4), name, fill=PROCESS, font=font_bold)
    draw.text((MARGIN + 150, stor_y + 6), desc, fill=MUTED, font=font_small)
    stor_y += 52

y = stor_y + 30

# ─── OBSERVABILITY ─────────────────────────────────────────────────
draw.rounded_rectangle([MARGIN, y, WIDTH - MARGIN, y + 36], radius=4, fill=INK)
text_center(draw, MARGIN, y, WIDTH - 2 * MARGIN, 36, "OBSERVABILITY & OPERATIONS", font_section, PAPER)
y += 50

obs = [
    ("API", "Request context middleware → req.log, req.requestId, structured logs"),
    ("Errors", "Sentry (initSentry at bootstrap) → Error capture with tenant context"),
    ("Metrics", "Structured JSON logs → JSON per-request, per-job"),
    ("Render", "Logger (pino) → Pipeline stages, timing"),
    ("Agent", "Rolling file log → %ProgramData%\\PrintLoop\\agent.log"),
    ("Scheduled", "Console logs → Job start/end, counts"),
]

obs_y = y + 10
for layer, tool in obs:
    draw.rounded_rectangle([MARGIN, obs_y, MARGIN + 150, obs_y + 30], radius=4, fill=INK)
    text_center(draw, MARGIN, obs_y, 150, 30, layer, font_bold, PAPER)
    draw.text((MARGIN + 160, obs_y + 7), tool, fill=MUTED, font=font_reg)
    obs_y += 36

y = obs_y + 30

# ─── FOOTER ────────────────────────────────────────────────────────
draw.text((WIDTH // 2, y + 20), "PrintLoop SaaS v2 — Complete Architectural Mapping", fill=MUTED, font=font_small)
draw.text((WIDTH // 2, y + 40), "Generated from codebase analysis — every service, data flow, integration point, and operational component mapped.", fill=MUTED, font=font_small)

TOTAL_H = y + 80

# Crop to actual content
img_cropped = img.crop((0, 0, WIDTH, TOTAL_H))

output_path = "C:/Users/abdur/Music/printloop-saas-v2/printloop-architecture.png"
img_cropped.save(output_path, "PNG", quality=95)
print(f"Architecture diagram saved to: {output_path}")
print(f"Size: {img_cropped.size}")
