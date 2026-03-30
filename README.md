# PriceWatch

**AI-Powered Amazon Price Intelligence Agent**

A self-hosted "digital coworker" that monitors Amazon product prices, analyzes trends using AI, stores historical data in a vector database, and sends smart email alerts when prices drop. Includes a live dashboard for tracking and adding products.

[Demo Link](https://www.youtube.com/watch?v=n9t01whqB6M)

## Architecture

```
                    +-------------------+
                    |   Schedule Trigger |
                    |   (Every 6 Hours)  |
                    +---------+---------+
                              |
                              v
                    +-------------------+
                    |   Product List    |
                    |   (3 Amazon URLs) |
                    +---------+---------+
                              |
                              v
               +--------------+--------------+
               |                             |
               v                             v
+-----------------------------+   +-------------------+
| Playwright Scraper Service  |   | Ensure ChromaDB   |
| (Docker, Port 3001)         |   | Collection Exists |
| - Anti-detection headers    |   +-------------------+
| - User agent rotation       |
| - JSON-LD fallback          |
+-------------+---------------+
              |
              v
+-----------------------------+
| Get Price History           |
| (ChromaDB Query)            |
+-------------+---------------+
              |
              v
+-----------------------------+
| Prepare LLM Context        |
| (Current + Historical Data) |
+-------------+---------------+
              |
              v
+-----------------------------+
| OpenAI GPT-4o-mini          |
| (Price Trend Analysis)      |
| - Trend detection           |
| - Buy/Wait recommendation   |
| - Alert threshold decision   |
+-------------+---------------+
              |
              v
+-----------------------------+
| Parse AI Response           |
+------+----------------+-----+
       |                |
       v                v
+-------------+  +--------------+
| Store in    |  | Should Alert?|
| ChromaDB    |  | (IF Node)    |
+-------------+  +------+-------+
                   |           |
                   v           v
            +-----------+ +-----------+
            | Format    | | Log       |
            | Alert     | | (No Alert)|
            +-----+-----+ +-----------+
                  |
                  v
            +-----------+
            | Send Email|
            | (Gmail)   |
            +-----------+
```

## Demo Video

To view the demo, watch the video above. It covers:
1. The n8n workflow canvas walkthrough
2. Live execution with real-time data flow
3. AI analysis output
4. The dashboard with sparkline charts
5. Adding a new product from the UI

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Orchestrator | n8n (self-hosted) | Visual workflow engine, scheduling, logic |
| Web Scraper | Node.js + Playwright | Headless browser automation, price extraction |
| AI Engine | OpenAI GPT-4o-mini | Price trend analysis, buy/wait recommendations |
| Database | ChromaDB | Price history storage with vector capabilities |
| Alerting | Gmail SMTP | Email notifications on price drops |
| Dashboard | n8n Webhook + HTML/CSS | Live UI with charts and add-product form |
| Infrastructure | Docker Compose | Container orchestration, single-command deploy |

## Key Features

**Scraping**
- Per-domain CSS selector configuration (extensible to new sites)
- User agent rotation across 5 browser signatures
- Anti-detection: removes webdriver flag, adds Sec-Fetch headers, randomized delays
- JSON-LD structured data fallback when CSS selectors fail
- Debug screenshots on scrape failure

**AI Analysis**
- LLM makes a boolean decision (shouldAlert) that drives workflow logic
- Detects trends: dropping, rising, stable, unknown
- Provides buy/wait/no-action recommendations with confidence levels
- Analysis improves over time as historical data accumulates

**Reliability**
- Retry logic on HTTP nodes (2 retries, 5s delay)
- Continue-on-fail on scraper, ChromaDB, and OpenAI nodes
- Graceful skip when individual product scrapes fail
- Parallel execution: storage and alerting run independently

**Dashboard**
- Live web UI served via n8n webhook
- Sparkline price charts with gradient fill
- Add new products directly from the browser
- Color-coded trend badges and recommendation labels
- Responsive design

## Quick Start

### Prerequisites

- Docker and Docker Compose
- OpenAI API key
- Gmail account with App Password (for alerts)

### Setup

```bash
git clone https://github.com/maqsoodhuman/pricewatch.git
cd pricewatch

# Create environment file
cp .env.example .env
# Edit .env with your API keys

# Start all services
docker compose up -d --build

# Verify services are running
curl http://localhost:5678        # n8n UI
curl http://localhost:8000/api/v2/heartbeat  # ChromaDB
curl http://localhost:3001/health  # Scraper
```

### Configure n8n

1. Open http://localhost:5678 and create an account
2. Import the workflow from the n8n UI
3. Set up OpenAI credential (Header Auth: Name = `Authorization`, Value = `Bearer sk-...`)
4. Set up SMTP credential for Gmail alerts (smtp.gmail.com, port 587)
5. Create ChromaDB collection and update collection UUID in workflow nodes
6. Activate both workflows (main pipeline + dashboard)
7. Open the dashboard at http://localhost:5678/webhook/dashboard

## Project Structure

```
pricewatch/
|-- docker-compose.yml              # 3-service container setup
|-- .env                            # API keys (not committed)
|-- .env.example                    # Template for environment variables
|-- README.md
|-- scraper-service/
|   |-- Dockerfile                  # Playwright Docker image
|   |-- package.json
|   |-- server.js                   # Express API (/scrape, /scrape-batch, /health)
|   +-- scrapers/
|       +-- generic.js              # Per-domain scraping logic with selectors
+-- data/                           # Persistent volumes (not committed)
    |-- n8n/                        # n8n workflow data
    +-- chromadb/                   # Vector database storage
```

## Scraper API

```bash
# Single product
curl -X POST http://localhost:3001/scrape \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.amazon.com/dp/B0FHM61VTK/","productName":"Beats Headphones"}'

# Batch scrape
curl -X POST http://localhost:3001/scrape-batch \
  -H "Content-Type: application/json" \
  -d '{"products":[{"url":"...","productName":"..."},{"url":"...","productName":"..."}]}'

# Health check
curl http://localhost:3001/health
```

## n8n Workflows

### Main Pipeline (10 nodes)
Schedule Trigger, Product List, Scrape Price (Playwright), Get Price History, Prepare LLM Context, AI Price Analysis (OpenAI), Parse AI Response, Store in ChromaDB, Should Alert?, Format Alert + Send Email / Log (No Alert)

### Dashboard (3 nodes)
Webhook (GET), Webhook (POST), Serve Dashboard, Respond to Webhook


## Future Improvements

- Proxy rotation service for scraping at scale
- Dashboard price trend visualization with Chart.js
- Semantic search over price history ("when was X cheapest?")
- CI/CD pipeline with GitHub Actions
- Slack and Discord webhook notifications
- Support for additional e-commerce sites (selector config system is ready)
- Price drop threshold configuration per product

## License

MIT
