# FlashPermit Hybrid Bot 🤖

**Playwright + Azure AI Vision** for automating Phoenix SHAPE Portal permit submissions.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    FlashPermit Hybrid Bot                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   PHASE 1: Playwright Only (Steps 0-6)                      │
│   ─────────────────────────────────────                     │
│   ✅ Fast (~2-3 sec/step)                                   │
│   ✅ Reliable (deterministic)                               │
│   ✅ Free (no API costs)                                    │
│                                                              │
│   Step 0: Login (session reuse)                             │
│   Step 1: Applicant (ROC lookup)                            │
│   Step 2: Address (GIS autocomplete)                        │
│   Step 3: Permit Details (dropdowns)                        │
│   Step 4: Project Details (valuation)                       │
│   Step 5: City Use Only (skip)                              │
│   Step 6: Work Items (checkbox)                             │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   PHASE 2: AI Vision Powered (Steps 7-9)                    │
│   ─────────────────────────────────────                     │
│   🤖 Adaptive (handles unknown requirements)                │
│   🔄 Self-healing (adjusts to portal changes)               │
│   💰 ~$0.02-0.05 per permit                                 │
│                                                              │
│   Step 7: Work Item Details (AI analyzes fields)            │
│   Step 8: Submit Documents (AI handles loading)             │
│   Step 9: Confirmation (AI finds submit button)             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Why Hybrid?

| Approach | Speed | Cost | Reliability | Adaptability |
|----------|-------|------|-------------|--------------|
| Pure Playwright | ⚡ Fast | Free | ✅ High (if portal unchanged) | ❌ Breaks on changes |
| Pure AI Vision | 🐢 Slow | $$$ | ⚠️ Variable | ✅ Self-healing |
| **Hybrid** | ⚡ Fast | $ | ✅ High | ✅ Adaptive where needed |

## Quick Start

### 1. Install Dependencies

```bash
cd flashpermit-bot
npm install
npx playwright install chromium
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your Azure OpenAI credentials
```

You need:
- `AZURE_OPENAI_ENDPOINT` - Your Azure OpenAI resource endpoint
- `AZURE_OPENAI_API_KEY` - Your API key
- `AZURE_OPENAI_DEPLOYMENT` - Deployment name (must be GPT-4o for vision)

**Note:** You likely already have Azure AI configured for OCR! Check your existing setup.

### 3. Save Portal Session

Before running the bot, you need a saved login session:

```bash
# Run this once to login and save session
npx playwright codegen https://shapephx.phoenix.gov/s/
# Login manually, then close browser
# Session saved to shape-phx-session.json
```

Or use the Playwright test recorder to capture your login flow.

### 4. Run the Bot

```bash
# Development mode (browser visible)
npm run dev

# Or with ts-node
npm start
```

## Testing Individual Steps

Use the step analyzer to test AI Vision on specific steps:

```bash
# Analyze Step 7
npx tsx lib/analyze-step.ts 7

# Analyze Step 8
npx tsx lib/analyze-step.ts 8

# Analyze Step 9
npx tsx lib/analyze-step.ts 9
```

This will:
1. Open browser with saved session
2. Wait 60 seconds for you to navigate to the step
3. Take screenshot
4. Analyze with AI Vision
5. Display detailed field analysis
6. Save results to `./screenshots/`

## File Structure

```
flashpermit-bot/
├── lib/
│   ├── ai-form-analyzer.ts    # AI Vision integration
│   ├── hybrid-bot.ts          # Main bot implementation
│   └── analyze-step.ts        # Step analyzer tool
├── screenshots/               # Saved screenshots & analysis
├── .env.example               # Environment template
├── .env                       # Your configuration (not in git)
├── package.json
├── tsconfig.json
├── shape-phx-session.json     # Saved login session (not in git)
└── README.md
```

## How AI Vision Works

For Steps 7-9, the bot:

1. **Takes a screenshot** of the current portal state
2. **Sends to GPT-4o Vision** with context about what we're trying to do
3. **Receives structured analysis**:
   - What fields exist
   - What values to fill
   - Which buttons to click
   - Any errors or loading states
4. **Executes the AI's recommendations** via Playwright
5. **Verifies success** and proceeds to next step

Example AI response:
```json
{
  "stepNumber": 7,
  "stepName": "Work Item Details",
  "fields": [
    {
      "type": "text",
      "label": "Cost",
      "selector": "input[name='cost']",
      "value": "5000",
      "action": "fill",
      "required": true
    }
  ],
  "nextButtonSelector": "button:has-text('Next')",
  "hasErrors": false,
  "recommendations": ["Fill cost field with valuation amount", "Click Next"]
}
```

## Customizing for Your Needs

### Adding New Permit Types

Edit the `getWorkItemLabel()` method in `hybrid-bot.ts`:

```typescript
private getWorkItemLabel(installationType: string): string {
  switch (installationType) {
    case 'ac-only':
      return 'Replace Air Conditioner';
    case 'water-heater':  // NEW
      return 'Replace Water Heater';
    // ...
  }
}
```

### Adjusting AI Prompts

Edit `buildSystemPrompt()` and `buildUserPrompt()` in `ai-form-analyzer.ts` to:
- Add more context about specific fields
- Handle edge cases
- Improve accuracy for your use cases

### Handling Portal Changes

If Phoenix updates their portal:
1. Run the step analyzer on affected steps
2. Review AI analysis
3. Update Playwright selectors for Steps 0-6 if needed
4. AI Vision steps (7-9) should adapt automatically

## Troubleshooting

### "Login required - session expired"

Save a new session:
```bash
npx playwright codegen https://shapephx.phoenix.gov/s/
# Login, then close
```

### AI Analysis Confidence Low (<50%)

- The portal layout may have changed significantly
- Try running the step analyzer for detailed feedback
- Screenshot quality might be low - try fullPage screenshots

### Bot Stuck on Spinner

The portal sometimes has long loading times. Increase timeout:
```typescript
await page.waitForSelector('lightning-spinner', { 
  state: 'hidden', 
  timeout: 60000  // 60 seconds
});
```

### Whatfix Overlay Blocking Clicks

Already handled! But if issues persist:
```typescript
await page.evaluate(() => {
  document.querySelectorAll('[class*="whatfix"]').forEach(el => el.remove());
});
```

## Cost Estimation

| Volume | AI Calls | Est. Monthly Cost |
|--------|----------|-------------------|
| 10 permits | 30 | ~$0.50 |
| 50 permits | 150 | ~$2.50 |
| 200 permits | 600 | ~$10 |

*Based on GPT-4o Vision pricing (~$0.01-0.02 per image analysis)*

## Next Steps

1. **Test with real permit** - Use step analyzer first
2. **Tune AI prompts** - Based on what works
3. **Add error recovery** - Retry logic for failures
4. **Integrate with FlashPermit app** - API endpoint to trigger bot
5. **Add payment handling** - Pause at payment, resume after

## Support

For issues or questions, check the handover document or previous session notes.
