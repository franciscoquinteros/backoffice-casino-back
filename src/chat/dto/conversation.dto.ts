import { ApiProperty } from '@nestjs/swagger';

export class CreateConversationDto {
  @ApiProperty({
    description: 'ID del usuario que inicia la conversación',
    example: 'user123'
  })
  userId: string;

  @ApiProperty({
    description: 'Título opcional de la conversación',
    example: 'Consulta sobre facturación',
    required: false
  })
  title?: string;

  @ApiProperty({
    description: 'ID de la oficina a la que pertenece la conversación',
    example: '1',
    required: false
  })
  officeId?: string;
} 