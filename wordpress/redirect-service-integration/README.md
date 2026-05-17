# Redirect Service Integration

Plugin WordPress para integrar com a API Node.js do Redirect Service.

Instalação rápida:

- Copie a pasta `redirect-service-integration` para `wp-content/plugins/`.
- Ative o plugin no painel do WordPress.
- Vá em Configurações → Redirect Service e configure a `API URL` e `Internal Service Key`.

Testes:

- Use o botão "Testar API" na página de configurações para verificar conectividade com o endpoint `/health`.

Segurança:

- Campos sensíveis (service key, telegram token, ai key) são cifrados usando OpenSSL com `AUTH_KEY`.
