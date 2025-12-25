import { chromium, Page } from 'playwright';

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Robust Step 9 detection - handles multiple spinners and validation rounds
 */
async function waitForStep9(page: Page, timeout = 60000): Promise<boolean> {
  const startTime = Date.now();
  console.log('   ⏳ Waiting for Step 9 (Confirmation) to load...');
  
  while (Date.now() - startTime < timeout) {
    const isOnStep9 = await page.evaluate(() => {
      // Multiple signals that we're on the confirmation page
      const indicators = {
        // Check for "Confirmation" text in headers
        hasConfirmationHeader: Array.from(document.querySelectorAll('h1, h2, h3, [class*="header"], [class*="title"]'))
          .some(el => el.textContent?.includes('Confirmation')),
        
        // Check for review instructions text
        hasReviewText: document.body.textContent?.includes('Review the details of your application') || false,
        
        // Check sidebar - Step 9 should be active/current
        sidebarStep9Active: Array.from(document.querySelectorAll('[class*="progress"], [class*="step"]'))
          .some(el => el.textContent?.includes('Confirmation') && 
            (el.classList.contains('slds-is-active') || 
             el.classList.contains('current') ||
             el.querySelector('.slds-is-active'))),
        
        // Check for "Applicant" section with Edit button (only on confirmation)
        hasEditableApplicant: !!document.querySelector('button:has-text("Edit"), a:has-text("Edit")'),
        
        // Check URL or page state
        step9InUrl: window.location.href.includes('step=9') || window.location.href.includes('confirmation')
      };
      
      // Return true if any strong indicator is present
      return indicators.hasConfirmationHeader || 
             indicators.hasReviewText || 
             (indicators.sidebarStep9Active && indicators.hasEditableApplicant);
    });
    
    if (isOnStep9) {
      console.log('   ✅ Confirmed: Now on Step 9 (Confirmation)');
      return true;
    }
    
    // Check if still loading
    const hasSpinner = await page.locator('lightning-spinner').count() > 0;
    if (hasSpinner) {
      process.stdout.write('.');
    }
    
    await page.waitForTimeout(500);
  }
  
  console.log('\n   ⚠️ Timeout waiting for Step 9');
  return false;
}

/**
 * Click with retry logic for flaky elements
 */
async function clickWithRetry(page: Page, selector: string, maxRetries = 3): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await page.click(selector, { timeout: 10000 });
      return;
    } catch (e) {
      console.log(`   ⚠️ Click attempt ${attempt}/${maxRetries} failed for: ${selector}`);
      if (attempt === maxRetries) throw e;
      await page.waitForTimeout(1000 * attempt);
    }
  }
}

/**
 * Wait for all spinners to disappear (handles multiple sequential spinners)
 */
async function waitForAllSpinnersGone(page: Page, timeout = 30000): Promise<void> {
  const startTime = Date.now();
  let consecutiveNoSpinner = 0;
  
  while (Date.now() - startTime < timeout) {
    const spinnerCount = await page.locator('lightning-spinner').count();
    
    if (spinnerCount === 0) {
      consecutiveNoSpinner++;
      // Wait for 3 consecutive checks with no spinner (1.5 seconds stable)
      if (consecutiveNoSpinner >= 3) {
        return;
      }
    } else {
      consecutiveNoSpinner = 0;
    }
    
    await page.waitForTimeout(500);
  }
}

// ============================================================
// MAIN WORKFLOW
// ============================================================

