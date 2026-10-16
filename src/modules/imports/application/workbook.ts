import ExcelJS from "exceljs";

export const importModules = ["purchases", "inventory", "recipes", "products", "orders"] as const;
export type ImportModule = (typeof importModules)[number];
export type WorkbookData = Record<string, (string | number | Date | null | undefined)[][]>;
export type ParsedWorkbookRow = { rowNumber: number; values: Record<string, string> };
export type WorkbookFileKind = "TEMPLATE" | "REPORT";
export type WorkbookOptions = {
  reportPeriod?: { from: string; to: string };
  fileKind?: WorkbookFileKind;
  warehouses?: { code: string; name: string }[];
};

type SheetSpec = { name: string; columns: string[]; required: string[]; uniqueBy: string[][] };
type ModuleSpec = { label: string; permission: string; file: string; sheets: SheetSpec[] };

export const workbookSpecs: Record<ImportModule, ModuleSpec> = {
  purchases: {
    label: "Compras", permission: "purchases.read", file: "compras",
    sheets: [
      { name: "Compras", columns: ["codigo_compra", "referencia_orden_origen", "secuencia_recepcion", "fecha_recepcion", "proveedor_codigo", "tipo_documento", "serie_documento", "numero_documento", "moneda", "tipo_cambio_pen", "estado", "observaciones", "linea_numero", "lote_linea_numero", "material_codigo", "lote_proveedor", "fecha_vencimiento", "cantidad_presentaciones", "tipo_presentacion", "contenido_por_presentacion", "unidad_contenido", "precio_neto_unidad_base", "tasa_igv", "cantidad_base", "precio_unitario_con_igv", "subtotal_neto", "igv", "total_linea"], required: ["fecha_recepcion", "proveedor_codigo", "numero_documento", "moneda", "estado", "linea_numero", "material_codigo", "cantidad_presentaciones", "tipo_presentacion", "contenido_por_presentacion", "unidad_contenido", "precio_neto_unidad_base", "tasa_igv"], uniqueBy: [["codigo_compra", "linea_numero", "lote_linea_numero"], ["proveedor_codigo", "numero_documento", "secuencia_recepcion", "linea_numero", "lote_linea_numero"]] },
    ],
  },
  inventory: {
    label: "Almacén", permission: "inventory.read", file: "almacen",
    sheets: [
      { name: "Almacén", columns: ["codigo", "codigo_anterior", "sigla", "codigo_material_seg", "nombre", "tipo_item", "unidad_base", "modo_lote", "stock_minimo", "activo", "almacen_codigo", "stock_inicial", "costo_unitario_pen", "lote", "fecha_inicial", "observaciones"], required: ["nombre", "tipo_item", "unidad_base"], uniqueBy: [["codigo"], ["codigo_anterior"], ["nombre", "unidad_base", "almacen_codigo", "lote"]] },
    ],
  },
  recipes: {
    label: "Recetas", permission: "recipes.read", file: "recetas",
    sheets: [
      { name: "Recetas", columns: ["referencia_carga", "receta_codigo", "producto_codigo", "variante_sku", "version", "rendimiento", "unidad_salida", "estado", "material_codigo", "cantidad", "unidad", "merma_porcentaje"], required: ["referencia_carga", "producto_codigo", "version", "rendimiento", "material_codigo", "cantidad"], uniqueBy: [["referencia_carga", "version", "material_codigo"], ["receta_codigo", "version", "material_codigo"]] },
    ],
  },
  products: {
    label: "Productos", permission: "products.read", file: "productos",
    sheets: [
      { name: "Productos", columns: ["referencia_carga", "producto_codigo", "nombre", "categoria", "descripcion", "producto_activo", "sku", "talla", "color", "unidad", "stock_minimo", "precio_venta", "variante_activa"], required: ["referencia_carga", "nombre"], uniqueBy: [["sku"]] },
    ],
  },
  orders: {
    label: "Pedidos", permission: "orders.read", file: "pedidos",
    sheets: [
      { name: "Pedidos", columns: ["referencia_carga", "numero_pedido", "cliente_codigo", "fecha", "fecha_requerida", "moneda", "tipo_cambio_pen", "estado", "observaciones", "linea_numero", "sku", "cantidad", "precio_neto_unitario", "tasa_igv", "subtotal_neto", "igv", "total_linea"], required: ["referencia_carga", "cliente_codigo", "fecha", "linea_numero", "sku", "cantidad", "precio_neto_unitario"], uniqueBy: [["referencia_carga", "sku"], ["referencia_carga", "linea_numero"], ["numero_pedido", "sku"], ["numero_pedido", "linea_numero"]] },
    ],
  },
};

