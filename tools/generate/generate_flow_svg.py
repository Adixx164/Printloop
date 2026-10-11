#!/usr/bin/env python3
"""Generate PrintLoop printing flow as SVG with crisp text."""

WIDTH = 800
BOX_W = 320
BOX_H = 50
BOX_X = (WIDTH - BOX_W) // 2  # 240

# Colors
BG = "#FFFFFF"
BOX_FILL = "#E8F0E4"
BOX_STROKE = "#1A1410"
DIAMOND_FILL = "#F5E0D8"
ARROW_COLOR = "#1A1410"
TEXT_COLOR = "#1A1410"
TITLE_COLOR = "#D14B2C"
BRANCH_FILL = "#FFF8F0"

# Step positions (y = top of box)
steps = [
    (80,  "Customer Opens App"),
    (150, "Map Shows Nearby Print Shops"),
    (220, "Select a Shop"),
    (290, "See Services & Pricing"),
    (360, "Choose Print Mode"),
]

branches = [
    (80,  "Single"),
    (300, "Batch"),
    (520, "Group"),
]
BRANCH_Y = 430
BRANCH_W = 200
BRANCH_H = 40

after_branches = [
    (520, "Upload File(s)"),
    (590, "Customize (paper, size, color, finish)"),
    (660, "Preview Generated"),
]

# Diamond for "Satisfied?"
DIAMOND_CX = 400
DIAMOND_CY = 755
DIAMOND_W = 160
DIAMOND_H = 50

final_steps = [
    (830,  "Pay Online"),
    (900,  "Get Authentication Code"),
    (970,  "Order Sent to Shop"),
    (1040, "Shop Prints Job"),
    (1110, "Job Ready for Pickup"),
    (1180, "Customer Shows Auth Code"),
    (1250, "Shop Verifies & Hands Over"),
    (1320, "Done"),
]

TOTAL_H = 1420

def arrow(x1, y1, x2, y2, label=""):
    """Generate an arrow line with optional label."""
    lines = f'  <line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{ARROW_COLOR}" stroke-width="2" marker-end="url(#arrowhead)"/>'
    if label:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        lines += f'\n  <text x="{mx + 8}" y="{my - 4}" font-family="Inter, sans-serif" font-size="13" fill="{TEXT_COLOR}" font-weight="600">{label}</text>'
    return lines

def box(x, y, w, h, text, fill=BOX_FILL, font_size=14):
    """Generate a rounded rectangle with centered text."""
    rx = 8
    return f'''  <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" stroke="{BOX_STROKE}" stroke-width="2"/>
  <text x="{x + w//2}" y="{y + h//2 + 5}" text-anchor="middle" font-family="Inter, sans-serif" font-size="{font_size}" fill="{TEXT_COLOR}" font-weight="600">{text}</text>'''

def diamond(cx, cy, w, h, text):
    """Generate a diamond with centered text."""
    points = f"{cx},{cy - h//2} {cx + w//2},{cy} {cx},{cy + h//2} {cx - w//2},{cy}"
    return f'''  <polygon points="{points}" fill="{DIAMOND_FILL}" stroke="{BOX_STROKE}" stroke-width="2"/>
  <text x="{cx}" y="{cy + 5}" text-anchor="middle" font-family="Inter, sans-serif" font-size="14" fill="{TEXT_COLOR}" font-weight="600">{text}</text>'''

# Build SVG
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{TOTAL_H}" viewBox="0 0 {WIDTH} {TOTAL_H}">
  <defs>
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
      <polygon points="0 0, 10 3.5, 0 7" fill="{ARROW_COLOR}"/>
    </marker>
  </defs>
  <rect width="{WIDTH}" height="{TOTAL_H}" fill="{BG}"/>

  <!-- Title -->
  <text x="{WIDTH//2}" y="40" text-anchor="middle" font-family="Fraunces, serif" font-size="24" fill="{TITLE_COLOR}" font-weight="700">PrintLoop — Printing Flow</text>
  <line x1="100" y1="55" x2="700" y2="55" stroke="{BOX_STROKE}" stroke-width="1.5" stroke-dasharray="4,4"/>
'''

# Draw main steps
for y, text in steps:
    svg += "\n" + box(BOX_X, y, BOX_W, BOX_H, text)

# Arrows between main steps
for i in range(len(steps) - 1):
    y1 = steps[i][0] + BOX_H
    y2 = steps[i + 1][0]
    svg += "\n" + arrow(WIDTH // 2, y1, WIDTH // 2, y2)

# Arrow from "Choose Print Mode" to branches
svg += "\n" + arrow(WIDTH // 2, 360 + BOX_H, WIDTH // 2, BRANCH_Y)

# Draw branch boxes
for bx, btext in branches:
    svg += "\n" + box(bx, BRANCH_Y, BRANCH_W, BRANCH_H, btext, fill=BRANCH_FILL, font_size=13)

# Arrows from branches converging to "Upload File(s)"
upload_y = after_branches[0][0]
for bx, _ in branches:
    svg += "\n" + arrow(bx + BRANCH_W // 2, BRANCH_Y + BRANCH_H, WIDTH // 2, upload_y)

# Draw after-branch steps
for y, text in after_branches:
    svg += "\n" + box(BOX_X, y, BOX_W, BOX_H, text)

# Arrows between after-branch steps
for i in range(len(after_branches) - 1):
    y1 = after_branches[i][0] + BOX_H
    y2 = after_branches[i + 1][0]
    svg += "\n" + arrow(WIDTH // 2, y1, WIDTH // 2, y2)

# Arrow from "Preview Generated" to diamond
svg += "\n" + arrow(WIDTH // 2, 660 + BOX_H, DIAMOND_CX, DIAMOND_CY - DIAMOND_H // 2)

# Diamond
svg += "\n" + diamond(DIAMOND_CX, DIAMOND_CY, DIAMOND_W, DIAMOND_H, "Satisfied?")

# "No" arrow: from diamond left back up to Customize
svg += "\n" + arrow(DIAMOND_CX - DIAMOND_W // 2, DIAMOND_CY, BOX_X - 10, 590 + BOX_H // 2, "No")

# "Yes" arrow: from diamond bottom to Pay Online
svg += "\n" + arrow(DIAMOND_CX, DIAMOND_CY + DIAMOND_H // 2, WIDTH // 2, 830, "Yes")

# Draw final steps
for y, text in final_steps:
    svg += "\n" + box(BOX_X, y, BOX_W, BOX_H, text)

# Arrows between final steps
for i in range(len(final_steps) - 1):
    y1 = final_steps[i][0] + BOX_H
    y2 = final_steps[i + 1][0]
    svg += "\n" + arrow(WIDTH // 2, y1, WIDTH // 2, y2)

svg += "\n</svg>"

with open("C:/Users/abdur/Music/printloop-saas-v2/printing-flow.svg", "w") as f:
    f.write(svg)

print("SVG written to printing-flow.svg")
