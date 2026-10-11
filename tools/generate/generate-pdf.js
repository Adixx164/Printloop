const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const htmlPath = path.resolve(__dirname, 'PRINTLOOP_ARCHITECTURE_FLOW.html');
  const pdfPath = path.resolve(__dirname, 'PRINTLOOP_ARCHITECTURE_FLOW.pdf');
  
  console.log('Loading HTML file:', htmlPath);
  
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: 'C:\\Users\\abdur\\.cache\\puppeteer\\chrome\\win64-146.0.7680.31\\chrome-win64\\chrome.exe',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  
  const page = await browser.newPage();
  
  // Set a reasonable viewport
  await page.setViewport({ width: 1400, height: 2000 });
  
  // Load the HTML file
  const fileUrl = 'file://' + htmlPath;
  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 120000 });
  
  // Wait for Mermaid to render
  await page.waitForFunction(() => {
    return window.mermaid && document.querySelectorAll('.mermaid').length > 0;
  }, { timeout: 60000 });
  
  // Wait a bit more for all diagrams to render
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  // Generate PDF
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '20mm',
      right: '20mm',
      bottom: '20mm',
      left: '20mm'
    },
    scale: 0.8
  });
  
  console.log('PDF generated:', pdfPath);
  await browser.close();
  process.exit(0);
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});