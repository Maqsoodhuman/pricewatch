const { chromium, firefox } = require("playwright");
const path = require("path");

// ── User Agent Rotation ──
const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
];

// ── Per-domain selector configurations ──
const SITE_CONFIGS = {
  "amazon.com": {
    name: "Amazon",
    priceSelectors: [
      ".a-price .a-offscreen",
      ".priceToPay .a-offscreen",
      "#corePrice_feature_div .a-offscreen",
      ".a-price-whole",
      "#priceblock_ourprice",
      "#priceblock_dealprice",
    ],
    titleSelector: "#productTitle",
    waitFor: ".a-price",
    usesFirefox: false,
  },
  "target.com": {
    name: "Target",
    priceSelectors: [
      "[data-test='product-price'] span",
      "[data-test='product-price']",
      "span[data-test='product-price']",
      "[class*='CurrentPrice'] span",
    ],
    titleSelector: "[data-test='product-title'] h1, h1",
    waitFor: "[data-test='product-price'], [class*='CurrentPrice']",
    usesFirefox: false,
  },
  "ebay.com": {
    name: "eBay",
    priceSelectors: [
      "[data-testid='x-price-primary'] span.ux-textspans",
      ".x-price-primary span.ux-textspans",
      "[itemprop='price']",
    ],
    titleSelector: ".x-item-title__mainTitle span, h1",
    waitFor: "[data-testid='x-price-primary'], .x-price-primary, [itemprop='price']",
    usesFirefox: false,
  },
};

function getSiteConfig(url) {
  for (const [domain, config] of Object.entries(SITE_CONFIGS)) {
    if (url.includes(domain)) {
      return config;
    }
  }
  return null;
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^0-9.,]/g, "").replace(/,/g, "");
  const price = parseFloat(cleaned);
  return isNaN(price) ? null : price;
}

function randomDelay(min = 3000, max = 6000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function scrapePrice(url, productName = "Unknown") {
  const siteConfig = getSiteConfig(url);

  if (!siteConfig) {
    throw new Error(`Unsupported site. URL must be from: ${Object.keys(SITE_CONFIGS).join(", ")}`);
  }

  let browser;
  try {
    const browserType = siteConfig.usesFirefox ? firefox : chromium;
    const browserName = siteConfig.usesFirefox ? "Firefox" : "Chromium";
    const userAgent = getRandomUserAgent();
    console.log(`[BROWSER] Launching ${browserName} for ${siteConfig.name} with UA: ${userAgent.substring(0, 50)}...`);

    browser = await browserType.launch({
      headless: true,
      args: siteConfig.usesFirefox
        ? []
        : [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-blink-features=AutomationControlled",
            "--disable-infobars",
            "--window-size=1366,768",
          ],
    });

    const context = await browser.newContext({
      userAgent: userAgent,
      viewport: { width: 1366, height: 768 },
      locale: "en-US",
      ignoreHTTPSErrors: true,
      javaScriptEnabled: true,
      extraHTTPHeaders: {
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "DNT": "1",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Site": "none",
        "Sec-Fetch-User": "?1",
        "Cache-Control": "max-age=0",
      },
    });

    // Remove webdriver flag
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      // Override plugins to look more real
      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });
      // Override languages
      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });

    const page = await context.newPage();

    // Navigate
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });

    // Wait for price element
    try {
      await page.waitForSelector(siteConfig.waitFor, { timeout: 15000 });
    } catch {
      console.log(`[WARN] waitFor selector not found, proceeding anyway...`);
    }

    // Longer random delay to appear human
    await page.waitForTimeout(randomDelay(3000, 6000));

    // Scroll down slightly (human behavior)
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(randomDelay(1000, 2000));

    // ── Extract Price ──
    let price = null;
    let rawPriceText = null;

    for (const selector of siteConfig.priceSelectors) {
      try {
        const elements = await page.$$(selector);
        for (const element of elements) {
          const text = await element.textContent();
          const parsed = parsePrice(text);
          if (parsed && parsed > 0) {
            rawPriceText = text;
            price = parsed;
            console.log(`[PRICE] Found via "${selector}": ${text} → $${price}`);
            break;
          }
        }
        if (price) break;
      } catch {
        continue;
      }
    }

    // ── Fallback: JSON-LD structured data ──
    if (!price) {
      console.log(`[FALLBACK] Trying page.evaluate to find price...`);
      const fallbackPrice = await page.evaluate(() => {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');
        for (const script of scripts) {
          try {
            const data = JSON.parse(script.textContent);
            const findPrice = (obj) => {
              if (!obj || typeof obj !== "object") return null;
              if (obj.price) return parseFloat(obj.price);
              if (obj.lowPrice) return parseFloat(obj.lowPrice);
              if (obj.offers) return findPrice(obj.offers);
              if (Array.isArray(obj)) {
                for (const item of obj) {
                  const p = findPrice(item);
                  if (p) return p;
                }
              }
              return null;
            };
            const p = findPrice(data);
            if (p) return p;
          } catch {
            continue;
          }
        }

        const metaPrice = document.querySelector('meta[property="product:price:amount"], meta[name="twitter:data1"]');
        if (metaPrice) {
          const val = parseFloat(metaPrice.content);
          if (val > 0) return val;
        }

        return null;
      });

      if (fallbackPrice) {
        price = fallbackPrice;
        rawPriceText = `$${fallbackPrice} (from structured data)`;
        console.log(`[FALLBACK] Found price from structured data: $${price}`);
      }
    }

    // ── Screenshot on failure for debugging ──
    if (!price) {
      const screenshotPath = path.join("/app", `debug_${siteConfig.name}_${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`[DEBUG] Screenshot saved: ${screenshotPath}`);
      
      // Also log the page title to understand what page we're on
      const pageTitle = await page.title();
      console.log(`[DEBUG] Page title: ${pageTitle}`);
    }

    // ── Extract Title ──
    let scrapedTitle = productName;
    if (siteConfig.titleSelector) {
      try {
        const titleEl = await page.$(siteConfig.titleSelector);
        if (titleEl) {
          scrapedTitle = (await titleEl.textContent()).trim();
        }
      } catch {
        // Keep provided name
      }
    }

    if (!price) {
      throw new Error(`Could not extract price from ${siteConfig.name}. Selectors may need updating.`);
    }

    return {
      productName: scrapedTitle,
      price,
      currency: "USD",
      rawPriceText: rawPriceText?.trim() || null,
      source: siteConfig.name,
      url,
      available: true,
      scrapedAt: new Date().toISOString(),
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { scrapePrice };