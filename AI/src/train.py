"""CLI entrypoint for AI Scheduling demo.

Example:
  python src/train.py --input data/sample_availability.json --output output/schedule.json --required 3
"""
from __future__ import annotations

import argparse
import os

from scheduler import export_schedule, load_staff, solve_schedule


def parse_args() -> argparse.Namespace:
  parser = argparse.ArgumentParser(description="Train/solve staff scheduling")
  parser.add_argument("--input", required=True, help="Path to availability JSON")
  parser.add_argument("--output", required=True, help="Where to write schedule JSON")
  parser.add_argument("--required", type=int, default=3, help="Min staff per slot (default 3)")
  return parser.parse_args()


def main() -> None:
  args = parse_args()
  staff, days, hours = load_staff(args.input)

  result = solve_schedule(
    staff=staff,
    days=days,
    hours=hours,
    required_per_slot=args.required,
  )

  os.makedirs(os.path.dirname(args.output), exist_ok=True)
  export_schedule(result, args.output)

  print("Objective:", result.objective)
  print("Coverage gaps:", len(result.coverage_gaps))
  for sid, hours_worked in result.hours_by_staff.items():
    print(f"Staff {sid}: {hours_worked}h")


if __name__ == "__main__":
  main()
