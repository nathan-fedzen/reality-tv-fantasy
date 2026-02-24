import { PrismaClient } from "@prisma/client";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

function decimalToNumber(value: unknown) {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (typeof value === "object" && "toString" in value) {
    return Number((value as { toString: () => string }).toString());
  }
  return 0;
}

export async function survivorEntryCurrencyBalance(
  tx: Tx,
  leagueId: string,
  leagueEntryId: string
) {
  const [scoreSum, txSum] = await Promise.all([
    tx.leagueEntryScore.aggregate({
      where: {
        leagueEntryId,
        leagueEntry: { leagueId },
      },
      _sum: { points: true },
    }),
    tx.survivorPointTransaction.aggregate({
      where: {
        leagueId,
        leagueEntryId,
      },
      _sum: { amount: true },
    }),
  ]);

  return decimalToNumber(scoreSum._sum.points) + decimalToNumber(txSum._sum.amount);
}

export async function survivorEntryBalances(
  tx: Tx,
  leagueId: string,
  leagueEntryIds: string[]
) {
  if (leagueEntryIds.length === 0) return new Map<string, number>();

  const [scores, pointTxs] = await Promise.all([
    tx.leagueEntryScore.groupBy({
      by: ["leagueEntryId"],
      where: {
        leagueEntryId: { in: leagueEntryIds },
        leagueEntry: { leagueId },
      },
      _sum: { points: true },
    }),
    tx.survivorPointTransaction.groupBy({
      by: ["leagueEntryId"],
      where: {
        leagueId,
        leagueEntryId: { in: leagueEntryIds },
      },
      _sum: { amount: true },
    }),
  ]);

  const result = new Map<string, number>();
  for (const id of leagueEntryIds) {
    result.set(id, 0);
  }

  for (const row of scores) {
    result.set(
      row.leagueEntryId,
      (result.get(row.leagueEntryId) ?? 0) + decimalToNumber(row._sum.points)
    );
  }

  for (const row of pointTxs) {
    result.set(
      row.leagueEntryId,
      (result.get(row.leagueEntryId) ?? 0) + decimalToNumber(row._sum.amount)
    );
  }

  return result;
}

