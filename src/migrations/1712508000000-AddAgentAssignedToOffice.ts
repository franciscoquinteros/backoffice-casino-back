import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAgentAssignedToOffice1712508000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Primero agregamos la columna como nullable
    const hasColumn = await queryRunner.hasColumn('office', 'agent_assigned');
    if (!hasColumn) {
      await queryRunner.query(`ALTER TABLE "office" ADD COLUMN "agent_assigned" VARCHAR(255)`);
      
      // Actualizamos los registros existentes con un valor por defecto
      await queryRunner.query(`UPDATE "office" SET "agent_assigned" = 'admin@default.com' WHERE "agent_assigned" IS NULL`);
      
      // Ahora cambiamos la columna a NOT NULL
      await queryRunner.query(`ALTER TABLE "office" ALTER COLUMN "agent_assigned" SET NOT NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "office" DROP COLUMN "agent_assigned"`);
  }
} 