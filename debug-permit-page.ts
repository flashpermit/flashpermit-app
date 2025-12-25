import { chromium } from 'playwright';

async function debugPermitPage() {
  const browser = await chromium.launch({ headless: false });
  
  const context = await browser.newContext({
    storageState: 'shape-phx-session.json'
  });
  
  const page = await context.newPage();
  
  // Go to portal
  await page.goto('https://shapephx.phoenix.gov/s/');
  console.log('✅ Loaded home page');
  
  // Click "Apply for Permit"
  await page.getByRole('button', { name: 'Apply For Permit' }).click();
  console.log('✅ Clicked Apply for Permit');
  
  // Wait for page to load
  await page.waitForTimeout(5000);
  
  // Take screenshot
  await page.screenshot({ path: 'permit-selection-page.png', fullPage: true });
  console.log('✅ Screenshot saved: permit-selection-page.png');
  
  // Print page title
  const title = await page.title();
  console.log('Page title:', title);
  
  // Print all visible text
  const bodyText = await page.locator('body').innerText();
  console.log('\n📄 Page content:\n', bodyText.substring(0, 500));
  
  // Look for any cards or permit options
  const cards = await page.locator('lightning-card, .slds-card, [class*="card"]').count();
  console.log('\n🔍 Found', cards, 'card elements');
  
  // List all buttons
  const buttons = await page.locator('button').allTextContents();
  console.log('\n🔘 Buttons on page:', buttons);
  
  // Keep browser open
  console.log('\n👀 Browser staying open - check the page manually!');
  console.log('Press Ctrl+C to close when done');
  await page.waitForTimeout(120000);
  
  await browser.close();
}

debugPermitPage();