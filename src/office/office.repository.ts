import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Injectable } from '@nestjs/common';
import { Office } from './entities/office.entity';

@Injectable()
export class OfficeRepository {
  save(newOfficeEntity: Promise<Office>): Office | PromiseLike<Office> {
    throw new Error('Method not implemented.');
  }
  find(arg0: { where: { status: string; }; order: { name: string; }; }): Office[] | PromiseLike<Office[]> {
    throw new Error('Method not implemented.');
  }
  constructor(
    @InjectRepository(Office)
    private officeRepository: Repository<Office>,
  ) {}

  // Métodos para interactuar con la base de datos
  findAll() {
    return this.officeRepository.find();
  }

  findOne(id: number) {
    return this.officeRepository.findOne({ where: { id } });
  }

  create(office: Partial<Office>) {
    const newOffice = this.officeRepository.create(office);
    return this.officeRepository.save(newOffice);
  }

  async update(id: number, office: Partial<Office>) {
    await this.officeRepository.update(id, office);
    return this.findOne(id);
  }

  async remove(id: number) {
    const office = await this.findOne(id);
    if (office) {
      return this.officeRepository.remove(office);
    }
    return null;
  }
} 