// server.js

require('dotenv').config(); // Carga las variables de entorno
const express = require('express');
const cors = require('cors'); // Habilitar CORS para todas las rutas
const sql = require('mssql');

const app = express();
app.use(cors()); // Habilitar CORS para todas las rutas
app.use(express.json()); // Habilitar el uso de JSON en las peticiones

// --- DEBUG: Loguear variables de entorno para depuración ---
console.log("DEBUG: process.env.DB_USER:", process.env.DB_USER ? "Defined" : "Undefined");
console.log("DEBUG: process.env.DB_PASSWORD:", process.env.DB_PASSWORD ? "Defined" : "Undefined");
console.log("DEBUG: process.env.DB_SERVER:", process.env.DB_SERVER ? "Defined" : "Undefined");
console.log("DEBUG: process.env.DB_NAME_QUITO:", process.env.DB_NAME_QUITO ? `Defined as "${process.env.DB_NAME_QUITO}"` : "Undefined");
console.log("DEBUG: process.env.DB_NAME_GUAYAQUIL:", process.env.DB_NAME_GUAYAQUIL ? `Defined as "${process.env.DB_NAME_GUAYAQUIL}"` : "Undefined");
// Si tienes otras ciudades, añade logs para ellas también:
// console.log("DEBUG: process.env.DB_NAME_CUENCA:", process.env.DB_NAME_CUENCA ? `Defined as "${process.env.DB_NAME_CUENCA}"` : "Undefined");
// console.log("DEBUG: process.env.DB_NAME_MANTA:", process.env.DB_NAME_MANTA ? `Defined as "${process.env.DB_NAME_MANTA}"` : "Undefined");
// --- FIN DEBUG ---

// Objeto de configuración de bases de datos por ciudad (desde el ejemplo que proporcionaste)
// Asegúrate de que estas variables de entorno estén definidas en tu archivo .env
const configByCity = {};

if (process.env.DB_NAME_QUITO) {
  configByCity.QUI = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME_QUITO,
    options: {
      encrypt: true,
      trustServerCertificate: true // Cambiar a false en producción si usas certificados válidos
    }
  };
}

if (process.env.DB_NAME_GUAYAQUIL) {
  configByCity.GYE = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME_GUAYAQUIL,
    options: {
      encrypt: true,
      trustServerCertificate: true
    }
  };
}

// Puedes descomentar y configurar otras ciudades aquí si sus variables de entorno están definidas
// if (process.env.DB_NAME_CUENCA) {
//   configByCity.CUE = {
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD,
//     server: process.env.DB_SERVER,
//     database: process.env.DB_NAME_CUENCA,
//     options: {
//       encrypt: true,
//       trustServerCertificate: true
//     }
//   };
// }
// if (process.env.DB_NAME_MANTA) {
//   configByCity.MAN = {
//     user: process.env.DB_USER,
//     password: process.env.DB_PASSWORD,
//     server: process.env.DB_SERVER,
//     database: process.env.DB_NAME_MANTA,
//     options: {
//       encrypt: true,
//       trustServerCertificate: true
//     }
//   };
// }

// --- DEBUG: Loguear configByCity después de su inicialización ---
console.log("DEBUG: configByCity after initialization:", JSON.stringify(configByCity, null, 2));
// --- FIN DEBUG ---


// Objeto para almacenar pools de conexión ya creados y reutilizarlos.
const connectionPools = {};

/**
 * Obtiene o crea una nueva conexión de pool para la base de datos de una ciudad específica.
 * Reutiliza pools existentes si ya han sido creados para esa ciudad.
 * @param {string} cityCode El código de la ciudad (ej. 'QUI', 'GYE').
 * @returns {Promise<sql.ConnectionPool>} Una promesa que resuelve con un objeto ConnectionPool.
 */
const getConnection = async (cityCode) => {
  if (!cityCode) {
    throw new Error('cityCode no puede ser undefined o nulo para establecer la conexión.');
  }

  const normalizedCityCode = cityCode.toUpperCase();

  // Si ya tenemos un pool para esta ciudad y está conectado, lo devolvemos.
  if (connectionPools[normalizedCityCode] && connectionPools[normalizedCityCode].connected) {
    console.log(`DEBUG: Reutilizando pool existente para la ciudad ${normalizedCityCode}`); // Nuevo log
    return connectionPools[normalizedCityCode];
  }

  const dbConfig = configByCity[normalizedCityCode];
  if (!dbConfig) {
    throw new Error(`Ciudad no válida para conexión: ${cityCode}. Asegúrate de que la configuración exista.`);
  }

  try {
    console.log(`DEBUG: Intentando conectar a la base de datos: ${dbConfig.database} para la ciudad ${normalizedCityCode}`); // Nuevo log
    const pool = new sql.ConnectionPool(dbConfig);
    await pool.connect();
    // Almacenamos el pool para futura reutilización.
    connectionPools[normalizedCityCode] = pool;
    console.log(`Conectado a la base de datos ${dbConfig.database} para la ciudad ${normalizedCityCode}`);
    return pool;
  } catch (err) {
    console.error(`Error al conectar a la base de datos ${dbConfig.database} para la ciudad ${normalizedCityCode}:`, err);
    // Eliminar el pool si la conexión falló para intentar de nuevo más tarde si es necesario.
    if (connectionPools[normalizedCityCode]) {
      delete connectionPools[normalizedCityCode];
    }
    throw err; // Re-lanza el error para que sea manejado por la ruta de la API.
  }
};

// --- Rutas de la API ---

