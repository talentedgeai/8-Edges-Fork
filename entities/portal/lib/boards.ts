// Client-visible board: the task board linked to the client's company, read-only.
// The shape and privacy rules live in lib/boards/client-view.ts, shared with the
// team client hub so both surfaces always render the same thing. This wrapper
// only applies the portal actor's companyScope.

import type { PortalActor } from "@/kernel/identity/portal-auth";
import {
  hasClientBoard,
  getClientBoardView,
  type ClientBoardColumn,
  type ClientBoardCard,
} from "@/entities/company-os";

export type PortalBoardColumn = ClientBoardColumn;
export type PortalBoardCard = ClientBoardCard;
export type PortalBoardData = {
  boardName: string;
  columns: PortalBoardColumn[];
  cards: PortalBoardCard[];
};

export async function hasBoard(actor: PortalActor): Promise<boolean> {
  return hasClientBoard(actor.companyScope);
}

export async function getBoardForClient(actor: PortalActor): Promise<PortalBoardData | null> {
  const view = await getClientBoardView(actor.companyScope);
  if (!view) return null;
  return { boardName: view.boardName, columns: view.columns, cards: view.cards };
}
