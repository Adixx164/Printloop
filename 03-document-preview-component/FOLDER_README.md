# 03 — Document Preview Component

This is a small frontend component that shows a preview of uploaded PDFs, Word docs, Excel sheets, etc. before they get printed. It's designed to drop into the print flow at Step 3 (preview before payment).

## What's inside

```
03-document-preview-component/
├── components/print/
│   ├── DocumentPreview.tsx    ← The preview component itself
│   └── PreviewStep.tsx        ← Updated print-flow step that uses it
└── utils/
    └── fileTypes.ts           ← MIME type detection helper
```

## Why it's separate

This was built earlier in our development before we redesigned the entire frontend with the editorial style (which lives in `02-frontend/`). It uses a slightly different file structure (Next.js `.tsx` files, not Vite `.jsx`).

## How to use it

You have two options:

### Option A — Replace the existing preview step in the new frontend
The new frontend (`02-frontend/`) already has a built-in preview in `src/pages/customer/PrintFlow.jsx` (the `StepPreview` function). For real document rendering (instead of the current faux preview), you'd:

1. Install the library: `npm install @iamjariwala/react-doc-viewer`
2. Replace `StepPreview` in `PrintFlow.jsx` with the logic from `DocumentPreview.tsx`
3. Adapt the imports (`.tsx` → `.jsx`, Next.js paths → Vite paths)

This is small — about 1-2 hours of work for a frontend developer.

### Option B — Keep the faux preview for now
The current preview in `02-frontend/` is visually nice but doesn't actually render the user's file — it shows a placeholder. For early testing this is fine. Real document rendering can be added later.

## Library used

`@iamjariwala/react-doc-viewer` — supports PDF, DOCX, XLSX, PPTX, images. Free and open-source.
