import { google } from 'googleapis';
import { appLogger } from '../../plugins/logger';
import { prisma } from '../../plugins/prisma';
import data from '../../../googleapis.json';
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
    await prisma.esportsTeamsOnPlayers.deleteMany()
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
  const teams = rows.slice(1).map((row) => ({
    name: row[0]?.trim() || '',
    tag: row[1]?.trim() || '',
  }));
  const tabPath = tab.split(' ').join('/');

  try {
    for (const team of teams) {
      await prisma.esportsTeams.create({
        data: {
          teamId: team.tag,
          teamName: team.name,
          logo: `https://cdn.clarioncorp.net/teams/${tabPath}/${team.tag}.webp`
        },
      });
    }
  } catch (error) {
    teamsLogger.error(`Error filling out eSports Teams!`, error)
  }
}