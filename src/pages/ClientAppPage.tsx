import { onAuthStateChanged } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { auth, db, firebaseInitError } from '../config/firebase';
import { storeName, storeWhatsApp } from '../config/appSettings';

type Category = {
  id: string;
  name: string;
};

type Product = {
  id: string;
  name: string;
  price: number | null;
  categoryId: string | null;
  aliases: string[];
  unitType: string;
};

type OrderItem = {
  type: 'catalog' | 'free_text';
  productId?: string;
  name: string;
  unitType: string;
  quantity: number;
  price: number | null;
  note?: string | null;
};

type OrderRecord = {
  id: string;
  status: string;
  total: number;
  createdAt?: string;
};

type UserProfile = {
  houseKey: string;
};

const UNIT_LABELS: Record<string, string> = {
  unidad: 'unidad',
  docena: 'docena',
  paquete: 'paquete',
  litro: 'litro',
  libra: 'libra',
  otro: 'otro',
};

export const ClientAppPage = () => {
  const location = useLocation();
  const message = (location.state as { message?: string } | null)?.message;
  const [search, setSearch] = useState('');
  const [freeText, setFreeText] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (firebaseInitError || !auth || !db) {
      setError(firebaseInitError ?? 'Firebase no está configurado.');
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setError('Necesitas iniciar sesión para ver esta sección.');
        return;
      }

      const userSnap = await getDoc(doc(db, 'users', user.uid));
      if (userSnap.exists()) {
        setUserProfile({ houseKey: userSnap.data().houseKey as string });
      }

      const categoriesSnap = await getDocs(collection(db, 'categories'));
      const categoriesData = categoriesSnap.docs.map((item) => ({
        id: item.id,
        name: (item.data().name as string) ?? item.id,
      }));
      setCategories(categoriesData);

      const productsSnap = await getDocs(collection(db, 'products'));
      const productsData = productsSnap.docs.map((item) => {
        const data = item.data();
        return {
          id: item.id,
          name: data.name as string,
          price: typeof data.price === 'number' ? data.price : null,
          categoryId: (data.categoryId as string) ?? null,
          aliases: Array.isArray(data.aliases) ? (data.aliases as string[]) : [],
          unitType: (data.unitType as string) ?? 'otro',
        };
      });
      setProducts(productsData);

      const ordersQuery = query(
        collection(db, 'orders'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc'),
        limit(20),
      );
      const ordersSnap = await getDocs(ordersQuery);
      const ordersData = ordersSnap.docs.map((item) => ({
        id: item.id,
        status: (item.data().status as string) ?? 'SIN_ESTADO',
        total: (item.data().total as number) ?? 0,
        createdAt: item.data().createdAt?.toDate?.().toLocaleString?.(),
      }));
      setOrders(ordersData);
    });

    return () => unsubscribe();
  }, []);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return products;
    }
    return products.filter((product) => {
      const nameMatch = product.name.toLowerCase().includes(term);
      const aliasMatch = product.aliases.some((alias) =>
        alias.toLowerCase().includes(term),
      );
      return nameMatch || aliasMatch;
    });
  }, [products, search]);

  const groupedProducts = useMemo(() => {
    const byCategory = new Map<string, Product[]>();
    filteredProducts.forEach((product) => {
      const key = product.categoryId ?? 'sin-categoria';
      const list = byCategory.get(key) ?? [];
      list.push(product);
      byCategory.set(key, list);
    });
    return byCategory;
  }, [filteredProducts]);

  const freeTextItems = useMemo(() => {
    return freeText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({
        type: 'free_text' as const,
        name: line,
        unitType: 'otro',
        quantity: 1,
        price: null,
      }));
  }, [freeText]);

  const catalogItems = useMemo(() => {
    return Object.entries(quantities)
      .filter(([, qty]) => qty > 0)
      .map(([productId, qty]) => {
        const product = products.find((item) => item.id === productId);
        if (!product) {
          return null;
        }
        return {
          type: 'catalog' as const,
          productId,
          name: product.name,
          unitType: product.unitType,
          quantity: qty,
          price: product.price,
        };
      })
      .filter(Boolean) as OrderItem[];
  }, [products, quantities]);

  const cartItems: OrderItem[] = useMemo(() => {
    return [
      ...catalogItems.map((item) => ({
        ...item,
        note: notes[item.productId ?? item.name] ?? null,
      })),
      ...freeTextItems.map((item) => ({
        ...item,
        note: notes[item.name] ?? null,
      })),
    ];
  }, [catalogItems, freeTextItems, notes]);

  const hasUnpricedItems = cartItems.some((item) => item.price === null);
  const total = hasUnpricedItems
    ? 0
    : cartItems.reduce(
        (sum, item) => sum + (item.price ?? 0) * item.quantity,
        0,
      );
  const status = hasUnpricedItems ? 'PENDIENTE_COTIZAR' : 'PENDIENTE';

  const handleQuantity = (productId: string, delta: number) => {
    setQuantities((prev) => {
      const next = Math.max(0, (prev[productId] ?? 0) + delta);
      return { ...prev, [productId]: next };
    });
  };

  const handleNoteChange = (key: string, value: string) => {
    setNotes((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmitOrder = async () => {
    setError(null);
    if (firebaseInitError || !auth || !db) {
      setError(firebaseInitError ?? 'Firebase no está configurado.');
      return;
    }
    const user = auth.currentUser;
    if (!user || !userProfile) {
      setError('Necesitas iniciar sesión para registrar pedidos.');
      return;
    }
    if (cartItems.length === 0) {
      setError('Agrega productos o escribe un pedido.');
      return;
    }

    try {
      setSaving(true);
      const orderRef = doc(collection(db, 'orders'));
      await setDoc(orderRef, {
        userId: user.uid,
        houseKey: userProfile.houseKey,
        status,
        paymentMethod: null,
        total,
        items: cartItems,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setFreeText('');
      setQuantities({});
      setNotes({});
    } catch (err) {
      setError('No se pudo guardar el pedido.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container stack">
      <h1>Bienvenido {storeName ? `a ${storeName}` : ''}</h1>
      {message && <div className="alert">{message}</div>}
      {error && <div className="alert">{error}</div>}

      <div>
        <label htmlFor="freeText">Escribe tu pedido como quieras</label>
        <textarea
          id="freeText"
          rows={5}
          value={freeText}
          onChange={(event) => setFreeText(event.target.value)}
        />
      </div>

      <div className="notice">
        Escribe cada producto en una línea para convertirlo en items libres.
      </div>

      <div>
        <label htmlFor="search">Buscar productos</label>
        <input
          id="search"
          placeholder="Ej: Leche, arroz"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {Array.from(groupedProducts.entries()).map(([categoryId, items]) => {
        const categoryName =
          categoryId === 'sin-categoria'
            ? 'Sin categoría'
            : categories.find((item) => item.id === categoryId)?.name ??
              'Sin categoría';
        return (
          <div key={categoryId} className="stack">
            <h2>{categoryName}</h2>
            {items.map((product) => (
              <div key={product.id} className="product-row">
                <div>
                  <strong>
                    {product.name}
                    {product.unitType && (
                      <span className="muted">
                        {' '}
                        ({UNIT_LABELS[product.unitType] ?? product.unitType})
                      </span>
                    )}
                  </strong>
                  <div className="helper">
                    {product.price !== null
                      ? `S/ ${product.price}`
                      : 'Precio por cotizar'}
                  </div>
                </div>
                <div className="qty-controls">
                  <button type="button" onClick={() => handleQuantity(product.id, -1)}>
                    −
                  </button>
                  <span>{quantities[product.id] ?? 0}</span>
                  <button type="button" onClick={() => handleQuantity(product.id, 1)}>
                    +
                  </button>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <div className="stack">
        <h2>Carrito</h2>
        {cartItems.length === 0 && (
          <p className="helper">Aún no tienes items en el carrito.</p>
        )}
        {cartItems.map((item) => {
          const key = item.productId ?? item.name;
          return (
            <div key={key} className="cart-item stack">
              <div>
                <strong>{item.name}</strong>
                <div className="helper">
                  {item.quantity} {UNIT_LABELS[item.unitType] ?? item.unitType}
                </div>
                <div className="helper">
                  {item.price !== null ? `S/ ${item.price}` : 'Precio por cotizar'}
                </div>
              </div>
              <input
                placeholder="Nota opcional"
                value={notes[key] ?? ''}
                onChange={(event) => handleNoteChange(key, event.target.value)}
              />
            </div>
          );
        })}
        <div className="notice">
          Estado: {status} | Total: S/ {total}
        </div>
        <button type="button" onClick={handleSubmitOrder} disabled={saving}>
          {saving ? 'Guardando...' : 'Enviar pedido'}
        </button>
      </div>

      <div className="stack">
        <h2>Mis pedidos</h2>
        {orders.length === 0 && (
          <p className="helper">No hay pedidos recientes.</p>
        )}
        {orders.map((order) => (
          <div key={order.id} className="order-row">
            <strong>#{order.id}</strong>
            <div className="helper">Estado: {order.status}</div>
            <div className="helper">Total: S/ {order.total}</div>
            {order.createdAt && (
              <div className="helper">Fecha: {order.createdAt}</div>
            )}
          </div>
        ))}
      </div>

      {storeWhatsApp && (
        <p className="helper">WhatsApp: {storeWhatsApp}</p>
      )}
    </div>
  );
};
