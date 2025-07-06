import { appLogger } from "@plugins/logger";
import SteamUser from 'steam-user';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '@plugins/prisma';

const steamLogger = appLogger('Steam');

export default async function steamRefresh() {
  steamLogger.warn('Starting token refresh process...');

  try {
    const username = process.env.STEAM_USERNAME || '';
    const password = process.env.STEAM_PASSWORD || '';
    const appId = 1869590;

    if (!username || !password) {
      throw new Error('Missing Steam credentials in environment variables.');
    }

    const { jwt, refreshToken } = await fetchLoginTokens(username, password, appId);

    await prisma.token.upsert({
      where: { service: 'ODYSSEY' },
      update: { token: jwt, refreshToken, updatedAt: new Date() },
      create: { service: 'ODYSSEY', token: jwt, refreshToken }
    });

  } catch (e) {
    steamLogger.error(e);
  }
}

// Function to fetch login ticket from Steam, and return new Ody Tokens.
async function fetchLoginTokens(username: string, password: string, appId: number): Promise<{ jwt: string; refreshToken: string }> {
  const client = new SteamUser();

  return new Promise((resolve, reject) => {
    client.logOn({ accountName: username, password });

    client.on('loggedOn', async () => {
      steamLogger.info('Successfully logged in to Steam!');
      let sessionTicket: Buffer | null = null;

        try {
          // Check for existing active tickets
          const activeTickets = client.getActiveAuthSessionTickets();
          steamLogger.info('Active Tickets:', activeTickets);

          if (activeTickets.length > 0) {
            // Reuse the first active ticket
            const activeTicket = activeTickets[0];
            steamLogger.info('Reusing active session ticket:', activeTicket);
            const hex = activeTicket.gcToken.toString(16).padStart(16, '0');
            sessionTicket = Buffer.from(hex, 'hex');

          } else {
            // Create a new session ticket if none exist
            const ticketInfo = await client.createAuthSessionTicket(appId);
            sessionTicket = ticketInfo.sessionTicket;
            steamLogger.info('Created new session ticket:', sessionTicket);
          }

          // Encode the session ticket to HEX
          const hexEncodedTicket = sessionTicket.toString('hex').toUpperCase();
          steamLogger.info('Session Ticket (Hex):', hexEncodedTicket);

          // Send ticket to backend
          const tokens = await sendTicketToBackend(hexEncodedTicket);
          resolve(tokens);
      } catch (error) {
          reject(`Error during session ticket process: ${error}`);
      } finally {
          client.logOff();
      }
    });

    client.on('error', (err: Error) => {
        reject(`Steam Client Error: ${err.message}`);
    });
  });
}

// Function to send the ticket to the backend and retrieve JWT and RefreshToken
async function sendTicketToBackend(hexEncodedTicket: string): Promise<{ jwt: string; refreshToken: string }> {
    const requestBody = {
        authSessionTicket: hexEncodedTicket,
        currentGameLanguage: 'english',
    };

    const headers = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'deflate, gzip',
        'User-Agent': 'X-UnrealEngine-Agent',
        'X-Request-ID': uuidv4(),
        'X-App-Session-ID': uuidv4(),
        'X-Odyssey-GameVersion': '4.2.8',
    };

    try {
        const response = await axios.post(
            'https://prometheus-proxy.odysseyinteractive.gg/api/v1/login/steam',
            requestBody,
            { headers }
        );

        const { jwt, refreshToken } = response.data;
        steamLogger.info('Backend Response:', response.data);
        steamLogger.info('JWT:', jwt);
        steamLogger.info('Refresh Token:', refreshToken);

        return { jwt, refreshToken };
    } catch (error: any) {
        if (error.response?.data) {
            steamLogger.error('Backend API Response Error:', JSON.stringify(error.response.data, null, 2));
        }
        throw new Error(`Backend API Error: ${error.response?.data?.error?.message || error.message}`);
    }
}