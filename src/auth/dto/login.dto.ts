import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class LoginDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsString()
    @IsNotEmpty()
    password: string;

    @ApiPropertyOptional({ description: 'ID de la Oficina a visualizar (solo Superadmin)', example: '1' })
    @IsString() // O IsNumberString si el ID es número pero se envía como string
    @IsOptional()
    viewOfficeId?: string; // ID de la oficina que el Super Admin quiere ver
}
