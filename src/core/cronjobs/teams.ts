import { google } from 'googleapis';
import { appLogger } from '../../plugins/logger';
import { prisma } from '../../plugins/prisma';
import path from 'path';

const teamsLogger = appLogger('UpdateTeams');
const masterSheet = '18OruDTGebHcNc79pF0Lsf6grmROFGv2Sn-IM7wsqw6Y'; // This is a public document with no sensitive data, so idc about hard coding it.

const auth = new google.auth.GoogleAuth({
  keyFile: path.resolve(process.cwd(), 'googleapis.json'),
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets('v4');

// Main function to fetch streams and update the database
export async function updateTeams() {
  teamsLogger.info('Updating Teams Data...')

  // Clear the team tables
  try {
    await prisma.esportsPlayers.deleteMany()
    await prisma.esportsTeams.deleteMany()
  } catch (error) {
    teamsLogger.error(`Error clearing teams tables!`, error)
    return;
  }

  // do magic
  const seasons = await fetchTabs();
  for (const season of seasons) {
    await fetchTeamsFromSeason(season);
  }

  teamsLogger.info('Updated Teams!')
}

async function fetchTabs() {
  const meta = await sheets.spreadsheets.get({ auth, spreadsheetId: masterSheet });
  const sheetNames = meta.data.sheets?.map(s => s.properties?.title).filter(Boolean);
  const filtered = sheetNames.filter(name => name !== 'Template');
  return filtered as string[];
}

async function fetchTeamsFromSeason(tab: string) {
  const res = await sheets.spreadsheets.values.get({
    auth,
    spreadsheetId: masterSheet,
    range: `${tab}!A1:I`,
  });
  const rows = res.data.values || [];
  const teams = rows.slice(1).map(row => {
    const name = row[0]?.trim() || '';
    const tag = row[1]?.trim() || '';
  
    // Get all player IDs from columns C to G
    const players = row.slice(2, 7)
      .filter(Boolean) // Skip empty cells
      .map(cell => cell.split(':')[1]?.trim()) // Get part after colon
      .filter(Boolean); // Remove undefined/null
  
    return {
      name,
      tag,
      players,
    };
  });
  const [series, season] = tab.split(' ');

  console.log(JSON.stringify(teams, null, 1));

  try {
    for (const team of teams) {
      // Create the team
      await prisma.esportsTeams.upsert({
        where: { teamName: team.name },
        update: { teamTag: team.tag, logo: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/teams/${series}/${season}/${team.tag}.webp` }, // Always use latest icon for now
        create: {
          teamTag: team.tag,
          teamName: team.name,
          logo: `${process.env.CDN_BASE_URL ?? 'https://cdn.clarioncorp.net'}/teams/${series}/${season}/${team.tag}.webp`
        }
      });

      // Add the players
      for (let playerId of team.players) {
        const playerExists = await prisma.player.findUnique({
          where: { id: playerId }
        });

        await prisma.esportsPlayers.create({ data: {
          userId: playerId,
          teamName: team.name,
          series,
          season,
          ...(playerExists ? { linkedId: playerId } : {}) // fuckin stupid
        }});
      }
    }
  } catch (error) {
    teamsLogger.error(`Error filling out eSports Teams!`, error)
  }
}