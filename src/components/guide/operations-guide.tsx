"use client";

import { AuditOutlined, CheckCircleOutlined, LinkOutlined, OrderedListOutlined } from "@ant-design/icons";
import { Alert, Card, Col, Collapse, Row, Space, Table, Tag, Timeline, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { ModuleHeadingIntro } from "@/components/common/module-heading-intro";

type FieldRow = { key: string; field: string; required: boolean; rule: string };

const inventoryFields: FieldRow[] = [
  { key: "code", field: "Código", required: false, rule: "En Excel puede dejarse vacío: el sistema genera un correlativo. Los reportes conservan el código generado." },
  { key: "name", field: "Nombre", required: true, rule: "Nombre de la materia prima o merma recuperable." },
  { key: "type", field: "Tipo", required: true, rule: "Materia prima (MP) o Merma (MER). Los productos terminados se generan desde Productos." },
  { key: "supplier", field: "Proveedor", required: true, rule: "En el modal se selecciona un proveedor activo. En Excel debe coincidir por nombre; se ignoran mayúsculas, tildes y espacios repetidos." },
  { key: "currency", field: "Moneda", required: true, rule: "Selecciona una moneda registrada, por ejemplo PEN o USD. En Excel se admite su código o nombre." },
  { key: "unit", field: "Unidad de medida", required: true, rule: "Debe existir previamente en Catálogos: KG, L, UN, PAR, etc." },
];

const purchaseFields: FieldRow[] = [
  { key: "code", field: "Código", required: false, rule: "En Excel puede dejarse vacío: el sistema genera un correlativo. Los reportes conservan el código generado." },
  { key: "date", field: "Fecha de recepción", required: true, rule: "Fecha en la que se recibe físicamente la compra." },
  { key: "supplier", field: "Proveedor", required: true, rule: "Debe existir y estar activo en Catálogos." },
  { key: "document", field: "Documento / guía", required: true, rule: "No puede repetirse para el mismo proveedor y recepción." },
  { key: "lot", field: "Lote del proveedor", required: false, rule: "Opcional, salvo que la materia prima exija control de lote." },
  { key: "presentation", field: "Presentación", required: true, rule: "Tipo, cantidad y contenido. Ejemplo: 20 sacos de 10 kg." },
  { key: "received", field: "Cantidad recibida", required: true, rule: "Calculada: cantidad de presentaciones × contenido. Ejemplo: 20 × 10 = 200 kg." },
  { key: "price", field: "Precio", required: true, rule: "Precio neto por unidad base, mayor que cero." },
  { key: "tax", field: "IGV", required: true, rule: "18% por defecto; admite valores entre 0% y 100%." },
  { key: "status", field: "Estado", required: true, rule: "Pendiente al registrar; luego puede aprobarse o rechazarse." },
  { key: "final", field: "Precio final", required: true, rule: "Precio unitario con IGV = precio × (1 + IGV/100). Total = cantidad recibida × precio unitario con IGV." },
];

const fieldColumns: ColumnsType<FieldRow> = [
  { title: "Campo", dataIndex: "field", width: 180, render: (value) => <Typography.Text strong>{value}</Typography.Text> },
  { title: "Condición", dataIndex: "required", width: 110, render: (value) => <Tag color={value ? "red" : "default"}>{value ? "Obligatorio" : "Opcional"}</Tag> },
  { title: "Validación / ejemplo", dataIndex: "rule" },
];

const dependencies = [
  { key: "analytics", label: "Analítica", children: <p>Resume compras, inventario valorizado, producción, pedidos y alertas. Úsala para detectar stock bajo, pedidos próximos o vencidos y mantenimientos pendientes.</p> },
  { key: "catalogs", label: "Catálogos", children: <p>Es la base: registra unidades, almacenes, monedas, proveedores y clientes. Para proveedores y clientes selecciona DNI o RUC; la consulta externa completa los datos disponibles y siempre permite revisarlos antes de guardar.</p> },
  { key: "inventory", label: "Almacén", children: <p>Necesita unidades, almacenes, proveedores y monedas de Catálogos. Clasifica los ítems como Materia prima, Insumo elaborado o Merma; los productos terminados se generan desde Productos. Puedes registrar una presentación habitual, como BOLSA de 50 KG: es informativa y muestra la equivalencia del saldo, pero no cambia el stock ni el kardex. Para obtener un insumo C a partir de A y B, registra C con tipo Insumo elaborado y crea su composición desde Recetas.</p> },
  { key: "products", label: "Productos", children: <p>Necesita unidades, tallas, colores y el código interno de matriz. Cada variante admite C1 obligatorio y C2 opcional; el SKU se genera como MATRIZ-C1[-C2]-TALLA y queda vinculado al producto terminado en Almacén.</p> },
  { key: "purchases", label: "Compras", children: <p>Necesita proveedor, moneda, almacén y materias primas previamente registradas. Solo una compra aprobada incrementa el stock.</p> },
  { key: "recipes", label: "Recetas", children: <p>Concentra todas las combinaciones de materiales. En recetas de Producción, el rendimiento indica cuántos pares se obtienen con las cantidades registradas de cada material en su unidad de almacén (kg, L, und., etc.). Crear o activar una receta no cambia existencias: la orden calcula el consumo proporcional, reserva al liberarse y descuenta del kardex al iniciar. Si el destino es Almacén, elaborar la receta descuenta los ingredientes e ingresa el insumo resultante.</p> },
  { key: "production", label: "Producción", children: <p>Selecciona Formulación C1 y, para suelas bicolor, Formulación C2. Distribuye los pares entre las tallas registradas, vincula el pedido y agrega componentes opcionales con su cantidad total. Los turnos se registran por fecha. Al iniciar se consumen formulaciones y componentes; al finalizar cada talla ingresa a su SKU. La orden puede descargarse en Excel y PDF A5.</p> },
  { key: "machinery", label: "Maquinaria", children: <p>Registra prensas, inyectoras y otros equipos. Mantén su estado, fechas, costos de mantenimiento y reparaciones; los vencimientos alimentan las alertas y el Calendario. En <strong>Parámetros</strong> puedes guardar fichas versionadas por máquina, estación y canal, cargar una estructura para inyectora estática o rotativa e imprimir la revisión que utilizará el operario. Registra únicamente valores confirmados por personal autorizado y conserva una nueva revisión cuando cambie el material, molde o configuración.</p> },
  { key: "orders", label: "Pedidos", children: <p>Necesita un cliente y variantes de Productos. Al confirmar reserva el stock de producto terminado y queda disponible para preparación.</p> },
  { key: "pick-pack", label: "Pick & Pack y despacho", children: <p>Necesita un pedido confirmado. Picking registra lo recogido, packing registra lo empacado y cualquier diferencia exige una incidencia. Solo al despachar se descuenta del kardex la cantidad realmente empacada.</p> },
  { key: "calendar", label: "Calendario", children: <p>Se alimenta automáticamente de Pedidos, Producción, Pick & Pack y Mantenimiento. Los eventos manuales sirven para inventarios físicos, reuniones y tareas internas; en la vista Tareas pueden arrastrarse entre Pendiente, Finalizado y Cancelado.</p> },
  { key: "whiteboard", label: "Pizarra", children: <p>Es un espacio compartido por empresa para notas, dibujos e imágenes. Puedes pegar capturas con Ctrl+V, soltar archivos JPEG, PNG o WebP, mover y redimensionar los elementos. El borrador elimina trazos completos sin afectar notas o imágenes. Los cambios se guardan automáticamente y una revisión evita sobrescribir silenciosamente el trabajo de otra persona. Exportar PNG descarga la pizarra completa, incluso lo que queda fuera de la vista o del zoom actual, y se habilita de nuevo cuando detecta un cambio.</p> },
  { key: "access", label: "Usuarios, roles y sesiones", children: <p>El SUPERADMIN crea o edita usuarios, asigna roles, restablece contraseñas y revisa sesiones activas con hora e IP disponible. Revocar una sesión cierra el acceso de ese dispositivo.</p> },
  { key: "excel", label: "Excel e importaciones", children: <p>Compras, Almacén, Recetas, Productos y Pedidos tienen plantilla, importación y reporte. En Almacén, Tipo de presentación y Contenido por presentación son opcionales, pero deben completarse juntos; el contenido usa la unidad base. En Recetas usa una fila por ingrediente: Tipo de resultado acepta PRODUCCION o ALMACEN, y Código del resultado identifica el producto final o insumo elaborado. Un código de receta existente crea una nueva versión; los repetidos de un reporte se omiten.</p> },
];

const criticalRules = [
  { key: "stock", label: "¿Cuándo cambia el stock?", children: <p>Una compra solo ingresa stock al aprobarse. Una receta no mueve existencias. Producción consume al iniciar e ingresa productos terminados al finalizar. Pick & Pack descuenta al despachar.</p> },
  { key: "finished", label: "¿Dónde registro un producto terminado?", children: <p>En Productos, nunca como alta manual de Almacén. Al crear matriz, tallas y colores se genera cada SKU y su existencia terminada con stock cero.</p> },
  { key: "waste", label: "¿Cómo manejo la merma?", children: <p>Si el sobrante es medible, almacenado y reutilizable, regístralo en Almacén como tipo Merma y podrás usarlo después como ingrediente. La pérdida real del proceso se declara por material al finalizar la orden de producción, porque puede variar entre órdenes.</p> },
  { key: "intermediate", label: "¿Cómo creo un insumo con otros insumos?", children: <p>Crea primero C en Almacén como Insumo elaborado y con stock cero. Luego crea una Receta con destino Almacén, selecciona C como resultado y agrega A y B como ingredientes. Actívala y usa Enviar a Almacén: indica almacén, cantidad obtenida, merma real y lote. El sistema descuenta A y B, aumenta C y calcula su costo promedio con el valor consumido.</p> },
  { key: "production-status", label: "Estados de Producción", children: <p>Pendiente → En curso → Finalizado. El tablero permite cambiar el estado arrastrando tarjetas también en móvil; las transiciones aplican las mismas reglas de stock y Kardex.</p> },
  { key: "passwords", label: "Contraseñas y sesiones", children: <p>Las contraseñas no pueden visualizarse porque se guardan como hash. El SUPERADMIN puede asignar una contraseña temporal de al menos 6 caracteres; el usuario deberá cambiarla y sus sesiones anteriores quedarán revocadas.</p> },
  { key: "taxpayer", label: "Consulta DNI/RUC", children: <p>Selecciona primero el tipo de documento en Proveedores o Clientes. El sistema consulta desde el servidor, usa aleatoriamente una de las dos claves configuradas y prueba la segunda si la primera está limitada o no disponible.</p> },
];

export function OperationsGuide() {
  return (
    <>
      <div className="page-heading">
        <ModuleHeadingIntro title="Guía de operación" eyebrow="Ayuda" description="Consulta el orden recomendado, las dependencias entre módulos y los campos obligatorios antes de registrar información." />
      </div>

      <Alert type="info" showIcon message="Orden recomendado para iniciar" description="Configura accesos y Catálogos; registra materias primas y mermas; crea Productos y Recetas; luego opera Compras, Pedidos, Producción y Despacho." style={{ marginBottom: 18 }} />
      <Alert type="success" showIcon message="Códigos automáticos" description="Compras (CMP), materias primas (MP), mermas (MER), productos terminados (PT), recetas (REC), producción (OP), maquinaria (MAQ), pedidos (PED), Pick & Pack (PP), proveedores (PROV) y clientes (CLI) reciben su código al guardar. En Excel deja el código vacío para crear; conserva el código del reporte para reconocer un registro existente." style={{ marginBottom: 18 }} />
      <Alert type="info" showIcon message="Automatizaciones principales" description="Los SKU se generan desde Matriz-C1[-C2]-Talla; el stock se actualiza mediante documentos operativos; el Calendario concentra fechas y las alertas aparecen en Analítica y Notificaciones." style={{ marginBottom: 18 }} />

      <Row gutter={[18, 18]}>
        <Col xs={24} lg={10}>
          <Card className="section-card" title={<Space><OrderedListOutlined />Flujo inicial</Space>}>
            <Timeline items={[
              { color: "green", children: <><strong>1. Accesos y Catálogos</strong><br />Usuarios, roles, unidades, almacenes, monedas y terceros.</> },
              { color: "green", children: <><strong>2. Almacén</strong><br />Materias primas y mermas con stock cero o saldo físico verificado.</> },
              { color: "green", children: <><strong>3. Productos</strong><br />Matriz, tallas, colores y SKU terminados automáticos.</> },
              { color: "green", children: <><strong>4. Compras y Recetas</strong><br />Abastece insumos y define formulaciones con rendimiento en pares.</> },
              { color: "green", children: <><strong>5. Pedidos y Producción</strong><br />Programa por talla, colores, pedido, máquina y turnos.</> },
              { color: "blue", children: <><strong>6. Pick & Pack</strong><br />Recoge, empaca, imprime el formato y despacha.</> },
              { color: "blue", children: <><strong>7. Control</strong><br />Supervisa Analítica, Calendario, alertas, Kardex y sesiones.</> },
            ]} />
          </Card>
        </Col>
        <Col xs={24} lg={14}>
          <Card className="section-card" title={<Space><LinkOutlined />Dependencias por módulo</Space>}>
            <Collapse items={dependencies} defaultActiveKey={["inventory", "products", "production"]} />
          </Card>
        </Col>
      </Row>

      <Card className="section-card guide-fields-card" title={<Space><LinkOutlined />Reglas críticas del sistema</Space>}>
        <Collapse items={criticalRules} defaultActiveKey={["stock", "finished", "waste"]} />
      </Card>

      <Card className="section-card guide-fields-card" title={<Space><AuditOutlined />Puesta en marcha del stock</Space>}>
        <Alert
          type="warning"
          showIcon
          message="No cargues cantidades antiguas si ya hubo consumo"
          description="Registra los ítems con stock cero y utiliza como saldo inicial únicamente la cantidad que resulte del conteo o pesaje físico actual."
          style={{ marginBottom: 18 }}
        />
        <Timeline items={[
          { color: "green", children: <><strong>1. Registra el catálogo en cero</strong><br />Crea materias primas y mermas sin inventar existencias. Los terminados nacen desde Productos.</> },
          { color: "green", children: <><strong>2. Define una fecha de corte</strong><br />Realiza el conteo o pesaje físico y evita movimientos mientras termina el levantamiento.</> },
          { color: "green", children: <><strong>3. Registra el saldo verificado</strong><br />En Almacén abre Más acciones → Registrar saldo inicial. Indica almacén, cantidad, costo y lote cuando corresponda.</> },
          { color: "green", children: <><strong>4. Revisa el kardex</strong><br />Confirma que cada ítem tenga la cantidad y valoración correctas antes de iniciar Compras y Producción.</> },
          { color: "blue", children: <><strong>5. Continúa con la operación normal</strong><br />Desde la fecha de corte, el stock cambia mediante compras aprobadas, consumos y terminaciones de producción.</> },
        ]} />
        <Typography.Paragraph type="secondary" style={{ marginBottom: 0 }}>
          El saldo inicial se usa una sola vez por existencia. No sirve para corregir diferencias posteriores y será rechazado si el ítem o lote ya tiene movimientos.
        </Typography.Paragraph>
      </Card>

      <Card className="section-card guide-fields-card" title={<Space><CheckCircleOutlined />Campos obligatorios de Almacén</Space>}>
        <Table rowKey="key" size="small" columns={fieldColumns} dataSource={inventoryFields} pagination={false} scroll={{ x: 620 }} />
      </Card>
      <Card className="section-card guide-fields-card" title={<Space><CheckCircleOutlined />Campos de Compras</Space>}>
        <Table rowKey="key" size="small" columns={fieldColumns} dataSource={purchaseFields} pagination={false} scroll={{ x: 700 }} />
      </Card>
    </>
  );
}