// Ruta para obtener las ciudades (AHORA DEVUELVE NOMBRES DE BASE DE DATOS)
app.get('/api/ciudades', (req, res) => {
    // Genera la lista de ciudades dinámicamente desde configByCity
    const ciudadesDisponibles = Object.keys(configByCity).map(key => {
        // Obtener el nombre de la base de datos directamente de la configuración
        const dbName = configByCity[key].database;
        return { id_Ciudad: key, db_name: dbName }; // Cambiado ciu_descripcion a db_name
    });
    res.json(ciudadesDisponibles);
});

// Facturas por ciudad o todas
app.get('/api/facturas', async (req, res) => {
    try {
        const ciudad = req.query.ciudad || 'ALL'; // Valor por defecto 'ALL'
        let facturasResult = [];

        if (ciudad === 'ALL') {
            const ciudadesDisponibles = Object.keys(configByCity);
            const promesasFacturas = ciudadesDisponibles.map(async c => {
                let currentPool;
                try {
                    currentPool = await getConnection(c);
                    const request = currentPool.request();
                    // Usar un query directo para mayor control del filtro id_Ciudad si el SP no lo maneja
                    const query = `
                        SELECT
                            F.id_Factura,
                            F.fac_Fecha_Hora,
                            F.fac_Descripcion,
                            F.fac_Subtotal,
                            F.fac_IVA,
                            (F.fac_Subtotal + F.fac_IVA) AS fac_Total,
                            C.cli_Nombre AS cli_Nombre,
                            CIU.ciu_descripcion AS CiudadCliente,
                            CIU.id_Ciudad AS id_Ciudad_Cliente,
                            F.ESTADO_FAC
                        FROM FACTURAS F
                        INNER JOIN CLIENTES C ON F.id_Cliente = C.id_Cliente
                        INNER JOIN CIUDADES CIU ON C.id_Ciudad = CIU.id_Ciudad
                        ORDER BY F.fac_Fecha_Hora DESC;
                    `;
                    const result = await request.query(query);
                    currentPool.close();
                    // Añadir el nombre de la base de datos en lugar del código de ciudad
                    return result.recordset.map(f => ({ ...f, CiudadDB: configByCity[c].database }));
                } catch (innerErr) {
                    console.error(`Error al obtener facturas de ${c}:`, innerErr);
                    return [];
                }
            });
            facturasResult = (await Promise.all(promesasFacturas)).flat();
        } else {
            let pool;
            try {
                pool = await getConnection(ciudad);
                const request = pool.request();
                const query = `
                    SELECT
                        F.id_Factura,
                        F.fac_Fecha_Hora,
                        F.fac_Descripcion,
                        F.fac_Subtotal,
                        F.fac_IVA,
                        (F.fac_Subtotal + F.fac_IVA) AS fac_Total,
                        C.cli_Nombre AS cli_Nombre,
                        CIU.ciu_descripcion AS CiudadCliente,
                        CIU.id_Ciudad AS id_Ciudad_Cliente,
                        F.ESTADO_FAC
                    FROM FACTURAS F
                    INNER JOIN CLIENTES C ON F.id_Cliente = C.id_Cliente
                    INNER JOIN CIUDADES CIU ON C.id_Ciudad = CIU.id_Ciudad
                    WHERE CIU.id_Ciudad = @ciudad -- CORRECCIÓN: Usar CIU.id_Ciudad en lugar de F.id_Ciudad
                    ORDER BY F.fac_Fecha_Hora DESC;
                `;
                request.input('ciudad', sql.Char(3), ciudad);
                const result = await request.query(query);
                pool.close();
                // Añadir el nombre de la base de datos en lugar del código de ciudad
                facturasResult = result.recordset.map(f => ({ ...f, CiudadDB: configByCity[ciudad].database }));
            }
            catch (err) {
                console.error(`Error al obtener facturas para la ciudad ${ciudad}:`, err);
                return res.status(500).send(`Error al obtener facturas para la ciudad ${ciudad}`);
            }
        }
        res.json(facturasResult);
    } catch (err) {
        console.error('Error general al obtener facturas:', err);
        res.status(500).send('Error al obtener facturas');
    }
});

// Detalle de factura (necesita la ciudad en query params)
app.get('/api/facturas/detalle/:id', async (req, res) => {
    const { ciudad } = req.query;
    const { id } = req.params;
    const ciudades = Object.keys(configByCity);

    console.log(`[DEBUG - Factura Detalle] Recibida solicitud para ID: ${id}, Ciudad (req.query.ciudad): "${ciudad}"`);

    let citiesToSearch = [];
    if (ciudad && ciudad !== "ALL" && configByCity[ciudad]) {
        citiesToSearch = [ciudad];
        console.log(`[DEBUG - Factura Detalle] Ciudad es válida y configurada. Buscando solo en: ${ciudad}`);
    } else {
        citiesToSearch = ciudades; // Si es 'ALL', no especificada o no válida, buscar en todas
        console.log(`[DEBUG - Factura Detalle] Ciudad no especificada/válida. Buscando en todas las ciudades configuradas: ${citiesToSearch.join(', ')}`);
    }

    for (const cityCode of citiesToSearch) {
        console.log(`[DEBUG - Factura Detalle] Intentando conectar a la ciudad: ${cityCode}`);
        try {
            const pool = await getConnection(cityCode);
            const request = pool.request()
                .input('p_id_factura', sql.Char(15), id);
            
            console.log(`[DEBUG - Factura Detalle] Ejecutando SP 'dbo.sp_ver_factura_completa' en ${cityCode} para ID ${id}`);
            const result = await request.execute('dbo.sp_ver_factura_completa');
            
            pool.close(); // Cerrar el pool después de usarlo

            const headerData = result.recordsets[0]?.[0];
            if (headerData) {
                console.log(`[DEBUG - Factura Detalle] Factura encontrada en ${cityCode}.`);
                const detailData = result.recordsets[1] || [];
                const totalsData = result.recordsets[2]?.[0] || null;

                const formattedDetails = detailData.map(item => ({
                    id_producto: item.columna1,
                    descripcion_producto: item.columna2,
                    unidad_medida: item.columna3,
                    cantidad: item.columna4,
                    precio_unitario: item.columna5,
                    subtotal_producto: item.columna6,
                    estado_detalle: item.columna7,
                }));

                return res.json({
                    header: {
                        id_factura: headerData.columna1,
                        fecha_hora: headerData.columna2,
                        cliente_nombre: headerData.columna3,
                        cliente_ruc_ced: headerData.columna4,
                        cliente_mail: headerData.columna5,
                        descripcion_factura: headerData.columna6,
                        estado_factura: headerData.columna7,
                    },
                    details: formattedDetails,
                    totals_summary: totalsData?.columna6 || null,
                });
            }
        } catch (err) {
            // No es un error crítico si la factura no está en esta BD, solo se logea
            console.warn(`[DEBUG - Factura Detalle] Factura ${id} no encontrada o error en ${cityCode}: ${err.message}`);
            // Si la ciudad no es válida para la conexión (como 'IBR'), el error se manejará aquí
            // y el bucle continuará intentando con la siguiente ciudad válida.
        }
    }

    console.warn(`[DEBUG - Factura Detalle] Factura con ID ${id} no encontrada en ninguna de las bases de datos configuradas.`);
    return res.status(404).send(`Factura con ID ${id} no encontrada en ninguna de las bases de datos configuradas.`);
});

