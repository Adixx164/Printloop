# DPA PDF Generation Guide

The DPA (Data Processing Agreement) is stored as Markdown in `01-backend/routes/legal.routes.ts` 
in the `dpa` constant. Here are several ways to convert it to PDF:

## Option 1: Using Pandoc (Recommended)

```bash
# Install pandoc if not available
# Windows: choco install pandoc
# Mac: brew install pandoc
# Linux: apt-get install pandoc

# Extract DPA markdown and convert to PDF
npx tsx tools/extract-dpa.ts | pandoc -o PrintLoop-DPA-v1.0.pdf -f markdown -V geometry:margin=1in
```

## Option 2: Using Node.js (markdown-pdf)

```bash
# Install dependencies
npm install markdown-pdf --save-dev

# Run the generator
npx tsx tools/generate-dpa-pdf.ts
```

## Option 3: Online Tools (Quickest)

1. Copy the DPA markdown from `01-backend/routes/legal.routes.ts` (between `const dpa = \`` and the closing backtick)
2. Paste into any of these:
   - https://markdown2pdf.com/
   - https://dillinger.io/ (Export as PDF)
   - https://stackedit.io/ (Export as PDF)
   - VS Code with Markdown PDF extension

## Option 4: VS Code

1. Install "Markdown PDF" extension
2. Create a temporary file with the DPA markdown
3. Right-click → "Markdown PDF: Export (pdf)"

---

## DPA Content Location

The DPA markdown is in `01-backend/routes/legal.routes.ts` as a template literal in the `dpa` constant.

To extract it manually:
```bash
# Extract just the DPA markdown
sed -n '/const dpa = `/,/^`;/p' 01-backend/routes/legal.routes.ts | sed '1d;$d' > dpa.md
```

Then convert `dpa.md` to PDF using any of the methods above.

---

## Required for Production

The generated PDF should be:
1. **Version controlled** - Store in `docs/legal/PrintLoop-DPA-v1.0.pdf`
2. **Referenced in tenant onboarding** - Link in signup flow
3. **Available at `/api/legal/dpa`** - Already implemented as Markdown endpoint
4. **Signed by tenant** - Checkbox in onboarding wizard

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-08-30 | Initial DPA for PrintLoop SaaS v2 launch |