CREATE TABLE "machine_parameter_sheets" (
    "id" UUID NOT NULL,
    "machine_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "configuration_type" TEXT NOT NULL,
    "application" TEXT,
    "material" TEXT,
    "notes" TEXT,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "machine_parameter_sheets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "machine_parameter_values" (
    "id" UUID NOT NULL,
    "sheet_id" UUID NOT NULL,
    "scope" TEXT NOT NULL,
    "station" TEXT,
    "channel" TEXT,
    "group_name" TEXT NOT NULL,
    "parameter" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "machine_parameter_values_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "machine_parameter_sheets_machine_id_revision_key" ON "machine_parameter_sheets"("machine_id", "revision");
CREATE INDEX "machine_parameter_sheets_machine_id_created_at_idx" ON "machine_parameter_sheets"("machine_id", "created_at");
CREATE INDEX "machine_parameter_values_sheet_id_sort_order_idx" ON "machine_parameter_values"("sheet_id", "sort_order");

ALTER TABLE "machine_parameter_sheets" ADD CONSTRAINT "machine_parameter_sheets_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "machine_parameter_sheets" ADD CONSTRAINT "machine_parameter_sheets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "machine_parameter_values" ADD CONSTRAINT "machine_parameter_values_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "machine_parameter_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
