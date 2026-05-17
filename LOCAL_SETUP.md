# Local Development Setup (Windows)

Este documento descreve como preparar um ambiente local no Windows para desenvolver e testar o `redirect-service` (Node.js API) e a integração com WordPress.

Pré-requisitos
- Docker Desktop para Windows (com WSL2 backend preferido)
- Git
- Node.js 18+ (opcional — necessário apenas se você quiser executar a API fora do Docker)
- PowerShell
- Navegador para acessar WordPress local (http://localhost:8000)

Arquivos importantes
- `docker-compose.yml` — orquestra Postgres, Node API e WordPress
- `.env.example` — valores amostra para a API Node
- `schema.sql` — DDL para inicializar o banco de dados
- `wordpress/redirect-service-integration` — plugin WordPress integrado

Passos rápidos (Docker)
1. Copie `.env.example` para `.env` na raiz do repositório e ajuste valores se necessário:

```powershell
cp .env.example .env
notepad .env
```

2. Iniciar com Docker Compose (PowerShell):

```powershell
docker compose up --build
```

Isso criará/ligará os serviços:
- Postgres em `localhost:5432`
- API Node em `localhost:4000` (basePath `/api/v1`)
- WordPress em `http://localhost:8000` (Admin: `http://localhost:8000/wp-admin`)

Postgres / inicialização do schema
- O container `db` tem persistência em volume `db_data`.
- Para rodar o schema SQL inicial uma vez:

```powershell
# copie schema.sql para dentro do container e execute
docker cp schema.sql $(docker-compose ps -q db):/schema.sql
# ou execute psql diretamente do host (se psql instalado)
docker exec -it $(docker-compose ps -q db) psql -U rs_user -d redirect_service -f /schema.sql
```

Executando API Node.js localmente (fora do Docker)
1. Instale dependências:

```powershell
npm install
```

2. Copie `.env.example` para `.env` e ajuste (veja seção "Exemplo .env" abaixo).
3. Rode em modo desenvolvimento:

```powershell
npm run dev
```

Arquitetura e URLs esperadas (locais)
- API base: `http://localhost:4000/api/v1`
  - health: `http://localhost:4000/api/v1/health`
  - videos: `http://localhost:4000/api/v1/videos`
  - products: `http://localhost:4000/api/v1/products`
  - redirects: `http://localhost:4000/api/v1/redirects`
- WordPress Admin: `http://localhost:8000/wp-admin`
- Plugin (ativo) estará disponível em `wp-content/plugins/redirect-service-integration`

Plugin WordPress — ativação e configuração
1. A pasta do plugin já está mapeada para o container WordPress via Docker Compose (veja `docker-compose.yml`).
2. Abra `http://localhost:8000/wp-admin` e crie um usuário admin se solicitado.
3. Vá em `Plugins` e ative `Redirect Service Integration`.
4. Em `Configurações → Redirect Service` configure:
   - `API URL`: `http://host.docker.internal:4000/api/v1` *(explicação abaixo)*
   - `Internal Service Key`: copiar do `.env` (INTERNAL_SERVICE_KEY)
   - `Telegram Bot Token` e `Telegram Chat ID` se desejar testar notificações
5. Use o botão `Testar API` para verificar a conexão com o endpoint `/health`.

Observação sobre `host.docker.internal`
- Se o WordPress (container) precisa alcançar a API rodando no host Windows, use `http://host.docker.internal:4000` em vez de `localhost`.
- No cenário Docker Compose (API em container `api`), defina a `API URL` como `http://api:4000/api/v1` apenas se fizer chamadas internas entre containers.
- Para simplicidade no desenvolvimento com WordPress em container e API em container no mesmo compose, use `http://api:4000/api/v1`.

Exemplo `.env` (local)
```
PORT=4000
HOST=0.0.0.0
INTERNAL_SERVICE_KEY=dev-internal-key-please-change
PGHOST=db
PGPORT=5432
PGUSER=rs_user
PGPASSWORD=rs_password
PGDATABASE=redirect_service
APP_NAME=redirect-service
```

Telegram test flow
1. Obtenha `TELEGRAM_BOT_TOKEN` do @BotFather e `CHAT_ID` (seu chat ou grupo).
2. No plugin configure `Telegram Bot Token` e `Telegram Chat ID`.
3. Teste com cURL (substitua `<TOKEN>` e `<CHAT_ID>`):

```powershell
curl -s -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" -d chat_id=<CHAT_ID> -d text="Teste do Redirect Service"
```

Bootstrap checklist (rápido)
- [ ] Docker Desktop instalado e rodando
- [ ] Copiado `.env.example` → `.env` e ajustado
- [ ] `docker compose up --build` executado sem erros
- [ ] Rodou `schema.sql` no container Postgres
- [ ] Acessou WordPress em `http://localhost:8000` e ativou plugin
- [ ] Configurou `API URL` e `Internal Service Key` nas configurações do plugin
- [ ] Testou conexão com `Testar API` (resposta OK)

Troubleshooting (comuns)
- Erro: WordPress não encontra o plugin
  - Verifique se `docker-compose.yml` monta `./wordpress/redirect-service-integration` para `/var/www/html/wp-content/plugins/redirect-service-integration`.
  - Verifique permissões do diretório (Windows -> Docker volume mount pode precisar de ajustes).

- Erro: Plugin diz "API URL não configurada"
  - Confirme que salvou as configurações em `Configurações → Redirect Service`.
  - Verifique se `API URL` inclui o path correto (`/api/v1`).

- Erro: Testar API retorna erro CORS ou conexão recusada
  - Se a API roda no host e WP em container, use `host.docker.internal` no `API URL`.
  - Verifique logs do container API: `docker compose logs api`.

- Erro: Autenticação falha (401)
  - Verifique se `Internal Service Key` bate com `INTERNAL_SERVICE_KEY` no `.env` do API.
  - Confirme que a header esperada é `x-service-key`.

Validação WordPress ↔ Node.js (fluxo)
1. Plugin obtém `API URL` das opções e usa `RDI_Api_Client` para chamadas REST.
2. `RDI_Api_Client` inclui o header `x-service-key` com a chave interna configurada.
3. API Node valida `x-service-key` no middleware (ver `src/middleware/auth.js` e `src/config.js`).
4. Se `/health` responde com `{ status: 'ok' }`, integração básica está OK.

Compatibilidade com VPS/produção
- A mesma composição é válida para ambientes de VPS (substituir volumes por discos e usar um proxy reverso como Nginx).
- Em produção não use `host.docker.internal`; use hosts reais ou serviço em rede privada.
- Garanta `INTERNAL_SERVICE_KEY` seguro e TLS entre WordPress e API.

Comandos úteis
- Levantar toda infra:
```powershell
docker compose up --build
```
- Subir em background:
```powershell
docker compose up -d --build
```
- Ver logs do serviço API:
```powershell
docker compose logs -f api
```
- Entrar no container DB e rodar psql:
```powershell
docker exec -it <db_container_id_or_name> psql -U rs_user -d redirect_service
```
Adminer (interface web para DB)
- Acesse `http://localhost:8080` após subir o compose.
- Conectar com:
  - System: PostgreSQL
  - Server: db
  - Username: rs_user
  - Password: rs_password
  - Database: redirect_service

Fluxo automático (Windows)
- Use o script PowerShell `scripts\bootstrap.ps1` para automatizar cópia de `.env`, subir serviços e aplicar `schema.sql`:

```powershell
.\scripts\bootstrap.ps1
```

Este script:
- Copia `.env.example` para `.env` quando necessário
- Executa `docker compose up -d --build`
- Aguarda o Postgres ficar pronto e aplica `schema.sql` no banco

Gerenciamento do banco localmente
- Usar Adminer em `http://localhost:8080` para inspeção e queries rápidas.
- Para executar queries via CLI dentro do container:

```powershell
$dbId = docker compose ps -q db
docker exec -it $dbId psql -U rs_user -d redirect_service
```

Atualizações e limpeza
- Parar e remover containers/volumes:

```powershell
docker compose down -v
```


---

Se quiser, eu atualizo o `docker-compose.yml` para incluir um serviço `adminer` ou `pgadmin` para facilitar a administração do banco, ou já crio um script `make dev`/`ps1` para simplificar os comandos no Windows.