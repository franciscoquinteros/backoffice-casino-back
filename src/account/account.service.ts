import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account } from './entities/account.entity';
import { CreateAccountDto } from './dto/account.dto';
import { IpnService } from 'src/transactions/transactions.service';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(Account)
    private accountRepository: Repository<Account>,
    @Inject(forwardRef(() => IpnService)) // Usar forwardRef para inyectar IpnService
    private ipnService: IpnService
  ) { }

  async findAll(): Promise<Account[]> {
    return this.accountRepository.find();
  }

  async findOne(id: number): Promise<Account> {
    const account = await this.accountRepository.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException(`Account with ID ${id} not found`);
    }
    return account;
  }

  async create(createAccountDto: CreateAccountDto): Promise<Account> {
    const newAccount = this.accountRepository.create(createAccountDto);

    // Guardar la cuenta en la base de datos
    const savedAccount = await this.accountRepository.save(newAccount);

    // Si es una cuenta de MercadoPago, configurar en el servicio IPN
    if (savedAccount.wallet === 'mercadopago' && savedAccount.status === 'active') {
      try {
        await this.ipnService.configureAccount(savedAccount);
        console.log(`Cuenta de MercadoPago configurada para IPN: ${savedAccount.name} (ID: ${savedAccount.id})`);
      } catch (error) {
        console.error('Error al configurar cuenta en IPN service:', error);
        // No fallamos la operación completa, solo registramos el error
      }
    }

    return savedAccount;
  }

  async update(id: number, updateAccountDto: Partial<CreateAccountDto>): Promise<Account> {
    const account = await this.findOne(id);

    // Actualizar solo los campos proporcionados
    Object.assign(account, updateAccountDto);

    // Guardar la cuenta actualizada
    const updatedAccount = await this.accountRepository.save(account);

    // Si es ahora una cuenta de MercadoPago activa, actualizar en IPN
    if (updatedAccount.wallet === 'mercadopago' && updatedAccount.status === 'active') {
      try {
        await this.ipnService.configureAccount(updatedAccount);
        console.log(`Configuración de IPN actualizada para cuenta: ${updatedAccount.name} (ID: ${updatedAccount.id})`);
      } catch (error) {
        console.error('Error al actualizar configuración en IPN service:', error);
      }
    }

    return updatedAccount;
  }

  async remove(id: number): Promise<void> {
    const account = await this.findOne(id);
    await this.accountRepository.remove(account);
    // No es necesario quitar del IPN ya que las cuentas eliminadas se filtran automáticamente
  }

  async findCbuByAgent(idAgent: string): Promise<string> {
    const account = await this.accountRepository.findOne({
      select: ['cbu'],
      where: { 
        agent: idAgent, 
        status: 'active' 
      }
    });
  
    if (!account) {
      throw new NotFoundException(`No active account found for agent ${idAgent}`);
    }
  
    return account.cbu;
  }

  async findAllCbus(): Promise<string[]> {
    const accounts = await this.accountRepository.find({
      select: ['cbu'],
      where: { status: 'active' } // Asumiendo que quieres solo las cuentas activas
    });

    return accounts.map(account => account.cbu);
  }

  async findActiveMercadoPagoAccounts(): Promise<Account[]> {
    return this.accountRepository.find({
      where: {
        wallet: 'mercadopago',
        status: 'active'
      }
    });
  }
}