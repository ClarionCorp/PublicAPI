import { FastifyPluginAsync } from 'fastify';
import * as cheerio from 'cheerio';
import { Element } from 'domhandler';

const matches: FastifyPluginAsync = async (fastify) => {
  fastify.get('/:username', { preHandler: [fastify.authenticate] }, async (req, reply) => {
    const { username } = req.params as { username: string };

    try {
      // Fetch the player page
      const response = await fetch(`https://stats.omegastrikers.gg/player/${username}`);
      if (!response.ok) {
        return reply.status(response.status).send({ error: 'Failed to fetch player data' });
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Find the match-history div
      const matchHistory = $('.match-history');

      if (matchHistory.length === 0) {
        console.log('No match history found');
        return reply.status(404).send({ error: 'No match history found' });
      }

      // Extract data from each match card
      $('.match-card', matchHistory).each((index: number, element: Element) => {
        const matchCard = $(element);

        // Match result (win/loss)
        const matchResult = matchCard.hasClass('loss') ? 'Loss' : 'Win';
        console.log(`\n=== Match ${index + 1} ===`);
        console.log(`Result: ${matchResult}`);

        // Character played
        const character = matchCard.find('.character-avatar').attr('alt');
        console.log(`Character: ${character}`);

        // Level badge
        const level = matchCard.find('.match-badges .badge').first().text();
        console.log(`Level: ${level}`);

        // Role badge
        const role = matchCard.find('.match-badges .badge').eq(1).text();
        console.log(`Role: ${role}`);

        // Match metadata
        const mode = matchCard.find('.mode-label').text();
        const timeAgo = matchCard.find('.time-ago').text();
        const mapName = matchCard.find('.map-name').text();
        const result = matchCard.find('.result').text();
        const duration = matchCard.find('.duration').text();
        console.log(`Mode: ${mode}`);
        console.log(`Time: ${timeAgo}`);
        console.log(`Map: ${mapName}`);
        console.log(`Result Text: ${result}`);
        console.log(`Duration: ${duration}`);

        // Bans
        const bans: string[] = [];
        matchCard.find('.match-bans img').each((_i: number, img: Element) => {
          bans.push($(img).attr('alt') || '');
        });
        console.log(`Bans: ${bans.join(', ')}`);

        // Stats
        const goals = matchCard.find('.stat-line').eq(0).text().replace('Goals: ', '');
        const assists = matchCard.find('.stat-line').eq(1).text().replace('Assists: ', '');
        const saves = matchCard.find('.stat-line').eq(2).text().replace('Saves: ', '');
        const kos = matchCard.find('.stat-line').eq(3).text().replace('KOs: ', '');
        console.log(`Stats - G: ${goals}, A: ${assists}, S: ${saves}, K: ${kos}`);

        // Average Tier
        const avgTier = matchCard.find('.match-tier .tier-name').text();
        console.log(`Average Tier: ${avgTier}`);

        // Awakenings
        const awakenings: string[] = [];
        matchCard.find('.match-awakenings img').each((_i: number, img: Element) => {
          awakenings.push($(img).attr('alt') || '');
        });
        console.log(`Awakenings: ${awakenings.join(', ')}`);

        // Detailed match table stats (if expanded section exists)
        const detailsTable = matchCard.find('.match-details table tbody tr');
        if (detailsTable.length > 0) {
          console.log('\nDetailed Team Stats:');
          detailsTable.each((i: number, row: Element) => {
            const cols = $(row).find('td');
            const team1Stats = cols.eq(2).text().trim();
            const team2Stats = cols.eq(3).text().trim();
            console.log(`  Player ${i + 1}: Team1 (${team1Stats}) vs Team2 (${team2Stats})`);
          });
        }
      });

    } catch (error) {
      console.error('Error fetching match history:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }

    return reply.status(200).send({ message: 'Check console for match history data' });
  });
};

export default matches;