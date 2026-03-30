# PriceWatch — AI-Powered Amazon Price Intelligence Agent

An automated "digital coworker" that monitors Amazon product prices, analyzes trends using AI, stores historical data in a vector database, and sends smart email alerts when prices drop.

Built with **n8n** (workflow orchestration), **Playwright** (headless browser automation), **OpenAI** (AI-powered analysis), and **ChromaDB** (vector database) — all containerized with Docker Compose.

## Architecture

```
┌──────────────┐     ┌─────────────────────┐     ┌───────────────┐
│  n8n          │────▶│  Playwright Scraper  │     │   ChromaDB    │
│  (Orchestrator)│    │  (Microservice)      │     │ (Vector DB)   │
│  Port 5678    │     │  Port 3001           │     │  Port 8000    │
└──────┬───────┘     └─────────────────────┘     └───────────────┘
       │                                                 ▲
       │              ┌─────────────────────┐           │
       └─────────────▶│   OpenAI API        │           │
                      │   (Price Analysis)  │           │
                      └─────────────────────┘           │
                                                        │
       ┌────────────────────────────────────────────────┘
       │  Price history stored & queried per product
```

## What It Does

1. **Scrapes** Amazon product pages on a schedule using Playwright headless browser
2. **Retrieves** price history from ChromaDB for trend comparison
3. **Analyzes** current vs. historical prices using OpenAI (GPT-4o-mini)
4. **Stores** each price data point in ChromaDB with metadata
5. **Alerts** via email when the AI detects a significant price drop (>5%) or all-time low

## Tech Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Orchestrator | n8n (self-hosted) | Visual workflow engine, scheduling, logic |
| Web Scraper | Node.js + Playwright | Headless browser automation, price extraction |
| AI Engine | OpenAI GPT-4o-mini | Price trend analysis, buy/wait recommendations |
| Database | ChromaDB | Price history storage with vector capabilities |
| Alerting | Gmail SMTP | Email notifications on price drops |
| Infrastructure | Docker Compose | Container orchestration, single-command deployment |

## Key Features

- **Per-domain selector config** — Extensible architecture for adding new e-commerce sites
- **Anti-detection measures** — User agent rotation, randomized delays, browser fingerprint masking
- **JSON-LD fallback** — Extracts prices from structured data when CSS selectors fail
- **Parallel execution** — Storage and alerting run in parallel from the AI analysis node
- **Error resilience** — Retry logic, continue-on-fail, graceful degradation on scrape failures
- **AI decision-making** — LLM determines alert threshold, not hardcoded rules

## Quick Start

### Prerequisites
- Docker & Docker Compose
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

# Verify services
curl http://localhost:5678        # n8n UI
curl http://localhost:8000/api/v2/heartbeat  # ChromaDB
curl http://localhost:3001/health  # Scraper
```

### Configure n8n
1. Open `http://localhost:5678`
2. Import the workflow from `pricewatch-workflow.json`
3. Set up OpenAI credential (Header Auth: `Authorization` / `Bearer sk-...`)
4. Set up SMTP credential for Gmail alerts
5. Create ChromaDB collection and update collection UUID in workflow nodes
6. Activate the workflow

## Project Structure

```
pricewatch/
├── docker-compose.yml              # 3-service container setup
├── .env                            # API keys (not committed)
├── scraper-service/
│   ├── Dockerfile                  # Playwright Docker image
│   ├── package.json
│   ├── server.js                   # Express API (/scrape, /scrape-batch, /health)
│   └── scrapers/
│       └── generic.js              # Per-domain scraping logic with selectors
└── data/                           # Persistent volumes (not committed)
    ├── n8n/                        # n8n workflow data
    └── chromadb/                   # Vector database storage
```

## n8n Workflow

The workflow consists of 10 nodes:

**Schedule Trigger** → **Product List** → **Scrape Price (Playwright)** → **Get Price History** → **Prepare LLM Context** → **AI Price Analysis (OpenAI)** → **Parse AI Response** → **Store in ChromaDB** + **Should Alert?** → **Format Alert** + **Send Email** / **Log (No Alert)**

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
```

## Future Improvements

- Proxy rotation for scraping at scale
- Dashboard for price trend visualization
- Semantic search over price history ("when was X cheapest?")
- CI/CD pipeline with GitHub Actions
- Support for additional e-commerce sites (configurable selector system is ready)
- Slack/Discord webhook notifications

## License

MIT
