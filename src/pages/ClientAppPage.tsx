import { useLocation } from 'react-router-dom';

import { storeName, storeWhatsApp } from '../config/appSettings';

export const ClientAppPage = () => {
  const location = useLocation();
  const message = (location.state as { message?: string } | null)?.message;

  return (
    <div className="container stack">
      <h1>Bienvenido {storeName ? `a ${storeName}` : ''}</h1>
      {message && <div className="alert">{message}</div>}
      <div className="notice">
        Esta es la vista del cliente. Aquí irán productos, carrito y pedidos.
      </div>
      <div>
        <label htmlFor="search">Buscar productos</label>
        <input id="search" placeholder="Ej: Camiseta" />
      </div>
      <div>
        <label htmlFor="notes">Notas de pedido</label>
        <textarea id="notes" rows={3} placeholder="Detalles del pedido" />
      </div>
      <button type="button">Ver catálogo</button>
      {storeWhatsApp && (
        <p className="helper">WhatsApp: {storeWhatsApp}</p>
      )}
    </div>
  );
};
