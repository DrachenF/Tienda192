import { onAuthStateChanged, updatePassword } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';

import { auth, db, firebaseInitError } from '../config/firebase';
import { storeName } from '../config/appSettings';

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  price: number | null;
  unitType: string;
  categoryId: string | null;
  availability: 'in_stock' | 'out_of_stock' | 'unknown';
};

type OrderItem = {
  type: 'catalog' | 'free_text';
  productId?: string;
  name: string;
  unitType: string;
  quantity: number;
  price: number | null;
  productSnapshot?: {
    name: string;
    price: number | null;
    unitType: string;
    categoryId: string | null;
  };
};

type Order = {
  id: string;
  userId: string;
  status: string;
  total: number;
  houseKey: string;
  items: OrderItem[];
  createdAt?: string;
  createdAtRaw?: Date | null;
};

const ACTIVE_STATUSES = [
  'RECIBIDO',
  'PENDIENTE_COTIZAR',
  'COTIZADO_CONFIRMAR',
  'PREPARANDO',
  'EN_CAMINO',
];

const HISTORY_STATUSES = ['ENTREGADO', 'PARCIAL', 'CANCELADO'];

const UNIT_TYPES = ['unidad', 'docena', 'paquete', 'litro', 'libra', 'otro'];

export const AdminPage = () => {
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [historyOrders, setHistoryOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [historyFilters, setHistoryFilters] = useState({
    startDate: '',
    endDate: '',
    houseKey: '',
  });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newProduct, setNewProduct] = useState({
    name: '',
    price: '',
    unitType: 'unidad',
    categoryId: '',
    availability: 'in_stock',
  });
  const [statusUpdate, setStatusUpdate] = useState<Record<string, string>>({});
  const [conversions, setConversions] = useState<
    Record<
      string,
      {
        mode: 'existing' | 'new';
        productId: string;
        name: string;
        price: string;
        unitType: string;
        categoryId: string;
      }
    >
  >({});
  const [pinInput, setPinInput] = useState('');
  const [pinMessage, setPinMessage] = useState<string | null>(null);

  useEffect(() => {
    if (firebaseInitError || !auth || !db) {
      setError(firebaseInitError ?? 'Firebase no está configurado.');
      return;
    }

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setError('Necesitas iniciar sesión.');
        return;
      }

      const categoriesSnap = await getDocs(collection(db, 'categories'));
      setCategories(
        categoriesSnap.docs.map((docItem) => ({
          id: docItem.id,
          name: (docItem.data().name as string) ?? docItem.id,
        })),
      );

      const productsSnap = await getDocs(collection(db, 'products'));
      setProducts(
        productsSnap.docs.map((docItem) => {
          const data = docItem.data();
          return {
            id: docItem.id,
            name: data.name as string,
            price: typeof data.price === 'number' ? data.price : null,
            unitType: (data.unitType as string) ?? 'otro',
            categoryId: (data.categoryId as string) ?? null,
            availability:
              (data.availability as Product['availability']) ?? 'unknown',
          };
        }),
      );

      const activeQuery = query(
        collection(db, 'orders'),
        where('status', 'in', ACTIVE_STATUSES),
        orderBy('createdAt', 'desc'),
        limit(50),
      );

      const unsubOrders = onSnapshot(activeQuery, (snapshot) => {
        const data = snapshot.docs.map((docItem) => {
          const order = docItem.data();
          return {
            id: docItem.id,
            userId: order.userId as string,
            status: order.status as string,
            total: (order.total as number) ?? 0,
            houseKey: (order.houseKey as string) ?? '',
            items: (order.items as OrderItem[]) ?? [],
            createdAtRaw: order.createdAt?.toDate?.() ?? null,
            createdAt: order.createdAt?.toDate?.().toLocaleString?.(),
          };
        });
        setActiveOrders(data);
      });

      return () => {
        unsubOrders();
      };
    });

    return () => {
      unsubAuth();
    };
  }, []);

  const historyQuery = useMemo(() => {
    if (!db) {
      return null;
    }
    const constraints = [collection(db, 'orders')] as unknown[];
    if (historyFilters.houseKey) {
      constraints.push(where('houseKey', '==', historyFilters.houseKey));
    }
    constraints.push(where('status', 'in', HISTORY_STATUSES));
    constraints.push(orderBy('createdAt', 'desc'));
    constraints.push(limit(50));
    return query(...(constraints as Parameters<typeof query>));
  }, [db, historyFilters.houseKey]);

  const loadHistory = async () => {
    if (!historyQuery) {
      return;
    }
    const snapshot = await getDocs(historyQuery);
    const data = snapshot.docs
      .map((docItem) => {
        const order = docItem.data();
        return {
          id: docItem.id,
          userId: order.userId as string,
          status: order.status as string,
          total: (order.total as number) ?? 0,
          houseKey: (order.houseKey as string) ?? '',
          items: (order.items as OrderItem[]) ?? [],
          createdAtRaw: order.createdAt?.toDate?.() ?? null,
          createdAt: order.createdAt?.toDate?.().toLocaleString?.(),
        };
      })
      .filter((order) => {
        if (!historyFilters.startDate && !historyFilters.endDate) {
          return true;
        }
        const createdAt = order.createdAtRaw ?? null;
        if (!createdAt) {
          return false;
        }
        const start = historyFilters.startDate
          ? new Date(historyFilters.startDate)
          : null;
        const end = historyFilters.endDate
          ? new Date(`${historyFilters.endDate}T23:59:59`)
          : null;
        if (start && createdAt < start) {
          return false;
        }
        if (end && createdAt > end) {
          return false;
        }
        return true;
      });
    setHistoryOrders(data);
  };

  useEffect(() => {
    if (!firebaseInitError && db) {
      loadHistory();
    }
  }, [historyFilters, db]);

  const handleStatusChange = async (orderId: string, status: string) => {
    if (!db) {
      return;
    }
    await updateDoc(doc(db, 'orders', orderId), {
      status,
      updatedAt: serverTimestamp(),
    });
  };

  const handleCreateCategory = async () => {
    if (!db || !newCategoryName.trim()) {
      return;
    }
    const docRef = doc(collection(db, 'categories'));
    await setDoc(docRef, { name: newCategoryName.trim() });
    setNewCategoryName('');
    const snapshot = await getDocs(collection(db, 'categories'));
    setCategories(
      snapshot.docs.map((docItem) => ({
        id: docItem.id,
        name: (docItem.data().name as string) ?? docItem.id,
      })),
    );
  };

  const handleCreateProduct = async () => {
    if (!db || !newProduct.name.trim()) {
      return;
    }
    const priceValue = newProduct.price ? Number(newProduct.price) : null;
    const docRef = doc(collection(db, 'products'));
    await setDoc(docRef, {
      name: newProduct.name.trim(),
      price: Number.isFinite(priceValue) ? priceValue : null,
      unitType: newProduct.unitType,
      categoryId: newProduct.categoryId || null,
      availability: newProduct.availability,
    });
    setNewProduct({
      name: '',
      price: '',
      unitType: 'unidad',
      categoryId: '',
      availability: 'in_stock',
    });
    const snapshot = await getDocs(collection(db, 'products'));
    setProducts(
      snapshot.docs.map((docItem) => {
        const data = docItem.data();
        return {
          id: docItem.id,
          name: data.name as string,
          price: typeof data.price === 'number' ? data.price : null,
          unitType: (data.unitType as string) ?? 'otro',
          categoryId: (data.categoryId as string) ?? null,
          availability:
            (data.availability as Product['availability']) ?? 'unknown',
        };
      }),
    );
  };

  const handleUpdateProduct = async (productId: string, patch: Partial<Product>) => {
    if (!db) {
      return;
    }
    await updateDoc(doc(db, 'products', productId), patch);
    setProducts((prev) =>
      prev.map((product) =>
        product.id === productId ? { ...product, ...patch } : product,
      ),
    );
  };

  const handleConvertItem = async (order: Order, item: OrderItem) => {
    if (!db || item.type !== 'free_text') {
      return;
    }
    const key = `${order.id}-${item.name}`;
    const conversion = conversions[key];
    if (!conversion) {
      return;
    }
    let product: Product | null = null;
    if (conversion.mode === 'existing') {
      if (!conversion.productId) {
        setError('Selecciona un producto existente.');
        return;
      }
      product = products.find((p) => p.id === conversion.productId) ?? null;
    } else {
      if (!conversion.name.trim()) {
        return;
      }
      const priceValue = conversion.price ? Number(conversion.price) : null;
      const newRef = doc(collection(db, 'products'));
      await setDoc(newRef, {
        name: conversion.name.trim(),
        price: Number.isFinite(priceValue) ? priceValue : null,
        unitType: conversion.unitType,
        categoryId: conversion.categoryId || null,
        availability: 'in_stock',
      });
      product = {
        id: newRef.id,
        name: conversion.name.trim(),
        price: Number.isFinite(priceValue) ? priceValue : null,
        unitType: conversion.unitType,
        categoryId: conversion.categoryId || null,
        availability: 'in_stock',
      };
      setProducts((prev) => [...prev, product!]);
    }

    if (!product) {
      return;
    }

    const updatedItems = order.items.map((orderItem) => {
      if (orderItem !== item) {
        return orderItem;
      }
      return {
        type: 'catalog' as const,
        productId: product.id,
        name: product.name,
        unitType: product.unitType,
        quantity: orderItem.quantity,
        price: product.price,
        productSnapshot: {
          name: product.name,
          price: product.price,
          unitType: product.unitType,
          categoryId: product.categoryId,
        },
      };
    });

    const hasUnpriced = updatedItems.some((orderItem) => orderItem.price === null);
    const total = hasUnpriced
      ? 0
      : updatedItems.reduce(
          (sum, orderItem) => sum + (orderItem.price ?? 0) * orderItem.quantity,
          0,
        );

    await updateDoc(doc(db, 'orders', order.id), {
      items: updatedItems,
      total,
      status: 'COTIZADO_CONFIRMAR',
      updatedAt: serverTimestamp(),
    });
  };

  const handlePinUpdate = async () => {
    setPinMessage(null);
    if (firebaseInitError || !auth) {
      setPinMessage(firebaseInitError ?? 'Firebase no está configurado.');
      return;
    }
    if (!pinInput.trim()) {
      setPinMessage('Ingresa un nuevo PIN o contraseña.');
      return;
    }
    const isDigits = /^\d+$/.test(pinInput);
    if (isDigits) {
      if (pinInput.length > 7) {
        setPinMessage('El PIN debe tener máximo 7 dígitos.');
        return;
      }
      if (pinInput.length < 4) {
        setPinMessage('El PIN debe tener mínimo 4 dígitos.');
        return;
      }
    } else {
      const strong =
        pinInput.length >= 8 &&
        /[A-Za-z]/.test(pinInput) &&
        /\d/.test(pinInput);
      if (!strong) {
        setPinMessage(
          'La contraseña debe tener al menos 8 caracteres, letras y números.',
        );
        return;
      }
    }

    const user = auth.currentUser;
    if (!user) {
      setPinMessage('Necesitas iniciar sesión.');
      return;
    }
    try {
      await updatePassword(user, pinInput);
      setPinInput('');
      setPinMessage('PIN/contraseña actualizado.');
    } catch (err) {
      setPinMessage('No se pudo actualizar el PIN/contraseña.');
    }
  };

  return (
    <div className="container stack">
      <h1>Panel Admin {storeName ? `- ${storeName}` : ''}</h1>
      {error && <div className="alert">{error}</div>}

      <div className="stack">
        <h2>Pedidos activos</h2>
        {activeOrders.length === 0 && (
          <p className="helper">No hay pedidos activos.</p>
        )}
        {activeOrders.map((order) => (
          <div key={order.id} className="order-card stack">
            <strong>#{order.id}</strong>
            <div className="helper">Casa: {order.houseKey}</div>
            <div className="helper">Estado: {order.status}</div>
            <div className="helper">Total: S/ {order.total}</div>
            <div className="order-items stack">
              {order.items.map((item) => (
                <div key={`${order.id}-${item.name}`} className="order-item">
                  <div>
                    <strong>{item.name}</strong>
                    <div className="helper">
                      {item.quantity} {item.unitType}
                    </div>
                    <div className="helper">
                      {item.price !== null ? `S/ ${item.price}` : 'Sin precio'}
                    </div>
                  </div>
                  {item.type === 'free_text' && (
                    <div className="stack">
                      <label>Convertir item libre</label>
                      <select
                        value={conversions[`${order.id}-${item.name}`]?.mode ?? 'existing'}
                        onChange={(event) =>
                          setConversions((prev) => ({
                            ...prev,
                            [`${order.id}-${item.name}`]: {
                              mode: event.target.value as 'existing' | 'new',
                              productId: '',
                              name: item.name,
                              price: '',
                              unitType: 'unidad',
                              categoryId: '',
                            },
                          }))
                        }
                      >
                        <option value="existing">Producto existente</option>
                        <option value="new">Producto nuevo</option>
                      </select>
                      {(conversions[`${order.id}-${item.name}`]?.mode ?? 'existing') ===
                      'existing' ? (
                        <select
                          value={conversions[`${order.id}-${item.name}`]?.productId ?? ''}
                          onChange={(event) =>
                            setConversions((prev) => ({
                              ...prev,
                              [`${order.id}-${item.name}`]: {
                                ...prev[`${order.id}-${item.name}`],
                                mode: 'existing',
                                productId: event.target.value,
                              },
                            }))
                          }
                        >
                          <option value="">Selecciona producto</option>
                          {products.map((product) => (
                            <option key={product.id} value={product.id}>
                              {product.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="stack">
                          <input
                            placeholder="Nombre"
                            value={
                              conversions[`${order.id}-${item.name}`]?.name ?? item.name
                            }
                            onChange={(event) =>
                              setConversions((prev) => ({
                                ...prev,
                                [`${order.id}-${item.name}`]: {
                                  ...prev[`${order.id}-${item.name}`],
                                  mode: 'new',
                                  name: event.target.value,
                                },
                              }))
                            }
                          />
                          <input
                            placeholder="Precio"
                            inputMode="numeric"
                            value={conversions[`${order.id}-${item.name}`]?.price ?? ''}
                            onChange={(event) =>
                              setConversions((prev) => ({
                                ...prev,
                                [`${order.id}-${item.name}`]: {
                                  ...prev[`${order.id}-${item.name}`],
                                  mode: 'new',
                                  price: event.target.value,
                                },
                              }))
                            }
                          />
                          <select
                            value={
                              conversions[`${order.id}-${item.name}`]?.unitType ?? 'unidad'
                            }
                            onChange={(event) =>
                              setConversions((prev) => ({
                                ...prev,
                                [`${order.id}-${item.name}`]: {
                                  ...prev[`${order.id}-${item.name}`],
                                  mode: 'new',
                                  unitType: event.target.value,
                                },
                              }))
                            }
                          >
                            {UNIT_TYPES.map((unit) => (
                              <option key={unit} value={unit}>
                                {unit}
                              </option>
                            ))}
                          </select>
                          <select
                            value={
                              conversions[`${order.id}-${item.name}`]?.categoryId ?? ''
                            }
                            onChange={(event) =>
                              setConversions((prev) => ({
                                ...prev,
                                [`${order.id}-${item.name}`]: {
                                  ...prev[`${order.id}-${item.name}`],
                                  mode: 'new',
                                  categoryId: event.target.value,
                                },
                              }))
                            }
                          >
                            <option value="">Sin categoría</option>
                            {categories.map((category) => (
                              <option key={category.id} value={category.id}>
                                {category.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <button type="button" onClick={() => handleConvertItem(order, item)}>
                        Convertir y cotizar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="stack">
              <label htmlFor={`status-${order.id}`}>Actualizar estado</label>
              <select
                id={`status-${order.id}`}
                value={statusUpdate[order.id] ?? order.status}
                onChange={(event) =>
                  setStatusUpdate((prev) => ({
                    ...prev,
                    [order.id]: event.target.value,
                  }))
                }
              >
                {[
                  'RECIBIDO',
                  'PREPARANDO',
                  'EN_CAMINO',
                  'ENTREGADO',
                  'PARCIAL',
                  'CANCELADO',
                ].map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  handleStatusChange(order.id, statusUpdate[order.id] ?? order.status)
                }
              >
                Guardar estado
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="stack">
        <h2>Historial</h2>
        <div className="stack">
          <div>
            <label htmlFor="startDate">Desde</label>
            <input
              id="startDate"
              type="date"
              value={historyFilters.startDate}
              onChange={(event) =>
                setHistoryFilters((prev) => ({
                  ...prev,
                  startDate: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <label htmlFor="endDate">Hasta</label>
            <input
              id="endDate"
              type="date"
              value={historyFilters.endDate}
              onChange={(event) =>
                setHistoryFilters((prev) => ({
                  ...prev,
                  endDate: event.target.value,
                }))
              }
            />
          </div>
          <div>
            <label htmlFor="houseKey">HouseKey</label>
            <input
              id="houseKey"
              value={historyFilters.houseKey}
              onChange={(event) =>
                setHistoryFilters((prev) => ({
                  ...prev,
                  houseKey: event.target.value,
                }))
              }
            />
          </div>
          <button type="button" onClick={loadHistory}>
            Buscar historial
          </button>
        </div>
        {historyOrders.length === 0 && (
          <p className="helper">No hay pedidos en historial.</p>
        )}
        {historyOrders.map((order) => (
          <div key={order.id} className="order-row">
            <strong>#{order.id}</strong>
            <div className="helper">Casa: {order.houseKey}</div>
            <div className="helper">Estado: {order.status}</div>
            <div className="helper">Total: S/ {order.total}</div>
            {order.createdAt && (
              <div className="helper">Fecha: {order.createdAt}</div>
            )}
          </div>
        ))}
      </div>

      <div className="stack">
        <h2>Catálogo</h2>
        <div className="stack">
          <h3>Categorías</h3>
          <input
            placeholder="Nueva categoría"
            value={newCategoryName}
            onChange={(event) => setNewCategoryName(event.target.value)}
          />
          <button type="button" onClick={handleCreateCategory}>
            Crear categoría
          </button>
        </div>
        <div className="stack">
          <h3>Productos</h3>
          <input
            placeholder="Nombre"
            value={newProduct.name}
            onChange={(event) =>
              setNewProduct((prev) => ({ ...prev, name: event.target.value }))
            }
          />
          <input
            placeholder="Precio"
            inputMode="numeric"
            value={newProduct.price}
            onChange={(event) =>
              setNewProduct((prev) => ({ ...prev, price: event.target.value }))
            }
          />
          <select
            value={newProduct.unitType}
            onChange={(event) =>
              setNewProduct((prev) => ({ ...prev, unitType: event.target.value }))
            }
          >
            {UNIT_TYPES.map((unit) => (
              <option key={unit} value={unit}>
                {unit}
              </option>
            ))}
          </select>
          <select
            value={newProduct.categoryId}
            onChange={(event) =>
              setNewProduct((prev) => ({
                ...prev,
                categoryId: event.target.value,
              }))
            }
          >
            <option value="">Sin categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <select
            value={newProduct.availability}
            onChange={(event) =>
              setNewProduct((prev) => ({
                ...prev,
                availability: event.target.value,
              }))
            }
          >
            <option value="in_stock">in_stock</option>
            <option value="out_of_stock">out_of_stock</option>
            <option value="unknown">unknown</option>
          </select>
          <button type="button" onClick={handleCreateProduct}>
            Crear producto
          </button>
        </div>
        <div className="stack">
          {products.map((product) => (
            <div key={product.id} className="product-edit stack">
              <strong>{product.name}</strong>
              <input
                value={product.name}
                onChange={(event) =>
                  handleUpdateProduct(product.id, { name: event.target.value })
                }
              />
              <input
                inputMode="numeric"
                value={product.price ?? ''}
                onChange={(event) =>
                  handleUpdateProduct(product.id, {
                    price: event.target.value ? Number(event.target.value) : null,
                  })
                }
              />
              <select
                value={product.unitType}
                onChange={(event) =>
                  handleUpdateProduct(product.id, { unitType: event.target.value })
                }
              >
                {UNIT_TYPES.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
              <select
                value={product.categoryId ?? ''}
                onChange={(event) =>
                  handleUpdateProduct(product.id, {
                    categoryId: event.target.value || null,
                  })
                }
              >
                <option value="">Sin categoría</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <select
                value={product.availability}
                onChange={(event) =>
                  handleUpdateProduct(product.id, {
                    availability: event.target.value as Product['availability'],
                  })
                }
              >
                <option value="in_stock">in_stock</option>
                <option value="out_of_stock">out_of_stock</option>
                <option value="unknown">unknown</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="stack">
        <h2>Actualizar PIN/contraseña</h2>
        <input
          type="password"
          placeholder="Nuevo PIN (máx 7 dígitos) o contraseña segura"
          value={pinInput}
          onChange={(event) => setPinInput(event.target.value)}
        />
        <button type="button" onClick={handlePinUpdate}>
          Actualizar
        </button>
        {pinMessage && <p className="helper">{pinMessage}</p>}
      </div>
    </div>
  );
};
