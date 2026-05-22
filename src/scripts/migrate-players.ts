import axios from "axios";
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User, UserRole } from '../users/user.entity';
import { Repository } from 'typeorm';

const TITLE_ID = process.env.PLAYFAB_TITLE_ID || 'YOUR_TITLE_ID';
const SECRET_KEY = process.env.PLAYFAB_SECRET_KEY || 'YOUR_SECRET_KEY';
const SEGMENT_ID = process.env.PLAYFAB_ALL_PLAYERS_SEGMENT_ID || 'YOUR_ALL_PLAYERS_SEGMENT_ID';

async function fetchPlayers(continuationToken: string | null = null) {
  try {
    const res = await axios.post(
      `https://${TITLE_ID}.playfabapi.com/Admin/GetPlayersInSegment`,
      {
        SegmentId: SEGMENT_ID,
        MaxBatchSize: 1000,
        ContinuationToken: continuationToken
      },
      { headers: { 'X-SecretKey': SECRET_KEY } }
    );
    return res.data.data;
  } catch (error: any) {
    console.error('PlayFab API Error:', error.response?.data || error.message || error);
    throw error;
  }
}

async function migratePlayers() {
  // Create application context to reuse TypeORM configuration from AppModule
  const app = await NestFactory.createApplicationContext(AppModule);
  const userRepository = app.get<Repository<User>>(getRepositoryToken(User));

  let token: string | null = null;
  let totalMigrated = 0;

  console.log('Starting migration from PlayFab to Database...');

  try {
    do {
      const { PlayerProfiles, ContinuationToken } = await fetchPlayers(token);
      token = ContinuationToken;

      if (!PlayerProfiles || PlayerProfiles.length === 0) break;

      for (const player of PlayerProfiles) {
        // The User entity requires email, password, and phoneNumber.
        // We generate placeholders here. Adjust this if you have the actual data.
        const email = `${player.PlayerId}@playfab.internal`;
        const password = 'migrated_user_no_password'; 
        const phoneNumber = '0000000000';
        const displayName = player.DisplayName || 'PlayFab Player';

        // Use TypeORM upsert for cleaner syntax and compatibility
        await userRepository.upsert(
          [
            {
              playfabId: player.PlayerId,
              displayName: displayName,
              email: email,
              password: password,
              phoneNumber: phoneNumber,
              role: UserRole.PLAYER,
              createdAt: player.Created ? new Date(player.Created) : new Date(),
              updatedAt: new Date(),
            },
          ],
          ['playfabId'], // Conflict target
        );
      }

      totalMigrated += PlayerProfiles.length;
      console.log(`Migrated batch: ${PlayerProfiles.length}. Total: ${totalMigrated}.`);
    } while (token);

    console.log('Migration completed successfully!');
  } catch (err: any) {
    console.error('Migration failed:', err.message || err);
  } finally {
    await app.close();
  }
}

migratePlayers().catch((err) => {
  console.error('Unhandled migration error:', err);
  process.exit(1);
});