// Empleados (por ciudad o todas)
app.get('/api/empleados', async (req, res) => {
  const ciudad = req.query.ciudad || 'ALL';
  console.log(`[API Empleados] Recibida solicitud. Query parameter 'ciudad': "${ciudad}"`);

  const ciudadesAConsultar = ciudad === 'ALL'
    ? Object.keys(configByCity)
    : [ciudad]; 

  try {
    let empleadosFinal = [];

    // Validar que citiesToQuery no esté vacío antes de iterar
    if (ciudadesAConsultar.length === 0) {
      console.warn('[API Empleados] No hay ciudades configuradas para la consulta de empleados.');
      return res.json([]); // Devolver un array vacío si no hay ciudades configuradas
    }

    for (const c of ciudadesAConsultar) {
      // Asegurarse de que la configuración para 'c' existe antes de intentar conectar
      if (!configByCity[c]) {
        console.warn(`[API Empleados] Configuración de base de datos no encontrada para la ciudad: ${c}. Saltando.`);
        continue; 
      }

      try {
        console.log(`[API Empleados] FETCHING de la base de datos: ${configByCity[c].database} (código: ${c})`);
        const pool = await getConnection(c); 
        const result = await pool.request().query(`
          SELECT
            E.id_Empleado, E.emp_Cedula, E.emp_Nombre1, E.emp_Nombre2,
            E.emp_Apellido1, E.emp_Apellido2, E.emp_Sexo, E.emp_FechaNacimiento,
            E.emp_Sueldo, E.emp_Mail, D.dep_Nombre, R.rol_Descripcion,
            (SELECT TOP 1 CP.nombre_ciudad
              FROM ciuxprov CP
              WHERE LEFT(E.emp_Cedula, 2) = CP.codigo_provincia
              ORDER BY CP.nombre_ciudad) AS CiudadCedula
          FROM Empleados E
          LEFT JOIN Departamentos D ON E.id_Departamento = D.id_Departamento
          LEFT JOIN Roles R ON E.id_Rol = R.id_Rol
          ORDER BY E.emp_Apellido1, E.emp_Nombre1
        `);
        pool.close(); // Asegurarse de cerrar el pool después de usarlo en el bucle
        console.log(`[API Empleados] Obtenidos ${result.recordset.length} empleados de ${configByCity[c].database} (código: ${c})`);
        
        empleadosFinal.push(
          ...result.recordset.map(e => ({
            ...e,
            CiudadDB: configByCity[c].database,
            id_Ciudad: c // lo necesitamos para el rol, este id_Ciudad es el código QUI, GYE etc.
          }))
        );
      } catch (innerErr) {
        console.error(`Error al obtener empleados de ${c}:`, innerErr);
      }
    }
    console.log(`[API Empleados] Enviando ${empleadosFinal.length} empleados en la respuesta final.`);
    res.json(empleadosFinal);
  } catch (err) {
    console.error('[API Empleados] Error general al obtener empleados:', err);
    res.status(500).send('Error al obtener empleados');
  }
});

