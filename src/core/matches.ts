import * as cheerio from 'cheerio';
import { Element } from 'domhandler';
import { MatchStatus, Role } from '../../prisma/client';
import { getMapIdFromName, getMapNameFromId } from '../objects/maps';
import { getCharacterIdFromName } from './utils';

export interface PlayerStatData {
  userId: string;
  team: number;
  character: string;
  role: Role;
  awakenings: string[];
  level: number;
  assists: number;
  scores: number;
  saves: number;
  knockouts: number;
  mvp: boolean;
}

export interface MatchData {
  matchUniqueKey: string;
  map: string;
  role: Role;
  mode: string;
  result: MatchStatus;
  duration: number;
  bans: string[];
  avgRank: string;
  playerId: string;
  mvpId: string | null;
  playedAt: Date;
  playerItems: PlayerStatData[];
}

// Parse duration string like "11m 55s" to seconds
export function parseDuration(durationStr: string): number {
  const matches = durationStr.match(/(?:(\d+)m)?\s*(?:(\d+)s)?/);
  if (!matches) return 0;
  const minutes = parseInt(matches[1] || '0', 10);
  const seconds = parseInt(matches[2] || '0', 10);
  return minutes * 60 + seconds;
}

// Parse time ago to approximate date
export function parseTimeAgo(timeAgoStr: string): Date {
  const now = new Date();
  const match = timeAgoStr.match(/(\d+)\s+(second|minute|hour|day|week|month|year)s?\s+ago/i);
  if (!match) return now;

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'second': return new Date(now.getTime() - value * 1000);
    case 'minute': return new Date(now.getTime() - value * 60 * 1000);
    case 'hour': return new Date(now.getTime() - value * 60 * 60 * 1000);
    case 'day': return new Date(now.getTime() - value * 24 * 60 * 60 * 1000);
    case 'week': return new Date(now.getTime() - value * 7 * 24 * 60 * 60 * 1000);
    case 'month': return new Date(now.getTime() - value * 30 * 24 * 60 * 60 * 1000);
    case 'year': return new Date(now.getTime() - value * 365 * 24 * 60 * 60 * 1000);
    default: return now;
  }
}

// Parse the first match card to get identifying data for cache checking
export function parseFirstMatchForCache(html: string): { result: MatchStatus; map: string; duration: number } | null {
  const $ = cheerio.load(html);
  const matchHistory = $('.match-history');

  if (matchHistory.length === 0) {
    return null;
  }

  const firstMatchCard = $('[class^="match-card"]', matchHistory).first();
  if (firstMatchCard.length === 0) {
    return null;
  }

  const mapName = firstMatchCard.find('.map-name').text();
  return {
    result: firstMatchCard.hasClass('loss') ? MatchStatus.DEFEAT : MatchStatus.VICTORY,
    map: getMapIdFromName(mapName) || mapName,
    duration: parseDuration(firstMatchCard.find('.duration').text())
  };
}

