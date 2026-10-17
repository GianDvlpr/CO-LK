import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { createWorkbook, validateWorkbook, workbookSpecs } from "@/modules/imports/application/workbook";

describe("import workbooks", () => {
  it("genera una plantilla Excel válida con todas las hojas", async () => {
    const bytes = await createWorkbook("products");
    const result = await validateWorkbook("products", bytes as ArrayBuffer);

    expect(result.preview.map((sheet) => sheet.sheet)).toEqual(["Productos"]);
    expect(result.errors).toContainEqual(expect.objectContaining({ code: "EMPTY_FILE" }));
    expect(result.importMode).toBe("CREATE_UPDATE");
  });

  it("genera una sola hoja de datos por módulo", async () => {
    for (const importModule of ["purchases", "inventory", "recipes", "products", "orders"] as const) {
      const bytes = await createWorkbook(importModule);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(bytes as ArrayBuffer) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
      const dataSheets = workbook.worksheets.filter((sheet) => !["Instrucciones", "_Listas"].includes(sheet.name));
      expect(dataSheets).toHaveLength(1);
    }
  });

  it("exige costo y fecha cuando se informa stock inicial", async () => {
    const bytes = await createWorkbook("inventory", {
      "Almacén": [[null, "01", "PVC", null, "Cuero negro", "MATERIA_PRIMA", "M2", "OPTIONAL", 20, "SI", "PRINCIPAL", 100]],
    });
    const result = await validateWorkbook("inventory", bytes as ArrayBuffer);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "costo_unitario_pen", code: "REQUIRED_FIELD" }),
      expect.objectContaining({ field: "fecha_inicial", code: "REQUIRED_FIELD" }),
    ]));
  });

  it("explica cada columna con encabezados amigables y sin la columna accion", async () => {
    const bytes = await createWorkbook("inventory");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes as ArrayBuffer) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const instructions = workbook.getWorksheet("Instrucciones");
    const items = workbook.getWorksheet("Almacén");
    const instructionText = instructions?.getColumn(2).values.map(String).join(" ") ?? "";

    expect(instructionText).toContain("etiqueta temporal");
    expect(instructionText).toContain("Un código vacío crea un registro");
    expect(items?.getRow(1).values).toContain("Unidad de medida");
    expect(items?.getRow(1).values).toContain("Código anterior");
    expect(items?.getRow(1).values).not.toContain("accion");
    expect(items?.getRow(1).getCell(1).note).toContain("Código oficial");
  });

  it("convierte encabezados amigables, tolera columnas reordenadas y conserva compatibilidad técnica", async () => {
    const bytes = await createWorkbook("products", {
      Productos: [["PROD-TEMP-1", null, "I0034", "Zapato clásico", "Calzado", "Modelo de prueba", "SI", null, "38", "NEG", null, "UN", 0, 120, "SI"]],
    });
    const reordered = new ExcelJS.Workbook();
    await reordered.xlsx.load(Buffer.from(bytes as ArrayBuffer) as unknown as Parameters<typeof reordered.xlsx.load>[0]);
    const products = reordered.getWorksheet("Productos")!;
    for (const rowNumber of [1, 2]) {
      const first = products.getCell(rowNumber, 1).value;
      products.getCell(rowNumber, 1).value = products.getCell(rowNumber, 2).value;
      products.getCell(rowNumber, 2).value = first;
    }
    const reorderedBytes = await reordered.xlsx.writeBuffer();
    const reorderedResult = await validateWorkbook("products", reorderedBytes as ArrayBuffer);
    expect(reorderedResult.errors).toEqual([]);
    expect(reorderedResult.data.Productos[0].values.nombre).toBe("Zapato clásico");

    const legacy = new ExcelJS.Workbook();
    await legacy.xlsx.load(Buffer.from(bytes as ArrayBuffer) as unknown as Parameters<typeof legacy.xlsx.load>[0]);
    workbookSpecs.products.sheets.forEach((spec) => {
      const row = legacy.getWorksheet(spec.name)!.getRow(1);
      spec.columns.forEach((column, index) => { row.getCell(index + 1).value = column; });
    });
    const legacyBytes = await legacy.xlsx.writeBuffer();
    expect((await validateWorkbook("products", legacyBytes as ArrayBuffer)).errors).toEqual([]);
  });

  it("incluye los almacenes registrados en una lista desplegable y usa PRINCIPAL como respaldo", async () => {
    const registeredBytes = await createWorkbook("inventory", {}, {
      warehouses: [
        { code: "PRINCIPAL", name: "Almacén principal" },
        { code: "INSUMOS", name: "Almacén de insumos" },
      ],
    });
    const registeredWorkbook = new ExcelJS.Workbook();
    await registeredWorkbook.xlsx.load(Buffer.from(registeredBytes as ArrayBuffer) as unknown as Parameters<typeof registeredWorkbook.xlsx.load>[0]);
    const registeredList = registeredWorkbook.getWorksheet("_Listas");
    const movementValidation = registeredWorkbook.getWorksheet("Almacén")?.getCell("K2").dataValidation;

    expect(registeredList?.state).toBe("veryHidden");
    expect(registeredList?.getColumn(1).values).toEqual([undefined, "almacen_codigo", "PRINCIPAL", "INSUMOS"]);
    expect(movementValidation?.type).toBe("list");
    expect(movementValidation?.formulae).toEqual(["'_Listas'!$A$2:$A$3"]);

    const fallbackBytes = await createWorkbook("inventory");
    const fallbackWorkbook = new ExcelJS.Workbook();
    await fallbackWorkbook.xlsx.load(Buffer.from(fallbackBytes as ArrayBuffer) as unknown as Parameters<typeof fallbackWorkbook.xlsx.load>[0]);
    expect(fallbackWorkbook.getWorksheet("_Listas")?.getCell("A2").value).toBe("PRINCIPAL");
  });

  it("acepta un reporte que conserva el mismo formato de la plantilla", async () => {
    const bytes = await createWorkbook("products", {
      Productos: [["ZAP-001", "ZAP-001", "Zapato clásico", "Calzado", "Modelo de prueba", "SI", "ZAP-001-38-NEG", "38", "NEG", "UN", 0, 120, "SI"]],
    });
    const result = await validateWorkbook("products", bytes as ArrayBuffer);

    expect(result.totalRows).toBe(1);
    expect(result.errors).toEqual([]);
    expect(result.importMode).toBe("ONLY_NEW");
  });

  it("acepta registros nuevos sin código usando una referencia de carga", async () => {
    const bytes = await createWorkbook("orders", {
      Pedidos: [["PEDIDO-NUEVO-1", null, "CLI-01", "2026-10-01", null, "PEN", 1, "BORRADOR", null, 1, "SKU-01", 2, 10]],
    });
    const result = await validateWorkbook("orders", bytes as ArrayBuffer);

    expect(result.errors).toEqual([]);
  });

  it("detecta claves repetidas antes de confirmar la importación", async () => {
    const bytes = await createWorkbook("orders", {
      Pedidos: [
        ["REF-1", "PED-001", "CLI-01", "2026-10-01", null, "PEN", 1, "BORRADOR", null, 1, "SKU-01", 2, 10],
        ["REF-2", "ped-001", "CLI-02", "2026-10-02", null, "PEN", 1, "BORRADOR", null, 1, "SKU-02", 3, 12],
      ],
    });
    const result = await validateWorkbook("orders", bytes as ArrayBuffer);

    expect(result.errors).toContainEqual(expect.objectContaining({ code: "DUPLICATE_CONFLICT", rowNumber: 3 }));
  });

  it("omite una fila idéntica repetida y la informa como advertencia", async () => {
    const bytes = await createWorkbook("orders", {
      Pedidos: [
        ["REF-1", "PED-001", "CLI-01", "2026-10-01", null, "PEN", 1, "BORRADOR", null, 1, "SKU-01", 2, 10],
        ["REF-1", "PED-001", "CLI-01", "2026-10-01", null, "PEN", 1, "BORRADOR", null, 1, "SKU-01", 2, 10],
      ],
    });
    const result = await validateWorkbook("orders", bytes as ArrayBuffer);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toContainEqual(expect.objectContaining({ code: "DUPLICATE_IDENTICAL_SKIPPED", rowNumber: 3 }));
    expect(result.data.Pedidos).toHaveLength(1);
  });

  it("permite varios lotes distintos para una misma línea de compra", async () => {
    const bytes = await createWorkbook("purchases", {
      Compras: [
        ["COMP-001", null, 1, "2026-10-01", "PROV-01", "FACTURA", "F001", "1", "PEN", 1, "PENDIENTE", null, 1, 1, "MAT-01", "LOTE-A", null, 2, "SACO", 5, "KG", 10, 18],
        ["COMP-001", null, 1, "2026-10-01", "PROV-01", "FACTURA", "F001", "1", "PEN", 1, "PENDIENTE", null, 1, 2, "MAT-01", "LOTE-B", null, 2, "SACO", 5, "KG", 10, 18],
      ],
    });
    const result = await validateWorkbook("purchases", bytes as ArrayBuffer);

    expect(result.errors.filter((error) => error.code === "DUPLICATE_ROW")).toEqual([]);
  });
});
