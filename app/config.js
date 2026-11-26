/*
 * Configuración pública de la interfaz (no contiene secretos).
 *
 * PARA AÑADIR UNA EMPRESA NUEVA: copia una línea de CLIENTES, cámbiale el código y la URL
 * (la que acaba en /exec que te envíe la empresa) y guarda. Su enlace será:
 *   https://fryserviciosdigitales.github.io/FRY-CRM/app/?c=CODIGO
 * Usa códigos neutros (c-001, c-002...) en vez del nombre de la empresa.
 */
window.FRY_CONFIG = {
  // ID de cliente de Google (el mismo para todas las empresas)
  GOOGLE_CLIENT_ID: "30240602730-cav1msjdgab6sv5dv2u8k2q5pdentjjm.apps.googleusercontent.com",

  // Empresa que se abre si el enlace no lleva ?c=
  CLIENTE_POR_DEFECTO: "prueba",

  // Lista de empresas permitidas: "codigo": "URL de su API"
  CLIENTES: {
    "prueba": "https://script.google.com/macros/s/AKfycbxZaRQGpr52Gl3b0MTTidsHvz82xCpZ3y83naKLmCHFnlHg39OUsTkXvU2DhrbVNWbb/exec"
  }
};
