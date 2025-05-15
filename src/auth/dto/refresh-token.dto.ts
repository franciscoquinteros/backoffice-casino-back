import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
    @ApiProperty({ description: 'El token de actualización' })
    @IsString()
    @IsNotEmpty()
    refreshToken: string;
} 