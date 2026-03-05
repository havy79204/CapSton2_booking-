"""Simple ILP-based staff scheduler.

- Inputs availability per staff/day/hour.
- Ensures minimum coverage per slot.
- Balances workload by minimizing max-hours spread.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Dict, List, Sequence

import pulp


@dataclass
class StaffAvailability:
  id: str
  name: str
  availability: Dict[int, List[int]]  


@dataclass
class ScheduleResult:
  assignments: Dict[str, Dict[int, List[int]]]  
  coverage_gaps: List[Dict[str, int]]
  hours_by_staff: Dict[str, int]
  objective: float


def build_problem(
  staff: Sequence[StaffAvailability],
  days: Sequence[int],
  hours: Sequence[int],
  required_per_slot: int = 3,
) -> tuple[pulp.LpProblem, Dict[tuple[str, int, int], pulp.LpVariable]]:
  prob = pulp.LpProblem("staff_scheduling", pulp.LpMinimize)

  # Decision vars: assign[s, d, h] = 1 if staff s works hour h on day d.
  assign = {
    (s.id, d, h): pulp.LpVariable(f"assign_{s.id}_{d}_{h}", lowBound=0, upBound=1, cat="Binary")
    for s in staff
    for d in days
    for h in hours
  }

  # Availability constraints.
  for s in staff:
    for d in days:
      avail_hours = set(s.availability.get(d, []))
      for h in hours:
        if h not in avail_hours:
          prob += assign[(s.id, d, h)] == 0, f"not_avail_{s.id}_{d}_{h}"

  # Coverage: at least required_per_slot staff per hour slot.
  for d in days:
    for h in hours:
      prob += (
        pulp.lpSum(assign[(s.id, d, h)] for s in staff) >= required_per_slot,
        f"coverage_{d}_{h}"
      )

  # Workload per staff.
  hours_worked = {
    s.id: pulp.lpSum(assign[(s.id, d, h)] for d in days for h in hours)
    for s in staff
  }
  max_hours = pulp.LpVariable("max_hours", lowBound=0)
  min_hours = pulp.LpVariable("min_hours", lowBound=0)

  for s in staff:
    prob += hours_worked[s.id] <= max_hours, f"max_hours_{s.id}"
    prob += hours_worked[s.id] >= min_hours, f"min_hours_{s.id}"

  # Objective: balance hours and keep coverage tight.
  # Minimize spread plus small penalty for total hours (to avoid over-scheduling).
  total_hours = pulp.lpSum(hours_worked.values())
  prob += max_hours - min_hours + 0.01 * total_hours

  return prob, assign


def solve_schedule(
  staff: Sequence[StaffAvailability],
  days: Sequence[int],
  hours: Sequence[int],
  required_per_slot: int = 3,
) -> ScheduleResult:
  prob, assign = build_problem(staff, days, hours, required_per_slot)
  prob.solve(pulp.PULP_CBC_CMD(msg=False))

  assignments: Dict[str, Dict[int, List[int]]] = {}
  for s in staff:
    staff_days: Dict[int, List[int]] = {}
    for d in days:
      staff_days[d] = [h for h in hours if assign[(s.id, d, h)].value() > 0.5]
    assignments[s.id] = staff_days

  coverage_gaps: List[Dict[str, int]] = []
  for d in days:
    for h in hours:
      covered = sum(1 for s in staff if h in assignments[s.id][d])
      if covered < required_per_slot:
        coverage_gaps.append({"day": d, "hour": h, "covered": covered})

  hours_by_staff = {
    s.id: sum(len(assignments[s.id][d]) for d in days)
    for s in staff
  }

  objective_val = pulp.value(prob.objective)
  return ScheduleResult(assignments=assignments, coverage_gaps=coverage_gaps, hours_by_staff=hours_by_staff, objective=objective_val)


def load_staff(file_path: str) -> tuple[List[StaffAvailability], List[int], List[int]]:
  with open(file_path, "r", encoding="utf-8") as f:
    data = json.load(f)

  hours = list(range(int(data.get("hours", {}).get("start", 9)), int(data.get("hours", {}).get("end", 18))))
  days = list(data.get("days", list(range(7))))

  staff_list = []
  for item in data.get("staff", []):
    availability = {int(k): v for k, v in item.get("availability", {}).items()}
    staff_list.append(StaffAvailability(id=item["id"], name=item.get("name", item["id"]), availability=availability))

  return staff_list, days, hours


def export_schedule(result: ScheduleResult, out_path: str) -> None:
  out = {
    "assignments": result.assignments,
    "coverage_gaps": result.coverage_gaps,
    "hours_by_staff": result.hours_by_staff,
    "objective": result.objective,
  }
  with open(out_path, "w", encoding="utf-8") as f:
    json.dump(out, f, indent=2)


__all__ = [
  "StaffAvailability",
  "ScheduleResult",
  "build_problem",
  "solve_schedule",
  "load_staff",
  "export_schedule",
]
