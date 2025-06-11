// App.js
import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Route, Routes, Link, useLocation } from "react-router-dom";
import "./App.css"; // Asegúrate de que esta ruta sea correcta
import Inicio from './Inicio'; // Importa el componente Inicio
import GeneralLog from './GeneralLog'; // Importa el componente GeneralLog

// --- Componentes funcionales ---

// Componente reutilizable para la selección de ciudad (AHORA MUESTRA NOMBRES DE BASES DE DATOS)
function CitySelect({ selectedCity, onCityChange }) {
  const [ciudades, setCiudades] = useState([]);

  useEffect(() => {
    // Obtener la lista de ciudades/bases de datos del backend
    // Este endpoint de /api/ciudades debe devolver la lista de IDs de ciudades (QUI, GYE, etc.)
    // y los nombres de las bases de datos.
    fetch("http://localhost:3001/api/ciudades")
      .then((res) => res.json())
      .then((data) => setCiudades(data))
      .catch((err) => console.error("Error al obtener ciudades:", err));
  }, []);

  return (
    <div style={{ marginBottom: "1rem" }}>
      <label htmlFor="city-select">Filtrar por Base de Datos: </label> {/* Cambiado el label */}
      <select id="city-select" onChange={(e) => onCityChange(e.target.value)} value={selectedCity}>
        <option value="ALL">Todas las Bases de Datos</option> {/* Cambiado el texto */}
        {ciudades.map((c) => (
          <option key={c.id_Ciudad} value={c.id_Ciudad}>
            {c.db_name} {/* Usa db_name para el texto de la opción */}
          </option>
        ))}
      </select>
    </div>
  );
}

