import pLimit from 'p-limit';
import { Role } from '../../../prisma/client';
import { appLogger } from '../../plugins/logger';
import { prisma } from '../../plugins/prisma';

const logger = appLogger('Roleboard')
const BATCH_SIZE = 500
const CONCURRENCY = 4

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
      const games = s.games ?? 0

      const score = calcScore({
        knockouts: s.knockouts ?? 0,
        scores: s.scores ?? 0,
        assists: s.assists ?? 0,
        saves: s.saves ?? 0,
        mvps: s.mvp ?? 0,
        wins: s.wins ?? 0,
        games,
        rating,
        role: row.role as Role,
      })

      return {
        playerId: row.playerId,
        characterId: row.character,
        role: row.role as Role,
        gamemode: row.gamemode,
        playerScore: score,
        games,
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

  const limit = pLimit(CONCURRENCY)
  logger.info(`Creating entries...`)
  await Promise.all(
    chunk(entries, BATCH_SIZE).map(batch =>
      limit(() => prisma.roleBoard.createMany({ data: batch }))
    )
  )

  logger.info(`RoleBoard Rebuilt: ${entries.length} entries! (${(performance.now() - b4).toFixed(1)}ms)`)
}


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

  if (games === 0) return 0

  const koPG     = knockouts / games
  const scorePG  = scores / games
  const assistPG = assists / games
  const savePG   = saves / games
  const mvpRate  = mvps / games
  const winRate  = wins / games

  let base = 0

  if (role === 'Forward') {
    base =
      scorePG  * 12  +
      koPG     * 4   +
      assistPG * 3   +
      savePG   * 0.4 +  // rewards midfielder saves without inflating scoring forwards
      mvpRate  * 8   +
      winRate  * 5
  } else {
    base =
      savePG   * 0.1  +  // 200 saves/game = 20pts, low coeff, but fair for goalies
      scorePG  * 15   +  // goals as a goalie are extraordinary, but not the focus
      koPG     * 8    +
      assistPG * 3    +
      mvpRate  * 15   +
      winRate  * 5
  }

  // Soft penalty below rating 1400, no bonus above it (unless inactive)
  const smurfDampening = rating === 0 || rating >= 1400
    ? 1.0
    : 0.6 + ((rating - 800) / 600) * 0.4

  // Minimum games guard - push lucky or one-off players to bottom
  const lowGamePenalty = games < 5 ? 0.2 + (games / 5) * 0.3 : 1.0

  // Breakeven at 50 games, capped at 1.5×
  const consistencyMultiplier = Math.min(1.5, Math.log1p(games) / Math.log1p(25))

  return base * smurfDampening * consistencyMultiplier * lowGamePenalty
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}