import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from './users/user.entity';
import { Wallet } from './wallet/wallet.entity';
import { Transaction } from './transactions/transaction.entity';

const AWS = require('aws-sdk');

AWS.config.update({
  region: 'us-east-1',
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const region =
          configService.get<string>('AWS_REGION') || 'us-east-1';

        const username =
          configService.get<string>('PGUSER') || 'postgres';

        const database =
          configService.get<string>('PGDATABASE') || 'postgres';

        const port =
          configService.get<number>('PGPORT') || 5432;

        // WRITER ENDPOINT
        const writerHost =
          'afp.cluster-c0rcmqc0kwek.us-east-1.rds.amazonaws.com';

        // READER ENDPOINT
        const readerHost =
          'afp.cluster-ro-c0rcmqc0kwek.us-east-1.rds.amazonaws.com';

        // Generate IAM auth tokens
        const writerSigner = new AWS.RDS.Signer({
          region,
          hostname: writerHost,
          port,
          username,
        });

        const readerSigner = new AWS.RDS.Signer({
          region,
          hostname: readerHost,
          port,
          username,
        });

        const writerPassword = writerSigner.getAuthToken({});
        const readerPassword = readerSigner.getAuthToken({});

        return {
          type: 'postgres',

          replication: {
            master: {
              host: writerHost,
              port,
              username,
              password: writerPassword,
              database,
            },

            slaves: [
              {
                host: readerHost,
                port,
                username,
                password: readerPassword,
                database,
              },
            ],
          },

          entities: [User, Wallet, Transaction],

          synchronize:
            configService.get<string>('NODE_ENV') !== 'production',

          ssl: {
            rejectUnauthorized: false,
          },
        };
      },
    }),
  ],
})
export class AppModule {}