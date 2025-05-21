import {
  Body, Controller, Get, Post, Param, Patch, Delete,
  UseInterceptors, ClassSerializerInterceptor, HttpCode, HttpStatus,
  Query, NotFoundException, UseGuards, // <-- Importa UseGuards
  Req, ForbiddenException, ParseIntPipe, BadRequestException // <-- Importa Req, ForbiddenException, ParseIntPipe, BadRequestException
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBearerAuth, ApiParam } from '@nestjs/swagger'; // <-- Importa ApiBearerAuth, ApiParam
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'; // <-- Importa tu Guard
import { RolesGuard } from '../auth/guards/roles.guard'; // <-- Importa RolesGuard
import { Roles } from '../auth/decorators/roles.decorator'; // <-- Importa Roles
import { Request } from 'express'; // Importa Request

// Interfaz para el request con usuario (igual que en TransactionsController)
interface AuthenticatedUser {
  id: string | number;
  office: string; // <-- Usa 'office' consistentemente
  role?: string; // Añade role si lo necesitas para lógica admin
}
interface RequestWithUser extends Request {
  user?: AuthenticatedUser;
}
// Fin interfaz

@ApiTags('Users')
@Controller('users')
@UseInterceptors(ClassSerializerInterceptor) // Excluye @Password() en respuestas
@UseGuards(JwtAuthGuard, RolesGuard) // <-- Añade RolesGuard
@ApiBearerAuth()         // <-- Documenta Auth para Swagger
export class UserController {
  constructor(
    private readonly userService: UserService
  ) { }

  // IMPORTANTE: Colocamos el endpoint 'all' antes que otros endpoints con parámetros
  // para evitar que NestJS interprete 'all' como un parámetro
  @Get('all')
  @ApiOperation({ summary: 'Get all users from all offices (superadmin only)' })
  @ApiResponse({ status: 200, description: 'List of all users in the system', type: [UserResponseDto] })
  @ApiResponse({ status: 401, description: 'Unauthorized - Invalid or missing token' })
  @ApiResponse({ status: 403, description: 'Forbidden - User is not a superadmin' })
  async getAllUsers(
    @Req() request: RequestWithUser
  ): Promise<UserResponseDto[]> {
    // Verificar si el usuario es superadmin
    const user = request.user;
    console.log('GET /users/all - Usuario autenticado:', user);

    if (!user) {
      console.error('GET /users/all - No hay usuario autenticado');
      throw new ForbiddenException('Usuario no autenticado');
    }

    if (user.role !== 'superadmin') {
      console.error(`GET /users/all - Usuario ${user.id} con rol ${user.role} intentó acceder a todos los usuarios`);
      throw new ForbiddenException('Sólo los superadmins pueden acceder a todos los usuarios');
    }

    console.log(`[UserController] getAllUsers: Obteniendo todos los usuarios para superadmin ${user.id}`);
    const users = await this.userService.findAll();
    console.log(`Se encontraron ${users.length} usuarios en total`);
    return users.map(user => new UserResponseDto(user));
  }

