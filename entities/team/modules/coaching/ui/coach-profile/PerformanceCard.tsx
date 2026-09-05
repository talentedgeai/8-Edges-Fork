"use client";

import { ReviewHistoryTable } from "@/entities/team/ui/ReviewHistoryTable";
import type { MemberReviewCycle } from "@/entities/team/lib/reviews-labels";

export function PerformanceCard({ memberName, reviews }: { memberName: string; reviews: MemberReviewCycle[] }) {
  return (
    <section className="admin-card admin-coach-section">
      <div className="admin-card-title">
        Performance reviews{" "}
        <span className="admin-cell-muted">system of record</span>
      </div>
      {reviews.length === 0 ? (
        <div className="admin-hint">
          No review cycles yet for {memberName}. Self-assessments and manager reviews appear here
          once opened.
        </div>
      ) : (
        <>
          <div className="admin-hint">
            Every self-assessment and manager review for {memberName}. Open a row to read both sides.
          </div>
          <ReviewHistoryTable cycles={reviews} />
        </>
      )}
    </section>
  );
}
