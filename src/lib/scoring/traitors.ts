// src/lib/scoring/traitors.ts
import { PrismaClient, Prisma } from "@prisma/client";

const SURVIVAL_POINTS = 1;
const SHIELD_POINTS = 5;
const SHOW_TRAITOR_BONUS = 1;

// slot: 1..5
export function traitorsMultiplierForSlot(slot: number): number {
  switch (slot) {
    case 1: return 1.0;
    case 2: return 1.5;
    case 3: return 2.0;
    case 4: return 2.5;
    case 5: return 3.0;
    default: return 1.0;
  }
}

type Tx = Prisma.TransactionClient;

/**
 * Recompute all entry scores for a given TRAITORS episode.
 * Assumes commissioner has already written TraitorsEpisodePlayerResult rows for the episode.
 * Applies MemberEffect rows that cover this episode.
 */
export async function recomputeTraitorsEpisodeScores(
  tx: Tx,
  leagueId: string,
  episodeId: string
) {
  // Load all entries + their traitors picks
  const entries = await tx.leagueEntry.findMany({
    where: { leagueId },
    include: {
      user: { select: { id: true } },
      // For traitors picks we use TraitorsEntryPick
      // NOTE: Prisma will generate this relation name automatically only if you add it to schema.
      // If you don't want back-relations, query TraitorsEntryPick directly below.
    },
  });

  // Preload picks for all entries
  const picks = await tx.traitorsEntryPick.findMany({
    where: { entry: { leagueId } },
  });

  // Preload episode results
  const results = await tx.traitorsEpisodePlayerResult.findMany({
    where: { episodeId },
  });

  const resultByPlayerId = new Map<string, typeof results[number]>();
  for (const r of results) resultByPlayerId.set(r.playerId, r);

  // Load member effects that cover this episode
  const effects = await tx.memberEffect.findMany({
    where: {
      leagueId,
      OR: [
        { startsEpisodeId: episodeId },
        { endsEpisodeId: episodeId },
      ],
    },
  });

  // For “covers episode”, we need the numeric ordering of episodes.
  // Since your Episode has `week` as episode number, use it to resolve ranges.
  const episode = await tx.episode.findUnique({ where: { id: episodeId } });
  if (!episode) throw new Error("Episode not found");

  const allEpisodes = await tx.episode.findMany({
    where: { leagueId },
    select: { id: true, week: true },
  });

  const weekByEpisodeId = new Map(allEpisodes.map(e => [e.id, e.week]));
  const currentWeek = episode.week;

  function effectCoversEpisode(e: (typeof effects)[number]) {
    const startW = weekByEpisodeId.get(e.startsEpisodeId);
    const endW = weekByEpisodeId.get(e.endsEpisodeId);
    if (startW == null || endW == null) return false;
    return startW <= currentWeek && currentWeek <= endW;
  }

  const effectsByMember = new Map<string, (typeof effects)>();
  for (const e of effects) {
    if (!effectCoversEpisode(e)) continue;
    const arr = effectsByMember.get(e.leagueMemberId) ?? [];
    arr.push(e);
    effectsByMember.set(e.leagueMemberId, arr);
  }

  // Map userId -> leagueMemberId (effects are on LeagueMember)
  const members = await tx.leagueMember.findMany({
    where: { leagueId },
    select: { id: true, userId: true },
  });
  const memberIdByUserId = new Map(members.map(m => [m.userId, m.id]));

  // Build picksByEntry
  const picksByEntry = new Map<string, typeof picks>();
  for (const p of picks) {
    const arr = picksByEntry.get(p.entryId) ?? [];
    arr.push(p);
    picksByEntry.set(p.entryId, arr);
  }

  // Delete existing scores for this episode (same pattern as DR recompute)
  await tx.leagueEntryScore.deleteMany({ where: { episodeId } });

  const scoreRows: Prisma.LeagueEntryScoreCreateManyInput[] = [];

  for (const entry of entries) {
    const memberId = memberIdByUserId.get(entry.userId);
    const activeEffects = memberId ? effectsByMember.get(memberId) ?? [] : [];

    const zeroNext = activeEffects.some(e => e.type === "NEXT_EPISODE_ZERO");
    if (zeroNext) {
      scoreRows.push({
        leagueEntryId: entry.id,
        episodeId,
        points: new Prisma.Decimal(0),
        breakdown: {
          reason: "NEXT_EPISODE_ZERO",
          total: 0,
        } as any,
      });
      continue;
    }

    const forceOne = activeEffects.some(e => e.type === "FORCE_MULTIPLIER_ONE");

    const entryPicks = (picksByEntry.get(entry.id) ?? []).slice().sort((a, b) => a.slot - b.slot);

    let baseTotal = 0;
    let shieldTotal = 0;
    let showTraitorTotal = 0;
    let finalTotal = 0;

    const perPick: any[] = [];

    for (const pick of entryPicks) {
      const r = resultByPlayerId.get(pick.playerId);

      // If no result row exists, treat as alive/no shield/no show-traitor.
      const elimination = r?.elimination ?? "NONE";
      const gotShield = r?.gotShield ?? false;
      const isShowTraitor = r?.isShowTraitor ?? false;

      let base = 0;
      let shield = 0;
      let showTraitor = 0;

      if (elimination === "NONE") {
        base = SURVIVAL_POINTS;
        if (gotShield) shield = SHIELD_POINTS;
        if (isShowTraitor) showTraitor = SHOW_TRAITOR_BONUS;
      }

      const raw = base + shield + showTraitor;
      const mult = forceOne ? 1.0 : traitorsMultiplierForSlot(pick.slot);
      const final = raw * mult;

      baseTotal += base;
      shieldTotal += shield;
      showTraitorTotal += showTraitor;
      finalTotal += final;

      perPick.push({
        slot: pick.slot,
        playerId: pick.playerId,
        elimination,
        gotShield,
        isShowTraitor,
        base,
        shield,
        showTraitor,
        multiplier: mult,
        final,
      });
    }

    scoreRows.push({
      leagueEntryId: entry.id,
      episodeId,
      points: new Prisma.Decimal(finalTotal),
      breakdown: {
        baseTotal,
        shieldTotal,
        showTraitorTotal,
        forceMultiplierOne: forceOne,
        perPick,
        total: finalTotal,
      } as any,
    });
  }

  if (scoreRows.length) {
    await tx.leagueEntryScore.createMany({ data: scoreRows });
  }
}
