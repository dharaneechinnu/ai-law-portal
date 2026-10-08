# AI Law Firm Intelligence & Matter Management Portal

Local-development prototype. See [TRACKER.md](TRACKER.md) for the feature list and status.

## Prerequisites
- Python 3.11+ and Node 20+
- PostgreSQL with the `pgvector` extension installed

## Backend
```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows (use source .venv/bin/activate on macOS/Linux)
pip install -r requirements.txt
cp ../.env.example .env         # set DATABASE_URL and SECRET_KEY
alembic upgrade head                                  # creates the pgvector extension and all tables
python -m app.seed admin@firm.com 'ChangeMe123' 'Admin'   # roles + first admin
uvicorn app.main:app --reload   # http://localhost:8000/api/health
```

## Frontend
```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

## Configuration
LLM, embedding and eCourts credentials are entered in the Settings page and stored
encrypted in the database. They are never sent to the browser.
