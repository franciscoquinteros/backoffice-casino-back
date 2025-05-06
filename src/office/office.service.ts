// src/office/office.service.ts
import { ConflictException, Injectable, NotFoundException, Logger } from '@nestjs/common'; // <-- Asegúrate de importar Logger
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateOfficeDto } from './dto/create-office.dto';
import { UpdateOfficeDto } from './dto/update-office.dto';
import { Office } from './entities/office.entity';

@Injectable()
export class OfficeService {
    // --- CORRECCIÓN: Crea la instancia del Logger aquí ---
    private readonly logger = new Logger(OfficeService.name);
    // --- FIN CORRECCIÓN ---

    constructor(
        @InjectRepository(Office)
        private readonly officeRepository: Repository<Office>,
        // --- CORRECCIÓN: QUITA Logger del constructor ---
        // private readonly logger: Logger // <-- QUITAR ESTO
    ) {
         // Puedes añadir un log aquí para confirmar que el logger se creó
         this.logger.log(`OfficeService Initialized`);
    }

    async findAll(): Promise<Office[]> {
         this.logger.debug('Finding all offices...'); // Ahora puedes usar this.logger
        return this.officeRepository.find();
    }

    async findOne(id: string): Promise<Office> {
        this.logger.debug(`Finding office with ID: ${id}`);
        const office = await this.officeRepository.findOneBy({ id: id });
        if (!office) {
            this.logger.warn(`Office with ID ${id} not found.`);
            throw new NotFoundException(`Oficina con ID ${id} no encontrada`);
        }
        return office;
    }

    async create(createOfficeDto: CreateOfficeDto): Promise<Office> {
        this.logger.debug(`Attempting to create office with ID: ${createOfficeDto.id}`);
        const existingOffice = await this.officeRepository.findOneBy({ id: createOfficeDto.id });
        if (existingOffice) {
             this.logger.warn(`Conflict: Office with ID ${createOfficeDto.id} already exists.`);
            throw new ConflictException(`Ya existe una oficina con el ID ${createOfficeDto.id}`);
        }
        const newOffice = this.officeRepository.create(createOfficeDto);
        this.logger.log(`Creating new office: ${createOfficeDto.name} (ID: ${createOfficeDto.id})`);
        return this.officeRepository.save(newOffice);
    }

    async update(id: string, updateOfficeDto: UpdateOfficeDto): Promise<Office> {
         this.logger.debug(`Attempting to update office with ID: ${id}`);
        const office = await this.findOne(id); // findOne ya loguea y lanza error si no existe
        this.officeRepository.merge(office, updateOfficeDto);
        this.logger.log(`Updating office: ${office.name} (ID: ${id})`);
        return this.officeRepository.save(office);
    }

    async remove(id: string): Promise<void> {
        this.logger.debug(`Attempting to remove office with ID: ${id}`);
        const office = await this.findOne(id); // findOne ya loguea y lanza error si no existe
        await this.officeRepository.remove(office);
        this.logger.log(`Removed office: ${office.name} (ID: ${id})`);
    }

    async findAllActives(): Promise<Office[]> {
        this.logger.debug('Finding all active offices');
        return this.officeRepository.find({ where: { status: 'active' }, order: { name: 'ASC' } });
    }
}