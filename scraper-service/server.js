const express = require("express");
const { scrapePrice } = require("./scrapers/generic");

const app = express();
app.use(express.json());

const PORT = 3001;

// ── Health Check ──
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "pricewatch-scraper", timestamp: new Date().toISOString() });
});

// ── Scrape Endpoint ──
app.post("/scrape", async (req, res) => {
  const { url, productName } = req.body;

  if (!url) {
    return res.status(400).json({ error: "Missing 'url' in request body" });
  }

  console.log(`[SCRAPE] Starting: ${productName || "Unknown"} → ${url}`);

  try {
    const result = await scrapePrice(url, productName);
    console.log(`[SCRAPE] Success: ${productName} → $${result.price}`);
    res.json(result);
  } catch (error) {
    console.error(`[SCRAPE] Failed: ${productName} → ${error.message}`);
    res.status(500).json({
      error: error.message,
      productName: productName || "Unknown",
      url,
      timestamp: new Date().toISOString(),
    });
  }
});

// ── Batch Scrape (all products at once) ──
app.post("/scrape-batch", async (req, res) => {
  const { products } = req.body;

  if (!products || !Array.isArray(products)) {
    return res.status(400).json({ error: "Missing 'products' array in request body" });
  }

  console.log(`[BATCH] Scraping ${products.length} products...`);

  const results = await Promise.allSettled(
    products.map(({ url, productName }) => scrapePrice(url, productName))
  );

  const response = results.map((result, index) => {
    if (result.status === "fulfilled") {
      return { success: true, data: result.value };
    } else {
      return {
        success: false,
        error: result.reason.message,
        productName: products[index].productName,
        url: products[index].url,
      };
    }
  });

  console.log(`[BATCH] Done. ${response.filter((r) => r.success).length}/${products.length} succeeded.`);
  res.json(response);
});

app.listen(PORT, () => {
  console.log(`🔍 PriceWatch Scraper running on port ${PORT}`);
});