// Compras (listado) - MODIFICADO para eliminar 'id_Ciudad_Compra'
app.get('/api/compras', async (req, res) => {
    const ciudad = req.query.ciudad || 'ALL';
    console.log(`[API Compras] Recibida solicitud. Query parameter 'ciudad': "${ciudad}"`); // Log de entrada
    try {
        let comprasResult = [];
        const citiesToQuery = ciudad === 'ALL' ? Object.keys(configByCity) : [ciudad];

        // Validar que citiesToQuery no esté vacío antes de iterar
        if (citiesToQuery.length === 0) {
          console.warn('[API Compras] No hay ciudades configuradas para la consulta de compras.');
          return res.json([]);
        }

        console.log(`[API Compras] Ciudades para la consulta: ${citiesToQuery.join(', ')}`); // Log de ciudades a consultar

        const promesasCompras = citiesToQuery.map(async c => {
            let currentPool;
            // Asegurarse de que la configuración para 'c' existe antes de intentar conectar
            if (!configByCity[c]) {
              console.warn(`[API Compras] Configuración de base de datos no encontrada para la ciudad: ${c}. Saltando.`);
              return []; // Retorna un array vacío para esta ciudad
            }
            try {
                console.log(`[API Compras] FETCHING de la base de datos: ${configByCity[c].database} (código: ${c})`); // Log antes de la conexión
                currentPool = await getConnection(c);
                const request = currentPool.request();
                // Consulta SQL sin la columna 'id_Ciudad_Compra' y sin cláusula WHERE por ciudad
                const query = `
                    SELECT
                        id_Compra,
                        id_Proveedor,
                        oc_Fecha_Hora,
                        oc_Subtotal,
                        oc_IVA,
                        ESTADO_OC
                    FROM COMPRAS
                    ORDER BY oc_Fecha_Hora DESC;
                `;
                const result = await request.query(query);
                currentPool.close();
                console.log(`[API Compras] Obtenidas ${result.recordset.length} compras de ${configByCity[c].database} (código: ${c})`); // Log de resultados por DB
                return result.recordset.map(item => ({
                    ...item,
                    CiudadDB: configByCity[c].database,
                    id_Ciudad: c // Asignar el código de la ciudad de la conexión
                }));
            } catch (innerErr) {
                console.error(`Error al obtener compras de ${c}:`, innerErr);
                return [];
            }
        });
        comprasResult = (await Promise.all(promesasCompras)).flat();
        console.log(`[API Compras] Enviando ${comprasResult.length} compras en la respuesta final.`); // Log de la respuesta final
        res.json(comprasResult);
    } catch (err) {
        console.error('Error general al obtener compras:', err);
        res.status(500).send('Error al obtener compras');
    }
});

// Detalle de Orden de Compra por ID
app.get('/api/compras/detalle/:id', async (req, res) => {
    const { ciudad } = req.query;
    const { id: compraId } = req.params;
    let pool;
    try {
        console.log(`[Compras Detalle Backend] Recibida solicitud para ID: ${compraId}, Ciudad: ${ciudad}`);

        if (!ciudad) {
            return res.status(400).send('Se requiere el parámetro "ciudad" para obtener el detalle de la orden de compra.');
        }
        // Validar si la ciudad es una clave válida en configByCity
        if (!configByCity[ciudad]) {
            console.error(`Error: Ciudad no válida para conexión en el detalle de compra: ${ciudad}`);
            return res.status(400).send(`Ciudad no válida para la compra: ${ciudad}. Por favor, contacte al administrador si cree que es un error.`);
        }

        pool = await getConnection(ciudad);
        const request = pool.request();

        request.input('p_id_compra', sql.VarChar(7), compraId);

        const result = await request.execute('dbo.sp_ver_oc_completa');
        pool.close();

        // *** NUEVO LOG: Muestra la estructura RAW de los recordsets devueltos por el SP ***
        console.log(`[Compras Detalle Backend] Raw result.recordsets for ${compraId}:`, JSON.stringify(result.recordsets, null, 2));

        // Procesar el primer recordset que contiene todos los tipos de filas (cabecera, detalle, totales)
        const rows = result.recordsets[0] || [];

        // Encontrar la fila de cabecera
        const headerRow = rows.find(r => r.tipo === 'OC_CABECERA') || null;
        // Filtrar las filas de detalle
        const detailRows = rows.filter(r => r.tipo === 'OC_DETALLE');
        // Encontrar la fila de totales
        const totalRow = rows.find(r => r.tipo === 'TOTALES') || null;


        let headerData = null;
        if (headerRow) {
            // Mapear las columnas de la cabecera según la imagen proporcionada
            headerData = {
                id_orden_compra: headerRow.col1,
                proveedor_id: headerRow.col2,
                fecha_hora: headerRow.col3,
                estado_orden: headerRow.col4,
                usuario: headerRow.col5,
            };
        }

        const formattedDetails = detailRows.map(item => ({
            // Mapear las columnas de detalle según la imagen proporcionada (col1, col2, col3, col5)
            id_producto: item.col1,
            cantidad: item.col2,
            precio_unitario: item.col3,
            subtotal_producto: item.col5, // Según la imagen, el subtotal del producto está en col5
        }));

        let totalsData = { // Se inicializa con valores por defecto para evitar 'null' en frontend
            subtotal: 0.00,
            iva: 0.00,
            total: 0.00,
        };
        if (totalRow) {
             // Extraer y parsear los valores de subtotal, IVA y total de las cadenas en las columnas
            const subtotalMatch = totalRow.col1 ? String(totalRow.col1).match(/Subtotal=([0-9.]+)/) : null;
            const ivaMatch = totalRow.col2 ? String(totalRow.col2).match(/IVA=([0-9.]+)/) : null;
            const totalMatch = totalRow.col3 ? String(totalRow.col3).match(/Total=([0-9.]+)/) : null;

            totalsData = {
                subtotal: subtotalMatch ? parseFloat(subtotalMatch[1]) : 0.00,
                iva: ivaMatch ? parseFloat(ivaMatch[1]) : 0.00,
                total: totalMatch ? parseFloat(totalMatch[1]) : 0.00,
            };
        }

        const formattedResponse = {
            header: headerData,
            details: formattedDetails,
            totals_summary: totalsData, // Asegura que no sea null
        };
        console.log(`[Compras Detalle Backend] Formatted response for ${compraId}:`, JSON.stringify(formattedResponse, null, 2));
        res.json(formattedResponse);
    } catch (err) {
        console.error(`[Compras Detalle Backend] Error al obtener el detalle de la orden de compra ${compraId}:`, err);
        res.status(500).send('Error al obtener el detalle de la orden de compra.');
    }
});

