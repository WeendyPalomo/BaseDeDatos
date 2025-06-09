// server.js

require('dotenv').config(); // Carga las variables de entorno
const express = require('express');
const cors = require('cors');
const sql = require('mssql');

const app = express();
app.use(cors()); // Habilitar CORS para todas las rutas
app.use(express.json()); // Habilitar el uso de JSON en las peticiones

// Objeto de configuración de bases de datos por ciudad (desde el ejemplo que proporcionaste)
const configByCity = {
  QUI: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME_QUITO,
    options: {
      encrypt: true,
      trustServerCertificate: true // Cambiar a false en producción si usas certificados válidos
    }
  },
  GYE: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME_GUAYAQUIL,
    options: {
      encrypt: true,
      trustServerCertificate: true
    }
  },
  CUE: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME_CUENCA,
    options: {
      encrypt: true,
      trustServerCertificate: true
    }
  },
  MAN: {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME_MANTA,
    options: {
      encrypt: true,
      trustServerCertificate: true
    }
  }
};

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
    return connectionPools[normalizedCityCode];
  }

  const dbConfig = configByCity[normalizedCityCode];
  if (!dbConfig) {
    throw new Error(`Ciudad no válida para conexión: ${cityCode}`);
  }

  try {
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
                let pool;
                try {
                    pool = await getConnection(c);
                    const request = pool.request();
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
                    pool.close();
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
                    WHERE F.id_Ciudad = @ciudad -- Filtrando por la ciudad de la factura
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

    if (ciudad && ciudad !== "ALL") {
        try {
            const pool = await getConnection(ciudad);
            const result = await pool.request()
                .input('p_id_factura', sql.Char(15), id)
                .execute('dbo.sp_ver_factura_completa');

            const headerData = result.recordsets[0]?.[0] || null;
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
                header: headerData ? {
                    id_factura: headerData.columna1,
                    fecha_hora: headerData.columna2,
                    cliente_nombre: headerData.columna3,
                    cliente_ruc_ced: headerData.columna4,
                    cliente_mail: headerData.columna5,
                    descripcion_factura: headerData.columna6,
                    estado_factura: headerData.columna7,
                } : null,
                details: formattedDetails,
                totals_summary: totalsData?.columna6 || null,
            });
        } catch (err) {
            console.error(`Error al obtener detalle en ciudad ${ciudad}:`, err);
            return res.status(500).send('Error al obtener el detalle de la factura.');
        }
    }

    for (const ciudadDb of ciudades) {
        try {
            const pool = await getConnection(ciudadDb);
            const result = await pool.request()
                .input('p_id_factura', sql.Char(15), id)
                .execute('dbo.sp_ver_factura_completa');

            const headerData = result.recordsets[0]?.[0];
            if (headerData) {
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
            console.warn(`Factura no encontrada o error en ${ciudadDb}:`, err.message);
        }
    }

    return res.status(404).send('Factura no encontrada en ninguna ciudad.');
});

