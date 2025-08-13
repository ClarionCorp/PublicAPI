import { appLogger } from '../../plugins/logger';
import axios from 'axios'
import {
  TextCensor,
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
  asteriskCensorStrategy
} from 'obscenity'
import { sleep } from '../utils';
import { YouTubeStreams } from '@/types/streams';
import { prisma } from '../../plugins/prisma';

const baseURL = 'https://www.googleapis.com/youtube/v3';
const streamLogger = appLogger('FetchTwitch')


// Main function to fetch streams and update the database
export async function updateYouTube() {
  streamLogger.debug('Updating Streams...')

  // Step 1: Clear the YouTubeStreams table
  try {
    await prisma.youTubeStreams.deleteMany()
    // streamLogger.log(`Cleared 'YouTubeStreams' table`)
  } catch (error) {
    streamLogger.error(`Error clearing 'YouTubeStreams' table`, error)
    return
  }

  // Step 2: Fetch stream data from the Google API
  const liveStreams: YouTubeStreams[] = await getVideosForGame()

  // Step 3: Prepare data for database insertion
  const matcher = new RegExpMatcher({
    ...englishDataset.build(),
    ...englishRecommendedTransformers,
  })

  const censor = new TextCensor().setStrategy(asteriskCensorStrategy())

  const pgStreams = liveStreams.map((stream) => {
    const title = stream.snippet.title
    const matches = matcher.getAllMatches(title)
    const cleanTitle = censor.applyTo(title, matches)

    return {
      ...stream,
      snippet: {
        ...stream.snippet,
        title: cleanTitle
      }
    }
  });

  // Step 4: Insert live streams into the database
  for (const item of pgStreams) {
    await sleep(100)
    try {
      const stream = item.snippet
      const thumbnailUrl = stream.thumbnails.medium.url
      const viewerCount = await getViewersForVideo(item.id.videoId);
  
      await prisma.youTubeStreams.create({
        data: {
          videoId: item.id.videoId,
          channel: stream.channelTitle,
          title: stream.title,
          viewers: viewerCount,
          thumbnail: thumbnailUrl,
        },
      })
      // streamLogger.log(`Inserted stream: ${stream.user_name}`)
    } catch (error) {
      streamLogger.error(`Error inserting stream: ${item.snippet.channelTitle}`, error)
    }
  }

  streamLogger.debug('Updated Streams!')
}



// Method to get video data for a specific game. Defaults to streams for OS.
async function getVideosForGame(gameQuery: string = 'Omega+Strikers', type: string = 'live') {
  try {
    const { data } = await axios.get(`${baseURL}/search`, {
      params: {
        part: 'snippet',
        eventType: type,
        type: 'video',
        q: gameQuery,
        videoCategoryId: 20,
        maxResults: 50,
        safeSearch: 'moderate',
        key: process.env.YOUTUBE_API_KEY,
      }
    })
    return data.items
  } catch (error) {
    streamLogger.error('Error fetching streams', error)
    return;
  }
}

async function getViewersForVideo(videoId: string) {
  try {
    const { data } = await axios.get(`${baseURL}/videos`, {
      params: {
        part: 'liveStreamingDetails',
        id: videoId,
        key: process.env.YOUTUBE_API_KEY,
      },
    })

    let viewers = parseInt(data.items[0].liveStreamingDetails.concurrentViewers);
    if (!viewers)
      viewers = 1;

    return viewers
  } catch (error) {
    streamLogger.error('Error fetching viewers', error)
    return;
  }
}
