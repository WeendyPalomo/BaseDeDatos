// src/GeneralLog.js
import React, { useEffect, useState } from "react";

function GeneralLog() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    // Llama al endpoint que consolida los logs de todas las ciudades
    fetch(`http://localhost:3001/api/general/log`)
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        setTransactions(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error al obtener transacciones del log general:", err);
        setError("Error al cargar las transacciones del log general.");
        setLoading(false);
      });
  }, []);

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Log General de Transacciones</h1>
      {loading && <p>Cargando transacciones...</p>}
      {error && <p className="error-message">{error}</p>}

      {!loading && !error && transactions.length === 0 && (
        <p>No hay transacciones disponibles en el log general.</p>
      )}

      {!loading && !error && transactions.length > 0 && (
        <table border="1" cellPadding="10" style={{ marginTop: "1rem" }}>
          <thead>
            <tr>
              <th>Usuario</th>
              <th>IP</th>
              <th>Módulo</th>
              <th>Descripción</th>
              <th>Fecha/Hora</th>
              <th>Ciudad DB</th> {/* Se mantiene para mostrar de qué DB proviene */}
            </tr>
          </thead>
          <tbody>
            {/* Las propiedades de 't' ahora coinciden directamente con la salida del SP */}
            {transactions.map((t, index) => (
              <tr key={index}> {/* Usar index como key si no hay un ID único en el log */}
                <td>{t.log_usuario}</td>
                <td>{t.log_ip}</td>
                <td>{t.modulo}</td> {/* Columna 'modulo' directamente del SP */}
                <td>{t.log_descripcion}</td>
                <td>{t.log_fecha ? new Date(t.log_fecha).toLocaleString('es-ES') : 'N/A'}</td>
                <td>{t.CiudadDB || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default GeneralLog;
