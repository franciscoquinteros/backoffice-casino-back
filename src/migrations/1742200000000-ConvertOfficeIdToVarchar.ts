import { MigrationInterface, QueryRunner } from "typeorm";

export class ConvertOfficeIdToVarchar1742200000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        // Primero crear una columna temporal de tipo varchar
        await queryRunner.query(`
            ALTER TABLE "conversation" 
            ADD COLUMN "office_id_temp" varchar
        `);
        
        // Copiar los datos, convirtiendo de int a varchar
        await queryRunner.query(`
            UPDATE "conversation" 
            SET "office_id_temp" = "office_id"::varchar
            WHERE "office_id" IS NOT NULL
        `);
        
        // Eliminar la columna original
        await queryRunner.query(`
            ALTER TABLE "conversation" 
            DROP COLUMN "office_id"
        `);
        
        // Renombrar la columna temporal
        await queryRunner.query(`
            ALTER TABLE "conversation" 
            RENAME COLUMN "office_id_temp" TO "office_id"
        `);
        
        // Actualizar valores nulos a '1'
        await queryRunner.query(`
            UPDATE "conversation" 
            SET "office_id" = '1' 
            WHERE "office_id" IS NULL
        `);
        
        // Hacer la columna NOT NULL
        await queryRunner.query(`
            ALTER TABLE "conversation" 
            ALTER COLUMN "office_id" SET NOT NULL
        `);
        
        // Crear índice si no existe
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_conversation_office_id" ON "conversation" ("office_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Primero crear una columna temporal de tipo int
        await queryRunner.query(`
            ALTER TABLE "conversation" 
            ADD COLUMN "office_id_temp" int
        `);
        
        // Copiar los datos, convirtiendo de varchar a int
        await queryRunner.query(`
            UPDATE "conversation" 
            SET "office_id_temp" = "office_id"::int
            WHERE "office_id" IS NOT NULL
        `);
        
        // Eliminar la columna original
        await queryRunner.query(`
            ALTER TABLE "conversation" 
            DROP COLUMN "office_id"
        `);
        
        // Renombrar la columna temporal
        await queryRunner.query(`
            ALTER TABLE "conversation" 
            RENAME COLUMN "office_id_temp" TO "office_id"
        `);
    }
} 