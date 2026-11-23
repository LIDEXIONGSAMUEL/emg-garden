"""Render one verified EMG Garden trial from audit:recording --trial output."""

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
from matplotlib.ticker import PercentFormatter


def show_gaps(times, values, max_step):
    gaps = np.flatnonzero(np.diff(times) > max_step) + 1
    return np.insert(times, gaps, times[gaps]), np.insert(values, gaps, np.nan)


def plot_trial(audit, output):
    trial = audit["trialTrace"]
    sample_rate = audit["sampleRate"]
    origin = trial["contractStartMs"]
    hold_start = (trial["holdStartMs"] - origin) / 1000
    rest_start = (trial["restStartMs"] - origin) / 1000
    duration = (trial["endMs"] - origin) / 1000
    raw = trial["raw"]
    raw_times = np.array([s["index"] for s in raw]) / sample_rate - origin / 1000
    measured_counts = all("adcCount" in s for s in raw)
    field = "adcCount" if measured_counts else "voltage"
    raw_values = np.array([s[field] for s in raw], dtype=float)
    windows = trial["windows"]
    window_times = np.array([w["time"] for w in windows]) / 1000 - origin / 1000
    activity = np.array([
        w["activity"] if w["quality"] == "good" else np.nan for w in windows
    ], dtype=float)

    source = {
        "simulation": "SIMULATION · generated signal",
        "serial": "SERIAL · declared device recording",
    }.get(audit["originalSource"], "Recording source unverified")
    validity = "valid scored trial" if trial["valid"] else "invalid trial · excluded from scores"
    tag = f"{source}   |   {trial['block'].capitalize()}   |   {validity}"

    fig, (raw_ax, activity_ax) = plt.subplots(2, sharex=True, figsize=(9.1, 5.0))
    fig.subplots_adjust(left=.14, right=.97, bottom=.17, top=.72, hspace=.32)
    fig.suptitle(f"EMG Garden   /   Round {trial['round']}, trial {trial['trial']}",
                 x=.14, y=.97, ha="left", color="#163938", fontsize=19, fontweight="bold")
    fig.text(.14, .875, tag, color="#466056", fontsize=10)

    for ax in (raw_ax, activity_ax):
        ax.set_xlim(0, duration)
        ax.set_axisbelow(True)
        ax.grid(axis="y", color="#D8E1DF", linewidth=.7)
        ax.spines[["top", "right"]].set_visible(False)
        ax.axvspan(0, hold_start, color="#DDEAE9", alpha=.5)
        ax.axvspan(hold_start, rest_start, color="#B8DCCB", alpha=.5)
        ax.axvspan(rest_start, duration, color="#EDF0E4", alpha=.55)
        ax.axvline(hold_start, color="#618480", linewidth=.8)
        ax.axvline(rest_start, color="#618480", linewidth=.8)

    for left, right, label in (
        (0, hold_start, "Squeeze"),
        (hold_start, rest_start, "Scored hold"),
        (rest_start, duration, "Relax"),
    ):
        raw_ax.text((left + right) / 2, 1.10, label, ha="center",
                    transform=raw_ax.get_xaxis_transform(), color="#163938")

    raw_ax.plot(*show_gaps(raw_times, raw_values, 1.5 / sample_rate),
                color="#35586A", linewidth=.48)
    raw_ax.set_ylabel("Raw ADC (counts)" if measured_counts else "Raw module output (V)")
    activity_ax.plot(*show_gaps(window_times, activity, .075),
                     color="#17675B", linewidth=1.55)
    target, tolerance = trial["target"], trial["tolerance"]
    activity_ax.fill_between([hold_start, rest_start], target - tolerance,
                             target + tolerance, color="#7CBEA1", alpha=.42)
    activity_ax.hlines(target, hold_start, rest_start, color="#346B5A",
                       linewidth=1, linestyles="dashed")
    activity_ax.set_ylabel("Normalized RMS")
    activity_ax.yaxis.set_major_formatter(PercentFormatter(xmax=1))
    activity_ax.set_xlabel("Time since squeeze cue (s)")
    fig.text(.14, .042, f"Target {target:.0%} ± {tolerance:.0%} in scored hold. "
             "Activity uses the window endpoint used by live scoring.",
             color="#466056", fontsize=9)
    fig.savefig(output, dpi=210, facecolor="white")
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audit_json", type=Path)
    parser.add_argument("output_png", type=Path)
    args = parser.parse_args()
    if args.output_png.suffix.lower() != ".png":
        parser.error("Use a .png output filename.")
    if args.output_png.exists():
        parser.error("Choose a new output filename.")
    audit = json.loads(args.audit_json.read_text(encoding="utf-8-sig"))
    if "trialTrace" not in audit:
        parser.error("Generate audit JSON with --trial ROUND:TRIAL first.")
    plot_trial(audit, args.output_png)


if __name__ == "__main__":
    main()
