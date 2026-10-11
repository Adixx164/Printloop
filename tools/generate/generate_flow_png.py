"""Generate PrintLoop printing flow as PNG using PIL."""
from PIL import Image, ImageDraw, ImageFont
import os

WIDTH = 1200
BOX_W = 480
BOX_H = 70
BOX_X = (WIDTH - BOX_W) // 2  # 360
MARGIN_TOP = 80

# Colors
BG = (255, 255, 255)
BOX_FILL = (232, 240, 228)
BOX_STROKE = (26, 20, 16)
DIAMOND_FILL = (245, 224, 216)
ARROW_COLOR = (26, 20, 16)
TEXT_COLOR = (26, 20, 16)
TITLE_COLOR = (209, 75, 44)
BRANCH_FILL = (255, 248, 240)
NO_ARROW = (180, 60, 40)

# Try to load fonts
try:
    font_bold = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 20)
    font_reg = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 18)
    font_small = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", 16)
    font_title = ImageFont.truetype("C:/Windows/Fonts/arialbd.ttf", 28)
except:
    font_bold = ImageFont.load_default()
    font_reg = font_bold
    font_small = font_bold
    font_title = font_bold

def text_center(draw, x, y, w, h, text, font, fill):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((x + (w - tw) // 2, y + (h - th) // 2 - 2), text, fill=fill, font=font)

def draw_box(draw, x, y, w, h, text, fill=BOX_FILL, stroke=BOX_STROKE, font=font_bold):
    draw.rounded_rectangle([x, y, x + w, y + h], radius=12, fill=fill, outline=stroke, width=3)
    text_center(draw, x, y, w, h, text, font, TEXT_COLOR)

def draw_diamond(draw, cx, cy, w, h, text):
    points = [(cx, cy - h // 2), (cx + w // 2, cy), (cx, cy + h // 2), (cx - w // 2, cy)]
    draw.polygon(points, fill=DIAMOND_FILL, outline=BOX_STROKE, width=3)
    text_center(draw, cx - w // 2, cy - h // 2, w, h, text, font_bold, TEXT_COLOR)

def arrow(draw, x1, y1, x2, y2, color=ARROW_COLOR, label=""):
    draw.line([(x1, y1), (x2, y2)], fill=color, width=3)
    # Arrowhead
    import math
    angle = math.atan2(y2 - y1, x2 - x1)
    arrow_len = 14
    arrow_angle = 0.4
    ax1 = x2 - arrow_len * math.cos(angle - arrow_angle)
    ay1 = y2 - arrow_len * math.sin(angle - arrow_angle)
    ax2 = x2 - arrow_len * math.cos(angle + arrow_angle)
    ay2 = y2 - arrow_len * math.sin(angle + arrow_angle)
    draw.polygon([(x2, y2), (int(ax1), int(ay1)), (int(ax2), int(ay2))], fill=color)
    if label:
        mx, my = (x1 + x2) / 2 + 10, (y1 + y2) / 2 - 10
        draw.text((int(mx), int(my)), label, fill=color, font=font_small)

def line(draw, x1, y1, x2, y2, color=ARROW_COLOR, width=3):
    draw.line([(x1, y1), (x2, y2)], fill=color, width=width)

# Layout
y_cursor = MARGIN_TOP
GAP = 25
positions = {}

steps_main = [
    "Customer Opens App",
    "Map Shows Nearby Print Shops",
    "Select a Shop",
    "See Services & Pricing",
    "Choose Print Mode",
]

branch_labels = ["Single", "Batch", "Group"]
BRANCH_W = 220
BRANCH_H = 50

after_branch = [
    "Upload File(s)",
    "Customize (paper, size, color, finish)",
    "Preview Generated",
]

DIAMOND_W = 200
DIAMOND_H = 70

final_steps = [
    "Pay Online",
    "Get Authentication Code",
    "Order Sent to Shop",
    "Shop Prints Job",
    "Job Ready for Pickup",
    "Customer Shows Auth Code",
    "Shop Verifies & Hands Over",
    "Done",
]

# Calculate positions
y = MARGIN_TOP
for text in steps_main:
    positions[text] = y
    y += BOX_H + GAP
# Choose Print Mode is at y - GAP - BOX_H, but branches go from here
branch_y = y
y += BRANCH_H + GAP

for text in after_branch:
    positions[text] = y
    y += BOX_H + GAP

diamond_cy = y + DIAMOND_H // 2
y += DIAMOND_H + GAP + 20  # extra gap for Yes label

for text in final_steps:
    positions[text] = y
    y += BOX_H + GAP

TOTAL_H = y + 60

# Create image
img = Image.new("RGB", (WIDTH, TOTAL_H), BG)
draw = ImageDraw.Draw(img)

# Title
title = "PrintLoop - Printing Flow"
bbox = draw.textbbox((0, 0), title, font=font_title)
tw = bbox[2] - bbox[0]
draw.text(((WIDTH - tw) // 2, 20), title, fill=TITLE_COLOR, font=font_title)

# Dashed separator
for x in range(100, WIDTH - 100, 12):
    draw.line([(x, 65), (x + 6, 65)], fill=BOX_STROKE, width=2)

# Draw main steps
for text in steps_main:
    y_pos = positions[text]
    draw_box(draw, BOX_X, y_pos, BOX_W, BOX_H, text)

# Arrows between main steps
for i in range(len(steps_main) - 1):
    y1 = positions[steps_main[i]] + BOX_H
    y2 = positions[steps_main[i + 1]]
    arrow(draw, WIDTH // 2, y1, WIDTH // 2, y2)

# Arrow from Choose Print Mode to branches
arrow(draw, WIDTH // 2, positions["Choose Print Mode"] + BOX_H, WIDTH // 2, branch_y)

# Branch boxes
branch_centers = []
for i, bl in enumerate(branch_labels):
    bx = BOX_X + i * (BRANCH_W + 80)
    draw_box(draw, bx, branch_y, BRANCH_W, BRANCH_H, bl, fill=BRANCH_FILL, font=font_reg)
    branch_centers.append(bx + BRANCH_W // 2)

# Converging arrows from branches to Upload File(s)
upload_y = positions["Upload File(s)"]
for bc in branch_centers:
    arrow(draw, bc, branch_y + BRANCH_H, WIDTH // 2, upload_y)

# After-branch steps
for text in after_branch:
    draw_box(draw, BOX_X, positions[text], BOX_W, BOX_H, text)

# Arrows between after-branch steps
for i in range(len(after_branch) - 1):
    y1 = positions[after_branch[i]] + BOX_H
    y2 = positions[after_branch[i + 1]]
    arrow(draw, WIDTH // 2, y1, WIDTH // 2, y2)

# Arrow from Preview to diamond
arrow(draw, WIDTH // 2, positions["Preview Generated"] + BOX_H, WIDTH // 2, diamond_cy - DIAMOND_H // 2)

# Diamond
draw_diamond(draw, WIDTH // 2, diamond_cy, DIAMOND_W, DIAMOND_H, "Satisfied?")

# "No" arrow: from diamond left, back up to Customize
customize_cy = positions["Customize (paper, size, color, finish)"] + BOX_H // 2
no_start_x = WIDTH // 2 - DIAMOND_W // 2
no_y = diamond_cy
# Draw a curved path: left from diamond, then up to customize
elbow_x = BOX_X - 60
line(draw, no_start_x, no_y, elbow_x, no_y, color=NO_ARROW, width=3)
line(draw, elbow_x, no_y, elbow_x, customize_cy, color=NO_ARROW, width=3)
# Arrowhead at end (pointing right into customize)
draw.polygon([(BOX_X, customize_cy), (BOX_X - 16, customize_cy - 10), (BOX_X - 16, customize_cy + 10)], fill=NO_ARROW)
draw.text((elbow_x - 10, diamond_cy - 28), "No", fill=NO_ARROW, font=font_small)

# "Yes" arrow: from diamond bottom to Pay Online
pay_y = positions["Pay Online"]
arrow(draw, WIDTH // 2, diamond_cy + DIAMOND_H // 2, WIDTH // 2, pay_y, label="Yes")

# Final steps
for text in final_steps:
    draw_box(draw, BOX_X, positions[text], BOX_W, BOX_H, text)

# Arrows between final steps
for i in range(len(final_steps) - 1):
    y1 = positions[final_steps[i]] + BOX_H
    y2 = positions[final_steps[i + 1]]
    arrow(draw, WIDTH // 2, y1, WIDTH // 2, y2)

# Save
output_path = "C:/Users/abdur/Music/printloop-saas-v2/printing-flow.png"
img.save(output_path, "PNG", quality=95)
print(f"PNG saved to: {output_path}")
print(f"Size: {img.size}")
