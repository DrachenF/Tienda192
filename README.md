# Tienda192

## Configuración Firebase

1. Copia el archivo `.env.example` a `.env.local`.
2. Pega los valores reales desde Firebase Console en las variables `VITE_FIREBASE_*`.
3. Completa `VITE_STORE_NAME`, `VITE_STORE_WHATSAPP` y `VITE_DEBUG` según tu entorno.
4. Reinicia la app para que tome los cambios.

Estructura esperada en Firestore:
- `users`
- `admins`
- `orders`
- `products`
- `categories`
- `settings`
- `catalogMeta`

## Crear primer admin (automático)

El primer usuario registrado se convierte automáticamente en admin y se crea su
documento en la colección `admins` con `active: true`. Los siguientes usuarios se
registran como clientes.

## Deploy web

1. Configura las variables de entorno en tu proveedor (usando los mismos nombres que en `.env.local`).
2. Construye el proyecto y sube la carpeta de salida generada por Vite.
3. Verifica que las reglas de Firestore y Storage estén publicadas en Firebase.

## APK Android (Capacitor)

1. Inicializa Capacitor y agrega la plataforma Android.
2. Ejecuta el build web y sincroniza los assets con `npx cap sync`.
3. Abre el proyecto Android en Android Studio para generar el APK.
