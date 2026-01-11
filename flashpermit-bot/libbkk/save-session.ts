import { chromium } from 'playwright';
import * as fs from 'fs';
import * as readline from 'readline';

async function waitForEnter(prompt: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, () => { rl.close(); resolve(); });
  });
}

async function saveLoginSession() {
  console.log('🔐 FlashPermit - Login Session Saver\n');
  console.log('Steps:');
  console.log('1. Browser will open');
  console.log('2. Click Login, enter email/password');
  console.log('3. Complete login fully (see your dashboard)');
  console.log('4. Come back here and press ENTER\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await context.newPage();
  
  await page.route('**/*whatfix*', route => route.abort());
  await page.goto('https://shapephx.phoenix.gov/s/');

  console.log('════════════════════════════════════════');
  console.log('  👆 BROWSER OPEN - LOGIN NOW!');
  console.log('════════════════════════════════════════\n');

  await waitForEnter('✋ Press ENTER after you are FULLY logged in... ');

  console.log('\n💾 Saving session...');
  await page.waitForTimeout(2000);
  
  const state = await context.storageState();
  fs.writeFileSync('shape-phx-session.json', JSON.stringify(state, null, 2));
  
  console.log(`✅ Session saved! (${state.cookies.length} cookies)`);
  console.log('\nNow run: npx tsx lib/hybrid-bot.ts\n');
  
  await browser.close();
}

saveLoginSession();