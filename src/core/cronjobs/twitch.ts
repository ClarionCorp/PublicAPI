import axios, { Method } from 'axios';
import { appLogger } from '../../plugins/logger';
import { prisma } from '../../plugins/prisma';
import { Token } from '../../../prisma/client';
import { TwitchStreams } from '../../types/streams';
import {
  TextCensor,
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
  asteriskCensorStrategy
} from 'obscenity'

const streamLogger = appLogger('FetchTwitch')

// Main function to fetch streams and update the database
export async function updateTwitch() {
  streamLogger.debug('Updating Streams...')

  // Clear the TwitchStreams table
  try {
    await prisma.twitchStreams.deleteMany()
    // streamLogger.info(`Cleared 'TwitchStreams' table`)
  } catch (error) {
    streamLogger.error(`Error clearing 'TwitchStreams' table`, error)
    return;
  }

  // Fetch stream data from the Twitch API
  const fetched = await twitchClient('/streams', 'GET', { game_id: '1600495710', first: 30 });
  const streams: TwitchStreams[] = fetched.data;

  // Filter live streams and prepare data for database insertion
  const liveStreams = streams.filter((stream) => stream.type === 'live')

  // Build matcher with the English blacklist and recommended transforms
  const matcher = new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
  })

  // Use the asterisk censor strategy (e.g. `fuck` -> `****`)
  const censor = new TextCensor().setStrategy(asteriskCensorStrategy())

  // Clean all stream titles (if not mature)
  const pgStreams = liveStreams.map((stream) => {
    const matches = matcher.getAllMatches(stream.title)
    const cleanTitle = stream.is_mature
      ? stream.title
      : censor.applyTo(stream.title, matches)

    return {
      ...stream,
      title: cleanTitle,
    }
  })

  // Insert live streams into the database
  for (const stream of pgStreams) {
    try {
      // Replace {width} and {height} placeholders with 1280 and 720
      const thumbnailUrl = stream.thumbnail_url
        .replace('{width}', '1280')
        .replace('{height}', '720')
  
      await prisma.twitchStreams.create({
        data: {
          username: stream.user_name,
          title: stream.title,
          viewers: stream.viewer_count,
          thumbnail: thumbnailUrl, // Store the modified thumbnail URL
          startedAt: stream.started_at
        },
      })
      // streamLogger.info(`Inserted stream: ${stream.user_name}`)
    } catch (error) {
      streamLogger.error(`Error inserting stream: ${stream.user_name}`, error)
    }
  }

  streamLogger.debug('Updated Streams!')
}

// Method to get OAuth token and save it to a file
async function updateToken(): Promise<Token | null> {
  streamLogger.info('Fetching new Twitch token...')
  try {
    const { data } = await axios.post(
      'https://id.twitch.tv/oauth2/token',
      null,
      {
        params: {
          client_id: process.env.TWITCH_CLIENT_ID,
          client_secret: process.env.TWITCH_SECRET,
          grant_type: 'client_credentials',
        },
      }
    )
    const token = data.access_token
    const expiresIn = data.expires_in // seconds until token expires
    const tokenExpiresAt = new Date(Date.now() + data.expires_in * 1000)

    // Create or update token storage
    const creds = await prisma.token.upsert({
      where: { service: 'TWITCH' },
      update: { token, expires: tokenExpiresAt, updatedAt: new Date() },
      create: { service: 'TWITCH', token, expires: tokenExpiresAt, updatedAt: new Date() }
    });

    streamLogger.info(`Twitch token fetched successfully, it expires in ${expiresIn} seconds.`)
    return creds;
  } catch (error) {
    streamLogger.error('Error fetching Twitch token!!', error)
    return null;
  }
}

// Ensure token is valid before making requests
async function ensureValidToken(): Promise<Token> {
  const creds = await prisma.token.findFirst({ where: { service: 'TWITCH' }});

  if (!creds || !creds.token || !creds.expires || new Date() >= creds.expires) {
    return await updateToken();
  }

  return creds;
}

export async function twitchClient(subUrl: string, method: Method, params?: any): Promise<any> {
  try {
    const creds = await ensureValidToken();
    const { data } = await axios({
      method,
      url: `https://api.twitch.tv/helix${subUrl}`,
      headers: {
        Authorization: `Bearer ${creds.token}`,
        'Client-Id': process.env.TWITCH_CLIENT_ID || ''
      },
      params
    })

    return data;
  } catch (e) {
    streamLogger.error('Something went wrong while using the Twitch Client!', e);
    return null;
  }
}