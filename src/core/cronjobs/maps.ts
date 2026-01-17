import { appLogger } from '../../plugins/logger';
import { prisma } from '../../plugins/prisma';
import axios from 'axios';
import * as cheerio from 'cheerio';

const mapsLogger = appLogger('Maps');

export interface MapInfo {
  name: string;
  imageUrl: string;
  imagePath: string;
}

/**
 * Scrapes the map rotation from stats.omegastrikers.gg and updates the database
 * Sets active=true for maps in rotation, active=false for maps not in rotation
 */
export default async function updateMapRotation(): Promise<void> {
  mapsLogger.info('Starting map rotation update...');

  try {
    // Scrape the current map rotation
    const scrapedMaps = await scrapeMapRotation();

    if (scrapedMaps.length === 0) {
      mapsLogger.warn('No maps scraped, skipping database update!');
      return;
    }

    // Get the names of scraped maps for easy lookup
    const scrapedMapNames = new Set(scrapedMaps.map(m => m.name));

    mapsLogger.info(`Processing ${scrapedMaps.length} maps from rotation...`);

    // Upsert each scraped map with active=true
    for (const map of scrapedMaps) {
      // Extract the ID from the image path (e.g., GTD_SummerSplash from /static/img/maps/GTD_SummerSplash.png)
      const mapId = map.imagePath.replace(/^\/static\/img\/maps\//, '').replace(/\.png$/, '');
      const imageUrl = `${process.env.CDN_BASE_URL}/maps/${mapId}.webp`;

      await prisma.maps.upsert({
        where: { name: map.name },
        update: {
          active: true,
          imageUrl: imageUrl,
          updatedAt: new Date()
        },
        create: {
          id: mapId,
          name: map.name,
          imageUrl: imageUrl,
          active: true,
          rotatedAt: new Date()
        }
      });

      mapsLogger.debug(`Upserted map: ${map.name} (active=true)`);
    }

    // Set active=false for maps not in the current rotation
    const deactivated = await prisma.maps.updateMany({
      where: {
        name: {
          notIn: Array.from(scrapedMapNames)
        },
        active: true
      },
      data: {
        active: false,
        updatedAt: new Date()
      }
    });

    if (deactivated.count > 0) {
      mapsLogger.info(`Deactivated ${deactivated.count} map(s) no longer in rotation`);
    }

    mapsLogger.info('Map rotation update completed successfully!');

  } catch (error: any) {
    mapsLogger.error('Failed to update map rotation:', error.message);
    throw error;
  }
}

/**
 * Scrapes the map rotation from stats.omegastrikers.gg
 * @returns Array of map information
 */
async function scrapeMapRotation(): Promise<MapInfo[]> {
  try {

    // Fetch the HTML content
    const response = await axios.get(`https://stats.omegastrikers.gg/map_rotation`);

    // Load HTML into cheerio
    const $ = cheerio.load(response.data);

    // Extract map information from the HTML structure
    const maps: MapInfo[] = [];

    $('.map-card').each((_index, element) => {
      const mapName = $(element).find('.map-name').text().trim();
      const imageUrl = $(element).find('.map-image').attr('src') || '';
      const imagePath = $(element).find('.map-image').attr('src') || '';

      if (mapName) {
        maps.push({
          name: mapName,
          imageUrl: imageUrl.startsWith('http') ? imageUrl : `https://stats.omegastrikers.gg${imageUrl}`,
          imagePath
        });
      }
    });

    if (maps.length === 0) {
      mapsLogger.warn('No maps found in the rotation page');
    } else {
      mapsLogger.info(`Successfully scraped ${maps.length} maps from rotation`);
    }

    return maps;

  } catch (error: any) {
    if (error.response) {
      mapsLogger.error(`HTTP Error: ${error.response.status} - ${error.response.statusText}`);
    } else if (error.request) {
      mapsLogger.error('No response received from server');
    } else {
      mapsLogger.error(`Error: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get just the map names as a simple string array
 * @returns Array of map name strings
 */
export async function getMapNames(): Promise<string[]> {
  const maps = await scrapeMapRotation();
  return maps.map(map => map.name);
}

/**
 * Get active maps from the database
 * @returns Array of active maps
 */
export async function getActiveMaps() {
  return await prisma.maps.findMany({
    where: { active: true },
    orderBy: { name: 'asc' }
  });
}