// Parse all matches from HTML and return structured data
export function parseMatchHistory(html: string, playerId: string): MatchData[] {
  const $ = cheerio.load(html);
  const matchHistory = $('.match-history');
  const matchDataArray: MatchData[] = [];

  if (matchHistory.length === 0) {
    return matchDataArray;
  }

  // Extract data from each match card (support both old 'match-card' and new 'match-card-{hash}' formats)
  $('[class^="match-card"]', matchHistory).each((index: number, element: Element) => {
    const matchCard = $(element);

    // Match result (win/loss)
    const matchResult = matchCard.hasClass('loss') ? MatchStatus.DEFEAT : MatchStatus.VICTORY;

    // Character played
    const character = matchCard.find('.character-avatar').attr('alt') || 'Unknown';

    // Level badge
    const level = parseInt(matchCard.find('.match-badges .badge').first().text(), 10);

    // Role badge
    const roleText = matchCard.find('.match-badges .badge').eq(1).text();
    const role = roleText === 'Forward' ? Role.Forward : Role.Goalie;

    // Match metadata
    const mode = matchCard.find('.mode-label').text() || 'Ranked';
    const timeAgo = matchCard.find('.time-ago').text();
    const mapName = matchCard.find('.map-name').text();
    const duration = parseDuration(matchCard.find('.duration').text());
    // Offset each match by index * 10 seconds to maintain order (newer matches appear first)
    const playedAt = new Date(parseTimeAgo(timeAgo).getTime() - (index * 10 * 1000));

    // Bans
    const bans: string[] = [];
    matchCard.find('.match-bans img').each((_i: number, img: Element) => {
      bans.push($(img).attr('alt') || '');
    });

    // Average Tier
    const avgTier = matchCard.find('.match-tier .tier-name').text() || 'Unknown';

    // Awakenings
    const awakenings: string[] = [];
    matchCard.find('.match-awakenings img').each((_i: number, img: Element) => {
      awakenings.push($(img).attr('alt') || '');
    });

    // Detailed match table stats
    const playerItems: PlayerStatData[] = [];
    const detailsTable = matchCard.find('.match-details table tbody tr');

    detailsTable.each((_i: number, row: Element) => {
      const cols = $(row).find('td');

      // Team 1 player (badges: Level, Role)
      const team1Char = cols.eq(0).find('img').attr('alt') || 'Unknown';
      const team1Badges = cols.eq(0).find('.badge');
      const team1LevelBadge = team1Badges.filter('[title="Level"]');
      const team1RoleBadge = team1Badges.filter('[title="Role"]');
      const team1MvpBadge = team1Badges.filter('[title="MVP"]');
      const team1Level = parseInt(team1LevelBadge.text().trim(), 10) || 1;
      const team1RoleText = team1RoleBadge.text().trim();
      const team1Role = team1RoleText === 'Forward' ? Role.Forward : Role.Goalie;
      const team1IsMvp = team1MvpBadge.length > 0;
      const team1Awakenings: string[] = [];
      cols.eq(1).find('img').each((_idx: number, img: Element) => {
        team1Awakenings.push($(img).attr('title') || $(img).attr('alt') || '');
      });
      const team1Stats = cols.eq(2).text().trim().split('/');
      const team1UserLink = cols.eq(0).find('a').attr('href') || '';
      const team1UserId = team1UserLink.split('/').pop() || '';

      // Team 2 player (badges can include MVP, so filter by title attribute)
      const team2Char = cols.eq(5).find('img').attr('alt') || 'Unknown';
      const team2Badges = cols.eq(5).find('.badge');
      const team2LevelBadge = team2Badges.filter('[title="Level"]');
      const team2RoleBadge = team2Badges.filter('[title="Role"]');
      const team2MvpBadge = team2Badges.filter('[title="MVP"]');
      const team2Level = parseInt(team2LevelBadge.text().trim(), 10) || 1;
      const team2RoleText = team2RoleBadge.text().trim();
      const team2Role = team2RoleText === 'Forward' ? Role.Forward : Role.Goalie;
      const team2IsMvp = team2MvpBadge.length > 0;
      const team2Awakenings: string[] = [];
      cols.eq(4).find('img').each((_idx: number, img: Element) => {
        team2Awakenings.push($(img).attr('title') || $(img).attr('alt') || '');
      });
      const team2Stats = cols.eq(3).text().trim().split('/');
      const team2UserLink = cols.eq(5).find('a').attr('href') || '';
      const team2UserId = team2UserLink.split('/').pop() || '';

      playerItems.push({
        userId: team1UserId,
        team: 1,
        character: team1Char,
        role: team1Role,
        awakenings: team1Awakenings,
        level: team1Level,
        assists: parseInt(team1Stats[1], 10),
        scores: parseInt(team1Stats[0], 10),
        saves: parseInt(team1Stats[2], 10),
        knockouts: parseInt(team1Stats[3], 10),
        mvp: team1IsMvp,
      });

      playerItems.push({
        userId: team2UserId,
        team: 2,
        character: team2Char,
        role: team2Role,
        awakenings: team2Awakenings,
        level: team2Level,
        assists: parseInt(team2Stats[1], 10),
        scores: parseInt(team2Stats[0], 10),
        saves: parseInt(team2Stats[2], 10),
        knockouts: parseInt(team2Stats[3], 10),
        mvp: team2IsMvp,
      });
    });

    // Find MVP user ID from playerItems
    const mvpPlayer = playerItems.find(item => item.mvp === true);
    const mvpId = mvpPlayer?.userId || null;

    // Create unique match ID based on stable data to avoid duplicates
    const matchUniqueKey = `${playerId}-${character.toLowerCase().replace(/['\s]+/g, '-')}-${matchResult.toLowerCase()}-${mapName.toLowerCase().replace(/['\s]+/g, '-')}-${duration}-${mvpId || 'no-mvp'}`;

    matchDataArray.push({
      matchUniqueKey,
      map: getMapIdFromName(mapName) || mapName,
      role,
      mode,
      result: matchResult,
      duration,
      bans,
      avgRank: avgTier,
      playerId,
      mvpId,
      playedAt,
      playerItems
    });
  });

  return matchDataArray;
}

