import pLimit from 'p-limit';
import { Role } from '../../../prisma/client';
import { appLogger } from '../../plugins/logger';
import { prisma } from '../../plugins/prisma';

const logger = appLogger('Roleboard')
const threads = 4

export async function updateRoleBoard() {
  const b4 = performance.now();
  logger.info('Updating RoleBoard...');

  // Aggregate stats across all gamemodes in the DB
  const grouped = await prisma.playerCharacterRating.groupBy({
    by: ['playerId', 'character', 'role', 'gamemode'],
    _sum: {
      games: true,
      assists: true,
      knockouts: true,
      losses: true,
      mvp: true,
      saves: true,
      scores: true,
      wins: true,
    },
  })

  // Fetch all relevant player ratings in one query
  const playerIds = [...new Set(grouped.map(r => r.playerId))]
  const playerRatings = await prisma.playerRating.findMany({
    where: { playerId: { in: playerIds } },
    orderBy: { createdAt: 'desc' },
    distinct: ['playerId'],
    select: { playerId: true, rating: true, rank: true },
  })
  const ratingMap = new Map(playerRatings.map(p => [p.playerId, { rating: p.rating, globalRank: p.rank }]))

  // Compute scores, filter out ineligible entries
  const entries = grouped
    .map(row => {
      const s = row._sum
      const { rating, globalRank } = ratingMap.get(row.playerId) ?? { rating: 800, globalRank: 10001 }

      const score = calcScore({
        knockouts: s.knockouts ?? 0,
        scores: s.scores ?? 0,
        assists: s.assists ?? 0,
        saves: s.saves ?? 0,
        mvps: s.mvp ?? 0,
        wins: s.wins ?? 0,
        games: s.games ?? 0,
        rating,
        role: row.role as Role,
      })

      return {
        playerId: row.playerId,
        characterId: row.character,
        role: row.role as Role,
        gamemode: row.gamemode,
        playerScore: score,
        games: s.games ?? 0,
        knockouts: s.knockouts ?? 0,
        scores: s.scores ?? 0,
        assists: s.assists ?? 0,
        saves: s.saves ?? 0,
        mvps: s.mvp ?? 0,
        wins: s.wins ?? 0,
        losses: s.losses ?? 0,
        rating,
        globalRank
      }
    })
    .filter(e => e.playerScore > 0)

  // Flush and repopulate with concurrent batch writes
  logger.info(`Deleting existing entries...`)
  await prisma.roleBoard.deleteMany()

  const limit = pLimit(threads)
  logger.info(`Creating entries...`)
  await Promise.all(
    chunk(entries, 500).map(batch =>
      limit(() => prisma.roleBoard.createMany({ data: batch }))
    )
  )

  logger.info(`RoleBoard Rebuilt: ${entries.length} entries! (${(performance.now() - b4).toFixed(1)}ms)`)
}


