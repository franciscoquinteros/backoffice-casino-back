import { TestingModule } from '@nestjs/testing';
import { INestApplication, NotFoundException } from '@nestjs/common';
import { UserController } from '../../src/users/user.controller';
import { UserService } from '../../src/users/user.service';
import { getUserTestModule } from '../mocks/modules';
import { 
  mockUsers, 
  mockUser, 
  mockCreateUserDto, 
  mockUpdateUserDtoComplete, 
  mockUpdatePasswordDto,
  mockUpdatedUser,
  mockNonExistentUserId
} from '../mocks/user';
import { UserResponseDto } from '../../src/users/dto/user-response.dto';

describe('UserController', () => {
  let controller: UserController;
  let userService: UserService;
  let app: INestApplication;

  beforeEach(async () => {
    const module: TestingModule = await getUserTestModule();

    controller = module.get<UserController>(UserController);
    userService = module.get<UserService>(UserService);
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('Obtener listado completo de usuarios', () => {
    it('should return an array of users', async () => {
      jest.spyOn(userService, 'findAll').mockResolvedValue(mockUsers);

      const result = await controller.findAll();

      expect(result).toEqual(mockUsers.map(user => new UserResponseDto(user)));
      expect(userService.findAll).toHaveBeenCalledTimes(1);
    });

    it('should return an empty array when no users exist', async () => {
      jest.spyOn(userService, 'findAll').mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual([]);
      expect(userService.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('Creación de usuario', () => {
    it('should create a new user successfully', async () => {
      jest.spyOn(userService, 'create').mockResolvedValue(mockUser);

      const result = await controller.create(mockCreateUserDto);

      expect(result).toEqual(new UserResponseDto(mockUser));
      expect(userService.create).toHaveBeenCalledWith(mockCreateUserDto);
      expect(userService.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('Actualización de usuario', () => {
    it('should update a user successfully', async () => {
      const userId = '1';
      
      jest.spyOn(userService, 'updateUser').mockResolvedValue(mockUpdatedUser);

      const result = await controller.update(userId, mockUpdateUserDtoComplete);

      expect(result).toEqual(new UserResponseDto(mockUpdatedUser));
      expect(userService.updateUser).toHaveBeenCalledWith(
        parseInt(userId), 
        mockUpdateUserDtoComplete
      );
      expect(userService.updateUser).toHaveBeenCalledTimes(1);
    });

    it('should propagate NotFoundException when user does not exist', async () => {
      const nonExistentId = mockNonExistentUserId.toString();
      
      jest.spyOn(userService, 'updateUser').mockRejectedValue(
        new NotFoundException(`Usuario con ID ${nonExistentId} no encontrado`)
      );

      await expect(
        controller.update(nonExistentId, mockUpdateUserDtoComplete)
      ).rejects.toThrow(NotFoundException);
      
      expect(userService.updateUser).toHaveBeenCalledWith(
        parseInt(nonExistentId), 
        mockUpdateUserDtoComplete
      );
    });
  });

  describe('Actualización de contraseña', () => {
    it('should update password successfully', async () => {
      const userId = '1';
      
      jest.spyOn(userService, 'updatePassword').mockResolvedValue(mockUser);

      await controller.updatePassword(userId, mockUpdatePasswordDto);

      expect(userService.updatePassword).toHaveBeenCalledWith(
        parseInt(userId), 
        mockUpdatePasswordDto
      );
      expect(userService.updatePassword).toHaveBeenCalledTimes(1);
    });

    it('should propagate NotFoundException when user does not exist', async () => {
      const nonExistentId = mockNonExistentUserId.toString();
      
      jest.spyOn(userService, 'updatePassword').mockRejectedValue(
        new NotFoundException(`Usuario con ID ${nonExistentId} no encontrado`)
      );

      await expect(
        controller.updatePassword(nonExistentId, mockUpdatePasswordDto)
      ).rejects.toThrow(NotFoundException);
      
      expect(userService.updatePassword).toHaveBeenCalledWith(
        parseInt(nonExistentId), 
        mockUpdatePasswordDto
      );
    });
  });

  describe('Eliminación de usuario', () => {
    it('should remove user successfully', async () => {
      const userId = 1;
      
      jest.spyOn(userService, 'remove').mockResolvedValue(undefined);

      await controller.remove(userId);

      expect(userService.remove).toHaveBeenCalledWith(userId);
      expect(userService.remove).toHaveBeenCalledTimes(1);
    });

    it('should propagate NotFoundException when user does not exist', async () => {
      jest.spyOn(userService, 'remove').mockRejectedValue(
        new NotFoundException(`Usuario con ID ${mockNonExistentUserId} no encontrado`)
      );

      await expect(controller.remove(mockNonExistentUserId)).rejects.toThrow(
        NotFoundException
      );
      
      expect(userService.remove).toHaveBeenCalledWith(mockNonExistentUserId);
      expect(userService.remove).toHaveBeenCalledTimes(1);
    });
  });
});
