import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindManyOptions, FindOneOptions, Repository } from 'typeorm';
import { Account } from './entities/account.entity';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';
import { IpnService } from 'src/transactions/transactions.service';
import { AccountDto } from './dto/account.dto';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(Account)
    private accountRepository: Repository<Account>,
    @Inject(forwardRef(() => IpnService)) // Usar forwardRef para inyectar IpnService
    private ipnService: IpnService
  ) { }

  /* async findAll(): Promise<Account[]> {
    return this.accountRepository.find();
  } */

  async findAll(officeId?: string): Promise<Account[]> { // <-- Aceptar officeId opcional
    console.log(`AccountService: Buscando todas las cuentas${officeId ? ` para oficina ${officeId}` : ''}`);

    // Construir las opciones de búsqueda
    const findOptions: FindManyOptions<Account> = {};

    // Si se proporciona officeId, añadir la condición WHERE usando la columna 'agent'
    if (officeId) {
      findOptions.where = { agent: officeId }; // <-- ¡CORRECCIÓN! Usar 'agent' en lugar de 'office'
    }

    // Añadir otras opciones si son necesarias (ej: ordenación por defecto)
    // findOptions.order = { name: 'ASC' };

    return this.accountRepository.find(findOptions); // <-- Usar las opciones construidas
  }

  async findCbuByOffice(officeId: string): Promise<string> {
    console.log(`AccountService: Buscando CBU activo para oficina ${officeId}`);

    // Busca UNA cuenta activa donde la columna 'office' coincida con el officeId recibido
    // Asumiendo que la columna en Account se llama 'office' y guarda el ID como STRING
    const account = await this.accountRepository.findOne({
      select: ['cbu'], // Solo necesitamos el CBU
      where: {
        office: officeId, // <-- Busca directamente por officeId
        status: 'active'
      }
      // Podrías añadir un order By si quieres una cuenta específica en caso de haber varias
      // order: { created_at: 'ASC' } // Ejemplo: la más antigua
    });

    if (!account || !account.cbu) {
      console.log(`AccountService: No active account with CBU found for office ${officeId}.`);
      throw new NotFoundException(`No active account with CBU found for office ${officeId}`);
    }

    console.log(`AccountService: CBU found for office ${officeId}`);
    return account.cbu;
  }


  async findOne(id: number, officeId?: string): Promise<Account> { // <-- Aceptar officeId opcional
    console.log(`AccountService: Buscando cuenta ID ${id}${officeId ? ` en oficina ${officeId}` : ''}`);

    const whereCondition: any = { id }; // Siempre buscar por ID

    // Si se proporciona officeId, añadir la condición de oficina
    if (officeId) {
      whereCondition.agent = officeId; // <-- Asegurar que la cuenta pertenece a esta oficina
    }

    const findOptions: FindOneOptions<Account> = { where: whereCondition };

    const account = await this.accountRepository.findOne(findOptions); // <-- Usar las opciones construidas
    if (!account) {
      // El mensaje de Not Found podría ser más genérico para no revelar si el ID existe en otra oficina
      // O más específico si el requisito es solo para cuentas de la oficina.
      // Si officeId se pasa y no se encuentra, significa que no existe en esa oficina O el ID es incorrecto.
      // Puedes lanzar un error 404 general para no dar pistas.
      throw new NotFoundException(`Account with ID ${id} not found${officeId ? ` in office ${officeId}` : ''}`);
    }
    return account;
  }

  /* async create(createAccountDto: CreateAccountDto): Promise<Account> {
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
  } */

  async create(createAccountDto: CreateAccountDto, officeId: string): Promise<Account> {
    console.log(`AccountService: Creando cuenta para oficina ${officeId}`);
    const newAccount = this.accountRepository.create(createAccountDto);
    newAccount.agent = officeId; // <-- Asignar la oficina

    const savedAccount = await this.accountRepository.save(newAccount);

    if (savedAccount.wallet === 'mercadopago' && savedAccount.status === 'active') {
      try {
        await this.ipnService.configureAccount(savedAccount);
        console.log(`Cuenta de MercadoPago configurada para IPN: ${savedAccount.name} (ID: ${savedAccount.id})`);

        // Reiniciar el servicio IPN para asegurar que la nueva cuenta esté disponible
        await this.ipnService.reloadService();
        console.log('Servicio IPN reiniciado después de crear nueva cuenta');
      } catch (error) {
        console.error('Error al configurar cuenta en IPN service:', error);
      }
    }
    return savedAccount;
  }

  async update(id: number, updateAccountDto: UpdateAccountDto, officeId: string): Promise<Account> {
    console.log(`AccountService: Actualizando cuenta ID ${id} en oficina ${officeId}`);
    const account = await this.findOne(id, officeId);

    // Actualizar solo los campos que vienen en el DTO
    if (updateAccountDto.mp_access_token !== undefined) account.mp_access_token = updateAccountDto.mp_access_token;
    if (updateAccountDto.mp_public_key !== undefined) account.mp_public_key = updateAccountDto.mp_public_key;
    if (updateAccountDto.mp_client_id !== undefined) account.mp_client_id = updateAccountDto.mp_client_id;
    if (updateAccountDto.mp_client_secret !== undefined) account.mp_client_secret = updateAccountDto.mp_client_secret;
    if (updateAccountDto.receiver_id !== undefined) account.receiver_id = updateAccountDto.receiver_id;
    if (updateAccountDto.name !== undefined) account.name = updateAccountDto.name;
    if (updateAccountDto.alias !== undefined) account.alias = updateAccountDto.alias;
    if (updateAccountDto.cbu !== undefined) account.cbu = updateAccountDto.cbu;
    if (updateAccountDto.operator !== undefined) account.operator = updateAccountDto.operator;
    if (updateAccountDto.status !== undefined) account.status = updateAccountDto.status;
    if (updateAccountDto.wallet !== undefined) account.wallet = updateAccountDto.wallet;

    const updatedAccount = await this.accountRepository.save(account);

    // Si es una cuenta de Mercado Pago activa, actualizar la configuración del IPN
    if (updatedAccount.wallet === 'mercadopago' && updatedAccount.status === 'active') {
      try {
        await this.ipnService.configureAccount(updatedAccount);
        console.log(`Configuración de IPN actualizada para cuenta: ${updatedAccount.name} (ID: ${updatedAccount.id})`);

        // Reiniciar el servicio IPN para asegurar que los cambios estén disponibles
        await this.ipnService.reloadService();
        console.log('Servicio IPN reiniciado después de actualizar cuenta');
      } catch (error) {
        console.error('Error al actualizar configuración en IPN service:', error);
      }
    }

    return updatedAccount;
  }


  async remove(id: number, officeId: string): Promise<void> {
    const account = await this.findOne(id, officeId);
    await this.accountRepository.remove(account);
    // No es necesario quitar del IPN ya que las cuentas eliminadas se filtran automáticamente
  }

  async findCbuByAgent(idAgent: string, officeId?: string): Promise<string> { // <-- Aceptar officeId
    console.log(`AccountService: Buscando CBU activo para agente ${idAgent}${officeId ? ` en oficina ${officeId}` : ''}`);
    const whereCondition: any = {
      agent: idAgent, // Assuming agent field exists in Account entity
      status: 'active'
    };
    if (officeId) {
      whereCondition.agent = officeId;
    }
    const account = await this.accountRepository.findOne({
      select: ['cbu'],
      where: whereCondition
    });

    if (!account) {
      throw new NotFoundException(`No active account found for agent ${idAgent}${officeId ? ` in office ${officeId}` : ''}`);
    }

    return account.cbu;
  }

  /*  async findAllCbus(): Promise<string[]> {
     const accounts = await this.accountRepository.find({
       select: ['cbu'],
       where: { status: 'active' } // Asumiendo que quieres solo las cuentas activas
     });
 
     return accounts.map(account => account.cbu);
   } */

  /* async findActiveMercadoPagoAccounts(): Promise<Account[]> {
    return this.accountRepository.find({
      where: {
        wallet: 'mercadopago',
        status: 'active'
      }
    });
  } */

  async findActiveMercadoPagoAccounts(officeId?: string): Promise<Account[]> {
    console.log(`AccountService: Buscando cuentas MP activas${officeId ? ` para oficina ${officeId}` : ''}`);
    const whereCondition: any = { wallet: 'mercadopago', status: 'active' };
    if (officeId) { whereCondition.agent = officeId; }
    return this.accountRepository.find({ where: whereCondition });
  }

  async findAllCbus(officeId?: string): Promise<string[]> {
    console.log(`AccountService: Buscando CBUs de cuentas activas${officeId ? ` para oficina ${officeId}` : ''}`);
    const whereCondition: any = { status: 'active' };
    if (officeId) { whereCondition.agent = officeId; }
    const accounts = await this.accountRepository.find({ select: ['cbu'], where: whereCondition });
    return accounts.map(account => account.cbu).filter(cbu => cbu !== null && cbu !== undefined);
  }

  async findByCbu(cbu: string, officeId?: string): Promise<Account | null> {
    try {
      const query = this.accountRepository.createQueryBuilder('account')
        .where('account.cbu = :cbu', { cbu })
        .andWhere('account.wallet = :wallet', { wallet: 'mercadopago' })
        .andWhere('account.status = :status', { status: 'active' })
        .andWhere('account.mp_client_id IS NOT NULL');

      if (officeId) {
        query.andWhere('account.agent = :officeId', { officeId });
      }

      return await query.getOne();
    } catch (error) {
      console.error(`Error al buscar cuenta por CBU ${cbu}:`, error);
      return null;
    }
  }

  private lastSelectedCbu: { [officeId: string]: string } = {};

  // Método corregido en AccountService - usando accumulated_amount actual de la BD
  async getNextAvailableCbu(amount: number, officeId?: string): Promise<{ cbu: string, name: string }> {
    console.log(`AccountService: Obteniendo siguiente CBU disponible para monto ${amount}${officeId ? ` en oficina ${officeId}` : ''}`);

    const MAX_AMOUNT_PER_ACCOUNT = 300000;

    const whereCondition: any = {
      wallet: 'mercadopago',
      status: 'active'
    };

    if (officeId) {
      whereCondition.agent = officeId;
    }

    // PASO 1: Verificar si hay una cuenta actualmente en uso para esta oficina
    const lastCbu = this.lastSelectedCbu[officeId || 'default'];

    if (lastCbu) {
      // Obtener la cuenta ACTUAL de la base de datos (con accumulated_amount actualizado)
      const currentAccount = await this.accountRepository.findOne({
        where: {
          ...whereCondition,
          cbu: lastCbu
        }
      });

      if (currentAccount) {
        const currentAccumulated = Number(currentAccount.accumulated_amount || 0);

        // Si la cuenta actual aún no ha alcanzado el límite, seguir usándola
        if (currentAccumulated < MAX_AMOUNT_PER_ACCOUNT) {
          console.log(`AccountService: Continuando con cuenta actual ${lastCbu} (Acumulado actual: ${currentAccumulated}/${MAX_AMOUNT_PER_ACCOUNT})`);
          return { cbu: currentAccount.cbu, name: currentAccount.name };
        } else {
          console.log(`AccountService: Cuenta actual ${lastCbu} alcanzó el límite (${currentAccumulated}), buscando siguiente...`);
          // Limpiar la referencia ya que esta cuenta ya no sirve
          delete this.lastSelectedCbu[officeId || 'default'];
        }
      } else {
        console.log(`AccountService: Cuenta anterior ${lastCbu} ya no existe o no está activa, buscando nueva...`);
        // Limpiar la referencia ya que esta cuenta ya no existe
        delete this.lastSelectedCbu[officeId || 'default'];
      }
    }

    // PASO 2: Buscar la siguiente cuenta disponible (que tenga accumulated_amount < 300000)
    // Ordenar por accumulated_amount ASC para encontrar la que menos tiene
    const accounts = await this.accountRepository.find({
      where: whereCondition,
      order: { accumulated_amount: 'ASC', id: 'ASC' }
    });

    if (!accounts || accounts.length === 0) {
      const errorMessage = officeId
        ? `No active CBU accounts found for agent/office ${officeId}. `
        : `No active CBU accounts found in the system.`;

      console.error(`AccountService: ${errorMessage}`);
      throw new NotFoundException(errorMessage);
    }

    // PASO 3: Buscar la primera cuenta disponible (que no haya alcanzado el límite)
    let selectedAccount = accounts.find(account => {
      const currentAccumulated = Number(account.accumulated_amount || 0);
      return currentAccumulated < MAX_AMOUNT_PER_ACCOUNT;
    });

    // PASO 4: Si todas las cuentas superan el límite, resetear y empezar de nuevo
    if (!selectedAccount) {
      console.log(`AccountService: Todas las cuentas superan el límite. Reseteando accumulated_amounts...`);
      await this.resetAllAccountsToZero(accounts);

      // Después del reset, obtener las cuentas actualizadas
      const resetAccounts = await this.accountRepository.find({
        where: whereCondition,
        order: { accumulated_amount: 'ASC', id: 'ASC' }
      });

      selectedAccount = resetAccounts[0]; // Tomar la primera después del reset
    }

    // PASO 5: Guardar la nueva cuenta seleccionada
    this.lastSelectedCbu[officeId || 'default'] = selectedAccount.cbu;

    const currentAccumulated = Number(selectedAccount.accumulated_amount || 0);
    console.log(`AccountService: Cuenta seleccionada: CBU ${selectedAccount.cbu} (${selectedAccount.name}, Acumulado actual: ${currentAccumulated}/${MAX_AMOUNT_PER_ACCOUNT})`);

    return { cbu: selectedAccount.cbu, name: selectedAccount.name };
  }

  /**
   * Resetea el accumulated_amount de todas las cuentas proporcionadas a 0
   */
  private async resetAllAccountsToZero(accounts: Account[]): Promise<void> {
    console.log(`AccountService: Reseteando ${accounts.length} cuentas a 0`);

    for (const account of accounts) {
      account.accumulated_amount = 0;
    }

    await this.accountRepository.save(accounts);
    console.log(`AccountService: ${accounts.length} cuentas reseteadas exitosamente`);
  }

  async updateAccountAccumulatedAmount(cbu: string, amount: number): Promise<void> {
    console.log(`AccountService: Actualizando monto acumulado para CBU ${cbu} con monto ${amount}`);

    const account = await this.accountRepository.findOne({
      where: { cbu }
    });

    if (!account) {
      console.log(`AccountService: No se encontró cuenta con CBU ${cbu}`);
      return;
    }

    const previousAmount = Number(account.accumulated_amount);
    const newAmount = previousAmount + Number(amount);

    // Actualizar el monto acumulado
    account.accumulated_amount = newAmount;

    // Guardar la actualización
    await this.accountRepository.save(account);

    console.log(`AccountService: Monto acumulado actualizado para CBU ${cbu}. Anterior: ${previousAmount}, Nuevo: ${newAmount}`);

    // Verificar si la cuenta alcanzó el límite de 300000
    const MAX_AMOUNT_PER_ACCOUNT = 300000;
    if (newAmount >= MAX_AMOUNT_PER_ACCOUNT) {
      console.log(`AccountService: La cuenta ${account.name} (CBU: ${cbu}) alcanzó el límite con ${newAmount}. Se moverá al final de la rotación.`);
    }
  }

  async resetAccumulatedAmounts(officeId?: string): Promise<void> {
    console.log(`AccountService: Reseteando montos acumulados${officeId ? ` para oficina ${officeId}` : ''}`);

    const whereCondition: any = {};

    if (officeId) {
      whereCondition.agent = officeId;
    }

    // Buscar todas las cuentas que correspondan al filtro
    const accounts = await this.accountRepository.find({
      where: whereCondition
    });

    // Reiniciar el monto acumulado para cada cuenta
    for (const account of accounts) {
      account.accumulated_amount = 0;
    }

    // Guardar las actualizaciones
    await this.accountRepository.save(accounts);

    console.log(`AccountService: Montos acumulados reseteados para ${accounts.length} cuentas`);
  }

  /**
   * Encuentra todas las cuentas para el superadmin (sin filtrar por oficina)
   * @returns Todas las cuentas en el sistema
   */
  async findAllForSuperadmin(): Promise<AccountDto[]> {
    try {
      console.log('[AccountService] findAllForSuperadmin: Buscando todas las cuentas');
      const accounts = await this.accountRepository.find();
      return accounts.map(account => new AccountDto(account));
    } catch (error) {
      console.error('[AccountService] findAllForSuperadmin error:', error);
      throw new Error('Error al obtener todas las cuentas');
    }
  }

}