// Extract all unique user IDs from match data
export function extractUserIds(matchDataArray: MatchData[]): string[] {
  const allUserIds = new Set<string>();
  matchDataArray.forEach(matchData => {
    matchData.playerItems.forEach((item) => {
      if (item.userId) {
        allUserIds.add(item.userId);
      }
    });
  });
  return Array.from(allUserIds);
}

// Check if match history exists in HTML
export function hasMatchHistory(html: string): boolean {
  const $ = cheerio.load(html);
  return $('.match-history').length > 0;
}

// Calculate map stats from matches
export function calculateMapStats(matches: any[], playerId: string, mapId: string) {
  let wins = 0;
  let losses = 0;
  let totalScores = 0;
  let totalAssists = 0;
  let totalSaves = 0;
  let totalKnockouts = 0;
  let totalDuration = 0;
  let mvpCount = 0;
  let forwardGames = 0;
  let goalieGames = 0;
  const characterCounts: Record<string, number> = {};

  for (const match of matches) {
    if (match.result === 'VICTORY') {
      wins++;
    } else {
      losses++;
    }

    totalDuration += match.duration;

    const playerStat = match.playerStats.find((ps: any) => ps.userId === playerId);
    if (playerStat) {
      totalScores += playerStat.scores;
      totalAssists += playerStat.assists;
      totalSaves += playerStat.saves;
      totalKnockouts += playerStat.knockouts;
      if (playerStat.mvp) mvpCount++;

      if (playerStat.role === 'Forward') {
        forwardGames++;
      } else if (playerStat.role === 'Goalie') {
        goalieGames++;
      }

      characterCounts[playerStat.character] = (characterCounts[playerStat.character] || 0) + 1;
    }
  }

  const totalGames = matches.length;
  const winRate = totalGames > 0 ? ((wins / totalGames) * 100) : 0;

  const mostPlayedCharacter = Object.entries(characterCounts)
    .sort((a, b) => b[1] - a[1])[0];

  const avgScores = totalGames > 0 ? totalScores / totalGames : 0;
  const avgAssists = totalGames > 0 ? totalAssists / totalGames : 0;
  const avgSaves = totalGames > 0 ? totalSaves / totalGames : 0;
  const avgKnockouts = totalGames > 0 ? totalKnockouts / totalGames : 0;
  const avgDuration = totalGames > 0 ? totalDuration / totalGames : 0;

  const characterBreakdown = Object.entries(characterCounts).map(([character, games]) => {
    const charMatches = matches.filter((m: any) =>
      m.playerStats.some((ps: any) => ps.userId === playerId && ps.character === character)
    );
    const charWins = charMatches.filter((m: any) => m.result === 'VICTORY').length;
    return {
      character,
      characterId: getCharacterIdFromName(character) || null,
      games,
      wins: charWins,
      losses: games - charWins,
      winRate: games > 0 ? Math.round((charWins / games) * 1000) / 10 : 0
    };
  }).sort((a, b) => b.games - a.games);

  return {
    map: {
      name: getMapNameFromId(mapId) || mapId,
      id: mapId
    },
    stats: {
      games: totalGames,
      wins,
      losses,
      winRate: Math.round(winRate * 10) / 10,
      mvpCount,
      mvpRate: totalGames > 0 ? Math.round((mvpCount / totalGames) * 1000) / 10 : 0,
      averages: {
        scores: Math.round(avgScores * 100) / 100,
        assists: Math.round(avgAssists * 100) / 100,
        saves: Math.round(avgSaves * 100) / 100,
        knockouts: Math.round(avgKnockouts * 100) / 100,
        duration: Math.round(avgDuration)
      },
      totals: {
        scores: totalScores,
        assists: totalAssists,
        saves: totalSaves,
        knockouts: totalKnockouts,
        duration: totalDuration
      },
      roles: {
        forward: forwardGames,
        goalie: goalieGames
      }
    },
    mostPlayedCharacter: mostPlayedCharacter ? {
      character: mostPlayedCharacter[0],
      characterId: getCharacterIdFromName(mostPlayedCharacter[0]) || null,
      games: mostPlayedCharacter[1]
    } : null,
    characterBreakdown
  };
}
