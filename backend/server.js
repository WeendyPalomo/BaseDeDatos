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

// Ruta para obtener las ciudades
app.get('/api/ciudades', (req, res) => {
    // Genera la lista de ciudades dinámicamente desde configByCity
    const ciudadesDisponibles = Object.keys(configByCity).map(key => {
        let ciu_descripcion = '';
        switch(key) {
            case 'QUI': ciu_descripcion = 'Quito'; break;
            case 'GYE': ciu_descripcion = 'Guayaquil'; break;
            case 'CUE': ciu_descripcion = 'Cuenca'; break;
            case 'MAN': ciu_descripcion = 'Manta'; break;
            default: ciu_descripcion = key; // Fallback
        }
        return { id_Ciudad: key, ciu_descripcion: ciu_descripcion };
    });
    res.json(ciudadesDisponibles);
});
// Facturas por ciudad o todas
app.get('/api/facturas', async (req, res) => {
    try {
        const ciudad = req.query.ciudad || 'ALL'; // Valor por defecto 'ALL'
        let facturasResult = [];

        if (ciudad === 'ALL') {
            const ciudadesDisponibles = Object.keys(configByCity); // Obtener todos los códigos de ciudad (QUI, GYE, etc.)
            const promesasFacturas = ciudadesDisponibles.map(async c => {
                let pool;
                try {
                    pool = await getConnection(c);
                    const request = pool.request();
                    request.input('p_id_ciudad', sql.Char(3), null); // Enviar NULL al SP para listar todas las facturas de esa DB
                    const result = await request.execute('dbo.sp_facturas_listar_resumen_con_ciudad');
                    pool.close(); // Cerrar el pool después de usarlo
                    return result.recordset.map(f => ({ ...f, CiudadDB: c })); // Añade el código de la ciudad de origen
                } catch (innerErr) {
                    console.error(`Error al obtener facturas de ${c}:`, innerErr);
                    return []; // Retorna un array vacío en caso de error para una ciudad
                }
            });
            facturasResult = (await Promise.all(promesasFacturas)).flat(); // Unificar todos los arrays de facturas
        } else {
            let pool;
            try {
                pool = await getConnection(ciudad);
                const request = pool.request();
                request.input('p_id_ciudad', sql.Char(3), ciudad);
                const result = await request.execute('dbo.sp_facturas_listar_resumen_con_ciudad');
                pool.close(); // Cerrar el pool después de usarlo
                facturasResult = result.recordset;
            }
            catch (err) { // Captura de errores específica para la conexión/ejecución
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
    const ciudades = ['QUI', 'GYE', 'CUE', 'MAN'];

    // Si se especifica una ciudad concreta
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

    // Si no se especifica ciudad o es "ALL", intentar en todas
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
            // Continuar intentando con las otras ciudades
        }
    }

    return res.status(404).send('Factura no encontrada en ninguna ciudad.');
});

// Empleados (por ciudad o todas)
app.get('/api/empleados', async (req, res) => {
    const ciudad = req.query.ciudad || 'ALL'; // Valor por defecto 'ALL'
    console.log(`[API Empleados] Recibida solicitud. Ciudad de filtro: "${ciudad}"`);
    let pool;
    try {
        let empleadosResult = [];
        const allCities = Object.keys(configByCity); // Lista de todos los códigos de ciudad

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
                            E.id_Ciudad AS EmpleadoCiudadAsignada, -- Añadido para ver el id_Ciudad directo de la tabla EMPLEADOS
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
                    currentPool.close(); // Cerrar el pool después de usarlo
                    return result.recordset.map(e => ({ ...e, CiudadDB: c })); // Añade el código de la ciudad de origen (DB)
                } catch (innerErr) {
                    console.error(`Error al obtener empleados de ${c}:`, innerErr);
                    return [];
                }
            });
            empleadosResult = (await Promise.all(promesasEmpleados)).flat();
        } else { // Si se solicita una ciudad específica
            try {
                pool = await getConnection(ciudad); // Conecta solo a la base de datos de la ciudad solicitada
                const query = `
                    SELECT
                        E.id_Empleado, E.emp_Cedula, E.emp_Nombre1, E.emp_Nombre2,
                        E.emp_Apellido1, E.emp_Apellido2, E.emp_Sexo, E.emp_FechaNacimiento,
                        E.emp_Sueldo, E.emp_Mail, D.dep_Nombre, R.rol_Descripcion,
                        E.id_Ciudad AS EmpleadoCiudadAsignada, -- Añadido para ver el id_Ciudad directo de la tabla EMPLEADOS
                        (SELECT TOP 1 CP.nombre_ciudad
                        FROM ciuxprov CP
                        WHERE LEFT(E.emp_Cedula, 2) = CP.codigo_provincia
                        ORDER BY CP.nombre_ciudad) AS CiudadCedula
                    FROM Empleados E
                    LEFT JOIN Departamentos D ON E.id_Departamento = D.id_Departamento
                    LEFT JOIN Roles R ON E.id_Rol = R.id_Rol
                    WHERE E.id_Ciudad = @ciudad -- ¡Este es el filtro por la ciudad asignada al empleado!
                    ORDER BY E.emp_Apellido1, E.emp_Nombre1
                `;
                const request = pool.request();
                request.input('ciudad', sql.Char(3), ciudad);
                const result = await request.query(query);
                pool.close(); // Cerrar el pool después de usarlo
                empleadosResult = result.recordset.map(e => ({ ...e, CiudadDB: ciudad })); // También añade la ciudad de la DB de origen
            } catch (err) {
                console.error(`[API Empleados] Error al obtener empleados para la ciudad ${ciudad}:`, err);
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
    const ciudad = req.query.ciudad || 'ALL'; // Valor por defecto 'ALL'
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
                    // Consulta directa para que coincida con la imagen de SELECT * FROM COMPRAS
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
                    currentPool.close(); // Cerrar el pool después de usarlo
                    return result.recordset.map(item => ({
                        id_Compra: item.id_Compra,
                        id_Proveedor: item.id_Proveedor, 
                        oc_Fecha_Hora: item.oc_Fecha_Hora,
                        oc_Subtotal: item.oc_Subtotal,
                        oc_IVA: item.oc_IVA,
                        oc_Total: (item.oc_Subtotal + item.oc_IVA), // Calcula el total aquí
                        ESTADO_OC: item.ESTADO_OC,
                        CiudadDB: c // Añadir la ciudad de origen de la base de datos
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
                // Consulta directa para una ciudad específica, para que coincida con la imagen.
                const query = `
                    SELECT
                        id_Compra,
                        id_Proveedor,
                        oc_Fecha_Hora,
                        oc_Subtotal,
                        oc_IVA,
                        ESTADO_OC
                    FROM COMPRAS
                    WHERE id_Ciudad = @ciudad 
                    ORDER BY oc_Fecha_Hora DESC;
                `;
                request.input('ciudad', sql.Char(3), ciudad); 
                const result = await request.query(query);
                pool.close(); // Cerrar el pool después de usarlo
                comprasResult = result.recordset.map(item => ({
                    id_Compra: item.id_Compra,
                    id_Proveedor: item.id_Proveedor,
                    oc_Fecha_Hora: item.oc_Fecha_Hora,
                    oc_Subtotal: item.oc_Subtotal,
                    oc_IVA: item.oc_IVA,
                    oc_Total: (item.oc_Subtotal + item.oc_IVA),
                    ESTADO_OC: item.ESTADO_OC,
                    CiudadDB: ciudad 
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

        // CORRECCIÓN: El nombre del parámetro debe ser 'p_id_compra' para que coincida con el SP
        request.input('p_id_compra', sql.VarChar(7), compraId); 

        const result = await request.execute('dbo.sp_ver_oc_completa');
        pool.close(); // Cerrar el pool después de usarlo
        
        console.log(`[Compras Detalle Backend] Raw result from SP for ${compraId}:`, JSON.stringify(result.recordsets, null, 2));

        // El SP dbo.sp_ver_oc_completa devuelve un único recordset que mezcla la cabecera, detalles y totales.
        // Necesitamos parsear este recordset para estructurarlo para el frontend.
        const rawData = result.recordsets[0] || [];
        let headerData = null;
        const detailData = [];
        let totalsData = null;

        rawData.forEach(row => {
            if (row.tipo === 'OC_CABECERA') {
                headerData = {
                    id_orden_compra: row.col1,
                    proveedor_id: row.col2,
                    fecha_hora: row.col3,
                    estado_orden: row.col4,
                    usuario: row.col5, 
                };
            } else if (row.tipo === 'OC_DETALLE') {
                detailData.push({
                    id_producto: row.col1,
                    cantidad: row.col2,
                    precio_unitario: row.col3,
                    subtotal_producto: row.col5, 
                });
            } else if (row.tipo === 'TOTALES') {
                const subtotalMatch = row.col1 ? String(row.col1).match(/Subtotal=([0-9.]+)/) : null;
                const ivaMatch = row.col2 ? String(row.col2).match(/IVA=([0-9.]+)/) : null;
                const totalMatch = row.col3 ? String(row.col3).match(/Total=([0-9.]+)/) : null;

                totalsData = {
                    subtotal: subtotalMatch ? parseFloat(subtotalMatch[1]) : 0.00,
                    iva: ivaMatch ? parseFloat(ivaMatch[1]) : 0.00,
                    total: totalMatch ? parseFloat(totalMatch[1]) : 0.00,
                };
            }
        });

        if (!headerData) {
            console.warn(`[Compras Detalle Backend] No se encontró cabecera para la orden de compra ${compraId}.`);
            return res.status(404).send('Detalle de orden de compra no encontrado.');
        }

        const formattedResponse = {
            header: headerData,
            details: detailData,
            totals_summary: totalsData, 
        };
        console.log(`[Compras Detalle Backend] Formatted response for ${compraId}:`, JSON.stringify(formattedResponse, null, 2));
        res.json(formattedResponse);
    } catch (err) {
        console.error(`[Compras Detalle Backend] Error al obtener el detalle de la orden de compra ${compraId}:`, err);
        res.status(500).send('Error al obtener el detalle de la orden de compra.');
    }
});


// Payroll (Rol de Pago) - Manejo de 'ALL' sin modificar el SP
app.get('/api/empleados/payroll/:id', async (req, res) => {
    const { ciudad } = req.query; // Necesario para saber a qué DB conectarse (donde está la nómina)
    const { id: employeeId } = req.params;
    const { year, month } = req.query; // Año y Mes desde el frontend
    let pool;

    try {
        if (!ciudad) {
            return res.status(400).send('Se requiere el parámetro "ciudad" para obtener el rol de pago.');
        }
        pool = await getConnection(ciudad);

        let mainPayrollRaw = [];
        let payrollDetailsRaw = [];

        // Siempre pasamos NULL al SP para year y month para que (ASUMIENDO QUE EL SP HA SIDO MODIFICADO PARA IGNORAR NULLS)
        // nos devuelva todos los roles de pago para ese empleado.
        // Luego, filtramos en el backend si el SP no lo hace correctamente (lo cual es tu caso actual).
        const spYearParam = null; // Siempre enviamos null al SP para que devuelva todo
        const spMonthParam = null; // Siempre enviamos null al SP para que devuelva todo
        console.log(`[PAYROLL DEBUG] Enviando al SP - p_emp_codigo: ${employeeId}, p_year: ${spYearParam}, p_month: ${spMonthParam}`);

        const request = pool.request();
        request.input('p_emp_codigo', sql.VarChar(10), employeeId);
        request.input('p_year', sql.Char(4), spYearParam); 
        request.input('p_month', sql.Char(2), spMonthParam); 

        const result = await request.execute('dbo.sp_tthh_ver_detalle_pago_empleado');
        pool.close(); // Cerrar el pool después de usarlo

        console.log('[PAYROLL DEBUG] Raw recordsets from SP:', JSON.stringify(result.recordsets, null, 2));

        const mainPayrollRawFromSP = result.recordsets[0] || [];
        const payrollDetailsRawFromSP = result.recordsets[1] || [];

        // Log de los datos separados
        console.log('[PAYROLL DEBUG] mainPayrollRawFromSP:', mainPayrollRawFromSP);
        console.log('[PAYROLL DEBUG] payrollDetailsRawFromSP:', payrollDetailsRawFromSP);

        let filteredMainPayroll = mainPayrollRawFromSP;
        let filteredPayrollDetails = payrollDetailsRawFromSP;

        // APLICAR FILTRADO EN NODE.JS SI EL AÑO O EL MES NO SON 'ALL'
        if (year !== 'ALL' || month !== 'ALL') {
            const targetYear = parseInt(year);
            const targetMonth = month; 

            filteredMainPayroll = mainPayrollRawFromSP.filter(item => {
                if (!item.Pago) return false;
                const [itemYear, itemMonth] = item.Pago.split('-'); 
                const itemYearNum = parseInt(itemYear);

                const matchYear = (year === 'ALL' || itemYearNum === targetYear);
                const matchMonth = (month === 'ALL' || itemMonth === targetMonth);
                
                return matchYear && matchMonth;
            });

            const filteredPaymentPeriods = new Set(filteredMainPayroll.map(item => item.Pago));
            const filteredEmployeeIds = new Set(filteredMainPayroll.map(item => item.Empleado));

            filteredPayrollDetails = payrollDetailsRawFromSP.filter(detailItem => {
                return filteredPaymentPeriods.has(detailItem.id_Pago) && filteredEmployeeIds.has(detailItem.id_Empleado);
            });
        }

        const combinedPayroll = filteredMainPayroll.map(mainItem => {
            const itemDetails = filteredPayrollDetails.filter(detailItem => 
                detailItem.id_Empleado === mainItem.Empleado && detailItem.id_Pago === mainItem.Pago
            ).map(detailItem => ({
                id_detalle: detailItem.id_detalle,
                tipo_detalle: detailItem.tipo_detalle,
                fecha_detalle: detailItem.fecha, 
                valor_detalle: detailItem.valor,
                estado_detalle: detailItem.estado
            }));

            return {
                periodo_pago: mainItem.Pago,
                empleado_id: mainItem.Empleado,
                sueldo_base: mainItem.Sueldo,
                bonificaciones: mainItem.Bonificaciones,
                descuentos: mainItem.Descuentos,
                neto_a_pagar: mainItem.Neto,
                estado_pago: mainItem.Estado,
                details: itemDetails 
            };
        });

        res.json({ mainPayroll: combinedPayroll });
    } catch (err) {
        console.error('Error al obtener el rol de pago del empleado:', err);
        res.status(500).send('Error al obtener el rol de pago del empleado.');
    }
});


// NUEVA RUTA: Obtener rol de pago de empleado utilizando fn_visualizar_rol
app.get('/api/rol/:idEmpleado', async (req, res) => {
    const empleado = req.params.idEmpleado;
    let pool;
    try {
        // Conectar a la base de datos (asumimos Quito como la base donde reside la información de Pagos)
        pool = await getConnection('QUI');
        
        // 1. Obtener el id_Pago más reciente para el empleado
        const resultId = await pool.request()
            .input('empleado', sql.Char(7), empleado)
            .query(`
                SELECT TOP 1 p.id_Pago
                FROM Pagos p
                JOIN BonxEmpxPag b ON p.id_Pago = b.id_Pago
                WHERE b.id_Empleado = @empleado
                ORDER BY p.pag_Fecha_Inicio DESC;
            `);

        const idPago = resultId.recordset[0]?.id_Pago;

        if (!idPago) {
            pool.close();
            return res.status(404).json({ error: 'No se encontró un rol para este empleado con bonificaciones.' });
        }

        // 2. Usar el id_Pago para llamar a la función fn_visualizar_rol
        const rol = await pool.request()
            .input('id_Pago', sql.Char(7), idPago) 
            .query(`SELECT * FROM dbo.fn_visualizar_rol(@id_Pago)`);
        
        pool.close();
        res.json(rol.recordset);
    } catch (err) {
        console.error('Error al obtener el rol del empleado:', err);
        if (pool) pool.close(); 
        res.status(500).send('Error al obtener el rol del empleado.');
    }
});


// Ruta para Ventas (Asumimos que es un listado similar a Facturas, pero con detalle de productos)
app.get('/api/ventas', async (req, res) => {
  try {
    const { ciudad } = req.query;
    
    const pool = await getConnection('QUI'); // Asumimos una base para Ventas (ej: Quito)
    const request = pool.request();

    let query = `
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
          PF.pxf_Valor
      FROM FACTURAS F
      INNER JOIN CLIENTES C ON F.id_Cliente = C.id_Cliente
      INNER JOIN CIUDADES CIU ON C.id_Ciudad = CIU.id_Ciudad
      INNER JOIN PROXFAC PF ON F.id_Factura = PF.id_Factura
      INNER JOIN PRODUCTOS P ON PF.id_Producto = P.id_Producto
    `;

    if (ciudad && ciudad !== 'ALL') {
      query += ` WHERE CIU.id_Ciudad = @ciudad`;
      request.input('ciudad', sql.Char(3), ciudad);
    }
    query += ` ORDER BY F.fac_Fecha_Hora DESC, F.id_Factura, P.pro_Descripcion`;

    const result = await request.query(query);
    pool.close(); // Cerrar el pool después de usarlo
    res.json(result.recordset);
  } catch (err) {
    console.error('Error al obtener ventas:', err);
    res.status(500).send('Error al obtener ventas');
  }
});

// NUEVOS ENDPOINTS PARA CONTABILIDAD

// Ruta para listar asientos contables (resumen)

// Endpoint para listar asientos contables (resumen)
app.get("/api/contabilidad/asientos", async (req, res) => {
  const ciudad = req.query.ciudad || "ALL";
  try {
    let asientosResult = [];
    const allCities = Object.keys(configByCity);

    if (ciudad === "ALL") {
      // Obtener asientos de todas las ciudades
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
                ESTADO_ASI
            FROM ASIENTOS
            ORDER BY asi_FechaHora DESC, id_Asiento DESC;
        `;
        const result = await request.query(query);
        currentPool.close();
        console.log(`Ciudad ${c} tiene ${result.recordset.length} asientos`);
        return result.recordset.map(a => ({ ...a, CiudadDB: c }));
    } catch (innerErr) {
        console.error(`Error al obtener asientos de ${c}:`, innerErr);
        return [];
    }
});
console.log("Ciudades configuradas:", allCities);


      asientosResult = (await Promise.all(promesasAsientos)).flat();
    } else {
      // Obtener asientos solo de la ciudad seleccionada
      let pool;
      try {
        pool = await getConnection(ciudad);
        const request = pool.request();
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
        pool.close();
        asientosResult = result.recordset;
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
    const rows = result.recordset || [];

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

// NUEVOS ENDPOINTS PARA INVENTARIO (AHORA PARA AJUSTES)

// Ruta para listar ajustes de inventario (resumen)
app.get('/api/inventario/ajustes', async (req, res) => { 
    const ciudad = req.query.ciudad || 'ALL'; // Valor por defecto 'ALL'
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
                            ESTADO_AJU
                        FROM AJUSTES
                        ORDER BY aju_FechaHora DESC, id_Ajuste DESC;
                    `;
                    const result = await request.query(query);
                    currentPool.close();
                    return result.recordset.map(a => ({ ...a, CiudadDB: c }));
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
                        ESTADO_AJU
                    FROM AJUSTES
                    WHERE id_Ciudad = @ciudad 
                    ORDER BY aju_FechaHora DESC, id_Ajuste DESC;
                `;
                request.input('ciudad', sql.Char(3), ciudad);
                const result = await request.query(query);
                pool.close();
                ajustesResult = result.recordset;
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

    // Separar por tipo
    const headerRow = rows.find(r => r.tipo === 'CABECERA') || null;
    const detailRows = rows.filter(r => r.tipo === 'DETALLE');
    const totalRow = rows.find(r => r.tipo === 'TOTALES') || null;

    // Mapear detalles
    const formattedDetails = detailRows.map(row => ({
      id_Producto: row.columna1?.replace('Producto: ', '') ?? '',
      pro_Descripcion: row.columna2,
      aju_Cantidad: row.columna4?.replace('Cantidad: ', '') ?? '',
      ESTADO_AJUD: row.columna8?.replace('Estado PxA: ', '') ?? ''
    }));

    res.json({
      header: headerRow,
      details: formattedDetails,
      totals: {
        totalTexto: totalRow?.columna5 ?? null
      }
    });

  } catch (err) {
    console.error('Error al obtener el detalle del ajuste:', err);
    res.status(500).send('Error al obtener el detalle del ajuste.');
  }
});


// NUEVO ENDPOINT PARA LOG GENERAL
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
                return result.recordset.map(t => ({ ...t, CiudadDB: c })); 
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
