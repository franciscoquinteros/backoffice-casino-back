import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEmail, IsOptional, IsNumber, IsEnum, IsArray, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateTicketDto {
  @ApiProperty({ description: 'Email of the ticket requester' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Subject of the ticket' })
  @IsString()
  subject: string;

  @ApiProperty({ description: 'Description of the ticket' })
  @IsString()
  description: string;

  @ApiProperty({
    description: 'Office ID - Required to associate the ticket with a specific office',
    example: '123456'
  })
  @IsString()
  officeId: string;

  @ApiProperty({
    description: 'Custom fields for the ticket',
    example: [{ id: 1, value: 'Custom value' }],
    type: 'array',
  })
  @IsArray()
  @IsOptional()
  custom_fields?: { id: number; value: string }[];
}

export class ChangeTicketStatusDto {
  @ApiProperty({
    description: 'New status for the ticket',
    enum: ['new', 'open', 'pending', 'hold', 'solved', 'closed'],
  })
  @IsEnum(['new', 'open', 'pending', 'hold', 'solved', 'closed'])
  status: string;
}

// Actualiza tu CreateAgentDto para incluir campos adicionales
export class CreateAgentDto {
  name: string;
  email: string;
  role?: string = 'agent'; // Por defecto 'agent'
  default_group_id?: number;
  active?: boolean = true;
  verified?: boolean = true;
  user_fields?: Record<string, any>;
}

export class AssignTicketDto {
  @ApiProperty({ description: 'ID of the agent to assign the ticket to' })
  @IsString() // Cambiado a string para consistencia con Zendesk IDs
  userId: string;
}

export class InternalAssigneeDto {
  @ApiProperty({ description: 'ID of the internal assignee' })
  @IsNumber()
  id: number;

  @ApiProperty({ description: 'Name of the internal assignee' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Email of the internal assignee' })
  @IsEmail()
  email: string;
}

export class TicketResponseDto {
  @ApiProperty()
  @IsNumber()
  id: number;

  @ApiProperty()
  @IsString()
  subject: string;

  @ApiProperty()
  @IsString()
  description: string;

  @ApiProperty()
  @IsString()
  status: string;

  @ApiProperty()
  @IsNumber()
  requester_id: number;

  @ApiProperty()
  @IsOptional()
  @IsNumber()
  assignee_id?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  user?: {
    name: string;
    email: string;
  };

  @ApiProperty()
  @IsNumber()
  group_id: number;

  @ApiProperty({ type: 'array', required: false })
  @IsOptional()
  custom_fields?: { id: number; value: string }[];

  @ApiProperty({ type: InternalAssigneeDto, required: false })
  @IsOptional()
  internal_assignee?: InternalAssigneeDto;
}

export class CommentResponseDto {
  @ApiProperty()
  @IsNumber()
  id: number;

  @ApiProperty()
  @IsString()
  body: string;

  @ApiProperty()
  @IsNumber()
  author_id: number;

  @ApiProperty()
  @IsString()
  created_at: string;
}

export class UserResponseDto {
  @ApiProperty()
  @IsNumber()
  id: number;

  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  role: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  default_group_id?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  organization_id?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsNumber()
  custom_role_id?: number;
}

export class GroupMembershipResponseDto {
  @ApiProperty()
  @IsString()
  url: string;

  @ApiProperty()
  @IsNumber()
  id: number;

  @ApiProperty()
  @IsNumber()
  user_id: number;

  @ApiProperty()
  @IsNumber()
  group_id: number;

  @ApiProperty()
  @IsString()
  group_name: string;

  @ApiProperty()
  @IsString()
  created_at: string;

  @ApiProperty()
  @IsString()
  updated_at: string;

  @ApiProperty()
  @IsBoolean()
  default: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  user?: {
    name: string;
    email: string;
    role: string;
    assigned_tickets_count: number;
  };
}

export class ChatVisitor {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty()
  @IsString()
  email: string;
}

export class ChatAgent {
  @ApiProperty({ description: 'Agent ID' })
  @IsString() // Cambiado a string para coincidir con Zendesk Chat API
  id: string;

  @ApiProperty({ description: 'Agent name' })
  @IsString()
  name: string;
}

export class ChatConversationResponseDto {
  @ApiProperty()
  @IsString() // Cambiado a string para coincidir con Zendesk Chat API
  id: string;

  @ApiProperty()
  @IsString()
  status: string;

  @ApiProperty({ type: () => ChatVisitor })
  @Type(() => ChatVisitor)
  visitor: ChatVisitor;

  @ApiProperty({ type: () => ChatAgent, required: false })
  @Type(() => ChatAgent)
  @IsOptional()
  agent?: ChatAgent;

  @ApiProperty()
  @IsString()
  timestamp: string; // Cambiado a timestamp para coincidir con tu uso

  @ApiProperty()
  @IsString()
  lastMessage: string; // Agregado para coincidir con el frontend
}

export class ChatMessageDto {
  @ApiProperty({ description: 'Message content' })
  @IsString()
  message: string;
}

export class ChatMessageResponseDto {
  @ApiProperty()
  @IsString() // Cambiado a string para coincidir con Zendesk Chat API
  id: string;

  @ApiProperty()
  @IsString()
  message: string;

  @ApiProperty()
  @IsString()
  sender: string;

  @ApiProperty()
  @IsString()
  created_at: string;

  @ApiProperty()
  @IsString() // Cambiado a string para coincidir con chatId
  conversation_id: string;
}