export function isImportModule(value: string): value is ImportModule {
  return importModules.includes(value as ImportModule);
}

function exampleValue(column: string): string | number {
  const examples: Record<string, string | number> = {
    referencia_carga: "REGISTRO-1", compra_referencia: "REGISTRO-1", item_referencia: "REGISTRO-1", receta_referencia: "REGISTRO-1", producto_referencia: "REGISTRO-1", pedido_referencia: "REGISTRO-1",
    codigo_compra: "(se genera)", referencia_orden_origen: "OC-0001", secuencia_recepcion: 1,
    fecha_recepcion: "2026-10-13", proveedor_codigo: "PROV-000001", tipo_documento: "FACTURA", serie_documento: "F001",
    numero_documento: "00001234", moneda: "PEN", tipo_cambio_pen: 1, fecha_tipo_cambio: "2026-10-13",
    fuente_tipo_cambio: "SUNAT", estado: "PENDIENTE", observaciones: "Registro de ejemplo", linea_numero: 1,
    lote_linea_numero: 1, material_codigo: "MP-000001", lote_proveedor: "LOTE-2026-01", fecha_vencimiento: "2027-10-13",
    cantidad_presentaciones: 25, tipo_presentacion: "SACO", contenido_por_presentacion: 20, unidad_contenido: "KG",
    cantidad_base: 500, precio_neto_unidad_base: 4.5, tasa_igv: 18, precio_unitario_con_igv: 5.31,
    subtotal_neto: 2250, igv: 405, total_linea: 2655, codigo: "(se genera)", codigo_anterior: "01", sigla: "PVC", codigo_material_seg: "", nombre: "PVC",
    tipo_item: "MATERIA_PRIMA", unidad_base: "KG", modo_lote: "OPTIONAL", almacen_codigo: "PRINCIPAL",
    stock_minimo: 10, activo: "SI", producto_activo: "SI", variante_activa: "SI", stock_inicial: 100, fecha_inicial: "2026-10-13", item_codigo: "MP-000001", lote: "LOTE-2026-01", fecha: "2026-10-13",
    cantidad: 100, costo_unitario_pen: 4.5, receta_codigo: "(se genera)", producto_codigo: "(se genera)",
    variante_sku: "ZAP-001-40-NEG", version: 1, rendimiento: 1, unidad_salida: "PAR",
    unidad: "KG", merma_porcentaje: 3, categoria: "Calzado", descripcion: "Zapato clásico", sku: "ZAP-001-40-NEG",
    talla: "40", color: "NEG", precio_venta: 120, numero_pedido: "(se genera)", cliente_codigo: "CLI-000001",
    fecha_requerida: "2026-10-20", precio_neto_unitario: 100,
  };
  return examples[column] ?? (column.includes("fecha") ? "2026-10-13" : column.includes("codigo") ? "COD-001" : "Ejemplo");
}

