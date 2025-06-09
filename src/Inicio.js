// Inicio.js
import React from 'react';
import { Link } from 'react-router-dom';
import './Inicio.css'; // Importa el nuevo archivo CSS

function Inicio() {
  const modules = [
    // Se ha eliminado el módulo de Facturas
    { name: 'Talento Humano', path: '/empleados', description: 'Administración de información y nóminas de empleados.' },
    { name: 'Compras', path: '/compras', description: 'Seguimiento de órdenes de compra a proveedores.' },
    { name: 'Ventas', path: '/ventas', description: 'Registro y consulta de ventas realizadas.' },
    { name: 'Contabilidad', path: '/contabilidad', description: 'Visualización de asientos contables y movimientos financieros.' },
    { name: 'Inventario', path: '/inventario', description: 'Gestión de ajustes y productos en almacén.' },
    { name: 'Log General', path: '/general', description: 'Ver transacciones.' }, // Nuevo módulo de Log General
  ];

  return (
    <div className="inicio-container"> {/* Clase para el contenedor principal */}
      <div className="welcome-section"> {/* Clase para la sección de bienvenida */}
        <h1>
          Bienvenido al Sistema de Gestión Comercial
        </h1>
        <p>
          Explora los diferentes módulos para gestionar tu negocio de manera eficiente.
        </p>
      </div>

      <div className="modules-grid"> {/* Clase para la cuadrícula de módulos */}
        {modules.map((module) => (
          <Link
            key={module.name}
            to={module.path}
            className="module-card" // Clase para cada tarjeta de módulo
          >
            {/* Se ha eliminado el div con la clase "module-icon" y el SVG */}
            <h2 className="module-title">{module.name}</h2> {/* Clase para el título del módulo */}
            <p className="module-description">{module.description}</p> {/* Clase para la descripción del módulo */}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default Inicio;
