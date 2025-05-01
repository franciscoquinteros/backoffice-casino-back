import { Repository } from 'typeorm';
import { TicketAssignment } from './entities/ticket-assignment.entity';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class TicketAssignmentRepository {
    constructor(
        @InjectRepository(TicketAssignment)
        private repository: Repository<TicketAssignment>,
    ) { }

    async save(entity: TicketAssignment): Promise<TicketAssignment> {
        return this.repository.save(entity);
    }

    async findOne(options: any): Promise<TicketAssignment> {
        return this.repository.findOne(options);
    }

    async find(options?: any): Promise<TicketAssignment[]> {
        return this.repository.find(options);
    }

    async count(options?: any): Promise<number> {
        return this.repository.count(options);
    }

    create(entityLike: Partial<TicketAssignment>): TicketAssignment {
        return this.repository.create(entityLike) as TicketAssignment;
    }

    async findByOffice(officeId: string): Promise<TicketAssignment[]> {
        console.log(`TicketAssignmentRepository: Buscando asignaciones para oficina ${officeId}`);

        const queryBuilder = this.repository.createQueryBuilder('assignment');

        queryBuilder
            .innerJoin('assignment.user', 'assignedUser')
            .where('assignedUser.office = :userOffice', { userOffice: officeId });

        queryBuilder.orderBy('assignment.createdAt', 'DESC');

        const assignments = await queryBuilder.getMany();

        console.log(`TicketAssignmentRepository: Encontradas ${assignments.length} asignaciones para oficina ${officeId}`);
        return assignments;
    }
    
    async countByOffice(officeId: string): Promise<number> {
        console.log(`TicketAssignmentRepository: Contando asignaciones para oficina ${officeId}`);

        const queryBuilder = this.repository.createQueryBuilder('assignment');

        queryBuilder
            .innerJoin('assignment.user', 'assignedUser')
            .where('assignedUser.office = :userOffice', { userOffice: officeId });

        const count = await queryBuilder.getCount();

        console.log(`TicketAssignmentRepository: Contadas ${count} asignaciones para oficina ${officeId}`);
        return count;
    }
}