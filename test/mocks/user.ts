import { CreateUserDto } from '../../src/users/dto/create-user.dto';
import { UpdateUserDto, UserStatus, WithdrawalStatus } from '../../src/users/dto/update-user.dto';
import { UpdatePasswordDto } from '../../src/users/dto/update-password.dto';

// Mock bcrypt para evitar operaciones costosas durante las pruebas
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockImplementation(() => Promise.resolve('hashedPassword')),
  compare: jest.fn().mockImplementation(() => Promise.resolve(true)),
}));

export const mockUserRepository = {
  find: jest.fn(),
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  remove: jest.fn(),
};

export const mockUserService = {
  findAll: jest.fn(),
  findUsersByRole: jest.fn(),
  create: jest.fn(),
  updateUser: jest.fn(),
  updateLastLoginDate: jest.fn(),
  findOne: jest.fn(),
  findByEmail: jest.fn(),
  updatePassword: jest.fn(),
  remove: jest.fn(),
};

export const mockUserController = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  updatePassword: jest.fn(),
  remove: jest.fn(),
};

export const mockUser = {
  id: 1,
  username: 'testuser',
  email: 'test@test.com',
  password: 'hashedPassword',
  role: 'user',
  status: 'active',
  office: 'main_office',
  withdrawal: 'enabled',
  createdAt: new Date(),
  updatedAt: new Date(),
  lastLoginDate: new Date(),
  lastLogoutDate: new Date(),
  phoneNumber: '1234567890',
  description: 'Test user description',
  transactions: [],
  logs: []
};

export const mockUsers = [mockUser];

export const mockCreateUserDto: CreateUserDto = {
  username: 'newuser',
  email: 'new@example.com',
  password: 'password123',
  role: 'user',
  office: 'branch1'
};

export const mockCreateUserDtoWithExistingEmail: CreateUserDto = {
  username: 'existinguser',
  email: 'existing@example.com',
  password: 'password123',
  role: 'user',
  office: 'main_office'
};

export const mockUpdateUserDtoComplete: UpdateUserDto = {
  status: UserStatus.INACTIVE,
  withdrawal: WithdrawalStatus.DISABLED,
  role: 'supervisor',
  office: 'branch2'
};

export const mockUpdateUserDtoPartial: UpdateUserDto = {
  status: UserStatus.INACTIVE
};

export const mockUpdatedUser = { 
  ...mockUser, 
  status: 'inactive', 
  withdrawal: 'disabled', 
  role: 'supervisor', 
  office: 'branch2' 
};

export const mockPartiallyUpdatedUser = { 
  ...mockUser, 
  status: 'inactive' 
};

export const mockUpdatePasswordDto: UpdatePasswordDto = {
  password: 'newSecurePassword123'
};

export const mockNonExistentUserId = 999;

export function getMockUserWithUpdatedLoginDate() {
  const now = new Date();
  return { ...mockUser, lastLoginDate: now };
}