const columnDescriptions: Record<string, string> = {
  referencia_carga: "Identificador temporal que tú eliges para relacionar el registro principal con sus detalles dentro de este mismo Excel. No se guarda como código oficial. Ejemplo: COMPRA-1.",
  compra_referencia: "Debe repetir la Referencia temporal de la compra a la que pertenece esta línea.",
  item_referencia: "Debe repetir la Referencia temporal del ítem al que pertenece este movimiento inicial.",
  receta_referencia: "Debe repetir la Referencia temporal de la receta a la que pertenece este ingrediente.",
  producto_referencia: "Debe repetir la Referencia temporal del producto al que pertenece esta variante.",
  pedido_referencia: "Debe repetir la Referencia temporal del pedido al que pertenece esta línea.",
  codigo_compra: "Código oficial de la compra. Déjalo vacío al crear; el sistema lo genera. Consérvalo al reimportar un reporte para reconocer registros existentes.",
  referencia_orden_origen: "Número o código de la orden de compra externa que originó la recepción, si existe.",
  secuencia_recepcion: "Número correlativo cuando una misma orden se recibe en varias entregas.",
  fecha_recepcion: "Fecha en que la mercadería fue recibida físicamente.",
  proveedor_codigo: "Código del proveedor registrado en el sistema.",
  tipo_documento: "Tipo de comprobante o guía entregado por el proveedor, por ejemplo FACTURA o GUIA.",
  serie_documento: "Serie del documento del proveedor, por ejemplo F001.",
  numero_documento: "Número del documento o guía del proveedor.",
  moneda: "Moneda de la operación. Usa PEN o USD.",
  tipo_cambio_pen: "Valor en soles de una unidad de la moneda de la operación. Para PEN usa 1.",
  fecha_tipo_cambio: "Fecha del tipo de cambio utilizado.",
  fuente_tipo_cambio: "Origen del tipo de cambio, por ejemplo SUNAT.",
  estado: "Estado operativo del registro. Usa uno de los valores admitidos para el módulo, por ejemplo PENDIENTE, APROBADO o RECHAZADO.",
  observaciones: "Comentario adicional o aclaración del registro.",
  linea_numero: "Número correlativo de la línea dentro de la compra o pedido. Empieza normalmente en 1.",
  lote_linea_numero: "Número correlativo del lote dentro de una línea de compra cuando una línea contiene más de un lote.",
  material_codigo: "Código oficial de la materia prima o material ya registrado en Almacén.",
  lote_proveedor: "Código de lote indicado por el proveedor. Puede dejarse vacío si el material no controla lote.",
  fecha_vencimiento: "Fecha de vencimiento del lote, cuando corresponda.",
  cantidad_presentaciones: "Número de bultos o envases recibidos, por ejemplo 25 sacos.",
  tipo_presentacion: "Tipo de empaque recibido, por ejemplo SACO, BOTELLA o CILINDRO.",
  contenido_por_presentacion: "Contenido de cada presentación, por ejemplo 20 si cada saco contiene 20 kg.",
  unidad_contenido: "Unidad del contenido de cada presentación, por ejemplo KG o L.",
  cantidad_base: "Cantidad total recibida en la unidad base: cantidad_presentaciones × contenido_por_presentacion. El sistema la recalcula.",
  precio_neto_unidad_base: "Precio sin IGV por cada unidad base, por ejemplo precio por kilogramo.",
  tasa_igv: "Porcentaje de IGV. Para una tasa de 18 %, escribe 18.",
  precio_unitario_con_igv: "Precio unitario incluido IGV. Es informativo y el sistema lo recalcula.",
  subtotal_neto: "Importe total sin IGV de la línea. Es informativo y el sistema lo recalcula.",
  igv: "Importe del IGV de la línea. Es informativo y el sistema lo recalcula.",
  total_linea: "Precio final de la línea incluido IGV. Es informativo y el sistema lo recalcula.",
  codigo: "Código oficial del ítem de Almacén. Déjalo vacío para crear uno nuevo; si informas un código existente, el sistema actualiza ese ítem.",
  codigo_anterior: "Código que identificaba al material en el sistema anterior. Se conserva para trazabilidad y no reemplaza el código automático de LK INNOVACIÓN.",
  sigla: "Abreviatura usada para identificar rápidamente el material, por ejemplo PVC, TR, RB o EVA.",
  codigo_material_seg: "Código secundario del material en el sistema anterior. Es opcional.",
  nombre: "Nombre descriptivo del ítem o producto.",
  tipo_item: "Clasificación del ítem, por ejemplo MATERIA_PRIMA o PRODUCTO_TERMINADO.",
  unidad_base: "Unidad en la que se controla el stock del ítem, por ejemplo KG, L, UND o PAR.",
  modo_lote: "Define el control por lote: REQUIRED, OPTIONAL o NONE.",
  almacen_codigo: "Código del almacén. Selecciónalo de la lista; si lo dejas vacío en MovimientosIniciales, el sistema usa PRINCIPAL.",
  stock_minimo: "Cantidad mínima deseada antes de generar una alerta de reposición.",
  activo: "Indica si el registro está habilitado. Usa SI o NO.",
  producto_activo: "Indica si el producto está habilitado. Usa SI o NO.",
  variante_activa: "Indica si la variante está habilitada. Usa SI o NO.",
  stock_inicial: "Cantidad existente al comenzar a utilizar el sistema. Déjala vacía o en cero si el artículo inicia sin stock.",
  fecha_inicial: "Fecha a la que corresponde el stock inicial. Es obligatoria cuando informas una cantidad inicial.",
  item_codigo: "Código oficial del ítem existente en Almacén. Para un ítem nuevo también puedes vincularlo mediante su Referencia temporal.",
  lote: "Código del lote del movimiento inicial, si el ítem controla lotes.",
  fecha: "Fecha del movimiento o del pedido.",
  cantidad: "Cantidad del movimiento, ingrediente o pedido, expresada en la unidad indicada.",
  costo_unitario_pen: "Costo en soles por cada unidad base del ítem.",
  receta_codigo: "Código oficial de la receta. Déjalo vacío para crear una nueva; si informas un código existente, el sistema crea la actualización correspondiente.",
  producto_codigo: "Código oficial del producto. En Productos puede dejarse vacío al crear; en Recetas identifica el producto ya registrado.",
  variante_sku: "SKU de la variante específica que producirá la receta. Déjalo vacío si la receta aplica al producto en general.",
  version: "Número de versión de la receta. Permite conservar cambios históricos sin reemplazar versiones anteriores.",
  rendimiento: "Cantidad de producto terminado obtenida al ejecutar una receta completa.",
  unidad_salida: "Unidad del rendimiento de la receta, por ejemplo PAR o UND.",
  unidad: "Unidad de medida de la cantidad del ingrediente o de la variante, según la hoja.",
  merma_porcentaje: "Porcentaje adicional previsto por pérdida del material durante la producción.",
  categoria: "Categoría comercial del producto.",
  descripcion: "Descripción ampliada del producto.",
  sku: "Código único de la variante de talla y color. Lo usan pedidos, producción y stock.",
  talla: "Talla de la variante del producto.",
  color: "Color de la variante del producto.",
  precio_venta: "Precio de venta de la variante.",
  numero_pedido: "Código oficial del pedido. Déjalo vacío al crear; el sistema lo genera y lo incluye en los reportes.",
  cliente_codigo: "Código del cliente registrado en el sistema.",
  fecha_requerida: "Fecha en la que el cliente necesita recibir el pedido.",
  precio_neto_unitario: "Precio de venta por unidad sin IGV.",
};