// Componente para la ventana modal de detalles de factura (Facturas generales)
function FacturaDetailModal({ facturaId, onClose, ciudad }) {
  const [facturaDetails, setFacturaDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!facturaId || !ciudad) {
      setFacturaDetails(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    fetch(`http://localhost:3001/api/facturas/detalle/${facturaId}?ciudad=${ciudad}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setFacturaDetails(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error al obtener detalles de la factura:", err);
        setError("Error al cargar los detalles de la factura.");
        setLoading(false);
      });
  }, [facturaId, ciudad]);

  if (!facturaId || !ciudad) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close-button" onClick={onClose}>&times;</button>
        <h2>Detalle de Factura: {facturaId}</h2>

        {loading && <p>Cargando detalles...</p>}
        {error && <p className="error-message">{error}</p>}

        {facturaDetails && (
          <div className="factura-detail-container">
            {facturaDetails.header && (
              <div className="factura-header">
                <h3>Información General</h3>
                <p><strong>ID Factura:</strong> {facturaDetails.header.id_factura}</p>
                <p><strong>Fecha/Hora:</strong> {facturaDetails.header.fecha_hora}</p>
                <p><strong>Cliente:</strong> {facturaDetails.header.cliente_nombre}</p>
                <p><strong>RUC/Cédula:</strong> {facturaDetails.header.cliente_ruc_ced}</p>
                <p><strong>Email Cliente:</strong> {facturaDetails.header.cliente_mail}</p>
                <p><strong>Descripción:</strong> {facturaDetails.header.descripcion_factura}</p>
                <p><strong>Estado:</strong> {facturaDetails.header.estado_factura}</p>
              </div>
            )}

            {facturaDetails.details && facturaDetails.details.length > 0 && (
              <div className="factura-details">
                <h3>Detalle de Productos</h3>
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th>ID Producto</th>
                      <th>Descripción</th>
                      <th>U.M. Venta</th>
                      <th>Cantidad</th>
                      <th>P. Unitario</th>
                      <th>Subtotal Producto</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturaDetails.details.map((item, index) => (
                      <tr key={item.id_producto || index}>
                        <td>{item.id_producto}</td>
                        <td>{item.descripcion_producto}</td>
                        <td>{item.unidad_medida}</td>
                        <td>{item.cantidad}</td>
                        <td>{item.precio_unitario}</td>
                        <td>{item.subtotal_producto}</td>
                        <td>{item.estado_detalle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {facturaDetails.totals_summary && (
              <div className="factura-totals">
                <h3>Resumen de Totales</h3>
                <p className="totals-summary-text">{facturaDetails.totals_summary}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// Componente para el módulo de Facturas
function Facturas() {
  const [facturas, setFacturas] = useState([]);
  const [selectedCity, setSelectedCity] = useState("ALL");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [currentFacturaId, setCurrentFacturaId] = useState(null);
  const [currentFacturaCiudad, setCurrentFacturaCiudad] = useState(null); // Nuevo estado para la ciudad de la factura

  useEffect(() => {
    const queryParam = selectedCity !== "ALL" ? `?ciudad=${selectedCity}` : "";
    fetch(`http://localhost:3001/api/facturas${queryParam}`)
      .then((res) => res.json())
      .then((data) => setFacturas(data))
      .catch((err) => console.error("Error al obtener facturas:", err));
  }, [selectedCity]);

  const handleViewDetail = (id, ciudadDb) => { // Recibe también la ciudad de la DB
    setCurrentFacturaId(id);
    setCurrentFacturaCiudad(ciudadDb);
    setShowDetailModal(true);
  };

  const handleCloseModal = () => {
    setShowDetailModal(false);
    setCurrentFacturaId(null);
    setCurrentFacturaCiudad(null);
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Facturas</h1>
      <CitySelect selectedCity={selectedCity} onCityChange={setSelectedCity} />
      <table border="1" cellPadding="10" style={{ marginTop: "1rem" }}>
        <thead>
          <tr>
            <th>Acciones</th>
            <th>Factura ID</th>
            <th>Fecha/Hora</th>
            <th>Descripción</th>
            <th>Subtotal</th>
            <th>IVA</th>
            <th>Total</th>
            <th>Cliente</th>
            <th>Ciudad Cliente</th>
            <th>Estado</th>
            <th>Base de Datos</th> {/* Cambiado de Ciudad DB a Base de Datos */}
          </tr>
        </thead>
        <tbody>
          {facturas.length > 0 ? (
            facturas.map((f) => (
              <tr key={f.id_Factura}>
                <td>
                  <button onClick={() => handleViewDetail(f.id_Factura, f.CiudadDB || selectedCity)} className="view-detail-button">
                    Ver Detalle
                  </button>
                </td>
                <td>{f.id_Factura}</td>
                <td>{f.fac_Fecha_Hora ? new Date(f.fac_Fecha_Hora).toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</td>
                <td>{f.fac_Descripcion || 'N/A'}</td>
                <td>${f.fac_Subtotal ? f.fac_Subtotal.toFixed(2) : '0.00'}</td>
                <td>${f.fac_IVA ? f.fac_IVA.toFixed(2) : '0.00'}</td>
                <td>${f.fac_Total ? f.fac_Total.toFixed(2) : '0.00'}</td>
                <td>{f.cli_Nombre_Completo || 'N/A'}</td>
                <td>{f.CiudadCliente || 'N/A'}</td>
                <td>{f.ESTADO_FAC || 'N/A'}</td>
                <td>{f.CiudadDB || 'N/A'}</td> {/* Muestra el nombre de la Base de Datos */}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="11">No hay facturas disponibles para la base de datos seleccionada.</td>
            </tr>
          )}
        </tbody>
      </table>

      {showDetailModal && (
        <FacturaDetailModal
          facturaId={currentFacturaId}
          ciudad={currentFacturaCiudad} // Pasa la ciudad al modal
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}


// Componente para la ventana modal de detalles de rol de pago de empleado
function EmployeePayrollModal({ employeeId, onClose, ciudad }) {
  const [rolData, setRolData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Se eliminan los estados de año y mes, ya que se pidió quitar los filtros
  // const [selectedYear, setSelectedYear] = useState('ALL');
  // const [selectedMonth, setSelectedMonth] = useState('ALL');

  // Se eliminan las constantes y arrays relacionados con los filtros de año y mes
  // const currentYear = new Date().getFullYear();
  // const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  // const months = [
  //   { value: '01', label: 'Enero' }, { value: '02', label: 'Febrero' },
  //   { value: '03', label: 'Marzo' }, { value: '04', label: 'Abril' },
  //   { value: '05', label: 'Mayo' }, { value: '06', label: 'Junio' },
  //   { value: '07', label: 'Julio' }, { value: '08', label: 'Agosto' },
  //   { value: '09', label: 'Septiembre' }, { value: '10', label: 'Octubre' },
  //   { value: '11', label: 'Noviembre' }, { value: '12', label: 'Diciembre' },
  // ];

  useEffect(() => {
    if (!employeeId || !ciudad) {
      setRolData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const queryParams = new URLSearchParams();
    queryParams.append('ciudad', ciudad); // Añadir la ciudad a los query params

    fetch(`http://localhost:3001/api/empleados/payroll/${employeeId}?${queryParams.toString()}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setRolData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error al obtener detalles de rol de pago:", err);
        setError("Error al cargar los detalles del rol de pago.");
        setRolData(null);
        setLoading(false);
      });
  }, [employeeId, ciudad]); // Eliminados selectedYear, selectedMonth de las dependencias

  if (!employeeId || !ciudad) return null;

  return (
    <div className="modal-overlay">
      {/* Ajustes de estilo para el modal-content: hacerlo más ancho y alto */}
      <div className="modal-content" style={{ maxWidth: '90vw', maxHeight: '90vh', width: 'auto' }}>
        <button className="modal-close-button" onClick={onClose}>&times;</button>
        <h2>Rol de Pago para Empleado: {employeeId} (Base de Datos: {ciudad})</h2>

        {/* Se elimina el div de filtros de año y mes */}
        {/*
        <div className="payroll-filters">
          <label htmlFor="year-select">Año:</label>
          <select id="year-select" value={selectedYear} onChange={(e) => setSelectedYear(e.target.value)}>
            <option value="ALL">Todos</option>
            {years.map(year => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>

          <label htmlFor="month-select">Mes:</label>
          <select id="month-select" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)}>
            <option value="ALL">Todos</option>
            {months.map(month => (
              <option key={month.value} value={month.value}>{month.label}</option>
            ))}
          </select>
        </div>
        */}

        {loading && <p>Cargando rol de pago...</p>}
        {error && <p className="error-message">{error}</p>}

        {rolData && rolData.length > 0 ? (
          <div className="payroll-detail-container" style={{ overflowX: 'auto' }}> {/* Añadir overflow-x para tablas anchas */}
            <h3>Detalle de Rol de Pago</h3>
            <table className="detail-table">
              <thead>
                <tr>
                  {Object.keys(rolData[0]).map(col => (
                    <th key={col} style={{ textTransform: 'capitalize', whiteSpace: 'nowrap' }}> {/* whiteSpace:nowrap para evitar saltos de línea */}
                      {col.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rolData.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {Object.entries(row).map(([key, val], colIndex) => (
                      <td key={`${rowIndex}-${colIndex}`}>
                        {(() => {
                          const isCurrency = ['valor_bonificacion', 'valor_descuento', 'pag_sueldo_neto'].includes(key.toLowerCase());
                          if (typeof val === 'number' && isCurrency) {
                            return `$${val.toFixed(2)}`;
                          }
                          const isDateColumn = ['pag_fecha_inicio', 'pag_fecha_fin'].includes(key.toLowerCase());
                          if (typeof val === 'string' && isDateColumn && !isNaN(new Date(val))) {
                              const date = new Date(val);
                              return date.toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
                          }
                          return val;
                        })()}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          !loading && !error && <p>No hay roles de pago disponibles para este empleado. Genera el rol del empleado y refresca la pagina.</p>
        )}
      </div>
    </div>
  );
}


// Componente para el módulo de Empleados (Talento Humano)
function Empleados() {
  const [empleados, setEmpleados] = useState([]);
  const [selectedCity, setSelectedCity] = useState("ALL"); // Estado local para la ciudad seleccionada
  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [currentEmployeeId, setCurrentEmployeeId] = useState(null);
  const [currentEmployeeCity, setCurrentEmployeeCity] = useState(null); // Nuevo estado para la ciudad del empleado

  useEffect(() => {
    // Construir el parámetro de consulta para la ciudad
    const queryParam = selectedCity !== "ALL" ? `?ciudad=${selectedCity}` : ""; // Cambiado de 'city' a 'ciudad'
    fetch(`http://localhost:3001/api/empleados${queryParam}`) // Asegúrate que este endpoint exista en server.js
      .then((res) => res.json())
      .then((data) => setEmpleados(data))
      .catch((err) => console.error("Error al obtener empleados:", err));
  }, [selectedCity]); // Re-fetch cuando la ciudad seleccionada cambie

  const handleViewPayroll = (id, ciudadDb) => { // Recibe también la ciudad de la DB del empleado
    setCurrentEmployeeId(id);
    setCurrentEmployeeCity(ciudadDb);
    setShowPayrollModal(true);
  };

  const handleClosePayrollModal = () => {
    setShowPayrollModal(false);
    setCurrentEmployeeId(null);
    setCurrentEmployeeCity(null);
  };


  return (
    <div style={{ padding: "2rem" }}>
      <h1>Talento Humano (Empleados)</h1>
      {/* CitySelect dentro del componente Empleados para su propio filtro */}
      <CitySelect selectedCity={selectedCity} onCityChange={setSelectedCity} />
      <table border="1" cellPadding="10" style={{ marginTop: "1rem" }}>
        <thead>
          <tr>
            <th>Acciones</th>
            <th>ID Empleado</th>
            <th>Cédula</th>
            <th>Nombres</th>
            <th>Apellidos</th>
            <th>Sexo</th>
            <th>Fecha Nacimiento</th>
            <th>Sueldo</th>
            <th>Mail</th>
            <th>Departamento</th>
            <th>Rol</th>
            <th>Ciudad Asignada (Tabla)</th> 
            <th>Ciudad (Cédula)</th>
            <th>Base de Datos</th> {/* Cambiado de Ciudad DB a Base de Datos */}
          </tr>
        </thead>
        <tbody>
          {empleados.length > 0 ? (
            empleados.map((e) => (
              <tr key={e.id_Empleado}>
                <td>
                  <button onClick={() => handleViewPayroll(e.id_Empleado, e.id_Ciudad || selectedCity)} className="view-detail-button">
                    Ver Rol
                  </button>
                </td>
                <td>{e.id_Empleado}</td>
                <td>{e.emp_Cedula}</td>
                <td>{e.emp_Nombre1} {e.emp_Nombre2}</td>
                <td>{e.emp_Apellido1} {e.emp_Apellido2}</td>
                <td>{e.emp_Sexo}</td>
                <td>{e.emp_FechaNacimiento ? new Date(e.emp_FechaNacimiento).toLocaleDateString() : 'N/A'}</td>
                <td>${e.emp_Sueldo ? e.emp_Sueldo.toFixed(2) : '0.00'}</td>
                <td>{e.emp_Mail}</td>
                <td>{e.dep_Nombre}</td>
                <td>{e.rol_Descripcion}</td>
                <td>{e.EmpleadoCiudadAsignada || 'N/A'}</td> 
                <td>{e.CiudadCedula || 'N/A'}</td>
                <td>{e.CiudadDB || 'N/A'}</td> {/* Muestra el nombre de la Base de Datos */}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="14">No hay empleados registrados o no hay empleados para la base de datos seleccionada.</td> 
            </tr>
          )}
        </tbody>
      </table>

      {showPayrollModal && (
        <EmployeePayrollModal
          employeeId={currentEmployeeId}
          ciudad={currentEmployeeCity} // Pasa la ciudad al modal
          onClose={handleClosePayrollModal}
        />
      )}
    </div>
  );
}

// NUEVO COMPONENTE: Ventana Modal para Detalle de Orden de Compra
function PurchaseOrderDetailModal({ compraId, onClose, ciudad }) {
  const [compraDetails, setCompraDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!compraId || !ciudad) {
      setCompraDetails(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`http://localhost:3001/api/compras/detalle/${compraId}?ciudad=${ciudad}`)
      .then((res) => {
        if (!res.ok) {
          return res.text().then(text => {
            throw new Error(`HTTP error! status: ${res.status}, body: ${text}`);
          });
        }
        return res.json();
      })
      .then((data) => {
        // Validar estructura recibida desde backend
        if (!data.header || !data.details || !data.totals_summary) {
          throw new Error("Formato de datos inesperado");
        }
        setCompraDetails(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error al obtener detalles de la orden de compra (frontend):", err);
        setError(`Error al cargar los detalles de la orden de compra: ${err.message}`);
        setLoading(false);
      });
  }, [compraId, ciudad]);

  if (!compraId || !ciudad) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close-button" onClick={onClose}>&times;</button>
        <h2>Detalle de Orden de Compra: {compraId}</h2>

        {loading && <p>Cargando detalles...</p>}
        {error && <p className="error-message">{error}</p>}

        {compraDetails && (
          <div className="compra-detail-container">
            {compraDetails.header ? (
              <div className="compra-header">
                <h3>Información General</h3>
                <p><strong>ID Orden Compra:</strong> {compraDetails.header.id_orden_compra || 'N/A'}</p>
                <p><strong>ID Proveedor:</strong> {compraDetails.header.proveedor_id || 'N/A'}</p>
                <p><strong>Fecha/Hora:</strong> {compraDetails.header.fecha_hora ? new Date(compraDetails.header.fecha_hora).toLocaleString('es-ES') : 'N/A'}</p>
                <p><strong>Estado:</strong> {compraDetails.header.estado_orden || 'N/A'}</p>
                <p><strong>Usuario:</strong> {compraDetails.header.usuario || 'N/A'}</p>
              </div>
            ) : (
              <p>No se encontró la cabecera de la orden de compra.</p>
            )}

            {compraDetails.details && compraDetails.details.length > 0 ? (
              <div className="compra-details">
                <h3>Detalle de Productos</h3>
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th>ID Producto</th>
                      <th>Cantidad</th>
                      <th>P. Unitario</th>
                      <th>Subtotal Producto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compraDetails.details.map((item, index) => (
                      <tr key={item.id_producto || index}>
                        <td>{item.id_producto || 'N/A'}</td>
                        <td>{item.cantidad || 'N/A'}</td>
                        <td>${item.precio_unitario ? Number(item.precio_unitario).toFixed(2) : '0.00'}</td>
                        <td>${item.subtotal_producto ? Number(item.subtotal_producto).toFixed(2) : '0.00'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No hay detalles de productos para esta orden de compra.</p>
            )}

            {compraDetails.totals_summary ? (
              <div className="compra-totals">
                <h3>Resumen de Totales</h3>
                <p><strong>Subtotal:</strong> ${compraDetails.totals_summary.subtotal ? compraDetails.totals_summary.subtotal.toFixed(2) : '0.00'}</p>
                <p><strong>IVA:</strong> ${compraDetails.totals_summary.iva ? compraDetails.totals_summary.iva.toFixed(2) : '0.00'}</p>
                <p><strong>Total:</strong> ${compraDetails.totals_summary.total ? compraDetails.totals_summary.total.toFixed(2) : '0.00'}</p>
              </div>
            ) : (
              <p>No se encontraron totales para esta orden de compra.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Componente para el módulo de Compras
function Compras() {
  const [compras, setCompras] = useState([]);
  const [selectedCity, setSelectedCity] = useState("ALL");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [currentCompraId, setCurrentCompraId] = useState(null);
  const [currentCompraCiudad, setCurrentCompraCiudad] = useState(null); // Nuevo estado para la ciudad de la compra

  useEffect(() => {
    const queryParam = selectedCity !== "ALL" ? `?ciudad=${selectedCity}` : "";
    fetch(`http://localhost:3001/api/compras${queryParam}`)
      .then((res) => res.json())
      .then((data) => setCompras(data))
      .catch((err) => console.error("Error al obtener compras:", err));
  }, [selectedCity]);

  const handleViewDetail = (id, ciudadDb) => { // Recibe la ciudad de la DB
    setCurrentCompraId(id);
    setCurrentCompraCiudad(ciudadDb); // Pasar la ciudad de la DB (ej. "QUI")
    setShowDetailModal(true);
  };

  const handleCloseModal = () => {
    setShowDetailModal(false);
    setCurrentCompraId(null);
    setCurrentCompraCiudad(null);
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Compras</h1>
      <CitySelect selectedCity={selectedCity} onCityChange={setSelectedCity} />
      <table border="1" cellPadding="10" style={{ marginTop: "1rem" }}>
        <thead>
          <tr>
            <th>Acciones</th> 
            <th>ID Compra</th>
            <th>ID Proveedor</th> 
            <th>Fecha/Hora</th>
            <th>Subtotal</th>
            <th>IVA</th>
            <th>Total</th> {/* Nueva columna para el total */}
            <th>Estado OC</th> 
            <th>Base de Datos</th> {/* Cambiado de Ciudad DB a Base de Datos */}
          </tr>
        </thead>
        <tbody>
          {compras.length > 0 ? (
            compras.map((c, index) => (
              <tr key={c.id_Compra || index}>
                <td>
                  {/* AQUÍ SE PASA EL id_Ciudad (ej. "QUI") en lugar de CiudadDB (ej. "Comercial_Quito") */}
                  <button onClick={() => handleViewDetail(c.id_Compra, c.id_Ciudad || selectedCity)} className="view-detail-button">
                    Ver Detalle
                  </button>
                </td>
                <td>{c.id_Compra}</td>
                <td>{c.id_Proveedor || 'N/A'}</td> 
                <td>{c.oc_Fecha_Hora ? new Date(c.oc_Fecha_Hora).toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</td>
                <td>${c.oc_Subtotal ? c.oc_Subtotal.toFixed(2) : '0.00'}</td>
                <td>${c.oc_IVA ? c.oc_IVA.toFixed(2) : '0.00'}</td>
                <td>${c.oc_Total ? c.oc_Total.toFixed(2) : '0.00'}</td> {/* Muestra el total calculado */}
                <td>{c.ESTADO_OC || 'N/A'}</td> 
                <td>{c.CiudadDB || 'N/A'}</td> {/* Muestra el nombre de la Base de Datos */}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="9">No hay registros de compras para la base de datos seleccionada.</td> 
            </tr>
          )}
        </tbody>
      </table>

      {showDetailModal && (
        <PurchaseOrderDetailModal
          compraId={currentCompraId}
          ciudad={currentCompraCiudad} // Pasa la ciudad al modal
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}

// NUEVO COMPONENTE: Ventana Modal para Detalle de Factura de Ventas
// Se alinea la lógica de carga y manejo de 'ciudad' con PurchaseOrderDetailModal
function VentasDetailModal({ facturaId, onClose, ciudad }) {
  const [facturaDetails, setFacturaDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Asegurarse de que tanto facturaId como ciudad estén presentes antes de hacer la llamada
    if (!facturaId || !ciudad) {
      setFacturaDetails(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Construir la URL para el detalle de la factura, siempre pasando la ciudad
    fetch(`http://localhost:3001/api/facturas/detalle/${facturaId}?ciudad=${ciudad}`)
      .then((res) => {
        if (!res.ok) {
          // Mejorar el manejo de errores para depuración
          return res.text().then(text => {
            throw new Error(`HTTP error! status: ${res.status}, body: ${text}`);
          });
        }
        return res.json();
      })
      .then((data) => {
        setFacturaDetails(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error al obtener detalles de la factura de ventas:", err);
        setError(`Error al cargar los detalles de la factura de ventas: ${err.message}`);
        setLoading(false);
      });
  }, [facturaId, ciudad]); // Dependencia de ambos para re-ejecutar si cambian

  if (!facturaId || !ciudad) return null; // Salir si no hay ID o ciudad

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close-button" onClick={onClose}>&times;</button>
        <h2>Detalle de Factura (Venta): {facturaId}</h2>

        {loading && <p>Cargando detalles...</p>}
        {error && <p className="error-message">{error}</p>}

        {facturaDetails && (
          <div className="factura-detail-container">
            {facturaDetails.header && (
              <div className="factura-header">
                <h3>Información General de Venta</h3>
                <p><strong>ID Factura:</strong> {facturaDetails.header.id_factura}</p>
                <p><strong>Fecha/Hora:</strong> {facturaDetails.header.fecha_hora}</p>
                <p><strong>Cliente:</strong> {facturaDetails.header.cliente_nombre}</p>
                <p><strong>RUC/Cédula:</strong> {facturaDetails.header.cliente_ruc_ced}</p>
                <p><strong>Email Cliente:</strong> {facturaDetails.header.cliente_mail}</p>
                <p><strong>Descripción:</strong> {facturaDetails.header.descripcion_factura}</p>
                <p><strong>Estado:</strong> {facturaDetails.header.estado_factura}</p>
              </div>
            )}

            {facturaDetails.details && facturaDetails.details.length > 0 && (
              <div className="factura-details">
                <h3>Detalle de Productos Vendidos</h3>
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th>ID Producto</th>
                      <th>Descripción</th>
                      <th>U.M. Venta</th>
                      <th>Cantidad</th>
                      <th>P. Unitario</th>
                      <th>Subtotal Producto</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {facturaDetails.details.map((item, index) => (
                      <tr key={item.id_producto || index}>
                        <td>{item.id_producto}</td>
                        <td>{item.descripcion_producto}</td>
                        <td>{item.unidad_medida}</td>
                        <td>{item.cantidad}</td>
                        <td>{item.precio_unitario}</td>
                        <td>{item.subtotal_producto}</td>
                        <td>{item.estado_detalle}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {facturaDetails.totals_summary && (
              <div className="factura-totals">
                <h3>Resumen de Totales de Venta</h3>
                <p className="totals-summary-text">{facturaDetails.totals_summary}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Componente para el módulo de Ventas
function Ventas() {
  const [ventas, setVentas] = useState([]);
  const [selectedCity, setSelectedCity] = useState("ALL"); // Por defecto: todas las ciudades
  const [showDetailModal, setShowDetailModal] = useState(false); // Nuevo estado para controlar el modal de detalle
  const [currentFacturaId, setCurrentFacturaId] = useState(null); // ID de la factura seleccionada
  const [currentFacturaCiudad, setCurrentFacturaCiudad] = useState(null); // Ciudad de la factura seleccionada

  useEffect(() => {
    // Construir el parámetro de consulta para la ciudad
    const queryParam = selectedCity !== "ALL" ? `?ciudad=${selectedCity}` : "";
    // Realizar la llamada a la API para obtener las ventas
    fetch(`http://localhost:3001/api/ventas${queryParam}`)
      .then((res) => res.json())
      .then((data) => setVentas(data))
      .catch((err) => console.error("Error al obtener ventas:", err));
  }, [selectedCity]); // Re-fetch cuando la ciudad seleccionada cambie

  // Manejador para el botón "Ver Detalle" en Ventas
  const handleViewDetail = (id, ciudadDb) => {
    setCurrentFacturaId(id);
    // ¡IMPORTANTE! Aquí se pasa el id_Ciudad (QUI, GYE, etc.) que ahora viene del backend.
    setCurrentFacturaCiudad(ciudadDb);
    setShowDetailModal(true);
  };

  // Manejador para cerrar el modal de detalle de factura
  const handleCloseModal = () => {
    setShowDetailModal(false);
    setCurrentFacturaId(null);
    setCurrentFacturaCiudad(null);
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Ventas</h1>
      {/* Incluir el selector de ciudad */}
      <CitySelect selectedCity={selectedCity} onCityChange={setSelectedCity} />
      <table border="1" cellPadding="10" style={{ marginTop: "1rem" }}>
        <thead>
          <tr>
            <th>Acciones</th> {/* Nueva cabecera para el botón */}
            <th>ID Factura</th>
            <th>Fecha/Hora</th>
            <th>Descripción Factura</th>
            <th>Subtotal Factura</th>
            <th>IVA</th>
            <th>Total Factura</th>
            <th>Cliente</th>
            <th>Ciudad Cliente</th>
            <th>Producto</th>
            <th>Cantidad</th>
            <th>Valor Unitario</th>
            <th>Base de Datos</th> {/* Cambiado de Ciudad DB a Base de Datos */}
          </tr>
        </thead>
        <tbody>
          {ventas.length > 0 ? (
            ventas.map((v, index) => (
              <tr key={v.id_Factura || index}> {/* Usar id_Factura como key si está disponible */}
                <td>
                  {/* Pasa el id_Ciudad de la factura (e.g., "QUI") al handler */}
                  <button onClick={() => handleViewDetail(v.id_Factura, v.id_Ciudad || selectedCity)} className="view-detail-button">
                    Ver Detalle
                  </button>
                </td>
                <td>{v.id_Factura}</td>
                <td>{v.fac_Fecha_Hora ? new Date(v.fac_Fecha_Hora).toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</td>
                <td>{v.fac_Descripcion || 'N/A'}</td>
                <td>${v.fac_Subtotal ? v.fac_Subtotal.toFixed(2) : '0.00'}</td>
                <td>${v.fac_IVA ? v.fac_IVA.toFixed(2) : '0.00'}</td>
                <td>${v.fac_Total ? v.fac_Total.toFixed(2) : '0.00'}</td> {/* Asumo fac_Total del backend */}
                <td>{v.cli_Nombre || 'N/A'}</td>
                <td>{v.CiudadCliente || 'N/A'}</td>
                <td>{v.pro_Descripcion || 'N/A'}</td>
                <td>{v.pxf_Cantidad || 'N/A'}</td>
                {/* Solución al error: Comprobar si v.pxf_Valor es un número antes de llamar a toFixed() */}
                <td>{typeof v.pxf_Valor === 'number' ? `$${v.pxf_Valor.toFixed(2)}` : 'N/A'}</td>
                <td>{v.CiudadDB || 'N/A'}</td> {/* Muestra el nombre de la Base de Datos */}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="13">No hay registros de ventas disponibles para la base de datos seleccionada.</td> {/* Colspan ajustado */}
            </tr>
          )}
        </tbody>
      </table>

      {/* Modal para ver el detalle de la factura de ventas */}
      {showDetailModal && (
        <VentasDetailModal // Ahora usa el nuevo componente VentasDetailModal
          facturaId={currentFacturaId}
          ciudad={currentFacturaCiudad}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}

function AsientoDetailModal({ asientoId, onClose, ciudad }) {
  const [asientoDetails, setAsientoDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!asientoId || !ciudad) return;

    setLoading(true);
    setError(null);

    fetch(`http://localhost:3001/api/contabilidad/asiento/detalle/${asientoId}?ciudad=${ciudad}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Error: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setAsientoDetails(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setError("Error al cargar el detalle.");
        setLoading(false);
      });
  }, [asientoId, ciudad]);

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button onClick={onClose}>×</button>
        <h2>Detalle del Asiento {asientoId}</h2>

        {loading && <p>Cargando...</p>}
        {error && <p>{error}</p>}

        {asientoDetails?.header && (
          <div>
            <p><strong>Descripción:</strong> {asientoDetails.header.asi_Descripcion}</p>
            <p><strong>Fecha:</strong> {asientoDetails.header.asi_FechaHora}</p>

            <p><strong>Total Débito:</strong> ${Number(asientoDetails.header.asi_total_debe || 0).toFixed(2)}</p>
            <p><strong>Total Crédito:</strong> ${Number(asientoDetails.header.asi_total_haber || 0).toFixed(2)}</p>

            <p><strong>Estado:</strong> {asientoDetails.header.ESTADO_ASI}</p>
          </div>
        )}

        {asientoDetails?.details?.length > 0 && (
          <table border="1" cellPadding="6" style={{ marginTop: '1rem' }}>
            <thead>
              <tr>
                <th>ID Cuenta</th>
                <th>Nombre Cuenta</th>
                <th>Débito</th>
                <th>Crédito</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {asientoDetails.details.map((d, i) => (
                <tr key={i}>
                  <td>{d.id_cuenta}</td>
                  <td>{d.cue_nombre}</td>
                  <td>${Number(d.det_Debito || 0).toFixed(2)}</td>
                  <td>${Number(d.det_Credito || 0).toFixed(2)}</td>
                  <td>{d.ESTADO_DET}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}


// Módulo de Contabilidad
function Contabilidad() {
  const [asientos, setAsientos] = useState([]);
  const [selectedCity, setSelectedCity] = useState("ALL");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [currentAsientoId, setCurrentAsientoId] = useState(null);
  const [currentAsientoCiudad, setCurrentAsientoCiudad] = useState(null);

  useEffect(() => {
    const queryParam = selectedCity !== "ALL" ? `?ciudad=${selectedCity}` : "";
    fetch(`http://localhost:3001/api/contabilidad/asientos${queryParam}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Error en la respuesta del servidor: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => setAsientos(data))
      .catch((err) =>
        console.error("Error al obtener asientos contables:", err)
      );
  }, [selectedCity]);

  const handleViewDetail = (id, ciudadDb) => {
    setCurrentAsientoId(id);
    setCurrentAsientoCiudad(ciudadDb);
    setShowDetailModal(true);
  };

  const handleCloseModal = () => {
    setShowDetailModal(false);
    setCurrentAsientoId(null);
    setCurrentAsientoCiudad(null);
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Contabilidad (Asientos Contables)</h1>
      <CitySelect selectedCity={selectedCity} onCityChange={setSelectedCity} />

      <table border="1" cellPadding="10" style={{ marginTop: "1rem" }}>
        <thead>
          <tr>
            <th>Acciones</th>
            <th>ID Asiento</th>
            <th>Fecha/Hora</th>
            <th>Descripción</th>
            <th>Estado</th>
            <th>Base de Datos</th> {/* Cambiado de Ciudad DB a Base de Datos */}
          </tr>
        </thead>
        <tbody>
          {asientos.length > 0 ? (
            asientos.map((a) => (
              <tr key={a.id_Asiento}>
                <td>
                  <button
                    onClick={() =>
                      handleViewDetail(a.id_Asiento, a.CiudadDB || selectedCity)
                    }
                    className="view-detail-button"
                  >
                    Ver Detalle
                  </button>
                </td>
                <td>{a.id_Asiento}</td>
                <td>
                  {a.asi_FechaHora
                    ? new Date(a.asi_FechaHora).toLocaleDateString("es-ES", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "N/A"}
                </td>
                <td>{a.asi_Descripcion || "N/A"}</td>
                <td>{a.ESTADO_ASI || "N/A"}</td>
                <td>{a.CiudadDB || "N/A"}</td> {/* Muestra el nombre de la Base de Datos */}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="6">
                No hay asientos contables disponibles para la base de datos seleccionada.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {showDetailModal && (
        <AsientoDetailModal
          asientoId={currentAsientoId}
          ciudad={currentAsientoCiudad}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}

// NUEVO COMPONENTE: Ventana Modal para Detalle de Ajuste de Inventario
// Renombrado de InventarioDetailModal para manejar detalles de AJUSTES
// NUEVO COMPONENTE: Ventana Modal para Detalle de Ajuste de Inventario
// Renombrado de InventarioDetailModal para manejar detalles de AJUSTES
function AjusteDetailModal({ ajusteId, onClose, ciudad }) {
  const [ajusteDetails, setAjusteDetails] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!ajusteId || !ciudad) {
      setAjusteDetails(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    fetch(`http://localhost:3001/api/inventario/ajuste/detalle/${ajusteId}?ciudad=${ciudad}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        // --- LOG DEPURACIÓN: Verifica los datos recibidos del backend ---
        console.log("Datos de ajuste de inventario recibidos:", data);
        setAjusteDetails(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error al obtener detalles del ajuste:", err);
        setError("Error al cargar los detalles del ajuste.");
        setLoading(false);
      });
  }, [ajusteId, ciudad]);

  if (!ajusteId || !ciudad) return null;

  // La función extractValue se sigue usando para la cabecera porque el backend aún envía prefijos aquí
  const extractValue = (fullString, prefix) => {
    if (fullString && typeof fullString === 'string' && fullString.startsWith(prefix)) {
      return fullString.substring(prefix.length).trim();
    }
    return fullString;
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close-button" onClick={onClose}>&times;</button>
        <h2>Detalle de Ajuste de Inventario: {ajusteId}</h2>

        {loading && <p>Cargando detalles...</p>}
        {error && <p className="error-message">{error}</p>}

        {!loading && !error && ajusteDetails && (
          <div className="ajuste-detail-container">
            {ajusteDetails.header && (
              <div className="ajuste-header">
                <h3>Información General del Ajuste</h3>
                {/* Se usa extractValue para limpiar prefijos del header */}
                <p><strong>ID Ajuste:</strong> {extractValue(ajusteDetails.header.id_ajuste, 'Ajuste:')}</p>
                <p><strong>Descripción:</strong> {extractValue(ajusteDetails.header.descripcion, 'Descripción:')}</p>
                <p>
                  <strong>Fecha/Hora:</strong>{" "}
                  {ajusteDetails.header.fecha_hora
                    ? new Date(ajusteDetails.header.fecha_hora).toLocaleString("es-ES")
                    : "N/A"}
                </p>
                <p><strong>Usuario:</strong> {extractValue(ajusteDetails.header.usuario, 'Usuario:')}</p>
                <p><strong>Estado:</strong> {extractValue(ajusteDetails.header.estado, 'Estado:')}</p>
              </div>
            )}

            <h3>Detalle de Productos</h3>
            {ajusteDetails.details && ajusteDetails.details.length > 0 ? (
              <div className="table-responsive">
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th>ID Producto</th>
                      <th>Descripción Producto</th>
                      <th>U.M.</th>
                      <th>Cantidad Ajustada</th>
                      <th>Estado</th> {/* Asegúrate que esta columna exista */}
                    </tr>
                  </thead>
                  <tbody>
                    {ajusteDetails.details.map((item, index) => (
                      <tr key={item.id_Producto || index}>
                        <td>{item.id_Producto}</td>
                        <td>{item.pro_Descripcion}</td>
                        <td>{item.unidad_medida}</td>
                        <td>{item.aju_Cantidad}</td>
                        {/* Renderiza el estado directamente de la propiedad ESTADO_AJUD */}
                        <td>{item.ESTADO_AJUD || 'N/A'}</td> 
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>No hay detalles de productos para este ajuste.</p>
            )}

            {/* Mostrar totales si existen y si totalTexto tiene un valor */}
            {ajusteDetails.totals && ajusteDetails.totals.totalTexto && (
              <div className="ajuste-totales" style={{ marginTop: '1rem' }}>
                <h3>Totales</h3>
                <p><strong>Total Productos:</strong> {ajusteDetails.totals.totalTexto}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
// Componente para el módulo de Inventario (ahora mostrando Ajustes)
function Inventario() {
  const [ajustes, setAjustes] = useState([]); // Cambiado de `inventario` a `ajustes`
  const [selectedCity, setSelectedCity] = useState("ALL");
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [currentAjusteId, setCurrentAjusteId] = useState(null); // Cambiado de `currentProductoId`
  const [currentAjusteCiudad, setCurrentAjusteCiudad] = useState(null); // Cambiado de `currentProductoCiudad`

  useEffect(() => {
    // NUEVO ENDPOINT para listar ajustes de inventario
    const queryParam = selectedCity !== "ALL" ? `?ciudad=${selectedCity}` : "";
    // Asegúrate de que tu backend tenga este endpoint que lista los ajustes
    fetch(`http://localhost:3001/api/inventario/ajustes${queryParam}`)
      .then((res) => res.json())
      .then((data) => setAjustes(data))
      .catch((err) => console.error("Error al obtener ajustes de inventario:", err));
  }, [selectedCity]);

  const handleViewDetail = (id, ciudadDb) => {
    setCurrentAjusteId(id);
    setCurrentAjusteCiudad(ciudadDb);
    setShowDetailModal(true);
  };

  const handleCloseModal = () => {
    setShowDetailModal(false);
    setCurrentAjusteId(null);
    setCurrentAjusteCiudad(null);
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Inventario (Ajustes)</h1> {/* Título cambiado */}
      <CitySelect selectedCity={selectedCity} onCityChange={setSelectedCity} />
      <table border="1" cellPadding="10" style={{ marginTop: "1rem" }}>
        <thead>
          <tr>
            <th>Acciones</th>
            <th>ID Ajuste</th> {/* Cambiado */}
            <th>Usuario</th> {/* Nuevo */}
            <th>Descripción</th>
            <th>Fecha/Hora</th>
            <th>Num. Productos</th> {/* Nuevo */}
            <th>Estado</th>
            <th>Base de Datos</th> {/* Cambiado de Ciudad DB a Base de Datos */}
          </tr>
        </thead>
        <tbody>
          {ajustes.length > 0 ? (
            ajustes.map((a) => ( // Iterando sobre `ajustes`
              <tr key={a.id_Ajuste}>
                <td>
                  <button onClick={() => handleViewDetail(a.id_Ajuste, a.CiudadDB || selectedCity)} className="view-detail-button">
                    Ver Detalle
                  </button>
                </td>
                <td>{a.id_Ajuste}</td>
                <td>{a.USER_ID}</td> {/* Muestra el USER_ID */}
                <td>{a.aju_Descripcion}</td>
                <td>{a.aju_FechaHora ? new Date(a.aju_FechaHora).toLocaleDateString('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A'}</td>
                <td>{a.aju_Num_Produc}</td> {/* Muestra el número de productos */}
                <td>{a.ESTADO_AJU}</td>
                <td>{a.CiudadDB || 'N/A'}</td> {/* Muestra el nombre de la Base de Datos */}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="8">No hay ajustes de inventario disponibles para la base de datos seleccionada.</td> {/* Colspan ajustado */}
            </tr>
          )}
        </tbody>
      </table>

      {showDetailModal && (
        <AjusteDetailModal // Ahora usa el nuevo AjusteDetailModal
          ajusteId={currentAjusteId}
          ciudad={currentAjusteCiudad}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}


// Componente principal de la aplicación
function App() {
  const location = useLocation();
  // Determina si la barra de navegación debe mostrarse
  // Se muestra si la ruta actual NO es la raíz ("/")
  const showNavbar = location.pathname !== '/'; 

  return (
    <div className="App">
      {showNavbar && ( // Renderizado condicional de la barra de navegación
        <nav className="App-header">
          <ul>
            {/* Se ha eliminado el enlace a Facturas del menú */}
            <li className={location.pathname === "/" ? "active" : ""}> 
              <Link to="/">Inicio</Link>
            </li>
            <li className={location.pathname === "/empleados" ? "active" : ""}>
              <Link to="/empleados">Talento Humano</Link>
            </li>
            <li className={location.pathname === "/compras" ? "active" : ""}>
              <Link to="/compras">Compras</Link>
            </li>
            <li className={location.pathname === "/ventas" ? "active" : ""}>
              <Link to="/ventas">Ventas</Link>
            </li>
            <li className={location.pathname === "/contabilidad" ? "active" : ""}>
              <Link to="/contabilidad">Contabilidad</Link>
            </li>
            <li className={location.pathname === "/inventario" ? "active" : ""}>
              <Link to="/inventario">Inventario</Link>
            </li>
            {/* ENLACE REINTEGRADO para el Log General */}
            <li className={location.pathname === "/log-general" ? "active" : ""}>
              <Link to="/log-general">Log General</Link>
            </li>
          </ul>
        </nav>
      )}

      <Routes>
        <Route path="/" element={<Inicio />} />
        {/* Mantener la ruta por si se llega de otra forma o se desea añadir de nuevo */}
        <Route path="/facturas" element={<Facturas />} /> 
        <Route path="/empleados" element={<Empleados />} />
        <Route path="/compras" element={<Compras />} />
        <Route path="/ventas" element={<Ventas />} />
        <Route path="/contabilidad" element={<Contabilidad />} />
        <Route path="/inventario" element={<Inventario />} />
        {/* RUTA REINTEGRADA para el Log General */}
        <Route path="/log-general" element={<GeneralLog />} />
      </Routes>
    </div>
  );
}

// Un componente "wrapper" para envolver App con Router, ya que useLocation debe estar dentro de Router
function AppWrapper() {
  return (
    <Router>
      <App />
    </Router>
  );
}

export default AppWrapper;
