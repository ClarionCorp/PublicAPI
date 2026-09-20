import { prisma } from '@/plugins/prisma';
import { PlayerObjectType } from '@/types/players';

type Confidence = 'none' | 'low' | 'medium' | 'high';

export type SmurfPrediction = {
  confidence: Confidence,
  signals: {
    youngAccount: boolean,
    lowLevel: boolean,
    abnormalWinrate: boolean,
  },
}

// Works with cached data, usually called after searching (and thus updating) a player anyways
export async function guessIfSmurf(username?: string, cachedPlayer?: PlayerObjectType): Promise<SmurfPrediction> {
  let player: PlayerObjectType;

  if (cachedPlayer) {
    player = cachedPlayer;
  } else {
    player = await prisma.player.findFirst({
      where: { username },
      include: { ratings: true },
    });
  }

  // Set all outcomes to false first
  let youngAccount = false;
  let lowLevel = false;
  let abnormalWinrate = false;

  // Account Age Check
  const oldestRating = player.ratings[player.ratings.length - 1];
  const oneMonthAgo = new Date(); oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  if (new Date(oldestRating.createdAt) > oneMonthAgo) { youngAccount = true };

  // These are checks we can only do if the player has a rating point (played ranked)
  const latestRating = player.ratings[0];
  if (latestRating) {
    // Account Level Check
    if (latestRating.masteryLevel < 30) { lowLevel = true };

    // Abnormal Winrate Check (when paired with either above)
    if (latestRating.games >= 5 && (latestRating.wins / latestRating.games) > 0.85) { abnormalWinrate = true };
  }

  // Conclude findings
  let confidence: Confidence = 'none';

  if (abnormalWinrate && youngAccount && lowLevel) {
    confidence = 'high';
  } else if (abnormalWinrate && (youngAccount || lowLevel)) {
    confidence = 'medium';
  } else if (youngAccount || lowLevel) {
    confidence = 'low';
  }

  return {
    confidence,
    signals: { youngAccount, lowLevel, abnormalWinrate },
  }
}