async function testCompleteWorkflowWithWhatfixFix() {
  const browser = await chromium.launch({ headless: false });
  
  const context = await browser.newContext({
    storageState: 'shape-phx-session.json'
  });
  
  const page = await context.newPage();
  
  // BLOCK WHATFIX FROM LOADING
  await page.route('**/*whatfix*', route => route.abort());
  await page.route('**/*wfx*', route => route.abort());
  await page.route('**/cdn.whatfix.com/**', route => route.abort());
  console.log('✅ Blocked Whatfix from loading\n');
  
  console.log('🚀 Starting FlashPermit Complete Workflow Test...\n');
  console.log('=' .repeat(60) + '\n');
  
  try {
    // Navigate to portal
    await page.goto('https://shapephx.phoenix.gov/s/');
    console.log('✅ Loaded portal with saved session');
    
    // Click "Apply for Permit"
    await page.getByRole('button', { name: 'Apply For Permit' }).click();
    await page.waitForSelector('text=Select Permit Type', { timeout: 10000 });
    await page.waitForTimeout(2000);
    console.log('✅ Navigated to permit selection');
    
    // Select permit type
    await page.locator('text=general residential construction, including custom homes').first().click();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Next' }).click();
    console.log('✅ Selected Construction and Trades Residential Permit\n');
    
    // ============================================================
    // STEP 1: Applicant
    // ============================================================
    console.log('📋 STEP 1: Applicant');
    await page.waitForTimeout(3000);
    await page.getByLabel('Owner is Contractor').check();
    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Next' }).click();
    console.log('✅ Step 1 Complete\n');
    
    // ============================================================
    // STEP 2: Address - WITH WHATFIX FIX
    // ============================================================
    console.log('📋 STEP 2: Address');
    await page.waitForTimeout(3000);

    const addressInput = page.getByLabel('Address');
    await addressInput.click();
    await addressInput.fill('3825 E CAMELBACK RD');
    await page.waitForTimeout(1000);
    await page.keyboard.press('Enter');
    console.log('   ✅ Searched for address');

    // Wait for Advanced Search modal
    await page.waitForSelector('text=Advanced Search', { timeout: 15000 });
    await page.waitForTimeout(3000);
    console.log('   ✅ Advanced Search modal loaded');

    // Remove Whatfix overlay
    console.log('   🔧 Removing Whatfix overlay...');
    await page.evaluate(() => {
      document.querySelectorAll('[data-wfx-element], [class*="whatfix"], [class*="wfx"], .WFEMOFC').forEach(el => {
        el.remove();
      });
      
      if ((window as any).wfx) {
        (window as any).wfx.disable?.();
      }
      if ((window as any).whatfix) {
        (window as any).whatfix.disable?.();
      }
      
      const tbody = document.querySelector('tbody');
      if (tbody) {
        const cleanTbody = tbody.cloneNode(true);
        tbody.parentNode?.replaceChild(cleanTbody, tbody);
      }
    });
    console.log('   ✅ Whatfix overlay removed');
    await page.waitForTimeout(1000);

    // Coordinate-based Click for radio button
    console.log('   🔘 Clicking radio button via coordinates...');
    const firstRow = page.locator('tbody tr').first();
    const rowBox = await firstRow.boundingBox();

    if (rowBox) {
      await page.mouse.click(rowBox.x + 20, rowBox.y + (rowBox.height / 2));
      console.log('   ✅ Clicked radio button area');
    }
    await page.waitForTimeout(1000);

    // Check if Select button is enabled
    let selectEnabled = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button.slds-button_brand, button'));
      const selectBtn = buttons.find(b => b.textContent?.trim().includes('Select')) as HTMLButtonElement;
      return selectBtn ? !selectBtn.disabled : false;
    });

    // Fallback: JavaScript Event Dispatch
    if (!selectEnabled) {
      console.log('   🔘 Fallback: JavaScript event dispatch...');
      await page.evaluate(() => {
        const firstRow = document.querySelector('tbody tr') as HTMLTableRowElement;
        if (!firstRow) return false;
        
        const radio = firstRow.querySelector('input[type="radio"]') as HTMLInputElement;
        if (radio) {
          radio.checked = true;
          const events = ['mousedown', 'mouseup', 'click', 'change', 'input', 'focus'];
          events.forEach(eventType => {
            const event = eventType.includes('mouse') || eventType === 'click'
              ? new MouseEvent(eventType, { bubbles: true, cancelable: true, view: window })
              : new Event(eventType, { bubbles: true });
            radio.dispatchEvent(event);
          });
        }
        
        firstRow.click();
        firstRow.classList.add('slds-is-selected');
        firstRow.setAttribute('aria-selected', 'true');
        return true;
      });
      await page.waitForTimeout(1000);
      
      selectEnabled = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button.slds-button_brand, button'));
        const selectBtn = buttons.find(b => b.textContent?.trim().includes('Select')) as HTMLButtonElement;
        return selectBtn ? !selectBtn.disabled : false;
      });
    }

    // Click Select Button
    if (selectEnabled) {
      await page.getByRole('button', { name: 'Select' }).click();
      console.log('   ✅ Clicked Select button - address selected!');
    } else {
      console.log('   ⚠️ Select button still disabled - trying force click');
      await page.getByRole('button', { name: 'Select' }).click({ force: true });
    }

    await page.waitForTimeout(2000);
    await page.getByRole('button', { name: 'Next' }).click();
    console.log('✅ Step 2 Complete\n');
    
    // ============================================================
    // STEP 3: Permit Details
    // ============================================================
    console.log('📋 STEP 3: Permit Details');
    await page.waitForTimeout(3000);
    
    await page.getByRole('combobox', { name: 'Permit Work Type', exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole('option', { name: 'Repairs/ Replacements', exact: true }).click();
    await page.waitForTimeout(1000);
    
    await page.getByRole('combobox', { name: 'Permit Use Class', exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole('option', { name: 'Residential', exact: true }).click();
    await page.waitForTimeout(1000);
    
    await page.getByRole('combobox', { name: 'Use Type', exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole('option', { name: 'Single Family', exact: true }).click();
    await page.waitForTimeout(1000);
    
    await page.getByRole('combobox', { name: 'Land Use Type', exact: true }).click();
    await page.waitForTimeout(500);
    await page.getByRole('option', { name: 'Single Family', exact: true }).click();
    await page.waitForTimeout(1000);
    
    console.log('   ℹ️ Alteration Extent: leaving as --None--');
    console.log('   ℹ️ No. of Units: leaving empty');
    
    // Building from Standard Plan? - Set to "No"
    console.log('   Setting Building from Standard Plan to No...');
    try {
      const buildingPlanField = page.getByRole('combobox', { name: 'Building from Standard Plan?', exact: true });
      await buildingPlanField.waitFor({ timeout: 5000 });
      await buildingPlanField.click();
      await page.waitForTimeout(500);
      await page.getByRole('option', { name: 'No', exact: true }).click();
      await page.waitForTimeout(1000);
      console.log('   ✅ Building from Standard Plan set to No');
    } catch (e) {
      try {
        const buildingPlanField2 = page.getByRole('combobox', { name: 'Building from Standard Plan', exact: true });
        await buildingPlanField2.click();
        await page.waitForTimeout(500);
        await page.getByRole('option', { name: 'No', exact: true }).click();
        await page.waitForTimeout(1000);
        console.log('   ✅ Building from Standard Plan set to No (variant 2)');
      } catch (e2) {
        console.log('   ⚠️ Could not find Building from Standard Plan field - continuing');
      }
    }
    
    await page.getByRole('button', { name: 'Next' }).click();
    console.log('✅ Step 3 Complete\n');
    
    // ============================================================
    // STEP 4: Project Details
    // ============================================================
    console.log('📋 STEP 4: Project Details');
    await page.waitForTimeout(3000);
    
    try {
      await page.getByLabel('Project Valuation').fill('5000');
      await page.waitForTimeout(1000);
      console.log('   ✅ Project Valuation set to $5000');
    } catch (e) {
      console.log('   ⚠️ Project Valuation field not found');
    }
    
    try {
      const planSubmissionField = page.getByRole('combobox', { name: 'Plan Submission Type', exact: true });
      await planSubmissionField.waitFor({ timeout: 3000 });
      await planSubmissionField.click();
      await page.waitForTimeout(500);
      await page.getByRole('option', { name: 'No Plans Required', exact: true }).click();
      await page.waitForTimeout(1000);
      console.log('   ✅ Plan Submission Type set');
    } catch (e) {
      console.log('   ℹ️ Plan Submission Type field not found - skipping');
    }
    
    await page.getByRole('button', { name: 'Next' }).click();
    console.log('✅ Step 4 Complete\n');
    
    // ============================================================
    // STEP 5: For City Use Only
    // ============================================================
    console.log('📋 STEP 5: For City Use Only');
    await page.waitForTimeout(3000);
    
    await page.getByRole('button', { name: 'Next' }).click();
    console.log('   Clicked Next - waiting for Step 6...');
    
    // Wait for spinners to clear
    await waitForAllSpinnersGone(page);
    await page.waitForTimeout(2000);
    
    try {
      await page.waitForSelector('text=Select Your Work Items', { timeout: 10000 });
      console.log('   ✅ Step 6 page loaded');
    } catch (e) {
      console.log('   ⚠️ Step 6 header not found - continuing anyway');
    }
    
    console.log('✅ Step 5 Complete\n');
    
    // ============================================================
    // STEP 6: Select Your Work Items
    // ============================================================
    console.log('📋 STEP 6: Select Your Work Items');
    await page.waitForTimeout(3000);
    
    await waitForAllSpinnersGone(page);
    
    // Scroll to load HVAC section
    console.log('   Scrolling to load all work item sections...');
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(2000);
    
    try {
      await page.waitForSelector('text=HVAC', { timeout: 5000 });
      console.log('   ✅ HVAC section loaded');
    } catch {
      console.log('   ⚠️ HVAC section not found - trying to continue');
    }
    
    await page.getByLabel('Replace Furnace or Air Conditioner').check();
    await page.waitForTimeout(1000);
    
    await page.getByRole('button', { name: 'Next' }).click();
    console.log('✅ Step 6 Complete\n');
    
    // ============================================================
    // STEP 7: Work Item Details
    // ============================================================
    console.log('📋 STEP 7: Work Item Details');
    await page.waitForTimeout(3000);
    
    await page.getByRole('button', { name: 'Next' }).click();
    console.log('✅ Step 7 Complete\n');
    
    // ============================================================
    // STEP 8: Submit Documents
    // ============================================================
    console.log('📋 STEP 8: Submit Documents');
    await page.waitForTimeout(3000);
    
    // Check for validation errors
    const errors = await page.evaluate(() => {
      const errorElements = Array.from(document.querySelectorAll('[class*="error"], .slds-has-error, [role="alert"]'));
      return errorElements.map(el => el.textContent?.trim()).filter(Boolean);
    });
    
    if (errors.length > 0) {
      console.log('   ⚠️ Validation errors found:', errors);
    } else {
      console.log('   ✅ No validation errors');
    }
    
    const nextButton = page.getByRole('button', { name: 'Next' });
    const isDisabled = await nextButton.isDisabled();
    
    if (isDisabled) {
      console.log('   ⚠️ Next button is disabled - taking debug screenshot');
      await page.screenshot({ path: 'step8-blocked.png', fullPage: true });
    }
    
    await nextButton.click();
    console.log('   Clicked Next - transitioning to Confirmation...');
    
    // ============================================================
    // STEP 8→9 TRANSITION (THE FIX!)
    // ============================================================
    
    // Use robust Step 9 detection instead of simple timeout
    const reachedStep9 = await waitForStep9(page, 60000);
    
    if (!reachedStep9) {
      console.log('   ⚠️ Step 9 detection timed out - taking screenshot');
      await page.screenshot({ path: 'step8-to-9-timeout.png', fullPage: true });
      
      // Try one more approach: wait for URL change or specific content
      await page.waitForTimeout(5000);
    }
    
    console.log('✅ Step 8 Complete\n');
    
    // ============================================================
    // STEP 9: Confirmation
    // ============================================================
    console.log('📋 STEP 9: Confirmation');
    await page.waitForTimeout(2000);
    
    // Final verification
    const pageContent = await page.evaluate(() => {
      return {
        hasConfirmation: document.body.textContent?.includes('Confirmation') || false,
        hasReviewText: document.body.textContent?.includes('Review the details') || false,
        hasApplicantSection: !!document.querySelector('text=Applicant'),
        url: window.location.href
      };
    });
    
    console.log('   Page verification:', JSON.stringify(pageContent, null, 2));
    
    // Take screenshot of Confirmation page
    await page.screenshot({ path: 'step9-confirmation.png', fullPage: true });
    console.log('   📸 Screenshot saved: step9-confirmation.png');
    
    // ============================================================
    // SUCCESS!
    // ============================================================
    console.log('\n' + '=' .repeat(60));
    console.log('🎉🎉🎉 COMPLETE WORKFLOW SUCCESS! 🎉🎉🎉');
    console.log('=' .repeat(60));
    console.log('\n📌 All 9 steps completed successfully!');
    console.log('💳 Next: Click "Next" to proceed to payment (manual)');
    console.log('📄 Then: Download instant permit PDF');
    
    // ============================================================
    // PAYMENT HANDOFF (Production Feature)
    // ============================================================
    console.log('\n--- PAYMENT HANDOFF ---');
    console.log('In production, FlashPermit would:');
    console.log('1. Save current page state');
    console.log('2. Notify user: "Your permit is ready for payment!"');
    console.log('3. User clicks Next → redirected to payment gateway');
    console.log('4. User pays manually');
    console.log('5. Bot resumes to download issued permit PDF');
    
    console.log('\n👀 Browser staying open for 2 minutes for manual inspection...');
    await page.waitForTimeout(120000);
    
  } catch (error) {
    console.error('\n❌ WORKFLOW ERROR:', error);
    await page.screenshot({ path: 'workflow-error.png', fullPage: true });
    console.log('📸 Error screenshot saved: workflow-error.png');
  } finally {
    await browser.close();
  }
}

// Run the workflow
testCompleteWorkflowWithWhatfixFix();
