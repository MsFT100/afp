import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { MatchmakingService } from './matchmaking.service';
import { Match } from './match.entity';
import { User } from '../users/user.entity';
import { WalletsService } from '../wallet/wallet.service';
import { TransactionType } from '../transactions/transaction.entity';
import { In, Repository } from 'typeorm';

describe('MatchmakingService', () => {
  let service: MatchmakingService;
  let matchRepository: jest.Mocked<Partial<Record<keyof Repository<Match>, jest.Mock>>>;
  let playerRepository: jest.Mocked<Partial<Record<keyof Repository<User>, jest.Mock>>>;
  let walletsService: jest.Mocked<Partial<WalletsService>>;

  const winnerId = 'winner-uuid-123';
  const loserId = 'loser-uuid-456';
  const savedMatchId = 'match-uuid-789';

  const mockWinner: User = {
    id: winnerId,
    displayName: 'Winner',
    gamesPlayed: 10,
    gamesWon: 5,
    gamesLost: 5,
    countryCode: null,
  } as unknown as User;

  const mockLoser: User = {
    id: loserId,
    displayName: 'Loser',
    gamesPlayed: 10,
    gamesWon: 5,
    gamesLost: 5,
    countryCode: null,
  } as unknown as User;

  const defaultDto = {
    playerIds: [winnerId, loserId],
    tableName: 'Table 1',
    entryCoins: 100,
    winAmount: 180,
    duration: 300,
    winnerId,
    loserId,
  };

  const savedMatch = {
    id: savedMatchId,
    entryCoins: 100,
    winAmount: 180,
    tableName: 'Table 1',
    duration: 300,
  } as Match;

  beforeEach(async () => {
    matchRepository = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findAndCount: jest.fn(),
      delete: jest.fn(),
    };

    playerRepository = {
      findBy: jest.fn(),
      increment: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue(undefined),
    };

    walletsService = {
      deductBalance: jest.fn().mockResolvedValue(undefined),
      addBalance: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MatchmakingService,
        { provide: getRepositoryToken(Match), useValue: matchRepository },
        { provide: getRepositoryToken(User), useValue: playerRepository },
        { provide: WalletsService, useValue: walletsService },
      ],
    }).compile();

    service = module.get<MatchmakingService>(MatchmakingService);
  });

  describe('recordMatch', () => {
    it('should create a match, update stats, deduct entry fees, and credit the winner', async () => {
      playerRepository.findBy!.mockResolvedValue([mockWinner, mockLoser]);
      matchRepository.create!.mockReturnValue(savedMatch);
      matchRepository.save!.mockResolvedValue(savedMatch);

      const result = await service.recordMatch(defaultDto);

      expect(playerRepository.findBy).toHaveBeenCalledWith({
        id: In([winnerId, loserId]),
      });

      expect(matchRepository.create).toHaveBeenCalledWith({
        tableName: 'Table 1',
        entryCoins: 100,
        winAmount: 180,
        duration: 300,
        metadata: undefined,
        countryCode: undefined,
        players: [mockWinner, mockLoser],
        winner: mockWinner,
        loser: mockLoser,
      });

      expect(matchRepository.save).toHaveBeenCalledWith(savedMatch);

      expect(playerRepository.increment).toHaveBeenCalledTimes(4);
      expect(playerRepository.increment).toHaveBeenCalledWith({ id: winnerId }, 'gamesPlayed', 1);
      expect(playerRepository.increment).toHaveBeenCalledWith({ id: winnerId }, 'gamesWon', 1);
      expect(playerRepository.increment).toHaveBeenCalledWith({ id: loserId }, 'gamesPlayed', 1);
      expect(playerRepository.increment).toHaveBeenCalledWith({ id: loserId }, 'gamesLost', 1);

      expect(walletsService.deductBalance).toHaveBeenCalledTimes(2);
      expect(walletsService.deductBalance).toHaveBeenCalledWith(
        winnerId, 100, TransactionType.TABLE_FEE, `match_${savedMatchId}_winner_deduct`,
      );
      expect(walletsService.deductBalance).toHaveBeenCalledWith(
        loserId, 100, TransactionType.TABLE_FEE, `match_${savedMatchId}_loser_deduct`,
      );

      expect(walletsService.addBalance).toHaveBeenCalledWith(winnerId, 180);

      expect(result).toBe(savedMatch);
    });

    it('should throw NotFoundException when some players are not found', async () => {
      playerRepository.findBy!.mockResolvedValue([mockWinner]);

      await expect(service.recordMatch(defaultDto)).rejects.toThrow(NotFoundException);
      await expect(service.recordMatch(defaultDto)).rejects.toThrow('One or more players not found');

      expect(matchRepository.create).not.toHaveBeenCalled();
      expect(matchRepository.save).not.toHaveBeenCalled();
      expect(walletsService.deductBalance).not.toHaveBeenCalled();
      expect(walletsService.addBalance).not.toHaveBeenCalled();
    });

    it('should handle optional loserId (single-player deduction)', async () => {
      const dtoWithoutLoser = {
        ...defaultDto,
        playerIds: [winnerId],
        loserId: undefined,
      };
      playerRepository.findBy!.mockResolvedValue([mockWinner]);
      matchRepository.create!.mockReturnValue(savedMatch);
      matchRepository.save!.mockResolvedValue(savedMatch);

      await service.recordMatch(dtoWithoutLoser);

      expect(walletsService.deductBalance).toHaveBeenCalledTimes(1);
      expect(walletsService.deductBalance).toHaveBeenCalledWith(
        winnerId, 100, TransactionType.TABLE_FEE, `match_${savedMatchId}_winner_deduct`,
      );
      expect(walletsService.addBalance).toHaveBeenCalledWith(winnerId, 180);
    });

    it('should update countryCode when provided and user has none', async () => {
      const countryCode = 'ZA';
      const dto = { ...defaultDto, countryCode };
      const winnerWithoutCountry = { ...mockWinner, countryCode: null };
      const loserWithoutCountry = { ...mockLoser, countryCode: null };
      playerRepository.findBy!.mockResolvedValue([winnerWithoutCountry, loserWithoutCountry]);
      matchRepository.create!.mockReturnValue(savedMatch);
      matchRepository.save!.mockResolvedValue(savedMatch);

      await service.recordMatch(dto);

      expect(playerRepository.update).toHaveBeenCalledWith(
        { id: winnerId }, { countryCode },
      );
      expect(playerRepository.update).toHaveBeenCalledWith(
        { id: loserId }, { countryCode },
      );
    });

    it('should NOT update countryCode when user already has one', async () => {
      const countryCode = 'ZA';
      const dto = { ...defaultDto, countryCode };
      const winnerWithCountry = { ...mockWinner, countryCode: 'NG' };
      const loserWithCountry = { ...mockLoser, countryCode: 'GH' };
      playerRepository.findBy!.mockResolvedValue([winnerWithCountry, loserWithCountry]);
      matchRepository.create!.mockReturnValue(savedMatch);
      matchRepository.save!.mockResolvedValue(savedMatch);

      await service.recordMatch(dto);

      expect(playerRepository.update).not.toHaveBeenCalled();
    });

    it('should re-throw error when winner deductBalance fails', async () => {
      playerRepository.findBy!.mockResolvedValue([mockWinner, mockLoser]);
      matchRepository.create!.mockReturnValue(savedMatch);
      matchRepository.save!.mockResolvedValue(savedMatch);
      walletsService.deductBalance!.mockRejectedValueOnce(new Error('Insufficient balance'));

      await expect(service.recordMatch(defaultDto)).rejects.toThrow('Insufficient balance');

      expect(walletsService.addBalance).not.toHaveBeenCalled();
    });

    it('should re-throw error when loser deductBalance fails', async () => {
      playerRepository.findBy!.mockResolvedValue([mockWinner, mockLoser]);
      matchRepository.create!.mockReturnValue(savedMatch);
      matchRepository.save!.mockResolvedValue(savedMatch);
      walletsService.deductBalance!
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('Unique constraint violation'));

      await expect(service.recordMatch(defaultDto)).rejects.toThrow('Unique constraint violation');

      expect(walletsService.addBalance).not.toHaveBeenCalled();
    });

    it('should re-throw error when addBalance fails', async () => {
      playerRepository.findBy!.mockResolvedValue([mockWinner, mockLoser]);
      matchRepository.create!.mockReturnValue(savedMatch);
      matchRepository.save!.mockResolvedValue(savedMatch);
      walletsService.deductBalance!.mockResolvedValue(undefined);
      walletsService.addBalance!.mockRejectedValueOnce(new Error('Wallet error'));

      await expect(service.recordMatch(defaultDto)).rejects.toThrow('Wallet error');

      expect(walletsService.deductBalance).toHaveBeenCalledTimes(2);
    });

    it('should use unique references for winner and loser deductions', async () => {
      playerRepository.findBy!.mockResolvedValue([mockWinner, mockLoser]);
      matchRepository.create!.mockReturnValue(savedMatch);
      matchRepository.save!.mockResolvedValue(savedMatch);

      await service.recordMatch(defaultDto);

      const winnerRef = (walletsService.deductBalance as jest.Mock).mock.calls[0][3];
      const loserRef = (walletsService.deductBalance as jest.Mock).mock.calls[1][3];

      expect(winnerRef).toBe(`match_${savedMatchId}_winner_deduct`);
      expect(loserRef).toBe(`match_${savedMatchId}_loser_deduct`);
      expect(winnerRef).not.toBe(loserRef);
    });

    it('should call playerRepository.increment for both players', async () => {
      playerRepository.findBy!.mockResolvedValue([mockWinner, mockLoser]);
      matchRepository.create!.mockReturnValue(savedMatch);
      matchRepository.save!.mockResolvedValue(savedMatch);

      await service.recordMatch(defaultDto);

      expect(playerRepository.increment).toHaveBeenCalledTimes(4);
      expect(playerRepository.increment).toHaveBeenCalledWith({ id: winnerId }, 'gamesPlayed', 1);
      expect(playerRepository.increment).toHaveBeenCalledWith({ id: winnerId }, 'gamesWon', 1);
      expect(playerRepository.increment).toHaveBeenCalledWith({ id: loserId }, 'gamesPlayed', 1);
      expect(playerRepository.increment).toHaveBeenCalledWith({ id: loserId }, 'gamesLost', 1);
    });
  });
});
