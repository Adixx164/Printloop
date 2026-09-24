# 10 · CLOUD RENDER WORKER (render-worker/)

> Folder: `render-worker/`
> role — BullMQ consumer that normalises uploaded PDFs to PWG-Raster in the cloud so
>   kiosks spool pre-rendered artifacts instead of raw PDFs. Sits next to 01-backend as a
>   sibling service; calls back to POST /api/render/callback (HMAC-signed).

## source

```

render-worker/src/pipeline/render.ts
  role — render pipeline: PDF→PWG-Raster + PDF/A normalization + preview + meta
  details — VENDOR_ROOT defaults to ../../vendor/openprinting (cups-filters/libcupsfilters
    binaries). RenderOptions: dpi, color, pageSize, duplex. RenderResult: pwgBuffer,
    pageCount, colorPages, monoPages, mediaSize.
    getBinaryPath(binaryName): searches vendor cups-filters/src, utils, libcupsfilters/src,
    cups-filters/, cups-filters/build, /usr/bin, /usr/local/bin for pdftopwg/gs.
    pdfToPwgRaster(inputPdfPath, options): runs pdftopwg -d dpi -p pageSize -c|-g (-D for
    duplex) → .pwg, reads the file, parses PWG-Raster-Page-Count/Color-Pages/Mono-Pages
    headers, deletes temp .pwg, returns RenderResult. Falls back: pages = colorPages+monoPages
    when page count is 0.
    normalizeToPdfA(inputPdfPath): Ghostscript -dPDFA=2 -sDEVICE=pdfwrite -sProcessColorModel=
    DeviceRGB → _normalized.pdf, returns output path.
    parsePwgMeta(pwgPath): regex-parses PWG-Raster-Page-Count/Color-Pages/Mono-Pages from the
    header text.
    generatePreviewImages(inputPdfPath, maxPages=3): Ghostscript -sDEVICE=jpeg -dJPEGQ=85 -r150
    -dFirstPage=1 -dLastPage=N -sOutputFile=...-preview-%d.jpg → returns generated JPG paths.
    runCommand(command, args): spawns a child process, captures stdout/stderr, rejects on non-zero
    exit or spawn error.

render-worker/src/worker.ts
  role — BullMQ worker entry point
  details — connects to Redis, processes the 'render' queue, pulls file from S3, calls the
    render pipeline, writes the PWG artifact back to S3, extracts page count / color / mono,
    computes final cost via pricing, then POSTs /api/render/callback with HMAC-SHA256 signature
    (X-Render-Signature) using RENDER_CALLBACK_SECRET + raw body. On failure POSTs /api/render/
    failure.

render-worker/src/config/index.ts (+ .js/.d.ts)
  role — render-worker config
  details — VENDOR_ROOT, S3/S3-bucket config, callback URL/secret, worker concurrency.

render-worker/src/utils/logger.ts (+ .js/.d.ts)
  role — render-worker logger

render-worker/src/utils/s3.ts (+ .js/.d.ts)
  role — S3 fetch/store helpers for the render worker
  details — get( key ) → bytes, put( buffer ) → key, signed URL helpers.

render-worker/package.json / package-lock.json / tsconfig.json
  role — render-worker dependencies + TS config

render-worker/dist/ (if present)
  role — compiled render-worker output
  details — dist/pipeline/render.js, dist/worker.js, dist/config, dist/utils.

render-worker/README.md
  role — render-worker readme
  details — likely documents the render flow + TODO for wiring to 01-backend (per 00-START-HERE).
