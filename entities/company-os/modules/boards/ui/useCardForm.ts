"use client";

import { useState, type TransitionStartFunction } from "react";
import type { useRouter } from "next/navigation";
import type { BoardDetail } from "@/entities/company-os/modules/boards/data";
import { SUBJECT_BACKLOG_ITEM, SUBJECT_COMMITMENT } from "@/entities/company-os/modules/boards/types";
import {
  archiveCard,
  createCard,
  setCardEpic,
  setCardInternal,
  setCardRoadmapItem,
  setCardSprint,
  updateCard,
} from "@/entities/company-os/routes/(dashboard)/boards/[slug]/actions";
import type { Card, Form } from "./board-view-types";

// The card form's state and its four verbs: open an existing card, open a new
// one in a column (pre-set to the active sprint and epic filters), save (up to
// four server actions, retry-safe), and archive. Split out of BoardView (Q3);
// the board keeps the banner and the transition so every drawer shares them.
export function useCardForm({
  board,
  slug,
  isClientBoard,
  sprintFilter,
  epicFilter,
  setBanner,
  router,
  startSaving,
}: {
  board: BoardDetail["board"];
  slug: string;
  isClientBoard: boolean;
  sprintFilter: string;
  epicFilter: string;
  setBanner: (message: string | null) => void;
  router: ReturnType<typeof useRouter>;
  startSaving: TransitionStartFunction;
}) {
  const [form, setForm] = useState<Form | null>(null);

  function openCard(c: Card) {
    setForm({
      id: c.id,
      columnId: c.columnId,
      title: c.title,
      priority: c.priority,
      assigneeId: c.assignee_id ?? "",
      dueDate: c.due_date ?? "",
      humanTokens: c.human_tokens == null ? "" : String(c.human_tokens),
      description: c.description ?? "",
      sprintId: c.sprint_id ?? "",
      origSprintId: c.sprint_id ?? "",
      epicId: c.epic_id ?? "",
      origEpicId: c.epic_id ?? "",
      subjectType: c.subject_type,
      subjectLabel: c.subject_label,
      roadmapItemId: c.subject_type === SUBJECT_BACKLOG_ITEM ? c.subject_id ?? "" : "",
      origRoadmapItemId: c.subject_type === SUBJECT_BACKLOG_ITEM ? c.subject_id ?? "" : "",
      internal: c.internal,
      origInternal: c.internal,
    });
  }

  function openCreate(columnId: string) {
    const preset = sprintFilter !== "all" && sprintFilter !== "backlog" ? sprintFilter : "";
    const epicPreset = epicFilter !== "all" && epicFilter !== "none" ? epicFilter : "";
    setForm({
      id: null,
      columnId,
      title: "",
      priority: "p3",
      assigneeId: "",
      dueDate: "",
      humanTokens: "",
      description: "",
      sprintId: preset,
      origSprintId: "",
      epicId: epicPreset,
      origEpicId: "",
      subjectType: null,
      subjectLabel: null,
      roadmapItemId: "",
      origRoadmapItemId: "",
      internal: false,
      origInternal: false,
    });
  }

  function save() {
    if (!form) return;
    setBanner(null);
    startSaving(async () => {
      // Up to four server actions run in sequence with no transaction across
      // them. Two rules keep a retry safe: (1) every persisted step is folded
      // into the form immediately, so a retry after a mid-way failure only
      // repeats the steps that did not land (and a created card becomes an
      // update, never a second card); (2) any failure re-syncs the board from
      // the server so what the user sees behind the form is the truth.
      const fail = (message: string) => {
        setBanner(message);
        router.refresh();
      };
      let cardId = form.id;
      if (form.id) {
        const r = await updateCard(
          form.id,
          {
            title: form.title,
            description: form.description,
            priority: form.priority,
            assigneeId: form.assigneeId || null,
            dueDate: form.dueDate || null,
            humanTokens: form.humanTokens === "" ? null : Number(form.humanTokens),
          },
          slug,
        );
        if (!r.ok) return fail(r.error);
        if (form.sprintId !== form.origSprintId) {
          const sr = await setCardSprint(form.id, form.sprintId || null, slug);
          if (!sr.ok) return fail(sr.error);
          setForm((f) => (f ? { ...f, origSprintId: f.sprintId } : f));
        }
        if (form.epicId !== form.origEpicId) {
          const er = await setCardEpic(form.id, form.epicId || null, slug);
          if (!er.ok) return setBanner(er.error);
        }
      } else {
        const r = await createCard({
          boardId: board.id,
          columnId: form.columnId,
          title: form.title,
          priority: form.priority,
          assigneeId: form.assigneeId || undefined,
          dueDate: form.dueDate || undefined,
          humanTokens: form.humanTokens === "" ? undefined : Number(form.humanTokens),
          description: form.description || undefined,
          internal: isClientBoard ? form.internal : undefined,
        });
        // createCard returns the id even when a follow-up write inside it
        // failed; the row exists either way, so the form must become an edit.
        if (r.id) {
          const id = r.id;
          setForm((f) => (f ? { ...f, id, origSprintId: "", origRoadmapItemId: "", origInternal: f.internal } : f));
        }
        if (!r.ok) return fail(r.error);
        cardId = r.id ?? null;
        if (form.sprintId && cardId) {
          const sr = await setCardSprint(cardId, form.sprintId, slug);
          if (!sr.ok) return fail(sr.error);
          setForm((f) => (f ? { ...f, origSprintId: f.sprintId } : f));
        }
        if (form.epicId && cardId) {
          const er = await setCardEpic(cardId, form.epicId, slug);
          if (!er.ok) return setBanner(er.error);
        }
      }
      // Roadmap link (client boards, non-commitment cards) if it changed.
      if (isClientBoard && form.subjectType !== SUBJECT_COMMITMENT && cardId && form.roadmapItemId !== form.origRoadmapItemId) {
        const rr = await setCardRoadmapItem(cardId, form.roadmapItemId || null, slug);
        if (!rr.ok) return fail(rr.error);
        setForm((f) => (f ? { ...f, origRoadmapItemId: f.roadmapItemId } : f));
      }
      // Internal flag on existing cards (client boards) if it changed. New cards
      // set it atomically in createCard above, so no client-visible window.
      if (isClientBoard && form.id && form.internal !== form.origInternal) {
        const ir = await setCardInternal(form.id, form.internal, slug);
        if (!ir.ok) return fail(ir.error);
        setForm((f) => (f ? { ...f, origInternal: f.internal } : f));
      }
      setForm(null);
      router.refresh();
    });
  }

  function archive() {
    if (!form?.id) return;
    setBanner(null);
    startSaving(async () => {
      const r = await archiveCard(form.id!, slug);
      if (!r.ok) return setBanner(r.error);
      setForm(null);
      router.refresh();
    });
  }

  return { form, setForm, openCard, openCreate, save, archive };
}