// Empleados (por ciudad o todas)
app.get('/api/empleados', async (req, res) => {
    const ciudad = req.query.ciudad || 'ALL';
    console.log(`[API Empleados] Recibida solicitud. Ciudad de filtro: "${ciudad}"`);
    let pool;
    try {
        let empleadosResult = [];
        const allCities = Object.keys(configByCity);

        if (ciudad === 'ALL') {
            const promesasEmpleados = allCities.map(async c => {
                let currentPool;
                try {
                    currentPool = await getConnection(c);
                    const query = `
                        SELECT
                            E.id_Empleado, E.emp_Cedula, E.emp_Nombre1, E.emp_Nombre2,
                            E.emp_Apellido1, E.emp_Apellido2, E.emp_Sexo, E.emp_FechaNacimiento,
                            E.emp_Sueldo, E.emp_Mail, D.dep_Nombre, R.rol_Descripcion,
                            E.id_Ciudad AS EmpleadoCiudadAsignada,
                            (SELECT TOP 1 CP.nombre_ciudad
                            FROM ciuxprov CP
                            WHERE LEFT(E.emp_Cedula, 2) = CP.codigo_provincia
                            ORDER BY CP.nombre_ciudad) AS CiudadCedula
                        FROM Empleados E
                        LEFT JOIN Departamentos D ON E.id_Departamento = D.id_Departamento
                        LEFT JOIN Roles R ON E.id_Rol = R.id_Rol
                        ORDER BY E.emp_Apellido1, E.emp_Nombre1
                    `;
                    const result = await currentPool.request().query(query);
                    currentPool.close();
                    // Añadir el nombre de la base de datos
                    return result.recordset.map(e => ({ ...e, CiudadDB: configByCity[c].database }));
                } catch (innerErr) {
                    console.error(`Error al obtener empleados de ${c}:`, innerErr);
                    return [];
                }
            });
            empleadosResult = (await Promise.all(promesasEmpleados)).flat();
        } else {
            try {
                pool = await getConnection(ciudad);
                const request = pool.request();
                const query = `
                    SELECT
                        E.id_Empleado, E.emp_Cedula, E.emp_Nombre1, E.emp_Nombre2,
                        E.emp_Apellido1, E.emp_Apellido2, E.emp_Sexo, E.emp_FechaNacimiento,
                        E.emp_Sueldo, E.emp_Mail, D.dep_Nombre, R.rol_Descripcion,
                        E.id_Ciudad AS EmpleadoCiudadAsignada,
                        (SELECT TOP 1 CP.nombre_ciudad
                        FROM ciuxprov CP
                        WHERE LEFT(E.emp_Cedula, 2) = CP.codigo_provincia
                        ORDER BY CP.nombre_ciudad) AS CiudadCedula
                    FROM Empleados E
                    LEFT JOIN Departamentos D ON E.id_Departamento = D.id_Departamento
                    LEFT JOIN Roles R ON E.id_Rol = R.id_Rol
                    WHERE E.id_Ciudad = @ciudad -- Filtrando por la ciudad asignada al empleado
                    ORDER BY E.emp_Apellido1, E.emp_Nombre1
                `;
                request.input('ciudad', sql.Char(3), ciudad);
                const result = await request.query(query);
                pool.close();
                // Añadir el nombre de la base de datos
                empleadosResult = result.recordset.map(e => ({ ...e, CiudadDB: configByCity[ciudad].database }));
            } catch (err) {
                console.error(`Error al obtener empleados para la ciudad ${ciudad}:`, err);
                return res.status(500).send(`Error al obtener empleados para la ciudad ${ciudad}`);
            }
        }
        res.json(empleadosResult);
    } catch (err) {
        console.error('[API Empleados] Error general al obtener empleados:', err);
        res.status(500).send('Error al obtener empleados');
    }
});

