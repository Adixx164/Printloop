const pptxgen = require("pptxgenjs");
const pres = new pptxgen();

pres.layout = "LAYOUT_16x9";
pres.author = "PrintLoop";
pres.title = "Get Your Shop Live in 5 Minutes";
pres.subject = "PrintLoop operator onboarding";

const INK = "1A1410";
const ACCENT = "D14B2C";
const OCHRE = "C7944A";
const PAPER = "EEE7D9";
const WHITE = "FFFFFF";
const DARK_BG = "1A1410";

const FONT_HEAD = "Arial Black";
const FONT_BODY = "Calibri";

function titleSlide(title, subtitle) {
  const slide = pres.addSlide();
  slide.background = { color: DARK_BG };
  slide.addText(title, {
    x: 0.6,
    y: 1.6,
    w: 8.8,
    h: 2,
    fontSize: 40,
    fontFace: FONT_HEAD,
    color: WHITE,
    bold: true,
    align: "left",
    margin: 0,
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.6,
    y: 3.5,
    w: 1.8,
    h: 0.06,
    fill: { color: ACCENT },
  });
  slide.addText(subtitle, {
    x: 0.6,
    y: 3.7,
    w: 8.8,
    h: 1.2,
    fontSize: 18,
    fontFace: FONT_BODY,
    color: PAPER,
    align: "left",
    margin: 0,
  });
  return slide;
}

function sectionSlide(label, title) {
  const slide = pres.addSlide();
  slide.background = { color: PAPER };
  slide.addText(label, {
    x: 0.6,
    y: 0.5,
    w: 9,
    h: 0.5,
    fontSize: 12,
    fontFace: FONT_BODY,
    color: INK,
    charSpacing: 3,
    bold: true,
    margin: 0,
  });
  slide.addText(title, {
    x: 0.6,
    y: 1.0,
    w: 9,
    h: 1.4,
    fontSize: 36,
    fontFace: FONT_HEAD,
    color: INK,
    bold: true,
    align: "left",
    margin: 0,
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.6,
    y: 2.5,
    w: 1.4,
    h: 0.06,
    fill: { color: ACCENT },
  });
  return slide;
}

function twoColumnSlide(title, leftItems, rightItems) {
  const slide = pres.addSlide();
  slide.background = { color: WHITE };
  slide.addText(title, {
    x: 0.5,
    y: 0.4,
    w: 9,
    h: 0.9,
    fontSize: 28,
    fontFace: FONT_HEAD,
    color: INK,
    bold: true,
    margin: 0,
  });
  slide.addShape(pres.shapes.RECTANGLE, {
    x: 0.5,
    y: 1.2,
    w: 9,
    h: 0.04,
    fill: { color: OCHRE },
  });

  const bodyOpt = {
    x: 0.5,
    y: 1.4,
    w: 8.5,
    h: 3.6,
    fontSize: 16,
    fontFace: FONT_BODY,
    color: INK,
    align: "left",
    valign: "top",
    bullet: true,
    paraSpaceAfter: 14,
    margin: 0,
  };

  const left = [];
  leftItems.forEach((item) => {
    left.push({ text: item, options: { breakLine: true } });
  });

  const right = [];
  rightItems.forEach((item) => {
    right.push({ text: item, options: { breakLine: true } });
  });

  slide.addText(left, {
    ...bodyOpt,
    x: 0.5,
    w: 4.1,
  });
  slide.addText(right, {
    ...bodyOpt,
    x: 5.4,
  });

  return slide;
}

function statSlide(title, stats) {
  const slide = pres.addSlide();
  slide.background = { color: DARK_BG };
  slide.addText(title, {
    x: 0.6,
    y: 0.6,
    w: 9,
    h: 0.7,
    fontSize: 22,
    fontFace: FONT_HEAD,
    color: WHITE,
    bold: true,
    margin: 0,
  });
  stats.forEach((s, i) => {
    const x = 0.6 + i * 2.3;
    slide.addShape(pres.shapes.RECTANGLE, {
      x,
      y: 1.6,
      w: 2.0,
      h: 2.4,
      fill: { color: "262626" },
      line: { color: ACCENT, width: 1 },
    });
    slide.addText(s.value, {
      x,
      y: 1.8,
      w: 2.0,
      h: 1.1,
      fontSize: 34,
      fontFace: FONT_HEAD,
      color: ACCENT,
      bold: true,
      align: "center",
      valign: "middle",
      margin: 0,
    });
    slide.addText(s.label, {
      x,
      y: 3.0,
      w: 2.0,
      h: 0.8,
      fontSize: 12,
      fontFace: FONT_BODY,
      color: PAPER,
      align: "center",
      margin: 0,
    });
  });
  return slide;
}

// Build deck
titleSlide(
  "Get your shop live in 5 minutes",
  "PrintLoop is a web wizard for print-shop owners. No developer. No IT project. Just a browser and a printer."
);

sectionSlide("01 / THE MARKETPLACE", "Your shop, on the map.");
twoColumnSlide(
  "How it works",
  [
    "2-sided marketplace — you supply the printer, PrintLoop routes demand to you",
    "Customers find you by distance on the /find map",
    "You set the prices; PrintLoop handles payment split + commission",
    "Asset-light: the platform owns no printers and no shops",
  ],
  [
    "10–15% commission per print (default 10%)",
    "Payouts weekly to your bank, or instant for ₦100",
    "Trust built by ratings + accountability loop",
    "ML layer will optimise ranking and pricing over time",
  ]
);

sectionSlide("02 / YOUR REVENUE", "Commission-based, not subscription.");
statSlide("Where the money goes", [
  { value: "90%", label: "Your cut per print" },
  { value: "10%", label: "PrintLoop commission" },
  { value: "Fri", label: "Default payout day" },
  { value: "₦100", label: "Instant payout fee" },
]);

sectionSlide("03 / PAYMENTS & PAYOUT", "Get paid without chasing invoices.");
twoColumnSlide(
  "What we set up for you",
  [
    "Paystack subaccount — required to receive customer payments",
    "Business name, settlement bank code, NUBAN account number",
    "Payout bank account — where your weekly earnings land",
  ],
  [
    "KYC checklist: BVN, valid ID, phone, email",
    "Sole traders can upgrade from personal details later",
    "CAC optional at start; your KYC happens inside Paystack",
  ]
);

sectionSlide("04 / PRINTER & TEST PRINT", "The kiosk PC is the new M600.");
twoColumnSlide(
  "The 3-step printer setup",
  [
    "Add printer in Operator console → get pairing QR",
    "Install PrintLoop agent by double-clicking PrintLoopSetup.exe",
    "Scan QR; agent auto-picks transport",
  ],
  [
    "Spooler for USB/local printers (most shops)",
    "IPP for networked printers (HP, Brother, Canon)",
    "Raw9100 for Sharp MX and JetDirect-only printers",
    "SumatraPDF installed automatically for byte-faithful print",
  ]
);

sectionSlide("05 / GO LIVE", "When all checks are green.");
twoColumnSlide(
  "You’re live when",
  [
    "Account activated after email verification",
    "Shop address set",
    "Confirmed test print",
    "Printer online",
  ],
  [
    "Go live unlocks automatically",
    "You appear on the /find customer map",
    "Sorted by distance + online status + rating",
    "Console becomes your daily dashboard",
  ]
);

pres.writeFile({ fileName: "C:/Users/abdur/Videos/printloop-saas-v2/printloop-owner-onboarding.pptx" })
  .then(() => {
    console.log("OK: deck written");
  })
  .catch((err) => {
    console.error("FAIL:", err);
    process.exit(1);
  });