// RUTA PARA EL ROL DE PAGO (ACTUALIZADA: consume fn_visualizar_rol sin filtrar por año/mes)
app.get('/api/empleados/payroll/:id', async (req, res) => {
    const { ciudad } = req.query;
    const { id: employeeId } = req.params;

    let pool;

    try {
        if (!ciudad) {
            return res.status(400).send('Se requiere el parámetro "ciudad" para obtener el rol de pago.');
        }
        // Validar si la ciudad es una clave válida en configByCity
        if (!configByCity[ciudad]) {
            console.error(`Error: Ciudad no válida para conexión en el rol de pago: ${ciudad}`);
            return res.status(400).send(`Ciudad no válida para el rol de pago: ${ciudad}. Por favor, contacte al administrador si cree que es un error.`);
        }

        pool = await getConnection(ciudad);

        let idPago = null;

        const requestGetIdPago = pool.request();
        requestGetIdPago.input('id_Empleado', sql.Char(7), employeeId);

        const queryGetIdPago = `
            SELECT TOP 1 p.id_Pago
            FROM Pagos p
            JOIN BonxEmpxPag b ON p.id_Pago = b.id_Pago
            WHERE b.id_Empleado = @id_Empleado
            ORDER BY p.pag_Fecha_Inicio DESC;
        `;
        
        console.log(`[PAYROLL DEBUG] Query para obtener idPago: ${queryGetIdPago}`);
        const resultIdPago = await requestGetIdPago.query(queryGetIdPago);

        if (resultIdPago.recordset.length > 0) {
            idPago = resultIdPago.recordset[0].id_Pago;
            console.log(`[PAYROLL DEBUG] id_Pago encontrado: ${idPago}`);

            const requestRolData = pool.request();
            requestRolData.input('id_Pago', sql.Char(7), idPago);

            const rolResult = await requestRolData.query(`SELECT * FROM dbo.fn_visualizar_rol(@id_Pago);`);
            const rolData = rolResult.recordset;

            pool.close();

            return res.json(rolData);

        } else {
            console.log(`[PAYROLL DEBUG] No se encontró id_Pago para el empleado ${employeeId}.`);
            pool.close();
            return res.json([]);
        }

    } catch (err) {
        console.error('Error al obtener el rol de pago del empleado:', err);
        if (pool && pool.connected) {
            pool.close();
        }
        res.status(500).send('Error al obtener el rol de pago del empleado.');
    }
});


// Ruta para Ventas - MODIFICADO para filtrar por conexión de base de datos
app.get('/api/ventas', async (req, res) => {
  try {
    const { ciudad } = req.query;
    let ventasResult = [];

    console.log(`[API Ventas] Recibida solicitud. Ciudad de filtro (req.query.ciudad): "${ciudad}"`);

    // Determina qué ciudades consultar: todas o solo la especificada
    const citiesToQuery = ciudad === 'ALL' || !ciudad
      ? Object.keys(configByCity)
      : [ciudad];

    // Validar que citiesToQuery no esté vacío antes de iterar
    if (citiesToQuery.length === 0) {
      console.warn('[API Ventas] No hay ciudades configuradas para la consulta de ventas.');
      return res.json([]); // Devolver un array vacío si no hay ciudades configuradas
    }

    console.log(`[API Ventas] Ciudades para la consulta: ${citiesToQuery.join(', ')}`);

    const promisesVentas = citiesToQuery.map(async c => {
        let currentPool;
        // Asegurarse de que la configuración para 'c' existe antes de intentar conectar
        if (!configByCity[c]) {
          console.warn(`[API Ventas] Configuración de base de datos no encontrada para la ciudad: ${c}. Saltando.`);
          return []; // Retorna un array vacío para esta ciudad
        }
        try {
            console.log(`[API Ventas] FETCHING de la base de datos: ${configByCity[c].database} (código: ${c})`);
            currentPool = await getConnection(c); // Conecta a la base de datos de la ciudad actual
            const request = currentPool.request();
            // Consulta SQL sin la cláusula WHERE CIU.id_Ciudad = @ciudad
            // El filtrado se realiza al conectarse a la BD específica.
            const query = `
                  SELECT
                      F.id_Factura,
                      F.fac_Fecha_Hora,
                      F.fac_Descripcion,
                      F.fac_Subtotal,
                      F.fac_IVA,
                      (F.fac_Subtotal + F.fac_IVA) AS fac_Total,
                      C.cli_Nombre AS cli_Nombre,
                      CIU.ciu_descripcion AS CiudadCliente,
                      CIU.id_Ciudad AS id_Ciudad_Cliente,
                      PF.id_Producto,
                      P.pro_Descripcion,
                      PF.pxf_Cantidad,
                      PF.pxf_Valor,
                      CIU.id_Ciudad AS FacturaCiudadId -- Cambiado de F.id_Ciudad a CIU.id_Ciudad
                  FROM FACTURAS F
                  INNER JOIN CLIENTES C ON F.id_Cliente = C.id_Cliente
                  INNER JOIN CIUDADES CIU ON C.id_Ciudad = CIU.id_Ciudad
                  INNER JOIN PROXFAC PF ON F.id_Factura = PF.id_Factura
                  INNER JOIN PRODUCTOS P ON PF.id_Producto = P.id_Producto
                  ORDER BY F.fac_Fecha_Hora DESC, F.id_Factura, P.pro_Descripcion;
            `;
            console.log(`[API Ventas] Ejecutando consulta en la ciudad: ${c}`);
            const result = await request.query(query);
            currentPool.close();
            // Añadir el nombre de la base de datos Y el id_Ciudad (c)
            return result.recordset.map(item => ({
                ...item,
                CiudadDB: configByCity[c].database,
                id_Ciudad: item.FacturaCiudadId // Usar el alias de la columna CIU.id_Ciudad
            }));
        } catch (innerErr) {
            console.error(`Error al obtener ventas de ${c}:`, innerErr);
            return [];
        }
    });
    ventasResult = (await Promise.all(promisesVentas)).flat();
    console.log(`[API Ventas] Total de resultados a enviar al frontend: ${ventasResult.length}`);
    res.json(ventasResult);
  } catch (err) {
    console.error('Error general al obtener ventas:', err);
    res.status(500).send('Error al obtener ventas');
  }
});

