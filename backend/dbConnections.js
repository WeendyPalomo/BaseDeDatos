function VentasDetailModal({ facturaId, onClose, ciudad }) {
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
    // Usa el mismo endpoint de detalle de factura, ya que la estructura es la misma
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
        console.error("Error al obtener detalles de la factura de ventas:", err);
        setError("Error al cargar los detalles de la factura de ventas.");
        setLoading(false);
      });
  }, [facturaId, ciudad]);

  if (!facturaId || !ciudad) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close-button" onClick={onClose}>&times;</button>
        <h2>Detalle de Factura (Venta): {facturaId}</h2>

        {loading && <p>Cargando detalles...</p>}
        {error && <p className="error-message">{error}</p>}

        {facturaDetails && (
          <div className="factura-detail-container"> {/* Reutiliza la clase de contenedor de factura */}
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
