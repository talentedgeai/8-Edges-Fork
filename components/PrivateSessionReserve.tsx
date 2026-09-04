"use client";

import { useMemo, useState } from "react";
import {
  BASE_TEAM_SIZE,
  BASE_PRICE,
  DAY_OPTIONS,
  type DayCount,
  calculateTotal,
} from "@/lib/private-session";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

const LEAD_TIME_DAYS = 14;
const BOOKING_WINDOW_DAYS = 365;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatUsd(amount: number): string {
  return `$${amount.toLocaleString("en-US")}`;
}

export function PrivateSessionReserve() {
  const [days, setDays] = useState<DayCount>(3);
  const [teamSize, setTeamSize] = useState<number>(BASE_TEAM_SIZE);
  const [state, setState] = useState<FormState>({ status: "idle" });

  const total = calculateTotal(days, teamSize);
  const additional = Math.max(0, teamSize - BASE_TEAM_SIZE);

  const { minDate, maxDate } = useMemo(() => {
    const now = new Date();
    const min = new Date(now);
    min.setDate(min.getDate() + LEAD_TIME_DAYS);
    const max = new Date(now);
    max.setDate(max.getDate() + BOOKING_WINDOW_DAYS);
    return { minDate: isoDate(min), maxDate: isoDate(max) };
  }, []);

  function decTeam() {
    setTeamSize((n) => Math.max(BASE_TEAM_SIZE, n - 1));
  }
  function incTeam() {
    setTeamSize((n) => n + 1);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState({ status: "submitting" });

    const formData = new FormData(e.currentTarget);
    const payload = {
      days,
      team_size: teamSize,
      name: String(formData.get("name") || ""),
      email: String(formData.get("email") || ""),
      company: String(formData.get("company") || ""),
      start_date: String(formData.get("start_date") || ""),
      idea: String(formData.get("idea") || ""),
    };

    try {
      const res = await fetch("/api/checkout/saigon-private", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setState({ status: "error", message: data.error || "Could not start checkout." });
        return;
      }
      window.location.href = data.url as string;
    } catch {
      setState({ status: "error", message: "Network error. Please try again." });
    }
  }

  return (
    <div className="site-form-card site-rt-reserve">
      <form onSubmit={handleSubmit} className="site-rt-reserve-form">
        {/* Length */}
        <fieldset className="site-rt-fieldset">
          <legend className="site-rt-reserve-label">How many days</legend>
          <div className="site-rt-day-toggle">
            {DAY_OPTIONS.map((d) => {
              const selected = days === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  aria-pressed={selected}
                  className={`site-rt-day-btn${selected ? " is-active" : ""}`}
                >
                  <span className="site-rt-day-btn-num">{d}</span>
                  <span className="site-rt-day-btn-unit">days</span>
                </button>
              );
            })}
          </div>
          <p className="site-rt-reserve-hint">
            {formatUsd(BASE_PRICE)} for a 3-day retreat, first person. Each extra day is $1,000.
          </p>
        </fieldset>

        {/* Team size */}
        <fieldset className="site-rt-fieldset">
          <legend className="site-rt-reserve-label">How many people</legend>
          <div className="site-rt-stepper">
            <div className="site-rt-stepper-controls">
              <button
                type="button"
                onClick={decTeam}
                disabled={teamSize <= BASE_TEAM_SIZE}
                className="site-rt-stepper-btn"
                aria-label="Decrease team size"
              >
                −
              </button>
              <span className="site-rt-stepper-value">{teamSize}</span>
              <button
                type="button"
                onClick={incTeam}
                className="site-rt-stepper-btn"
                aria-label="Increase team size"
              >
                +
              </button>
            </div>
            <div className="site-rt-stepper-note">
              {additional === 0 ? (
                <>Just you for now</>
              ) : (
                <>+{additional} {additional === 1 ? "person" : "people"} · $1,000 each per day</>
              )}
            </div>
          </div>
        </fieldset>

        {/* Live total */}
        <div className="site-rt-total">
          <div>
            <div className="site-rt-total-label">Total</div>
            <div className="site-rt-total-num">{formatUsd(total)}</div>
          </div>
          <div className="site-rt-total-meta">
            <div>{days} days · {teamSize} {teamSize === 1 ? "person" : "people"}</div>
            <div>Mac Mini, 8 agents and The Polish included</div>
          </div>
        </div>

        {/* Personal details */}
        <div className="site-rt-fields">
          <div className="site-form-row">
            <div className="site-form-group">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" type="text" required autoComplete="name" placeholder="Jordan Pham" />
            </div>
            <div className="site-form-group">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required autoComplete="email" placeholder="jordan@yourcompany.com" />
            </div>
          </div>
          <div className="site-form-group">
            <label htmlFor="company">Company</label>
            <input id="company" name="company" type="text" required autoComplete="organization" placeholder="Your company" />
          </div>
          <div className="site-form-group">
            <label htmlFor="start_date">Start date</label>
            <input id="start_date" name="start_date" type="date" required min={minDate} max={maxDate} />
            <p className="site-rt-reserve-hint">
              Pick the day you arrive. Earliest start is {LEAD_TIME_DAYS} days from today. Your dates
              lock in as soon as payment completes.
            </p>
          </div>
          <div className="site-form-group">
            <label htmlFor="idea">In one sentence, what do you want to build?</label>
            <textarea id="idea" name="idea" placeholder="One sentence is fine." rows={3} required />
          </div>
        </div>

        {state.status === "error" && <p className="site-rt-form-error">{state.message}</p>}

        <div className="site-form-submit">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={state.status === "submitting"}
            style={{ width: "100%", opacity: state.status === "submitting" ? 0.5 : 1 }}
          >
            {state.status === "submitting" ? "Processing…" : `Reserve · ${formatUsd(total)} →`}
          </button>
          <p className="site-rt-reserve-fine">
            Secure checkout via Stripe. Full refund up to 30 days before your start date.
          </p>
          <p className="site-rt-reserve-fine">
            Not ready to commit?{" "}
            <a href="mailto:quan@edge8.ai" className="site-text-link" style={{ display: "inline" }}>Email quan@edge8.ai</a>
          </p>
        </div>
      </form>
    </div>
  );
}