// Detalle de Factura (necesita la ciudad en query params) - Este endpoint ya manejaba bien la ciudad.
// Se mantiene tal cual estaba, pues el detalle sí necesita buscar en la BD correcta.
// Se modificó en la respuesta anterior para que itere sobre todas las ciudades si no se especifica.
// No necesita más cambios aquí.

// ENDPOINTS PARA CONTABILIDAD

// Ruta para listar asientos contables (resumen)
app.get("/api/contabilidad/asientos", async (req, res) => {
  const ciudad = req.query.ciudad || "ALL";
  try {
    let asientosResult = [];
    
    // DEBUG: Log the incoming ciudad parameter
    console.log(`[API Contabilidad - Asientos] Recibida solicitud. Ciudad de filtro (req.query.ciudad): "${ciudad}"`);

    const citiesToQuery = ciudad === 'ALL' || !ciudad
      ? Object.keys(configByCity)
      : [ciudad];

    // Validar que citiesToQuery no esté vacío antes de iterar
    if (citiesToQuery.length === 0) {
      console.warn('[API Contabilidad - Asientos] No hay ciudades configuradas para la consulta de asientos.');
      return res.json([]);
    }

    console.log(`[API Contabilidad - Asientos] Ciudades para la consulta: ${citiesToQuery.join(', ')}`); // Nuevo log para ver qué ciudades se van a consultar

    const promesasAsientos = citiesToQuery.map(async c => {
            console.log(`[API Contabilidad - Asientos] Procesando ciudad: ${c}`); // Nuevo log dentro del map
            let currentPool;
            // Asegurarse de que la configuración para 'c' existe antes de intentar conectar
            if (!configByCity[c]) {
              console.warn(`[API Contabilidad - Asientos] Configuración de base de datos no encontrada para la ciudad: ${c}. Saltando.`);
              return []; // Retorna un array vacío para esta ciudad
            }
            try {
                currentPool = await getConnection(c);
                const request = currentPool.request();
                // La consulta no incluye WHERE id_Ciudad = @ciudad
                // ya que el filtrado se realiza por la conexión a la base de datos específica.
                const query = `
                    SELECT
                        id_Asiento,
                        asi_FechaHora,
                        asi_Descripcion,
                        ESTADO_ASI
                    FROM ASIENTOS
                    ORDER BY asi_FechaHora DESC, id_Asiento DESC;
                `;
                const result = await request.query(query);
                currentPool.close();
                console.log(`[API Contabilidad - Asientos] Ciudad ${c} tiene ${result.recordset.length} asientos`); // Nuevo log de cantidad de asientos
                // Añadir el nombre de la base de datos y el id_Ciudad (c) basado en la conexión
                return result.recordset.map(a => ({ ...a, CiudadDB: configByCity[c].database, id_Ciudad: c }));
            } catch (innerErr) {
                console.error(`Error al obtener asientos de ${c}:`, innerErr);
                return [];
            }
        });
        asientosResult = (await Promise.all(promesasAsientos)).flat();
    
    console.log(`[API Contabilidad - Asientos] Total de resultados a enviar al frontend: ${asientosResult.length}`); // Nuevo log del total
    res.json(asientosResult);
  } catch (err) {
    console.error("Error general al obtener asientos contables:", err);
    res.status(500).send("Error al obtener asientos contables");
  }
});
// Ruta para obtener el detalle del asiento contable
app.get('/api/contabilidad/asiento/detalle/:id', async (req, res) => {
  const { ciudad } = req.query;
  const { id: asientoId } = req.params;

  console.log(`[DEBUG - Asiento Detalle] Recibida solicitud para ID: ${asientoId}, Ciudad (req.query.ciudad): "${ciudad}"`);

  let citiesToSearch = [];
  if (ciudad && ciudad !== "ALL" && configByCity[ciudad]) {
      citiesToSearch = [ciudad];
      console.log(`[DEBUG - Asiento Detalle] Ciudad es válida y configurada. Buscando solo en: ${ciudad}`);
  } else {
      citiesToSearch = Object.keys(configByCity); // Si es 'ALL', no especificada o no válida, buscar en todas
      console.log(`[DEBUG - Asiento Detalle] Ciudad no especificada/válida. Buscando en todas las ciudades configuradas: ${citiesToSearch.join(', ')}`);
  }

  // Validar que citiesToSearch no esté vacío antes de iterar
  if (citiesToSearch.length === 0) {
    console.warn('[DEBUG - Asiento Detalle] No hay ciudades configuradas para la consulta de detalle de asiento.');
    return res.status(404).send(`Asiento con ID ${asientoId} no encontrado en ninguna de las bases de datos configuradas.`);
  }

  for (const cityCode of citiesToSearch) {
      console.log(`[DEBUG - Asiento Detalle] Intentando conectar a la ciudad: ${cityCode}`);
      // Asegurarse de que la configuración para 'cityCode' existe antes de intentar conectar
      if (!configByCity[cityCode]) {
        console.warn(`[DEBUG - Asiento Detalle] Configuración de base de datos no encontrada para la ciudad: ${cityCode}. Saltando.`);
        continue;
      }
      try {
          const pool = await getConnection(cityCode);
          const request = pool.request();
          request.input('p_id_Asiento', sql.VarChar(50), asientoId);

          console.log(`[DEBUG - Asiento Detalle] Ejecutando SP 'dbo.sp_ver_asiento_completo' en ${cityCode} para ID ${asientoId}`);
          const result = await request.execute('dbo.sp_ver_asiento_completo');
          pool.close();

          const rows = result.recordsets[0] || [];

          const headerRow = rows.find(r => r.tipo === 'CABECERA');
          if (headerRow) { // Si se encuentra la cabecera en esta BD, se devuelve
              const detailRows = rows.filter(r => r.tipo === 'PARTIDA');

              const formattedResponse = {
                  header: {
                      id_Asiento: headerRow.columna1,
                      asi_Descripcion: headerRow.columna2,
                      asi_total_debe: parseFloat((headerRow.columna3 || '0').replace(',', '')),
                      asi_total_haber: parseFloat((headerRow.columna4 || '0').replace(',', '')),
                      asi_FechaHora: headerRow.columna5,
                      user_id: headerRow.columna6,
                      ESTADO_ASI: headerRow.columna7,
                  },
                  details: detailRows.map(r => ({
                      id_cuenta: r.columna2,
                      cue_nombre: r.columna3,
                      det_Debito: parseFloat((r.columna4 || '0').replace(',', '')),
                      det_Credito: parseFloat((r.columna5 || '0').replace(',', '')),
                      ESTADO_DET: r.columna7,
                  }))
              };
              console.log(`[DEBUG - Asiento Detalle] Asiento encontrado en ${cityCode}.`);
              return res.json(formattedResponse);
          }
      } catch (err) {
          console.warn(`[DEBUG - Asiento Detalle] Asiento ${asientoId} no encontrado o error en ${cityCode}: ${err.message}`);
      }
  }

  console.warn(`[DEBUG - Asiento Detalle] Asiento con ID ${asientoId} no encontrado en ninguna de las bases de datos configuradas.`);
  return res.status(404).send(`Asiento con ID ${asientoId} no encontrado en ninguna de las bases de datos configuradas.`);
});