// I wanted to add detailed comments to this section in particular so normal people
// can look at it and provide feedback on what they think should change.
// If you got referred to this page from Discord,
// this is the function you should be looking at.
function calcScore(data: {
  knockouts: number
  scores: number
  assists: number
  saves: number
  mvps: number
  games: number
  wins: number
  rating: number
  role: 'Forward' | 'Goalie'
}): number {
  const { knockouts, scores, assists, saves, mvps, games, wins, rating, role } = data

  // Players with less than 3 games on the character are irrelevant
  // There's just not enough consistent data to rank their performance
  if (games < 3) return 0;

  //  Per-game rates 
  const scorePG  = scores / games;
  const koPG = knockouts / games;
  const assistPG = assists / games;
  const savePG = saves / games;
  const mvpRate = mvps / games;
  const winRate = wins / games;

  //   Per-game quality (linear)
  // Each stat is divided by its single-game "maximum" - the threshold
  // before rare occurrences (Scores: 11, KOs: 10, Assists: 8, Saves: 100).
  // Because players rarely sustain those as long-run averages, realistic per-game
  // rates fall below that, giving the formula a wide spread:
  // a "mid" stat lands around 25–35% of max, and elite averages sit around 50–60%.
  // Linear is intentional here, as sqrt would inflate mid-tier stats.
  const normScorePG = scorePG / 11;
  const normKoPG = koPG / 10;
  const normAssistPG = assistPG / 8;
  const normSavePG = savePG / 100;

  //  Volume (logarithmic)
  // Raw totals give credit for real investment in a character. log1p compresses
  // the scale so that 10x more games yields nowhere near 10x more credit, so
  // high game counts can't bury high-quality players. The denominator (upper-limit
  // rate x 50 games) anchors 1.0 at a natural reference point, keeping the
  // component on the same scale as per-game quality.
  const normScoreVol = Math.log1p(scores) / Math.log1p(11 * 50);
  const normKoVol = Math.log1p(knockouts) / Math.log1p(10 * 50);
  const normAssistVol = Math.log1p(assists) / Math.log1p(8 * 50);
  const normSaveVol = Math.log1p(saves) / Math.log1p(100 * 50);

  //  Role-specific quality + volume
  // Weights reflect what defines a strong player in each role:
  //
  // Forward:
  //   Scores: x5 (primary), KOs: x3, Assists: x2, Saves: x1.5.
  //   Saves included: we need to reward midfielders too.
  //
  // Goalie:
  //   Saves: x5 (primary), KOs: x3, Assists: x2.
  //   Scores included: we need to reward aggressive goalies slightly too.
  //
  // Volume uses the same stat priority but at lower weights (x1.2 / x0.7 / x0.5)
  // so accumulated totals are a secondary signal, not the headline number.
  let pgQuality: number;
  let volume: number;

  if (role === 'Forward') {
    pgQuality = normScorePG * 5 + normKoPG * 3 + normAssistPG * 2 + normSavePG * 1;
    volume = normScoreVol * 1.2 + normKoVol * 0.7 + normAssistVol * 0.5 + normSaveVol * 0.3;
  } else {
    pgQuality = normSavePG * 4 + normKoPG * 3.5 + normAssistPG * 2.5 + normScorePG * 0.5;
    volume = normSaveVol * 1.2 + normKoVol * 0.7 + normAssistVol * 0.5 + normScoreVol * 0.1;
  }

  //  Base Score
  // Four additive components in order of influence (insert stupid mithrix quote here):
  //
  //   1. pgQuality x (1 + winRate)
  //      Overally win rate amplifies per-game quality as a proxy for "how do you
  //      perform in games you win." WR gives a x1.0–x2.0 multiplier, so a
  //      60% WR player scores ~14% more quality than a 40% WR player with
  //      identical per-game stats.
  //
  //   2. volume
  //      Log-compressed totals (see above). Game count matters but can't dominate.
  //
  //   3. winRate x 1.5
  //      Win rate as its own flat term, separate from the quality amplification,
  //      because winning consistently is independently valuable.
  //
  //   4. mvpRate x 1.5
  //      Same weight for both roles; MVP is earned by whoever carried hardest
  //      regardless of position.
  const base =
    pgQuality * (1 + winRate) +                     // 1. Win-amplified per-game quality
    volume +                                        // 2. Log-compressed accumulated totals
    winRate * (role === 'Goalie' ? 3.0 : 1.5) +     // 3. Win rate as a standalone term (higher for goalies)
    mvpRate * (role === 'Goalie' ? 3.5 : 2.5)       // 4. MVP rate

  //  Rating Multiplier
  // Rating is a subtle modifier. The intent is to stop a Silver from outranking
  // a Diamond with equal character stats, without over-rewarding LP grinding.
  // Breakeven is Mid Gold. (Rookie through High Silver are smurf-heavy and
  // not considered reliable representatives of their rank)
  //
  //   Inactive/Unranked (0):  x0.50  - inactive, significant dampening
  //   Rookie         (800):   x0.70
  //   High Rookie   (1000):   x0.76
  //   Bronze        (1100):   x0.79
  //   High Bronze   (1300):   x0.85
  //   Silver        (1400):   x0.88
  //   High Silver   (1600):   x0.94
  //   Gold          (1700):   x0.97
  //   Mid Gold      (1800):   x1.00  - breakeven; no bonus or penalty
  //   Platinum      (2000):   x1.014
  //   Diamond       (2300):   x1.034
  //   Challenger    (2600):   x1.055
  //   Pro League    (3000):   x1.082
  //   ~4000 LP (theoretical 'max'): x1.15 (hard cap)
  const lpMultiplier =
    rating === 0    ? 0.50
    : rating < 800  ? 0.50 + (rating / 800) * 0.10
    : rating < 1800 ? 0.70 + ((rating - 800) / 1000) * 0.30
    : 1.00 + Math.min(0.15, (rating - 1800) / 2200 * 0.15
  );

  //  Very-low-game Penalty
  // A smooth logarithmic ramp that penalises small sample sizes. 8 games at
  // 100% WR shouldn't sit at #1 -- there isn't enough data to call it
  // consistent. The penalty fades to nothing at 20 games (a fair amount).
  //
  //   3 games: x0.09, 5 games: x0.25, 7 games: x0.49
  //   8 games: x0.64, 10 games: x1.00
  const lowGamePenalty = Math.min(1.0, (games / 10) ** 2)

  // Multiply it all together and an additional flat 10
  // to expand the range of points into something like 0-130
  // instead of 0-13. It's really just a styling preference thing
  return base * lpMultiplier * lowGamePenalty * 10
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}