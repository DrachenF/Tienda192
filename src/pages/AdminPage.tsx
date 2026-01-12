import { storeName } from '../config/appSettings';

export const AdminPage = () => (
  <div className="container stack">
    <h1>Panel Admin {storeName ? `- ${storeName}` : ''}</h1>
    <div className="notice">
      Aquí puedes administrar productos, pedidos y configuraciones.
    </div>
    <div>
      <label htmlFor="product">Nuevo producto</label>
      <input id="product" placeholder="Nombre del producto" />
    </div>
    <div>
      <label htmlFor="price">Precio</label>
      <input id="price" type="number" placeholder="0" />
    </div>
    <button type="button">Guardar producto</button>
  </div>
);