function describeColumn(sheet: string, column: string) {
  const contextual: Record<string, string> = {
    "Recetas.estado": "Estado de la receta, por ejemplo BORRADOR, ACTIVA o INACTIVA.",
    "Pedidos.estado": "Estado del pedido, por ejemplo BORRADOR, CONFIRMADO, EN_PROCESO, ATENDIDO o CANCELADO.",
  };
  return contextual[`${sheet}.${column}`] ?? columnDescriptions[column] ?? "Dato utilizado por el módulo para registrar o relacionar este campo.";
}

const friendlyLabels: Record<string, string> = {
  referencia_carga: "Referencia temporal",
  compra_referencia: "Referencia de compra",
  item_referencia: "Referencia del ítem",
  receta_referencia: "Referencia de receta",
  producto_referencia: "Referencia de producto",
  pedido_referencia: "Referencia de pedido",
  codigo_compra: "Código de compra",
  referencia_orden_origen: "Orden de compra de origen",
  secuencia_recepcion: "N.º de recepción",
  fecha_recepcion: "Fecha de recepción",
  proveedor_codigo: "Código de proveedor",
  tipo_documento: "Tipo de documento",
  serie_documento: "Serie del documento",
  numero_documento: "Número del documento",
  moneda: "Moneda",
  tipo_cambio_pen: "Tipo de cambio a PEN",
  fecha_tipo_cambio: "Fecha del tipo de cambio",
  fuente_tipo_cambio: "Fuente del tipo de cambio",
  estado: "Estado",
  observaciones: "Observaciones",
  linea_numero: "N.º de línea",
  lote_linea_numero: "N.º de lote en la línea",
  material_codigo: "Código de material",
  lote_proveedor: "Lote del proveedor",
  fecha_vencimiento: "Fecha de vencimiento",
  cantidad_presentaciones: "Cantidad de presentaciones",
  tipo_presentacion: "Tipo de presentación",
  contenido_por_presentacion: "Contenido por presentación",
  unidad_contenido: "Unidad del contenido",
  cantidad_base: "Cantidad total",
  precio_neto_unidad_base: "Precio sin IGV por unidad",
  tasa_igv: "IGV (%)",
  precio_unitario_con_igv: "Precio unitario con IGV",
  subtotal_neto: "Subtotal sin IGV",
  igv: "Importe de IGV",
  total_linea: "Total de la línea",
  codigo: "Código",
  codigo_anterior: "Código anterior",
  sigla: "Sigla",
  codigo_material_seg: "Código Material SEG",
  nombre: "Nombre",
  tipo_item: "Tipo de ítem",
  unidad_base: "Unidad de medida",
  modo_lote: "Control de lote",
  almacen_codigo: "Almacén",
  stock_minimo: "Stock mínimo",
  activo: "Activo",
  producto_activo: "Producto activo",
  variante_activa: "Variante activa",
  item_codigo: "Código del ítem",
  lote: "Lote",
  fecha: "Fecha",
  cantidad: "Cantidad",
  costo_unitario_pen: "Costo unitario (PEN)",
  stock_inicial: "Stock inicial",
  fecha_inicial: "Fecha del stock inicial",
  receta_codigo: "Código de receta",
  producto_codigo: "Código de producto",
  variante_sku: "SKU de variante",
  version: "Versión",
  rendimiento: "Rendimiento",
  unidad_salida: "Unidad de salida",
  unidad: "Unidad de medida",
  merma_porcentaje: "Merma (%)",
  categoria: "Categoría",
  descripcion: "Descripción",
  sku: "SKU",
  talla: "Talla",
  color: "Color",
  precio_venta: "Precio de venta",
  numero_pedido: "Número de pedido",
  cliente_codigo: "Código de cliente",
  fecha_requerida: "Fecha requerida",
  precio_neto_unitario: "Precio unitario sin IGV",
};

