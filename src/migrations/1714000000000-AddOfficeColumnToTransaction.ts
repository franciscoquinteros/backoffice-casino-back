import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOfficeColumnToTransaction1714000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transaction" ADD COLUMN IF NOT EXISTS "office" VARCHAR(255)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "transaction" DROP COLUMN IF EXISTS "office"`);
  }
} 