// ENDPOINTS PARA INVENTARIO (AHORA PARA AJUSTES)

// Ruta para listar ajustes de inventario (resumen)
app.get('/api/inventario/ajustes', async (req, res) => {
    const ciudad = req.query.ciudad || 'ALL';
    console.log(`[DEBUG - Inventario Ajustes Lista] Recibida solicitud. Ciudad de filtro: "${ciudad}"`);
    try {
        let ajustesResult = [];
        const citiesToQuery = ciudad === 'ALL' || !ciudad
          ? Object.keys(configByCity)
          : [ciudad];

        // Validar que citiesToQuery no esté vacío antes de iterar
        if (citiesToQuery.length === 0) {
          console.warn('[API Inventario Ajustes] No hay ciudades configuradas para la consulta de ajustes.');
          return res.json([]);
        }

        const promesasAjustes = citiesToQuery.map(async c => {
            let currentPool;
            // Asegurarse de que la configuración para 'c' existe antes de intentar conectar
            if (!configByCity[c]) {
              console.warn(`[API Inventario Ajustes] Configuración de base de datos no encontrada para la ciudad: ${c}. Saltando.`);
              return []; // Retorna un array vacío para esta ciudad
            }
            try {
                console.log(`[DEBUG - Inventario Ajustes Lista] Ejecutando consulta en la ciudad: ${c}`);
                currentPool = await getConnection(c); // Conecta a la base de datos de la ciudad actual
                const request = currentPool.request();
                // La consulta no incluye WHERE id_Ciudad_Ajuste = @ciudad
                // ya que el filtrado se realiza por la conexión a la base de datos específica.
                const query = `
                        SELECT
                            id_Ajuste,
                            USER_ID,
                            aju_Descripcion,
                            aju_FechaHora,
                            aju_Num_Produc,
                            ESTADO_AJU
                        FROM AJUSTES
                        ORDER BY aju_FechaHora DESC, id_Ajuste DESC;
                    `;
                const result = await request.query(query);
                currentPool.close();
                // Añadir el nombre de la base de datos y el id_Ciudad (c) basado en la conexión
                return result.recordset.map(a => ({ ...a, CiudadDB: configByCity[c].database, id_Ciudad: c }));
            } catch (innerErr) {
                console.error(`Error al obtener ajustes de inventario de ${c}:`, innerErr);
                return [];
            }
        });
        ajustesResult = (await Promise.all(promesasAjustes)).flat();
        console.log(`[DEBUG - Inventario Ajustes Lista] Total de resultados a enviar al frontend: ${ajustesResult.length}`);
        res.json(ajustesResult);
    } catch (err) {
        console.error('Error general al obtener ajustes de inventario:', err);
        res.status(500).send('Error al obtener ajustes de inventario');
    }
});
// Ruta para obtener el detalle de un ajuste de inventario por ID
app.get('/api/inventario/ajuste/detalle/:id', async (req, res) => {
    const { ciudad } = req.query;
    const { id: ajusteId } = req.params;

    console.log(`[DEBUG - Ajuste Detalle] Recibida solicitud para ID: ${ajusteId}, Ciudad (req.query.ciudad): "${ciudad}"`); // Nuevo log

    let citiesToSearch = [];
    if (ciudad && ciudad !== "ALL" && configByCity[ciudad]) {
        citiesToSearch = [ciudad];
        console.log(`[DEBUG - Ajuste Detalle] Ciudad es válida y configurada. Buscando solo en: ${ciudad}`); // Nuevo log
    } else {
        citiesToSearch = Object.keys(configByCity); // Si es 'ALL', no especificada o no válida, buscar en todas
        console.log(`[DEBUG - Ajuste Detalle] Ciudad no especificada/válida. Buscando en todas las ciudades configuradas: ${citiesToSearch.join(', ')}`); // Nuevo log
    }

    // Validar que citiesToSearch no esté vacío antes de iterar
    if (citiesToSearch.length === 0) {
      console.warn('[DEBUG - Ajuste Detalle] No hay ciudades configuradas para la consulta de detalle de ajuste.');
      return res.status(404).send(`Ajuste con ID ${ajusteId} no encontrado en ninguna de las bases de datos configuradas.`);
    }

    for (const cityCode of citiesToSearch) {
        console.log(`[DEBUG - Ajuste Detalle] Intentando conectar a la ciudad: ${cityCode}`); // Nuevo log
        // Asegurarse de que la configuración para 'cityCode' existe antes de intentar conectar
        if (!configByCity[cityCode]) {
          console.warn(`[DEBUG - Ajuste Detalle] Configuración de base de datos no encontrada para la ciudad: ${cityCode}. Saltando.`);
          continue;
        }
        try {
            const pool = await getConnection(cityCode);
            const request = pool.request();

            request.input('p_id_ajuste', sql.VarChar(50), ajusteId);
            console.log(`[DEBUG - Ajuste Detalle] Ejecutando SP 'dbo.sp_ver_ajuste_completo_unido' en ${cityCode} para ID ${ajusteId}`); // Nuevo log
            const result = await request.execute('dbo.sp_ver_ajuste_completo_unido');
            pool.close();

            const rows = result.recordsets[0] || [];
            console.log(`[DEBUG - Ajuste Detalle] Raw rows from SP for ${ajusteId} in ${cityCode}:`, JSON.stringify(rows, null, 2)); // Log para depuración

            const headerRow = rows.find(r => r.tipo === 'CABECERA') || null;
            if (headerRow) { // Si se encuentra la cabecera en esta BD, se devuelve
                const detailRows = rows.filter(r => r.tipo === 'DETALLE');
                const totalRow = rows.find(r => r.tipo === 'TOTALES') || null;

                const formattedDetails = detailRows.map(row => ({
                    // Aquí es donde se mapean las columnas del SP a los nombres esperados por el frontend
                    id_Producto: row.columna1?.replace('Producto: ', '')?.trim() ?? '',
                    pro_Descripcion: row.columna2?.trim() ?? '',
                    unidad_medida: row.columna3?.replace('UM: ', '')?.trim() ?? '',
                    aju_Cantidad: row.columna4?.replace('Cantidad: ', '')?.trim() ?? '',
                    ESTADO_AJUD: row.columna5?.replace('Estado PxA: ', '')?.trim() ?? '' // Columna 5 del detalle es el estado PxA
                }));

                console.log(`[DEBUG - Ajuste Detalle] Ajuste encontrado en ${cityCode}.`); // Nuevo log
                return res.json({
                    header: headerRow ? {
                        id_ajuste: headerRow.columna1?.replace('Ajuste: ', '')?.trim() ?? '',
                        descripcion: headerRow.columna2?.replace('Descripción: ', '')?.trim() ?? '',
                        fecha_hora: headerRow.columna3?.trim() ?? '', // Mantener como string, el frontend lo formateará
                        usuario: headerRow.columna4?.replace('Usuario: ', '')?.trim() ?? '',
                        estado: headerRow.columna5?.replace('Estado: ', '')?.trim() ?? ''
                    } : null,
                    details: formattedDetails,
                    totals: totalRow ? {
                        totalTexto: totalRow.columna5 // Asumiendo que columna5 tiene el texto total en la fila TOTALES
                    } : null
                });
            }
        } catch (err) {
            console.warn(`[DEBUG - Ajuste Detalle] Ajuste ${ajusteId} no encontrado o error en ${cityCode}: ${err.message}`); // Nuevo log
        }
    }

    console.warn(`[DEBUG - Ajuste Detalle] Ajuste con ID ${ajusteId} no encontrado en ninguna de las bases de datos configuradas.`); // Nuevo log
    return res.status(404).send(`Ajuste con ID ${ajusteId} no encontrado en ninguna de las bases de datos configuradas.`);
});