  // check-status podría quedar fuera del guard si es necesario que sea público
  // Si no, quitar esta línea y hereda el guard de la clase.
  // @UseGuards() // Quita o ajusta guard si este endpoint es diferente
  @Get('check-status')
  @ApiOperation({ summary: 'Check user status by email (Public?)' })
  // ... (resto de decoradores de check-status) ...
  async checkStatus(@Query('email') email: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) { throw new NotFoundException('User not found'); }
    return { status: user.status || 'active' };
  }

  @Post()
  @Roles('admin', 'superadmin')
  @ApiOperation({ summary: 'Create a new user (restricted by office)' })
  @ApiResponse({ status: 201, description: 'User created', type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 403, description: 'Forbidden' }) // Si no tiene permiso para crear
  async create(
    // Ya no necesitamos @Req request: RequestWithUser aquí si no validamos vs creator.office
    @Body() createUserDto: CreateUserDto
  ): Promise<UserResponseDto> {
    // La validación de si el DTO contiene 'office' y otros campos requeridos
    // se delega al ValidationPipe (si usas) o al servicio.
    // Ya NO comparamos con la oficina del usuario creador.
    console.log(`Creating user with data from request body:`, createUserDto);

    // Llama directamente al servicio con el DTO recibido del frontend
    const user = await this.userService.create(createUserDto);

    return new UserResponseDto(user);
  }

  @Get()
  @Roles('operador', 'encargado', 'admin', 'superadmin')
  @ApiOperation({ summary: 'Get users (filtered by user office)' })
  @ApiResponse({ status: 200, description: 'List of users for the office', type: [UserResponseDto] })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async findAll(@Req() request: RequestWithUser): Promise<UserResponseDto[]> {
    const user = request.user;
    if (!user?.office) { throw new ForbiddenException("User office information missing."); }

    let users;
    console.log(`Fetching users for office: ${user.office}`);
    users = await this.userService.findAllByOffice(user.office);

    return users.map(user => new UserResponseDto(user));
  }

  // GET /users/:id - Podrías necesitar un endpoint para buscar por ID, con autorización
  @Get(':id')
  @ApiOperation({ summary: 'Get a specific user by ID (if in same office)' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Not Found' })
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestWithUser
  ): Promise<UserResponseDto> {
    const requestingUser = request.user;
    if (!requestingUser?.office) { throw new ForbiddenException("User office missing."); }

    const targetUser = await this.userService.findOne(id);
    if (!targetUser) { throw new NotFoundException(`User with ID ${id} not found`); }

    // Autorización: ¿Está el usuario solicitado en la misma oficina que quien pregunta? (O es admin?)
    if (targetUser.office !== requestingUser.office && requestingUser.role !== 'superadmin') {
      throw new ForbiddenException("Cannot access users from other offices.");
    }

    return new UserResponseDto(targetUser);
  }


  @Patch(':id')
  @ApiOperation({ summary: 'Update a user (restricted by office)' })
  @ApiResponse({ status: 200, description: 'User updated', type: UserResponseDto })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async update(
    @Param('id', ParseIntPipe) id: number, // Usa ParseIntPipe si ID es numérico
    @Body() updateUserDto: UpdateUserDto,
    @Req() request: RequestWithUser // Necesitamos saber quién actualiza
  ): Promise<UserResponseDto> {
    const requestingUser = request.user;
    if (!requestingUser?.office) { throw new ForbiddenException("User office missing."); }

    // 1. Busca el usuario que se quiere actualizar
    const targetUser = await this.userService.findOne(id);
    if (!targetUser) { throw new NotFoundException(`User with ID ${id} not found`); }

    // 2. Autorización: ¿El usuario que actualiza es de la misma oficina que el usuario a actualizar?
    //    (O es admin, o quizás un usuario solo puede actualizarse a sí mismo - añade lógica según necesites)
    if (targetUser.office !== requestingUser.office && requestingUser.role !== 'superadmin' && requestingUser.id !== targetUser.id) {
      console.warn(`Forbidden: User ${requestingUser.id} (Office: ${requestingUser.office}) attempted to update user ${id} from office ${targetUser.office}.`);
      throw new ForbiddenException("Cannot update users from other offices.");
    }

    // Cuidado extra si se intenta cambiar la oficina
    if (updateUserDto.office && updateUserDto.office !== targetUser.office && requestingUser.role !== 'superadmin') {
      throw new ForbiddenException("Insufficient permissions to change user's office.");
    }


    // 3. Si está autorizado, llama al servicio para actualizar
    const updatedUser = await this.userService.updateUser(id, updateUserDto);
    return new UserResponseDto(updatedUser);
  }

  // Aplicar lógica de autorización similar a updatePassword y remove
  @Patch(':id/password')
  @ApiOperation({ summary: 'Update user password (restricted)' })
  // ... ApiResponses ...
  async updatePassword(
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePasswordDto: UpdatePasswordDto,
    @Req() request: RequestWithUser
  ): Promise<void> {
    const requestingUser = request.user;
    if (!requestingUser?.office) { throw new ForbiddenException("User office missing."); }

    const targetUser = await this.userService.findOne(id);
    if (!targetUser) { throw new NotFoundException(`User with ID ${id} not found`); }

    // Autorización (ej: misma oficina o es el propio usuario)
    if (targetUser.office !== requestingUser.office && targetUser.id !== requestingUser.id && requestingUser.role !== 'superadmin') {
      throw new ForbiddenException("Cannot change password for this user.");
    }

    await this.userService.updatePassword(id, updatePasswordDto);
  }

  @Delete(':id')
  @Roles('admin', 'superadmin')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a user (restricted by office, except for superadmin)' })
  // ... ApiResponses ...
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: RequestWithUser
  ): Promise<void> {
    console.log('==== DELETE USER DEBUG ====');
    console.log('1. Delete user request received for ID:', id);
    console.log('2. Request headers:', request.headers);

    const requestingUser = request.user;
    console.log('3. Requesting user object:', requestingUser);

    if (!requestingUser?.office) {
      console.log('4a. ERROR: User office missing');
      throw new ForbiddenException("User office missing.");
    }

    console.log('4b. Requesting user has office:', requestingUser.office);
    console.log('5. Requesting user role:', requestingUser.role);

    try {
      const targetUser = await this.userService.findOne(id);
      console.log('6. Target user found:', targetUser);

      if (!targetUser) {
        console.log('7a. ERROR: Target user not found');
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      console.log('7b. Target user exists');
      console.log('8. Requesting user role:', requestingUser.role, 'Target user office:', targetUser.office);

      // If user is superadmin, allow deletion of any user
      if (requestingUser.role === 'superadmin') {
        console.log('9a. User is superadmin, allowing deletion of any user');
        await this.userService.remove(id);
        console.log('10. User successfully deleted');
        return;
      }

      console.log('9b. User is not superadmin, checking office restriction');
      // For non-superadmin users, check office restriction
      if (targetUser.office !== requestingUser.office) {
        console.log('11a. ERROR: Cannot delete users from other offices');
        throw new ForbiddenException("Cannot delete users from other offices.");
      }

      console.log('11b. Offices match, allowing deletion');
      await this.userService.remove(id);
      console.log('12. User successfully deleted');
    } catch (error) {
      console.log('ERROR during user deletion:', error);
      throw error;
    }
  }
}