function friendlyLabel(sheet: string, column: string) {
  const contextual: Record<string, string> = {
    "MovimientosIniciales.fecha": "Fecha del movimiento",
    "MovimientosIniciales.cantidad": "Cantidad inicial",
    "Ingredientes.cantidad": "Cantidad requerida",
    "Pedidos.fecha": "Fecha del pedido",
    "DetallePedido.cantidad": "Cantidad solicitada",
  };
  return contextual[`${sheet}.${column}`] ?? friendlyLabels[column] ?? column;
}

function normalizeHeader(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function resolveHeader(sheet: string, columns: string[], value: string) {
  const normalized = normalizeHeader(value);
  return columns.find((column) => normalizeHeader(column) === normalized || normalizeHeader(friendlyLabel(sheet, column)) === normalized);
}

export async function createWorkbook(module: ImportModule, data: WorkbookData = {}, options: WorkbookOptions = {}) {
  const spec = workbookSpecs[module];
  const fileKind = options.fileKind ?? (Object.keys(data).length ? "REPORT" : "TEMPLATE");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "LK INNOVACION";
  workbook.created = new Date();
  workbook.modified = new Date();

  const instructions = workbook.addWorksheet("Instrucciones", { views: [{ showGridLines: false }] });
  instructions.columns = [{ width: 34 }, { width: 78 }, { width: 18 }, { width: 28 }];
  instructions.addRows([
    ["LK INNOVACION", `Formato de ${spec.label}`],
    ["Versión", "1.5"],
    ["Tipo de archivo", fileKind],
    ["Modo al importar", fileKind === "REPORT" ? "SOLO_NUEVOS: los registros existentes se omiten y nunca se actualizan." : "Un código vacío crea un registro; un código existente actualiza el registro correspondiente."],
    ["Uso", "No cambie los nombres de las hojas ni los encabezados. Complete una fila por registro y conserve los códigos tal como aparecen en el sistema."],
    ["Carga", "El sistema valida estructura y campos obligatorios antes de permitir la confirmación."],
    ["Estructura", "Cada módulo utiliza una sola hoja de datos. Cuando un documento, producto o receta ocupa varias filas, repite sus datos principales y utiliza la misma Referencia temporal."],
    ["Códigos automáticos", "La Referencia temporal enlaza las hojas del archivo y no se guarda como código. Deja vacío el código principal al crear: el sistema lo generará. Los reportes sí incluyen el código para reconocer registros existentes."],
    ["Concepto: Referencia temporal", "Es una etiqueta temporal creada por ti para unir una fila principal con sus filas de detalle en el mismo archivo. Repite el mismo valor en la columna Referencia correspondiente de la hoja de detalle. No se guarda como código oficial."],
    ...(module === "inventory" ? [["Lista de almacenes", "En almacen_codigo selecciona un código de la lista desplegable. La lista contiene los almacenes activos registrados; si no existe ninguno, se usa PRINCIPAL."]] : []),
  ]);
  for (const sheet of spec.sheets) {
    instructions.addRow([`${sheet.name} · obligatorios`, sheet.required.map((column) => friendlyLabel(sheet.name, column)).join(", ")]);
    instructions.addRow([`${sheet.name} · opcionales`, sheet.columns.filter((column) => !sheet.required.includes(column)).map((column) => friendlyLabel(sheet.name, column)).join(", ") || "Ninguno"]);
    const sectionHeader = instructions.addRow([`${sheet.name} · campo`, "¿Para qué sirve?", "Condición", "Ejemplo"]);
    sectionHeader.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    sectionHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173D32" } };
    for (const column of sheet.columns) instructions.addRow([friendlyLabel(sheet.name, column), describeColumn(sheet.name, column), sheet.required.includes(column) ? "Obligatorio" : "Opcional", exampleValue(column)]);
  }
  if (options.reportPeriod) instructions.addRow(["Periodo del reporte", `${options.reportPeriod.from} al ${options.reportPeriod.to}, ambas fechas incluidas`]);
  instructions.getRow(1).height = 28;
  instructions.getRow(1).font = { name: "Arial", size: 14, bold: true, color: { argb: "FF173D32" } };
  instructions.getColumn(1).font = { name: "Arial", size: 10, bold: true };
  [2, 3, 4].forEach((column) => {
    instructions.getColumn(column).font = { name: "Arial", size: 10 };
    instructions.getColumn(column).alignment = { wrapText: true, vertical: "top" };
  });
  instructions.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && row.height === undefined) row.height = 34;
    row.alignment = { wrapText: true, vertical: "top" };
  });

  const warehouseOptions = module === "inventory"
    ? Array.from(new Map((options.warehouses?.length ? options.warehouses : [{ code: "PRINCIPAL", name: "Almacén principal" }])
      .map((warehouse) => [warehouse.code.trim().toUpperCase(), { code: warehouse.code.trim().toUpperCase(), name: warehouse.name.trim() }])).values())
      .filter((warehouse) => warehouse.code)
    : [];
  const lists = warehouseOptions.length ? workbook.addWorksheet("_Listas", { state: "veryHidden" }) : null;
  if (lists) {
    lists.addRow(["almacen_codigo", "almacen_nombre"]);
    warehouseOptions.forEach((warehouse) => lists.addRow([warehouse.code, warehouse.name]));
  }

  for (const sheetSpec of spec.sheets) {
    const sheet = workbook.addWorksheet(sheetSpec.name, { views: [{ state: "frozen", ySplit: 1, showGridLines: false }] });
    sheet.columns = sheetSpec.columns.map((column) => {
      const header = friendlyLabel(sheetSpec.name, column);
      return { header, key: column, width: Math.min(32, Math.max(14, header.length + 3)) };
    });
    const rows = data[sheetSpec.name] ?? [];
    for (const row of rows) sheet.addRow(row);
    if (!rows.length) for (let index = 0; index < 20; index += 1) sheet.addRow([]);
    const header = sheet.getRow(1);
    header.height = 30;
    header.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    sheetSpec.columns.forEach((column, index) => {
      const cell = header.getCell(index + 1);
      const condition = sheetSpec.required.includes(column) ? "Obligatorio" : "Opcional";
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: sheetSpec.required.includes(column) ? "FF173D32" : "FF52606D" } };
      cell.note = `${describeColumn(sheetSpec.name, column)}\n\nCondición: ${condition}.\nEjemplo: ${exampleValue(column)}`;
      if (column === "almacen_codigo" && lists) {
        const listFormula = `'_Listas'!$A$2:$A$${warehouseOptions.length + 1}`;
        const lastRow = Math.max(1001, sheet.rowCount + 100);
        for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
          sheet.getCell(rowNumber, index + 1).dataValidation = {
            type: "list",
            allowBlank: !sheetSpec.required.includes(column),
            formulae: [listFormula],
            showInputMessage: true,
            promptTitle: "Almacén",
            prompt: "Selecciona el código de un almacén registrado.",
            showErrorMessage: true,
            errorStyle: "stop",
            errorTitle: "Almacén no válido",
            error: "Selecciona un almacén de la lista.",
          };
        }
      }
    });
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheetSpec.columns.length } };
    sheet.eachRow((row, rowNumber) => {
      row.font = rowNumber === 1 ? header.font : { name: "Arial", size: 10 };
      row.alignment = { vertical: "middle" };
    });
  }
  return workbook.xlsx.writeBuffer();
}