// ENDPOINT PARA LOG GENERAL
app.get('/api/general/log', async (req, res) => {
    let pool;
    try {
        let transactionsResult = [];
        const allCities = Object.keys(configByCity);

        // Validar que allCities no esté vacío
        if (allCities.length === 0) {
          console.warn('[API Log General] No hay ciudades configuradas para la consulta de log general.');
          return res.json([]);
        }

        const promises = allCities.map(async c => {
            let currentPool;
            // Asegurarse de que la configuración para 'c' existe antes de intentar conectar
            if (!configByCity[c]) {
              console.warn(`[API Log General] Configuración de base de datos no encontrada para la ciudad: ${c}. Saltando.`);
              return []; // Retorna un array vacío para esta ciudad
            }
            try {
                currentPool = await getConnection(c);
                const request = currentPool.request();
                const result = await request.input('p_limit', sql.Int, 50).execute('dbo.sp_ver_log_general');
                currentPool.close();
                // Añadir el nombre de la base de datos
                return result.recordset.map(t => ({ ...t, CiudadDB: configByCity[c].database }));
            } catch (innerErr) {
                console.error(`Error al obtener transacciones de log de ${c}:`, innerErr);
                return [];
            }
        });
        transactionsResult = (await Promise.all(promises)).flat();
        res.json(transactionsResult);
    } catch (err) {
        console.error('Error al obtener transacciones del log general:', err);
        res.status(500).send('Error al obtener transacciones del log general.');
    }
});


const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Servidor corriendo en puerto ${PORT}`));
