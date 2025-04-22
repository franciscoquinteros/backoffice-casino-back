import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from '../../src/users/user.service';
import { UserController } from '../../src/users/user.controller';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../src/users/entities/user.entity';
import { mockUserRepository } from './user';

export async function getUserTestModule(): Promise<TestingModule> {
  return await Test.createTestingModule({
    controllers: [UserController],
    providers: [
      UserService,
      {
        provide: getRepositoryToken(User),
        useValue: mockUserRepository,
      },
    ],
  }).compile();
}
