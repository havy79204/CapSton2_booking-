"""Fetch real availability from SQL Server and run scheduler.

Usage example (read-only, writes JSON output):
  python src/db_pipeline.py \
    --conn "Driver={ODBC Driver 18 for SQL Server};Server=localhost;Database=Zota;Trusted_Connection=yes;Encrypt=no" \
    --week-start 2026-02-08 \
    --out output/schedule_from_db.json \
    --required 3

Assumptions:
- Table dbo.Users with columns: UserId, Name, SalonId, RoleKey ('staff').
- Table dbo.StaffAvailability with columns: WeekStartDate (date), StaffId, StartHour, EndHour, SlotsJson (JSON array of booleans, length = 7 * (EndHour-StartHour)).
- Current UI marks slots as BUSY; we invert to get availability (available = not busy && within window).
- This script does NOT write shifts back to the database; it only outputs a schedule JSON. Add your own write-back if desired.
"""
from __future__ import annotations

import argparse
import json
import os
from datetime import date
from typing import Dict, List, Sequence

import pyodbc

from scheduler import StaffAvailability, export_schedule, solve_schedule


def parse_args() -> argparse.Namespace:
  p = argparse.ArgumentParser(description="Run scheduler using real DB availability (read-only)")
  p.add_argument("--conn", required=True, help="ODBC connection string")
  p.add_argument("--week-start", required=True, help="Week start ISO date (Monday) e.g. 2026-02-08")
  p.add_argument("--required", type=int, default=3, help="Min staff per slot (default 3)")
  p.add_argument("--start-hour", type=int, default=9, help="Day start hour (default 9)")
  p.add_argument("--end-hour", type=int, default=18, help="Day end hour (default 18)")
  p.add_argument("--out", required=True, help="Output JSON path")
  return p.parse_args()


def to_hours(start_hour: int, end_hour: int) -> List[int]:
  return list(range(start_hour, end_hour))


def invert_busy_slots(slots: Sequence[bool]) -> List[bool]:
  return [not bool(x) for x in slots]


def reshape_daily(slots: Sequence[bool], hours: Sequence[int]) -> Dict[int, List[int]]:
  hours_per_day = len(hours)
  days = 7
  out: Dict[int, List[int]] = {d: [] for d in range(days)}
  for d in range(days):
    for idx, h in enumerate(hours):
      flat_idx = d * hours_per_day + idx
      if flat_idx < len(slots) and slots[flat_idx]:
        out[d].append(h)
  return out


def fetch_staff_availability(conn_str: str, week_start_iso: str, start_hour: int, end_hour: int) -> List[StaffAvailability]:
  hours = to_hours(start_hour, end_hour)
  conn = pyodbc.connect(conn_str)
  staff_list: List[StaffAvailability] = []
  try:
    staff_rows = conn.execute(
      "SELECT UserId, Name, SalonId FROM dbo.Users WHERE RoleKey = N'staff' AND (Status IS NULL OR Status <> N'disabled')"
    ).fetchall()

    for row in staff_rows:
      sid = str(row.UserId)
      name = row.Name or sid
      avail_row = conn.execute(
        "SELECT TOP 1 StartHour, EndHour, SlotsJson FROM dbo.StaffAvailability WHERE WeekStartDate = ? AND StaffId = ?",
        week_start_iso,
        sid,
      ).fetchone()

      if avail_row:
        start_h = int(avail_row.StartHour or start_hour)
        end_h = int(avail_row.EndHour or end_hour)
        try:
          raw_slots = json.loads(avail_row.SlotsJson or "[]")
        except Exception:
          raw_slots = []
      else:
        start_h, end_h, raw_slots = start_hour, end_hour, []

      window_hours = to_hours(start_h, end_h)
      # Normalize to expected length; pad with False (busy) then invert to availability.
      expected_len = 7 * len(window_hours)
      padded = list(raw_slots)[:expected_len]
      if len(padded) < expected_len:
        padded.extend([False] * (expected_len - len(padded)))

      # UI stores busy=True, so invert to get available=True.
      available_flags = invert_busy_slots(padded)
      daily = reshape_daily(available_flags, window_hours)

      staff_list.append(StaffAvailability(id=sid, name=name, availability=daily))
  finally:
    conn.close()

  return staff_list


def main() -> None:
  args = parse_args()
  week_start_iso = str(args.week_start)
  try:
    date.fromisoformat(week_start_iso)
  except ValueError as e:
    raise SystemExit(f"Invalid week-start date: {week_start_iso}") from e

  staff = fetch_staff_availability(args.conn, week_start_iso, args.start_hour, args.end_hour)
  hours = to_hours(args.start_hour, args.end_hour)
  days = list(range(7))

  if not staff:
    raise SystemExit("No staff found for the given week")

  result = solve_schedule(
    staff=staff,
    days=days,
    hours=hours,
    required_per_slot=args.required,
  )

  os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
  export_schedule(result, args.out)
  print(f"Wrote schedule to {args.out}")
  print("Objective:", result.objective)
  print("Coverage gaps:", len(result.coverage_gaps))
  for sid, hours_worked in result.hours_by_staff.items():
    print(f"Staff {sid}: {hours_worked}h")


if __name__ == "__main__":
  main()
