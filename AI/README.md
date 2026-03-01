# AI Scheduling (Python)

Prototype scheduler to auto-assign salon staff shifts from their busy/available calendars.

## Goals
- Input: staff availability (hours they **can** work) per day of week.
- Output: weekly schedule ensuring each slot has at least 3 staff, while keeping staff total hours balanced (minimize max hour gap across staff).

## How it works
- Formulated as a Mixed Integer Program with `pulp`.
- Variables: `assign[staff, day, hour]` ∈ {0,1}.
- Constraints:
  - Assign only if staff is available for that hour.
  - Coverage: sum of assignments per slot ≥ `required_per_slot` (default 3).
  - Fairness: track `max_hours` / `min_hours` across staff; minimize `(max_hours - min_hours)` plus a small penalty for unmet coverage.
- Outputs JSON with the chosen staff for each day/hour plus per-staff hour totals.

## Run with real database data (read-only)
1) Ensure SQL Server ODBC driver is installed (e.g. "ODBC Driver 18 for SQL Server").
2) Install deps:
```bash
python -m venv .venv
.\.venv\Scripts\activate
pip install -r requirements.txt
```
3) Set a connection string that can read your DB (example with Windows auth):
```bash
set CONN="Driver={ODBC Driver 18 for SQL Server};Server=localhost;Database=Zota;Trusted_Connection=yes;Encrypt=no"
```
4) Run the pipeline to pull staff availability for a week and produce a schedule JSON:
```bash
python src/db_pipeline.py --conn %CONN% --week-start 2026-02-08 --out output/schedule_from_db.json --required 3
```

Notes:
- `SlotsJson` in the app is stored as **busy** flags; the pipeline inverts them to availability.
- Script is read-only; import the generated schedule into `StaffShifts` via your own process.

