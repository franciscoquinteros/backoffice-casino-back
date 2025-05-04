import { MigrationInterface, QueryRunner } from "typeorm";

export class AddOfficeIdToConversation1742000000000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Añadir la columna office_id a la tabla conversation con NOT NULL
        await queryRunner.query(`
            ALTER TABLE "conversation" 
            ADD COLUMN "office_id" varchar NULL
        `);

        // Establecer un valor por defecto (1) para las filas existentes
        await queryRunner.query(`
            UPDATE "conversation" 
            SET "office_id" = '1' 
            WHERE "office_id" IS NULL
        `);

        // Modificar la columna para hacerla NOT NULL después de actualizar los registros existentes
        await queryRunner.query(`
            ALTER TABLE "conversation" 
            ALTER COLUMN "office_id" SET NOT NULL
        `);

        // Crear un índice para mejorar el rendimiento de filtrado por oficina
        await queryRunner.query(`
            CREATE INDEX "IDX_conversation_office_id" ON "conversation" ("office_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Eliminar el índice
        await queryRunner.query(`
            DROP INDEX "IDX_conversation_office_id"
        `);

        // Eliminar la columna office_id de la tabla conversation
        await queryRunner.query(`
            ALTER TABLE "conversation" 
            DROP COLUMN "office_id"
        `);
    }
} 