// Compras (listado)
app.get('/api/compras', async (req, res) => {
    const ciudad = req.query.ciudad || 'ALL';
    let pool;
    try {
        let comprasResult = [];
        const allCities = Object.keys(configByCity);

        if (ciudad === 'ALL') {
            const promesasCompras = allCities.map(async c => {
                let currentPool;
                try {
                    currentPool = await getConnection(c);
                    const request = currentPool.request();
                    // Eliminada la columna 'id_Ciudad' de la selección
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
                    // Añadir el nombre de la base de datos y el id_Ciudad (c)
                    return result.recordset.map(item => ({
                        ...item,
                        CiudadDB: configByCity[c].database,
                        id_Ciudad: c // <-- Agregando id_Ciudad aquí
                    }));
                } catch (innerErr) {
                    console.error(`Error al obtener compras de ${c}:`, innerErr);
                    return [];
                }
            });
            comprasResult = (await Promise.all(promesasCompras)).flat();
        } else {
            try {
                pool = await getConnection(ciudad);
                const request = pool.request();
                // Eliminada la columna 'id_Ciudad' de la selección y la cláusula WHERE
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
                // No es necesario request.input('ciudad', ...) ya que la cláusula WHERE fue eliminada
                const result = await request.query(query);
                pool.close();
                // Añadir el nombre de la base de datos y el id_Ciudad (ciudad)
                comprasResult = result.recordset.map(item => ({
                    ...item,
                    CiudadDB: configByCity[ciudad].database,
                    id_Ciudad: ciudad // <-- Agregando id_Ciudad aquí
                }));
            } catch (err) {
                console.error(`Error al obtener compras para la ciudad ${ciudad}:`, err);
                return res.status(500).send(`Error al obtener compras para la ciudad ${ciudad}`);
            }
        }
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


// Ruta para Ventas
app.get('/api/ventas', async (req, res) => {
  try {
    const { ciudad } = req.query;
    let ventasResult = [];

    if (!ciudad || ciudad === 'ALL') {
        const allCities = Object.keys(configByCity);
        const promisesVentas = allCities.map(async c => {
            let currentPool;
            try {
                currentPool = await getConnection(c);
                const request = currentPool.request();
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
                      F.id_Ciudad AS FacturaCiudad -- Asegúrate de que esta columna esté en FACTURAS
                  FROM FACTURAS F
                  INNER JOIN CLIENTES C ON F.id_Cliente = C.id_Cliente
                  INNER JOIN CIUDADES CIU ON C.id_Ciudad = CIU.id_Ciudad
                  INNER JOIN PROXFAC PF ON F.id_Factura = PF.id_Factura
                  INNER JOIN PRODUCTOS P ON PF.id_Producto = P.id_Producto
                  ORDER BY F.fac_Fecha_Hora DESC, F.id_Factura, P.pro_Descripcion;
                `;
                const result = await request.query(query);
                currentPool.close();
                // Añadir el nombre de la base de datos
                return result.recordset.map(item => ({ ...item, CiudadDB: configByCity[c].database }));
            } catch (innerErr) {
                console.error(`Error al obtener ventas de ${c}:`, innerErr);
                return [];
            }
        });
        ventasResult = (await Promise.all(promisesVentas)).flat();
    } else {
        try {
            const pool = await getConnection(ciudad);
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
                  PF.id_Producto,
                  P.pro_Descripcion,
                  PF.pxf_Cantidad,
                  PF.pxf_Valor,
                  F.id_Ciudad AS FacturaCiudad -- Asegúrate de que esta columna esté en FACTURAS
              FROM FACTURAS F
              INNER JOIN CLIENTES C ON F.id_Cliente = C.id_Cliente
              INNER JOIN CIUDADES CIU ON C.id_Ciudad = CIU.id_Ciudad
              INNER JOIN PROXFAC PF ON F.id_Factura = PF.id_Factura
              INNER JOIN PRODUCTOS P ON PF.id_Producto = P.id_Producto
              WHERE F.id_Ciudad = @ciudad -- AGREGADO: Filtrar por la ciudad de la factura
              ORDER BY F.fac_Fecha_Hora DESC, F.id_Factura, P.pro_Descripcion;
            `;
            request.input('ciudad', sql.Char(3), ciudad);
            const result = await request.query(query);
            pool.close();
            // Añadir el nombre de la base de datos
            ventasResult = result.recordset.map(item => ({ ...item, CiudadDB: configByCity[ciudad].database }));
        } catch (err) {
            console.error(`Error al obtener ventas para la ciudad ${ciudad}:`, err);
            return res.status(500).send(`Error al obtener ventas para la ciudad ${ciudad}`);
        }
    }
    res.json(ventasResult);
  } catch (err) {
    console.error('Error general al obtener ventas:', err);
    res.status(500).send('Error al obtener ventas');
  }
});

// ENDPOINTS PARA CONTABILIDAD

// Ruta para listar asientos contables (resumen)
app.get("/api/contabilidad/asientos", async (req, res) => {
  const ciudad = req.query.ciudad || "ALL";
  try {
    let asientosResult = [];
    const allCities = Object.keys(configByCity);

    if (ciudad === "ALL") {
        const promesasAsientos = allCities.map(async c => {
            console.log(`Consultando ciudad: ${c}`);
            let currentPool;
            try {
                currentPool = await getConnection(c);
                const request = currentPool.request();
                const query = `
                    SELECT
                        id_Asiento,
                        asi_FechaHora,
                        asi_Descripcion,
                        ESTADO_ASI,
                        id_Ciudad -- Asegúrate de que esta columna esté en tu tabla ASIENTOS
                    FROM ASIENTOS
                    ORDER BY asi_FechaHora DESC, id_Asiento DESC;
                `;
                const result = await request.query(query);
                currentPool.close();
                console.log(`Ciudad ${c} tiene ${result.recordset.length} asientos`);
                // Añadir el nombre de la base de datos
                return result.recordset.map(a => ({ ...a, CiudadDB: configByCity[c].database }));
            } catch (innerErr) {
                console.error(`Error al obtener asientos de ${c}:`, innerErr);
                return [];
            }
        });
        console.log("Ciudades configuradas:", allCities);
        asientosResult = (await Promise.all(promesasAsientos)).flat();
    } else {
      let pool;
      try {
        pool = await getConnection(ciudad);
        const request = pool.request();
        const query = `
          SELECT
            id_Asiento,
            asi_FechaHora,
            asi_Descripcion,
            ESTADO_ASI,
            id_Ciudad -- Asegúrate de que esta columna esté en tu tabla ASIENTOS
          FROM ASIENTOS
          WHERE id_Ciudad = @ciudad -- Filtrar por ciudad del asiento
          ORDER BY asi_FechaHora DESC, id_Asiento DESC;
        `;
        request.input('ciudad', sql.Char(3), ciudad);
        const result = await request.query(query);
        pool.close();
        // Añadir el nombre de la base de datos
        asientosResult = result.recordset.map(a => ({ ...a, CiudadDB: configByCity[ciudad].database }));
      } catch (err) {
        console.error(`Error al obtener asientos para la ciudad ${ciudad}:`, err);
        return res
          .status(500)
          .send(`Error al obtener asientos para la ciudad ${ciudad}`);
      }
    }

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

  if (!ciudad) {
    return res.status(400).send('Se requiere el parámetro "ciudad".');
  }

  try {
    const pool = await getConnection(ciudad);
    const request = pool.request();
    request.input('p_id_Asiento', sql.VarChar(50), asientoId);

    const result = await request.execute('dbo.sp_ver_asiento_completo');
    const rows = result.recordsets[0] || [];

    const headerRow = rows.find(r => r.tipo === 'CABECERA');
    const detailRows = rows.filter(r => r.tipo === 'PARTIDA');

    const formattedResponse = {
      header: headerRow ? {
        id_Asiento: headerRow.columna1,
        asi_Descripcion: headerRow.columna2,
        asi_total_debe: parseFloat((headerRow.columna3 || '0').replace(',', '')),
        asi_total_haber: parseFloat((headerRow.columna4 || '0').replace(',', '')),
        asi_FechaHora: headerRow.columna5,
        user_id: headerRow.columna6,
        ESTADO_ASI: headerRow.columna7
      } : null,
      details: detailRows.map(r => ({
        id_asiento: r.columna1,
        id_cuenta: r.columna2,
        cue_nombre: r.columna3,
        det_Debito: parseFloat((r.columna4 || '0').replace(',', '')),
        det_Credito: parseFloat((r.columna5 || '0').replace(',', '')),
        ESTADO_DET: r.columna7
      }))
    };

    res.json(formattedResponse);
  } catch (err) {
    console.error('Error al obtener el detalle del asiento:', err);
    res.status(500).send('Error al obtener el detalle del asiento.');
  }
});

// ENDPOINTS PARA INVENTARIO (AHORA PARA AJUSTES)

// Ruta para listar ajustes de inventario (resumen)
app.get('/api/inventario/ajustes', async (req, res) => {
    const ciudad = req.query.ciudad || 'ALL';
    let pool;
    try {
        let ajustesResult = [];
        const allCities = Object.keys(configByCity);

        if (ciudad === 'ALL') {
            const promesasAjustes = allCities.map(async c => {
                let currentPool;
                try {
                    currentPool = await getConnection(c);
                    const request = currentPool.request();
                    const query = `
                        SELECT
                            id_Ajuste,
                            USER_ID,
                            aju_Descripcion,
                            aju_FechaHora,
                            aju_Num_Produc,
                            ESTADO_AJU,
                            id_Ciudad -- Asegúrate de que esta columna esté en tu tabla AJUSTES
                        FROM AJUSTES
                        ORDER BY aju_FechaHora DESC, id_Ajuste DESC;
                    `;
                    const result = await request.query(query);
                    currentPool.close();
                    // Añadir el nombre de la base de datos
                    return result.recordset.map(a => ({ ...a, CiudadDB: configByCity[c].database }));
                } catch (innerErr) {
                    console.error(`Error al obtener ajustes de inventario de ${c}:`, innerErr);
                    return [];
                }
            });
            ajustesResult = (await Promise.all(promesasAjustes)).flat();
        } else {
            try {
                pool = await getConnection(ciudad);
                const request = pool.request();
                const query = `
                    SELECT
                        id_Ajuste,
                        USER_ID,
                        aju_Descripcion,
                        aju_FechaHora,
                        aju_Num_Produc,
                        ESTADO_AJU,
                        id_Ciudad -- Asegúrate de que esta columna esté en tu tabla AJUSTES
                    FROM AJUSTES
                    WHERE id_Ciudad = @ciudad -- Filtrar por ciudad del ajuste
                    ORDER BY aju_FechaHora DESC, id_Ajuste DESC;
                `;
                request.input('ciudad', sql.Char(3), ciudad);
                const result = await request.query(query);
                pool.close();
                // Añadir el nombre de la base de datos
                ajustesResult = result.recordset.map(a => ({ ...a, CiudadDB: configByCity[ciudad].database }));
            } catch (err) {
                console.error(`Error al obtener ajustes de inventario para la ciudad ${ciudad}:`, err);
                return res.status(500).send(`Error al obtener ajustes de inventario para la ciudad ${ciudad}`);
            }
        }
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
    let pool;
    try {
        if (!ciudad) {
            return res.status(400).send('Se requiere el parámetro "ciudad" para obtener el detalle del ajuste.');
        }
        pool = await getConnection(ciudad);
        const request = pool.request();

        request.input('p_id_ajuste', sql.VarChar(50), ajusteId);
        const result = await request.execute('dbo.sp_ver_ajuste_completo_unido');
        pool.close();

        const rows = result.recordsets[0] || [];

        const headerRow = rows.find(r => r.tipo === 'CABECERA') || null;
        const detailRows = rows.filter(r => r.tipo === 'DETALLE');
        const totalRow = rows.find(r => r.tipo === 'TOTALES') || null;

        const formattedDetails = detailRows.map(row => ({
            id_Producto: row.columna1?.replace('Producto: ', '') ?? '',
            pro_Descripcion: row.columna2,
            aju_Cantidad: row.columna4?.replace('Cantidad: ', '') ?? '',
            ESTADO_AJUD: row.columna8?.replace('Estado PxA: ', '') ?? ''
        }));

        res.json({
            header: headerRow,
            details: formattedDetails,
            totals: totalRow
        });
    } catch (err) {
        console.error('Error al obtener el detalle del ajuste:', err);
        res.status(500).send('Error al obtener el detalle del ajuste.');
    }
});

// ENDPOINT PARA LOG GENERAL
app.get('/api/general/log', async (req, res) => {
    let pool;
    try {
        let transactionsResult = [];
        const allCities = Object.keys(configByCity);

        const promises = allCities.map(async c => {
            let currentPool;
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
