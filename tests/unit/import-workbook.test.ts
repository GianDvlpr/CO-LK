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

  it("mantiene la merma fuera de la plantilla de recetas", async () => {
    const bytes = await createWorkbook("recipes");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes as ArrayBuffer) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const rowValues = workbook.getWorksheet("Recetas")?.getRow(1).values;
    const headers = Array.isArray(rowValues) ? rowValues.map(String) : [];
    expect(headers).not.toContain("Merma (%)");
    expect(headers).not.toContain("merma_porcentaje");
  });

  it("exige costo y fecha cuando se informa stock inicial", async () => {
    const bytes = await createWorkbook("inventory", {
      "Almacén": [[null, "PVC", "Cuero negro", "MATERIA_PRIMA", "Polímeros Andinos SAC", null, "PEN", null, null, null, "M2", "OPTIONAL", 20, "SI", "PRINCIPAL", 100]],
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
    expect(items?.getRow(1).values).toContain("Costo unitario");
    expect(items?.getRow(1).values).toContain("Código de producto del proveedor");
    expect(items?.getRow(1).values).toContain("Precio neto");
    expect(items?.getRow(1).values).toContain("IGV (%)");
    expect(items?.getRow(1).values).toContain("Costo total");
    expect(items?.getRow(1).values).not.toContain("Costo unitario (PEN)");
    expect(items?.getRow(1).values).not.toContain("Código anterior");
    expect(items?.getRow(1).values).not.toContain("accion");
    expect(items?.getRow(1).getCell(1).note).toContain("Código oficial");
    expect(instructionText).toContain("Código o referencia con la que el proveedor identifica este producto");
    expect(instructionText).toContain("precio_neto × (1 + IGV/100)");
  });

  it("acepta archivos anteriores sin las columnas nuevas de costo de referencia", async () => {
    const bytes = await createWorkbook("inventory");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes as ArrayBuffer) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet("Almacén")!;
    const header = sheet.getRow(1);
    const newColumns = ["Código de producto del proveedor", "Precio neto", "IGV (%)", "Costo total"];
    for (let index = 1; index <= header.cellCount; index += 1) {
      if (newColumns.includes(String(header.getCell(index).value ?? ""))) header.getCell(index).value = null;
    }
    const result = await validateWorkbook("inventory", await workbook.xlsx.writeBuffer() as ArrayBuffer);
    expect(result.errors.filter((error) => error.code === "MISSING_HEADER")).toEqual([]);
  });

  it("convierte encabezados amigables, tolera columnas reordenadas y admite encabezados técnicos", async () => {
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
      suppliers: [{ name: "Polímeros Andinos SAC" }, { name: "Química Industrial SAC" }],
      currencies: [{ code: "PEN", name: "Sol peruano" }, { code: "USD", name: "Dólar estadounidense" }],
    });
    const registeredWorkbook = new ExcelJS.Workbook();
    await registeredWorkbook.xlsx.load(Buffer.from(registeredBytes as ArrayBuffer) as unknown as Parameters<typeof registeredWorkbook.xlsx.load>[0]);
    const registeredList = registeredWorkbook.getWorksheet("_Listas");
    const inventorySheet = registeredWorkbook.getWorksheet("Almacén");
    const movementValidation = inventorySheet?.getCell("O2").dataValidation;
    const supplierValidation = inventorySheet?.getCell("E2").dataValidation;
    const currencyValidation = inventorySheet?.getCell("G2").dataValidation;

    expect(registeredList?.state).toBe("veryHidden");
    expect(registeredList?.getColumn(1).values).toEqual([undefined, "almacen_codigo", "PRINCIPAL", "INSUMOS"]);
    expect(movementValidation?.type).toBe("list");
    expect(movementValidation?.formulae).toEqual(["'_Listas'!$A$2:$A$3"]);
    expect(supplierValidation?.formulae).toEqual(["'_Listas'!$C$2:$C$3"]);
    expect(currencyValidation?.formulae).toEqual(["'_Listas'!$D$2:$D$3"]);

    const fallbackBytes = await createWorkbook("inventory");
    const fallbackWorkbook = new ExcelJS.Workbook();
    await fallbackWorkbook.xlsx.load(Buffer.from(fallbackBytes as ArrayBuffer) as unknown as Parameters<typeof fallbackWorkbook.xlsx.load>[0]);
    expect(fallbackWorkbook.getWorksheet("_Listas")?.getCell("A2").value).toBe("PRINCIPAL");
  });

  it("exige proveedor y moneda en nuevos ítems de Almacén", async () => {
    const bytes = await createWorkbook("inventory", {
      "Almacén": [[null, "PVC", "PVC flexible", "MATERIA_PRIMA", null, null, null, null, null, null, "KG", "OPTIONAL", 10, "SI"]],
    }, { fileKind: "TEMPLATE" });
    const result = await validateWorkbook("inventory", bytes as ArrayBuffer);

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "proveedor_nombre", code: "REQUIRED_FIELD" }),
      expect.objectContaining({ field: "moneda", code: "REQUIRED_FIELD" }),
    ]));
  });

  it("acepta un reporte que conserva el mismo formato de la plantilla", async () => {
    const bytes = await createWorkbook("products", {
      Productos: [["ZAP-001", "ZAP-001", "I0034", "Zapato clásico", "Calzado", "Modelo de prueba", "SI", "ZAP-001-38-NEG", "38", "NEG", null, "UN", 0, 120, "SI"]],
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

  it("no incluye la columna de tasa de IGV en el formato de Compras", async () => {
    const bytes = await createWorkbook("purchases");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes as ArrayBuffer) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const headers = workbook.getWorksheet("Compras")?.getRow(1).values;
    expect(headers).not.toContain("IGV (%)");
    expect(headers).not.toContain("tasa_igv");
    expect(headers).toContain("Precio sin IGV por unidad");
  });

  it("tolera la columna heredada IGV (%) en archivos de Compras anteriores", async () => {
    const bytes = await createWorkbook("purchases");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(bytes as ArrayBuffer) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheet = workbook.getWorksheet("Compras")!;
    sheet.getRow(1).getCell(28).value = "IGV (%)";
    const result = await validateWorkbook("purchases", await workbook.xlsx.writeBuffer() as ArrayBuffer);

    expect(result.errors.filter((error) => error.code === "UNKNOWN_HEADER" || error.code === "DUPLICATE_HEADER")).toEqual([]);
  });

  it("marca como error los valores no numéricos y acepta guiones como vacío", async () => {
    const bytes = await createWorkbook("inventory", {
      "Almacén": [[null, "PVC", "PVC flexible", "MATERIA_PRIMA", "Polímeros Andinos SAC", null, "PEN", "abc", "18", null, "KG", "OPTIONAL", "diez", "SI", "PRINCIPAL", "-"]],
    });
    const result = await validateWorkbook("inventory", bytes as ArrayBuffer);

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "precio_neto", code: "INVALID_NUMBER" }),
      expect.objectContaining({ field: "stock_minimo", code: "INVALID_NUMBER" }),
    ]));
    expect(result.errors.some((error) => error.field === "stock_inicial" && error.code === "INVALID_NUMBER")).toBe(false);
  });

  it("rechaza precios no numéricos en Compras", async () => {
    const bytes = await createWorkbook("purchases", {
      Compras: [["COMP-001", null, 1, "2026-10-01", "PROV-01", "FACTURA", "F001", "1", "PEN", 1, "PENDIENTE", null, 1, 1, "MAT-01", null, null, 2, "SACO", 5, "KG", "abc"]],
    });
    const result = await validateWorkbook("purchases", bytes as ArrayBuffer);

    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "precio_neto_unidad_base", code: "INVALID_NUMBER" }),
    ]));
  });

  it("permite varios lotes distintos para una misma línea de compra", async () => {
    const bytes = await createWorkbook("purchases", {
      Compras: [
        ["COMP-001", null, 1, "2026-10-01", "PROV-01", "FACTURA", "F001", "1", "PEN", 1, "PENDIENTE", null, 1, 1, "MAT-01", "LOTE-A", null, 2, "SACO", 5, "KG", 10],
        ["COMP-001", null, 1, "2026-10-01", "PROV-01", "FACTURA", "F001", "1", "PEN", 1, "PENDIENTE", null, 1, 2, "MAT-01", "LOTE-B", null, 2, "SACO", 5, "KG", 10],
      ],
    });
    const result = await validateWorkbook("purchases", bytes as ArrayBuffer);

    expect(result.errors.filter((error) => error.code === "DUPLICATE_ROW")).toEqual([]);
  });
});
