import { Prisma, PrismaClient } from "@prisma/client";
import {
  SURVIVOR_V1_RULES,
  survivorEndgamePlacementPoints,
} from "@/lib/survivor/survivor-rules";

type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export async function recomputeSurvivorWeekScores(
  tx: Tx,
  leagueId: string,
  episodeId: string
) {
  const [episode, entries, draftPicks, castawayResults] = await Promise.all([
    tx.episode.findUnique({
      where: { id: episodeId },
      select: {
        id: true,
        survivorMeta: {
          select: {
            isMerge: true,
          },
        },
      },
    }),
    tx.leagueEntry.findMany({
      where: { leagueId },
      select: { id: true },
    }),
    tx.survivorDraftPick.findMany({
      where: { draft: { leagueId } },
      select: {
        leagueEntryId: true,
        castawayId: true,
        castaway: { select: { name: true } },
      },
    }),
    tx.survivorEpisodeCastawayResult.findMany({
      where: { leagueId, episodeId },
      select: {
        castawayId: true,
        survived: true,
        eliminated: true,
        individualImmunityWins: true,
        individualRewardWins: true,
        advantagesFound: true,
        idolsPlayedSuccessfully: true,
        votesReceived: true,
        confessionalLeader: true,
        endgamePlacement: true,
      },
    }),
  ]);

  if (!episode) return;

  const isMergeEpisode = !!episode.survivorMeta?.isMerge;

  await tx.leagueEntryScore.deleteMany({ where: { episodeId } });

  const rosterByEntry = new Map<
    string,
    Array<{ castawayId: string; castawayName: string }>
  >();

  for (const pick of draftPicks) {
    const list = rosterByEntry.get(pick.leagueEntryId) ?? [];
    list.push({ castawayId: pick.castawayId, castawayName: pick.castaway.name });
    rosterByEntry.set(pick.leagueEntryId, list);
  }

  const resultByCastawayId = new Map(
    castawayResults.map((row) => [row.castawayId, row])
  );

  const rows: Prisma.LeagueEntryScoreCreateManyInput[] = [];

  for (const entry of entries) {
    const roster = rosterByEntry.get(entry.id) ?? [];

    let total = new Prisma.Decimal(0);
    const perCastaway: Array<{
      castawayId: string;
      castawayName: string;
      points: {
        survived: number;
        immunity: number;
        reward: number;
        idolFind: number;
        idolPlay: number;
        zeroVotePostMerge: number;
        confessionalLeader: number;
        eliminated: number;
        endgamePlacement: number;
      };
      subtotal: number;
    }> = [];

    for (const castaway of roster) {
      const result = resultByCastawayId.get(castaway.castawayId);

      if (!result) {
        perCastaway.push({
          castawayId: castaway.castawayId,
          castawayName: castaway.castawayName,
          points: {
            survived: 0,
            immunity: 0,
            reward: 0,
            idolFind: 0,
            idolPlay: 0,
            zeroVotePostMerge: 0,
            confessionalLeader: 0,
            eliminated: 0,
            endgamePlacement: 0,
          },
          subtotal: 0,
        });
        continue;
      }

      const points = {
        survived: result.survived ? SURVIVOR_V1_RULES.performance.survived : 0,
        immunity:
          result.individualImmunityWins *
          SURVIVOR_V1_RULES.performance.individualImmunityWin,
        reward:
          result.individualRewardWins *
          SURVIVOR_V1_RULES.performance.individualRewardWin,
        idolFind: result.advantagesFound * SURVIVOR_V1_RULES.performance.idolFind,
        idolPlay:
          result.idolsPlayedSuccessfully *
          SURVIVOR_V1_RULES.performance.idolPlaySuccessful,
        zeroVotePostMerge:
          isMergeEpisode && !result.eliminated && result.votesReceived === 0
            ? SURVIVOR_V1_RULES.performance.zeroVotePostMerge
            : 0,
        confessionalLeader: result.confessionalLeader
          ? SURVIVOR_V1_RULES.performance.confessionalLeader
          : 0,
        eliminated: result.eliminated ? SURVIVOR_V1_RULES.performance.eliminated : 0,
        endgamePlacement: survivorEndgamePlacementPoints(result.endgamePlacement),
      };

      const subtotal =
        points.survived +
        points.immunity +
        points.reward +
        points.idolFind +
        points.idolPlay +
        points.zeroVotePostMerge +
        points.confessionalLeader +
        points.eliminated +
        points.endgamePlacement;

      total = total.add(new Prisma.Decimal(subtotal));

      perCastaway.push({
        castawayId: castaway.castawayId,
        castawayName: castaway.castawayName,
        points,
        subtotal,
      });
    }

    rows.push({
      leagueEntryId: entry.id,
      episodeId,
      points: total,
      breakdown: {
        ruleset: "SURVIVOR_V1_PERFORMANCE",
        isMergeEpisode,
        perCastaway,
        total: Number(total.toString()),
      },
    });
  }

  if (rows.length) {
    await tx.leagueEntryScore.createMany({ data: rows });
  }
}
