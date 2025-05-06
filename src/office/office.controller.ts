// src/office/office.controller.ts
import {
  Controller, Get, Post, Body, Patch, Param, Delete,
  HttpStatus, HttpCode, UseGuards, // <-- Importa UseGuards
  Req, ForbiddenException, ParseIntPipe // <-- Importa lo necesario
} from '@nestjs/common';
import { OfficeService } from './office.service';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger'; // <-- Importa ApiBearerAuth, ApiParam
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard'; // <-- Importa RolesGuard
import { Roles } from '../auth/decorators/roles.decorator'; // <-- Importa Roles
import { Request } from 'express';
import { Office } from './entities/office.entity';

// Interfaz RequestWithUser (asegúrate que esté definida o importada)
interface AuthenticatedUser { id: string | number; office: string; role: string; }
interface RequestWithUser extends Request { user?: AuthenticatedUser; }

@ApiTags('Offices')
@Controller('offices')
// --- QUITA el @UseGuards y @ApiBearerAuth de aquí ---
// @UseGuards(JwtAuthGuard)
// @ApiBearerAuth()
export class OfficeController {
  constructor(private readonly officeService: OfficeService) { }

  @Post()
  @Roles('superadmin')
  // --- APLICA GUARDS INDIVIDUALMENTE ---
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth() // Documenta que este SÍ requiere token
  // --- FIN GUARDS ---
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new office (Superadmin only)' })
  @ApiResponse({ status: 201, description: 'Office created successfully', type: Office })
  create(@Body() createOfficeDto: CreateOfficeDto): Promise<Office> {
    // Considera añadir lógica para asegurar que la oficina del DTO sea válida
    // o que solo un superadmin pueda asignar a cualquier oficina.
    // Actualmente, el servicio la crea tal como viene.
    return this.officeService.create(createOfficeDto);
  }

  // --- ESTE MÉTODO QUEDA PÚBLICO (SIN GUARDS) ---
  @Get()
  @ApiOperation({ summary: 'Get all active offices (Public)' }) // Actualiza descripción
  @ApiResponse({ status: 200, description: 'List of active offices', type: [Office] })
  findAll(): Promise<Office[]> {
    console.log("Finding all active offices (Public Endpoint)") // Using console.log instead
    return this.officeService.findAllActives(); // Llama al método de activas
  }
  // --- FIN MÉTODO PÚBLICO ---

  @Get(':id')
  // --- APLICA GUARDS INDIVIDUALMENTE ---
  @UseGuards(JwtAuthGuard) // Requiere login para ver detalles
  @ApiBearerAuth()
  // --- FIN GUARDS ---
  @ApiOperation({ summary: 'Get a specific office by ID (Requires login)' })
  @ApiParam({ name: 'id', description: 'ID of the office (string)', type: String })
  @ApiResponse({ status: 200, description: 'Office found', type: Office })
  @ApiResponse({ status: 404, description: 'Office not found' })
  findOne(
    @Param('id') id: string,
    @Req() req: RequestWithUser // Podrías usar esto para autorización extra si es necesario
  ): Promise<Office> {
    // Podrías añadir: Si req.user.role !== 'superadmin' && req.user.office !== id -> Forbidden
    return this.officeService.findOne(id);
  }

  @Patch(':id')
  @Roles('superadmin')
  // --- APLICA GUARDS INDIVIDUALMENTE ---
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  // --- FIN GUARDS ---
  @ApiOperation({ summary: 'Update an office (Superadmin only)' })
  @ApiParam({ name: 'id', description: 'ID of the office (string)', type: String })
  @ApiResponse({ status: 200, description: 'Office updated successfully', type: Office })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Office not found' })
  update(
    @Param('id') id: string,
    @Body() updateOfficeDto: UpdateOfficeDto
  ): Promise<Office> {
    return this.officeService.update(id, updateOfficeDto);
  }

  @Delete(':id')
  @Roles('superadmin')
  // --- APLICA GUARDS INDIVIDUALMENTE ---
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  // --- FIN GUARDS ---
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an office (Superadmin only)' })
  @ApiParam({ name: 'id', description: 'ID of the office (string)', type: String })
  @ApiResponse({ status: 204, description: 'Office deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Office not found' })
  remove(@Param('id') id: string): Promise<void> {
    return this.officeService.remove(id);
  }
}