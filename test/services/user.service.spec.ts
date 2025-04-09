import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserService } from '../../src/users/user.service';
import { User } from '../../src/users/entities/user.entity';
import { getUserTestModule } from '../mocks/modules';
import {
  mockUser,
  mockUsers,
  mockCreateUserDto,
  mockCreateUserDtoWithExistingEmail,
  mockUpdateUserDtoComplete,
  mockUpdateUserDtoPartial,
  mockUpdatedUser,
  mockUpdatePasswordDto,
  mockNonExistentUserId,
  getMockUserWithUpdatedLoginDate,
} from '../mocks/user';

// Mock bcrypt para evitar operaciones costosas durante las pruebas
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockImplementation(() => Promise.resolve('hashedPassword')),
  compare: jest.fn().mockImplementation(() => Promise.resolve(true)),
}));

describe('Servicio de gestión de usuarios', () => {
  let userService: UserService;
  let userRepository: Repository<User>;

  beforeEach(async () => {
    const app = await getUserTestModule();
    userService = app.get<UserService>(UserService);
    userRepository = app.get<Repository<User>>(getRepositoryToken(User));
    jest.clearAllMocks();
  });

  describe('Obtener listado completo de usuarios', () => {
    it('should return an array of users', async () => {
      jest.spyOn(userRepository, 'find').mockResolvedValue(mockUsers);

      const result = await userService.findAll();

      expect(result).toEqual(mockUsers);
      expect(userRepository.find).toHaveBeenCalledTimes(1);
    });
  });

  describe('Filtrar usuarios por rol y estado activo', () => {
    it('should return users with the specified role and active status', async () => {
      jest.spyOn(userRepository, 'find').mockResolvedValue(mockUsers);

      const result = await userService.findUsersByRole('admin');

      expect(result).toEqual(mockUsers);
      expect(userRepository.find).toHaveBeenCalledWith({
        where: { role: 'admin', status: 'active' },
      });
    });

    it('should return empty array when no users match role criteria', async () => {
      jest.spyOn(userRepository, 'find').mockResolvedValue([]);

      const result = await userService.findUsersByRole('nonexistent');

      expect(result).toEqual([]);
      expect(userRepository.find).toHaveBeenCalledWith({
        where: { role: 'nonexistent', status: 'active' },
      });
    });
  });

  describe('Registro de nuevo usuario con validación de email duplicado', () => {
    it('should create a new user successfully', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      jest
        .spyOn(userRepository, 'create')
        .mockReturnValue({ ...mockCreateUserDto, id: 2 } as User);
      jest.spyOn(userRepository, 'save').mockResolvedValue({
        ...mockCreateUserDto,
        id: 2,
        password: 'hashedPassword',
      } as User);

      const result = await userService.create(mockCreateUserDto);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: mockCreateUserDto.email },
      });
      expect(userRepository.create).toHaveBeenCalledWith({
        ...mockCreateUserDto,
        password: 'hashedPassword',
      });
      expect(userRepository.save).toHaveBeenCalled();
      expect(result.email).toEqual(mockCreateUserDto.email);
      expect(result.password).toEqual('hashedPassword');
    });

    it('should throw ConflictException when email already exists', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue({
        ...mockUser,
        email: mockCreateUserDtoWithExistingEmail.email,
      } as User);

      await expect(
        userService.create(mockCreateUserDtoWithExistingEmail),
      ).rejects.toThrow(ConflictException);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email: mockCreateUserDtoWithExistingEmail.email },
      });
      expect(userRepository.create).not.toHaveBeenCalled();
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('Actualización de campos de usuario con validación de existencia', () => {
    it('should update user fields successfully', async () => {
      const userId = 1;

      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValue({ ...mockUser } as User);
      jest
        .spyOn(userRepository, 'save')
        .mockResolvedValue(mockUpdatedUser as User);

      const result = await userService.updateUser(
        userId,
        mockUpdateUserDtoComplete,
      );

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(result.status).toEqual('inactive');
      expect(result.withdrawal).toEqual('disabled');
      expect(result.role).toEqual('supervisor');
      expect(result.office).toEqual('branch2');
    });

    it('should update only provided fields', async () => {
      const userId = 1;

      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValue({ ...mockUser } as User);
      jest
        .spyOn(userRepository, 'save')
        .mockImplementation((user) => Promise.resolve(user as User));

      const result = await userService.updateUser(
        userId,
        mockUpdateUserDtoPartial,
      );

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(result.status).toEqual('inactive');
      expect(result.role).toEqual(mockUser.role); // No debe cambiar
      expect(result.withdrawal).toEqual(mockUser.withdrawal); // No debe cambiar
      expect(result.office).toEqual(mockUser.office); // No debe cambiar
    });

    it('should throw NotFoundException when user does not exist', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(
        userService.updateUser(mockNonExistentUserId, mockUpdateUserDtoPartial),
      ).rejects.toThrow(NotFoundException);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockNonExistentUserId },
      });
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('Actualización de fecha de último acceso', () => {
    it('should update last login date successfully', async () => {
      const userId = 1;
      const now = new Date();
      jest.spyOn(global, 'Date').mockImplementation(() => now as any);

      const mockUserWithUpdatedLoginDate = getMockUserWithUpdatedLoginDate();

      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValue({ ...mockUser } as User);
      jest
        .spyOn(userRepository, 'save')
        .mockResolvedValue(mockUserWithUpdatedLoginDate as User);

      const result = await userService.updateLastLoginDate(userId);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(result.lastLoginDate).toEqual(now);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(
        userService.updateLastLoginDate(mockNonExistentUserId),
      ).rejects.toThrow(NotFoundException);
      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockNonExistentUserId },
      });
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('Búsqueda de usuario por ID', () => {
    it('should return a user when found by id', async () => {
      const userId = 1;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as User);

      const result = await userService.findOne(userId);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      const result = await userService.findOne(mockNonExistentUserId);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockNonExistentUserId },
      });
      expect(result).toBeNull();
    });
  });

  describe('Búsqueda de usuario por dirección de correo', () => {
    it('should return a user when found by email', async () => {
      const email = 'test@test.com';

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as User);

      const result = await userService.findByEmail(email);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null when email not found', async () => {
      const email = 'nonexistent@test.com';

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      const result = await userService.findByEmail(email);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { email },
      });
      expect(result).toBeNull();
    });
  });

  describe('Cambio de contraseña con cifrado seguro', () => {
    it('should update password successfully', async () => {
      const userId = 1;

      jest
        .spyOn(userRepository, 'findOne')
        .mockResolvedValue({ ...mockUser } as User);
      jest
        .spyOn(userRepository, 'save')
        .mockResolvedValue({ ...mockUser, password: 'hashedPassword' } as User);

      const result = await userService.updatePassword(
        userId,
        mockUpdatePasswordDto,
      );

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(result.password).toEqual('hashedPassword');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(
        userService.updatePassword(
          mockNonExistentUserId,
          mockUpdatePasswordDto,
        ),
      ).rejects.toThrow(NotFoundException);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockNonExistentUserId },
      });
      expect(userRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('Eliminación de usuario con validación previa', () => {
    it('should remove user successfully', async () => {
      const userId = 1;

      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser as User);
      jest.spyOn(userRepository, 'remove').mockResolvedValue({} as User);

      await userService.remove(userId);

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(userRepository.remove).toHaveBeenCalledWith(mockUser);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      await expect(userService.remove(mockNonExistentUserId)).rejects.toThrow(
        NotFoundException,
      );

      expect(userRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockNonExistentUserId },
      });
      expect(userRepository.remove).not.toHaveBeenCalled();
    });
  });
});