function cellValue(value: ExcelJS.CellValue) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("result" in value) return String(value.result ?? "");
    if ("text" in value) return String(value.text ?? "");
    if ("richText" in value) return value.richText.map((part) => part.text).join("");
  }
  return String(value).trim();
}

export async function validateWorkbook(module: ImportModule, bytes: ArrayBuffer) {
  const spec = workbookSpecs[module];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const errors: { rowNumber: number; field?: string; code: string; message: string; rawData?: Record<string, string> }[] = [];
  const warnings: { rowNumber: number; field?: string; code: string; message: string; rawData?: Record<string, string> }[] = [];
  const instructionSheet = workbook.getWorksheet("Instrucciones");
  let fileKind: WorkbookFileKind = "TEMPLATE";
  if (instructionSheet) for (let rowNumber = 1; rowNumber <= instructionSheet.rowCount; rowNumber += 1) {
    const row = instructionSheet.getRow(rowNumber);
    if (cellValue(row.getCell(1).value) === "Tipo de archivo" && cellValue(row.getCell(2).value).toUpperCase() === "REPORT") fileKind = "REPORT";
  }
  const preview: { sheet: string; rows: number; sample: Record<string, string>[] }[] = [];
  const data: Record<string, ParsedWorkbookRow[]> = {};
  let totalRows = 0;

  for (const sheetSpec of spec.sheets) {
    const sheet = workbook.getWorksheet(sheetSpec.name);
    if (!sheet) {
      errors.push({ rowNumber: 1, code: "MISSING_SHEET", message: `Falta la hoja ${sheetSpec.name}.` });
      continue;
    }
    const headerRow = sheet.getRow(1);
    const positions = new Map<string, number>();
    for (let index = 1; index <= headerRow.cellCount; index += 1) {
      const rawHeader = cellValue(headerRow.getCell(index).value);
      if (!rawHeader) continue;
      const canonical = resolveHeader(sheetSpec.name, sheetSpec.columns, rawHeader);
      if (!canonical) {
        if (normalizeHeader(rawHeader) === "accion") continue;
        errors.push({ rowNumber: 1, code: "UNKNOWN_HEADER", message: `${sheetSpec.name}: la columna “${rawHeader}” no es reconocida.` });
        continue;
      }
      if (positions.has(canonical)) {
        errors.push({ rowNumber: 1, field: canonical, code: "DUPLICATE_HEADER", message: `${sheetSpec.name}: la columna “${friendlyLabel(sheetSpec.name, canonical)}” está repetida.` });
        continue;
      }
      positions.set(canonical, index);
    }
    for (const column of sheetSpec.columns) if (!positions.has(column)) {
      errors.push({ rowNumber: 1, field: column, code: "MISSING_HEADER", message: `${sheetSpec.name}: falta la columna “${friendlyLabel(sheetSpec.name, column)}”.` });
    }
    const sample: Record<string, string>[] = [];
    const rows: ParsedWorkbookRow[] = [];
    const uniqueValues = sheetSpec.uniqueBy.map(() => new Map<string, { rowNumber: number; signature: string }>());
    let rowCount = 0;
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const record = Object.fromEntries(sheetSpec.columns.map((column) => [column, positions.has(column) ? cellValue(row.getCell(positions.get(column)!).value) : ""]));
      if (!Object.values(record).some(Boolean)) return;
      rowCount += 1;
      totalRows += 1;
      const required = sheetSpec.required;
      for (const field of required) if (!record[field]) errors.push({ rowNumber, field, code: "REQUIRED_FIELD", message: `${sheetSpec.name}: “${friendlyLabel(sheetSpec.name, field)}” es obligatorio.`, rawData: record });
      if (sheetSpec.name === "Almacén" && Number(record.stock_inicial || 0) > 0) {
        for (const field of ["costo_unitario_pen", "fecha_inicial"]) if (!record[field]) errors.push({ rowNumber, field, code: "REQUIRED_FIELD", message: `${sheetSpec.name}: “${friendlyLabel(sheetSpec.name, field)}” es obligatorio cuando existe stock inicial.`, rawData: record });
      }
      let identicalDuplicate = false;
      const signature = JSON.stringify(record);
      sheetSpec.uniqueBy.forEach((fields, uniqueIndex) => {
        if (fields.some((field) => !record[field])) return;
        const key = fields.map((field) => record[field].trim().toUpperCase()).join("\u001F");
        const first = uniqueValues[uniqueIndex].get(key);
        if (first?.signature === signature) {
          identicalDuplicate = true;
          warnings.push({ rowNumber, field: fields.join(", "), code: "DUPLICATE_IDENTICAL_SKIPPED", message: `${sheetSpec.name}: fila idéntica omitida; ya aparece en la fila ${first.rowNumber}.`, rawData: record });
        } else if (first) errors.push({ rowNumber, field: fields.join(", "), code: "DUPLICATE_CONFLICT", message: `${sheetSpec.name}: la clave ${fields.map((field) => friendlyLabel(sheetSpec.name, field)).join(" + ")} se repite con datos diferentes (primera aparición en la fila ${first.rowNumber}).`, rawData: record });
        else uniqueValues[uniqueIndex].set(key, { rowNumber, signature });
      });
      if (!identicalDuplicate) rows.push({ rowNumber, values: record });
      if (!identicalDuplicate && sample.length < 5) sample.push(record);
    });
    preview.push({ sheet: sheetSpec.name, rows: rowCount, sample });
    data[sheetSpec.name] = rows;
  }
  if (totalRows === 0) errors.push({ rowNumber: 1, code: "EMPTY_FILE", message: "El archivo no contiene filas para procesar." });
  if (totalRows > 1_000) errors.push({ rowNumber: 1, code: "ROW_LIMIT_EXCEEDED", message: "El archivo supera el máximo de 1,000 filas." });
  return { totalRows, errors: errors.slice(0, 200), warnings: warnings.slice(0, 200), preview, data, importMode: fileKind === "REPORT" ? "ONLY_NEW" as const : "CREATE_UPDATE" as const };
}
