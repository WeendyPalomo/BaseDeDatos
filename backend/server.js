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
    const { ciudad } = req.query; // Necesario para saber a qué DB conectarse
    const { id } = req.params;
    let pool;
    try {
        if (!ciudad) {
            return res.status(400).send('Se requiere el parámetro "ciudad" para obtener el detalle de la factura.');
        }
        pool = await getConnection(ciudad);
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

        res.json({
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
        console.error('Error al obtener el detalle de la factura:', err);
        res.status(500).send('Error al obtener el detalle de la factura.');
    }
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
                    return result.recordset.map(e => ({ ...e, CiudadDB: c })); // Añade el código de la ciudad de origen (DB)
                } catch (innerErr) {
                    console.error(`[API Empleados] Error al obtener empleados de ${c}:`, innerErr);
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
        if (!ciudad) {
            return res.status(400).send('Se requiere el parámetro "ciudad" para obtener el detalle de la orden de compra.');
        }
        pool = await getConnection(ciudad);
        const request = pool.request();

        request.input('p_id_oc', sql.VarChar(7), compraId); 

        const result = await request.execute('dbo.sp_ver_oc_completa');
        
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
                    usuario: row.col5, // Asumo que col5 es el usuario o similar
                };
            } else if (row.tipo === 'OC_DETALLE') {
                detailData.push({
                    id_producto: row.col1,
                    cantidad: row.col2,
                    precio_unitario: row.col3,
                    subtotal_producto: row.col5, // col5 es el subtotal del producto
                    // col4 es NULL en la imagen, si es un estado de detalle en tu DB, mapearlo aquí
                });
            } else if (row.tipo === 'TOTALES') {
                // Parsear los strings como "Subtotal=X.XX", "IVA=Y.YY", "Total=Z.ZZ"
                const subtotalMatch = row.col1 ? row.col1.match(/Subtotal=([0-9.]+)/) : null;
                const ivaMatch = row.col2 ? row.col2.match(/IVA=([0-9.]+)/) : null;
                const totalMatch = row.col3 ? row.col3.match(/Total=([0-9.]+)/) : null;

                totalsData = {
                    subtotal: subtotalMatch ? parseFloat(subtotalMatch[1]) : 0.00,
                    iva: ivaMatch ? parseFloat(ivaMatch[1]) : 0.00,
                    total: totalMatch ? parseFloat(totalMatch[1]) : 0.00,
                };
            }
        });

        if (!headerData) {
            return res.status(404).send('Detalle de orden de compra no encontrado.');
        }

        const formattedResponse = {
            header: headerData,
            details: detailData,
            totals_summary: totalsData, // Ahora es un objeto con subtotal, iva, total
        };

        res.json(formattedResponse);
    } catch (err) {
        console.error('Error al obtener el detalle de la orden de compra:', err);
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

        // Si el año o el mes son 'ALL', hacemos consulta directa y filtramos en Node.js
        if (year === 'ALL' || month === 'ALL') {
            // Consulta directa para obtener TODOS los roles de pago del empleado
            const mainPayrollQuery = `
                SELECT
                    id_Pago AS Pago,
                    id_Empleado AS Empleado,
                    emp_Sueldo AS Sueldo,
                    emp_Bonificaciones AS Bonificaciones,
                    emp_Descuentos AS Descuentos,
                    emp_Valor_Neto AS Neto,
                    ESTADO_PxE AS Estado
                FROM PagxEmp
                WHERE id_Empleado = @employeeId
                ORDER BY id_Pago DESC;
            `;
            const mainResult = await pool.request()
                .input('employeeId', sql.VarChar(10), employeeId)
                .query(mainPayrollQuery);
            mainPayrollRaw = mainResult.recordset;

            // Consulta directa para obtener TODOS los detalles de bonificaciones/descuentos del empleado
            const detailsQuery = `
                SELECT
                    id_Bonificacion AS id_detalle,
                    'BON' AS tipo_detalle,
                    bxe_Fecha AS fecha,
                    bxe_Valor AS valor,
                    ESTADO_BXE AS estado,
                    id_Empleado,
                    id_Pago
                FROM BonxEmpxPag
                WHERE id_Empleado = @employeeId

                UNION ALL

                SELECT
                    id_Descuento AS id_detalle,
                    'DES' AS tipo_detalle,
                    dxe_Fecha AS fecha,
                    dxe_Valor AS valor,
                    ESTADO_DXE AS estado,
                    id_Empleado,
                    id_Pago
                FROM DesxEmpxPag
                WHERE id_Empleado = @employeeId
                ORDER BY fecha DESC, tipo_detalle, id_detalle;
            `;
            const detailsResult = await pool.request()
                .input('employeeId', sql.VarChar(10), employeeId)
                .query(detailsQuery);
            payrollDetailsRaw = detailsResult.recordset;

            // Aplicar el filtrado por año y mes en Node.js si no son 'ALL'
            let filteredMainPayroll = mainPayrollRaw;
            let filteredPayrollDetails = payrollDetailsRaw;

            if (year !== 'ALL' || month !== 'ALL') {
                const targetYear = year !== 'ALL' ? parseInt(year) : null;
                const targetMonth = month !== 'ALL' ? month : null;

                filteredMainPayroll = mainPayrollRaw.filter(item => {
                    if (!item.Pago) return false;
                    const [itemYearStr, itemMonthStr] = item.Pago.split('-'); // FormatoYYYY-MM
                    const itemYearNum = parseInt(itemYearStr);

                    const matchYear = (targetYear === null || itemYearNum === targetYear);
                    const matchMonth = (targetMonth === null || itemMonthStr === targetMonth);
                    return matchYear && matchMonth;
                });

                const filteredPaymentPeriods = new Set(filteredMainPayroll.map(item => item.Pago));
                filteredPayrollDetails = payrollDetailsRaw.filter(detailItem => {
                    return filteredPaymentPeriods.has(detailItem.id_Pago) && detailItem.id_Empleado === employeeId;
                });
            }
            mainPayrollRaw = filteredMainPayroll; // Actualiza con los datos ya filtrados en Node.js
            payrollDetailsRaw = filteredPayrollDetails; // Actualiza con los datos ya filtrados en Node.js

        } else {
            // Si año y mes son específicos, se llama al SP (como antes)
            const request = pool.request();
            request.input('p_emp_codigo', sql.VarChar(10), employeeId);
            request.input('p_year', sql.Char(4), year); // Pasar el año específico
            request.input('p_month', sql.Char(2), month); // Pasar el mes específico

            const result = await request.execute('dbo.sp_tthh_ver_detalle_pago_empleado');
            mainPayrollRaw = result.recordsets[0] || [];
            payrollDetailsRaw = result.recordsets[1] || [];
        }

        // Combinar los detalles con el resumen de pago
        const combinedPayroll = mainPayrollRaw.map(mainItem => {
            const itemDetails = payrollDetailsRaw.filter(detailItem =>
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
        console.error('Error al obtener el rol de pago:', err);
        res.status(500).send('Error al obtener el rol de pago');
    }
});


// Ruta para Ventas (por ciudad o todas)
app.get('/api/ventas', async (req, res) => {
    const ciudad = req.query.ciudad || 'ALL'; // Valor por defecto 'ALL'
    let pool;
    try {
        let ventasResult = [];
        const allCities = Object.keys(configByCity);

        if (ciudad === 'ALL') {
            const promesasVentas = allCities.map(async c => {
                let currentPool;
                try {
                    currentPool = await getConnection(c);
                    const request = currentPool.request();
                    request.input('p_id_ciudad', sql.Char(3), null); 
                    const result = await request.execute('dbo.sp_facturas_listar_resumen_con_ciudad');
                    return result.recordset.map(f => ({ 
                        id_Factura: f.id_Factura,
                        fac_Fecha_Hora: f.fac_Fecha_Hora,
                        fac_Descripcion: f.fac_Descripcion,
                        fac_Subtotal: f.fac_Subtotal,
                        fac_IVA: f.fac_IVA,
                        fac_Total: f.fac_Total,
                        cli_Nombre: f.cli_Nombre_Completo, 
                        CiudadCliente: f.CiudadCliente, 
                        pro_Descripcion: 'N/A', 
                        pxf_Cantidad: 'N/A',
                        pxf_Valor: 'N/A',
                        ESTADO_FAC: f.ESTADO_FAC,
                        CiudadDB: c 
                    }));
                } catch (innerErr) {
                    console.error(`Error al obtener ventas de ${c}:`, innerErr);
                    return [];
                }
            });
            ventasResult = (await Promise.all(promesasVentas)).flat();
        } else {
            try {
                pool = await getConnection(ciudad);
                const request = pool.request();
                request.input('p_id_ciudad', sql.Char(3), ciudad);
                const result = await request.execute('dbo.sp_facturas_listar_resumen_con_ciudad');
                ventasResult = result.recordset.map(f => ({
                    id_Factura: f.id_Factura,
                    fac_Fecha_Hora: f.fac_Fecha_Hora,
                    fac_Descripcion: f.fac_Descripcion,
                    fac_Subtotal: f.fac_Subtotal,
                    fac_IVA: f.fac_IVA,
                    fac_Total: f.fac_Total,
                    cli_Nombre: f.cli_Nombre_Completo,
                    CiudadCliente: f.CiudadCliente,
                    pro_Descripcion: 'N/A',
                    pxf_Cantidad: 'N/A',
                    pxf_Valor: 'N/A',
                    ESTADO_FAC: f.ESTADO_FAC,
                }));
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
app.get('/api/contabilidad/asientos', async (req, res) => {
    const ciudad = req.query.ciudad || 'ALL'; // Valor por defecto 'ALL'
    let pool;
    try {
        let asientosResult = [];
        const allCities = Object.keys(configByCity);

        if (ciudad === 'ALL') {
            const promesasAsientos = allCities.map(async c => {
                let currentPool;
                try {
                    currentPool = await getConnection(c);
                    const request = currentPool.request();
                    const query = `
                        SELECT
                            id_Asiento,
                            asi_Fecha_Hora,
                            asi_Descripcion,
                            ESTADO_ASI
                        FROM ASIENTOS
                        ORDER BY asi_Fecha_Hora DESC, id_Asiento DESC;
                    `;
                    const result = await request.query(query);
                    return result.recordset.map(a => ({ ...a, CiudadDB: c }));
                } catch (innerErr) {
                    console.error(`Error al obtener asientos de ${c}:`, innerErr);
                    return [];
                }
            });
            asientosResult = (await Promise.all(promesasAsientos)).flat();
        } else {
            try {
                pool = await getConnection(ciudad);
                const request = pool.request();
                const query = `
                    SELECT
                        id_Asiento,
                        asi_Fecha_Hora,
                        asi_Descripcion,
                        ESTADO_ASI
                    FROM ASIENTOS
                    ORDER BY asi_Fecha_Hora DESC, id_Asiento DESC;
                `;
                const result = await request.query(query);
                asientosResult = result.recordset;
            } catch (err) { 
                console.error(`Error al obtener asientos para la ciudad ${ciudad}:`, err);
                return res.status(500).send(`Error al obtener asientos para la ciudad ${ciudad}`);
            }
        }
        res.json(asientosResult);
    } catch (err) {
        console.error('Error general al obtener asientos contables:', err);
        res.status(500).send('Error al obtener asientos contables');
    }
});

// Ruta para obtener el detalle de un asiento contable por ID
app.get('/api/contabilidad/asiento/detalle/:id', async (req, res) => {
    const { ciudad } = req.query; 
    const { id: asientoId } = req.params; 
    let pool;
    try {
        if (!ciudad) {
            return res.status(400).send('Se requiere el parámetro "ciudad" para obtener el detalle del asiento.');
        }
        pool = await getConnection(ciudad);
        const request = pool.request();

        request.input('p_id_Asiento', sql.VarChar(7), asientoId); 

        const result = await request.execute('dbo.sp_ver_asiento_completo');
        
        const headerData = result.recordsets[0]?.[0] || null;
        const detailData = result.recordsets[1] || [];

        const formattedDetails = detailData.map(item => ({
            id_cuenta: item.id_Cuenta, 
            cue_nombre: item.cue_Nombre, 
            det_Debito: item.det_Debito, 
            det_Credito: item.det_Credito, 
            det_Descripcion: item.det_Descripcion, 
            ESTADO_DET: item.ESTADO_DET, 
        }));

        const formattedResponse = {
            header: headerData ? {
                id_Asiento: headerData.id_Asiento, 
                asi_Fecha_Hora: headerData.asi_Fecha_Hora, 
                asi_Descripcion: headerData.asi_Descripcion, 
                asi_total_debe: headerData.asi_total_debe, 
                asi_total_haber: headerData.asi_total_haber, 
                ESTADO_ASI: headerData.ESTADO_ASI, 
            } : null,
            details: formattedDetails,
        };

        res.json(formattedResponse);
    } catch (err) {
        console.error('Error al obtener el detalle del asiento contable:', err);
        res.status(500).send('Error al obtener el detalle del asiento contable.');
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
        
        const headerData = result.recordsets[0]?.[0] || null;
        const detailData = result.recordsets[1] || [];

        if (!headerData) {
            return res.status(404).send('Ajuste no encontrado o no pertenece a la ciudad.');
        }

        const formattedResponse = {
            header: headerData, 
            details: detailData, 
        };

        res.json(formattedResponse);
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
