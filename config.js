/**
 * Configuración Central del Sistema
 * Contiene las credenciales de Firebase y constantes globales.
 * * Este archivo debe cargarse ANTES que index.html inicialice Firebase.
 */
(function() {
    // Configuración de Firebase para el proyecto: dist-castillo-sales
    const firebaseConfig = {
        apiKey: "AIzaSyApyjf3NIjnGJp2sWyJccsR40-Q8UnU364",
        authDomain: "dist-castillo-sales.firebaseapp.com",
        projectId: "dist-castillo-sales",
        storageBucket: "dist-castillo-sales.firebasestorage.app",
        messagingSenderId: "719110919658",
        appId: "1:719110919658:web:7830a013c8c685a2c08e93",
        measurementId: "G-VJWMMH9FQC"
    };

    // Exponer configuración al objeto window para acceso global
    window.AppConfig = {
        firebaseConfig: firebaseConfig,
        
        // ID del proyecto para construir rutas a datos públicos
        // Anteriormente hardcodeado como 'ventas-9a210'
        PUBLIC_DATA_ID: 'dist-castillo-sales',

        // Constantes globales adicionales pueden ir aquí
        // Ejemplo: Tasa de cambio por defecto, etc.
    };

    console.log("✅ Configuración cargada. Proyecto:", window.AppConfig.PUBLIC_DATA_ID);
})();
