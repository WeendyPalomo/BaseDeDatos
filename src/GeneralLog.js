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

      {/* Mensaje divertido y spinner de carga */}
      {loading && (
        <div style={{ textAlign: 'center', marginTop: '2rem' }}>
          {/* Spinner SVG */}
          <svg
            width="50"
            height="50"
            viewBox="0 0 38 38"
            xmlns="http://www.w3.org/2000/svg"
            stroke="#007bff"
            style={{ animation: 'spin 1.2s linear infinite' }}
          >
            <g fill="none" fillRule="evenodd">
              <g transform="translate(1 1)" strokeWidth="2">
                <circle strokeOpacity=".5" cx="18" cy="18" r="18" />
                <path d="M36 18c0-9.94-8.06-18-18-18">
                  <animateTransform
                    attributeName="transform"
                    type="rotate"
                    from="0 18 18"
                    to="360 18 18"
                    dur="1s"
                    repeatCount="indefinite"
                  />
                </path>
              </g>
            </g>
          </svg>
          <p style={{ marginTop: '1rem', fontSize: '1.1rem', color: '#555' }}>
            Un momento, estamos buceando en todas las bases de datos... ¡Puede que encontremos tesoros!
          </p>
        </div>
      )}

      {/* Estilos para la animación del spinner */}
      <style>
        {`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}
      </style>

      {error && <p className="error-message" style={{ color: 'red', textAlign: 'center', marginTop: '1rem' }}>{error}</p>}

      {!loading && !error && transactions.length === 0 && (
        <p style={{ textAlign: 'center', marginTop: '1rem' }}>No hay transacciones disponibles en el log general.</p>
      )}

      {!loading && !error && transactions.length > 0 && (
        <table border="1" cellPadding="10" style={{ marginTop: "1rem", width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ backgroundColor: "#007bff", color: "white" }}>
              <th style={{ padding: "10px", border: "1px solid #ddd", textAlign: "left" }}>Usuario</th>
              <th style={{ padding: "10px", border: "1px solid #ddd", textAlign: "left" }}>IP</th>
              <th style={{ padding: "10px", border: "1px solid #ddd", textAlign: "left" }}>Módulo</th>
              <th style={{ padding: "10px", border: "1px solid #ddd", textAlign: "left" }}>Descripción</th>
              <th style={{ padding: "10px", border: "1px solid #ddd", textAlign: "left" }}>Fecha/Hora</th>
              <th style={{ padding: "10px", border: "1px solid #ddd", textAlign: "left" }}>Ciudad DB</th> {/* Se mantiene para mostrar de qué DB proviene */}
            </tr>
          </thead>
          <tbody>
            {/* Las propiedades de 't' ahora coinciden directamente con la salida del SP */}
            {transactions.map((t, index) => (
              <tr key={index} style={{ backgroundColor: index % 2 === 0 ? "#f2f2f2" : "white" }}> {/* Usar index como key si no hay un ID único en el log */}
                <td style={{ padding: "10px", border: "1px solid #ddd" }}>{t.log_usuario}</td>
                <td style={{ padding: "10px", border: "1px solid #ddd" }}>{t.log_ip}</td>
                <td style={{ padding: "10px", border: "1px solid #ddd" }}>{t.modulo}</td> {/* Columna 'modulo' directamente del SP */}
                <td style={{ padding: "10px", border: "1px solid #ddd" }}>{t.log_descripcion}</td>
                <td style={{ padding: "10px", border: "1px solid #ddd" }}>{t.log_fecha ? new Date(t.log_fecha).toLocaleString('es-ES') : 'N/A'}</td>
                <td style={{ padding: "10px", border: "1px solid #ddd" }}>{t.CiudadDB || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default GeneralLog;
