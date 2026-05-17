# TEST_LOCAL.md

Checklist passo-a-passo para testar localmente o projeto `redirect-service` (Windows + Docker).

IMPORTANTE: Não execute comandos automatizados aqui — copie/cole manualmente no PowerShell.

1) Pré-requisitos
- Docker Desktop (WSL2 recomendado) em execução
- PowerShell
- Repositório clonado e atual (pasta do projeto)

2) Criar `.env` a partir de `.env.example`
```powershell
Copy-Item .env.example .env
notepad .env
# editar se necessário: verificar API_URL, INTERNAL_SERVICE_KEY, PGHOST
```

3) Subir containers Docker (modo background)
```powershell
docker compose up -d --build
```

4) Aplicar schema do banco
- Método preferido (script Bootstrap):
```powershell
.\scripts\bootstrap.ps1
```
- Método manual (se preferir):
```powershell
$dbId = docker compose ps -q db
docker cp .\schema.sql $dbId:/schema.sql
docker exec -i $dbId psql -U rs_user -d redirect_service -f /schema.sql
```

5) Acessar WordPress
- Frontend/admin no navegador: http://localhost:8000 e http://localhost:8000/wp-admin
- Crie usuário admin se solicitado

6) Ativar o plugin `Redirect Service Integration`
- Plugins → localizar “Redirect Service Integration” → Ativar

7) Configurar API URL e Internal Service Key
- Vá em Configurações → Redirect Service
- Valores recomendados para Compose local:
  - `API URL`: http://api:4000/api/v1
  - `Internal Service Key`: (copiar de `.env` → `INTERNAL_SERVICE_KEY`)

8) Testar conexão com o botão Testar API (na página de configurações)
- Clique em **Testar API** e aguarde mensagem "Conexão OK" ou detalhe de erro

9) Testar endpoint protegido (autenticação)
- Sem header (esperado: erro 401/unauthorized):
```powershell
curl http://localhost:4000/api/v1/redirects
```
- Com header correto (esperado: 200):
```powershell
curl -H "x-service-key: dev-internal-key-please-change" http://localhost:4000/api/v1/redirects
# Substitua o valor pelo INTERNAL_SERVICE_KEY do seu .env
```

10) Verificar health do serviço
```powershell
curl http://localhost:4000/api/v1/health
# Esperado: JSON {"status":"ok","uptime":...}
```

11) Verificar conexão com banco de dados
- Usar Adminer: http://localhost:8080
  - System: PostgreSQL
  - Server: db
  - Username: rs_user
  - Password: rs_password
  - Database: redirect_service
- Ou via CLI psql no container:
```powershell
$dbId = docker compose ps -q db
docker exec -it $dbId psql -U rs_user -d redirect_service -c "\dt"
```

12) Testes CRUD (exemplo)
- Criar redirect:
```powershell
curl -X POST -H "Content-Type: application/json" -H "x-service-key: dev-internal-key-please-change" -d '{"short_path":"t1","target_url":"https://example.com"}' http://localhost:4000/api/v1/redirects
```
- Listar redirects:
```powershell
curl -H "x-service-key: dev-internal-key-please-change" http://localhost:4000/api/v1/redirects
```

13) Persistência e reinício
- Parar e subir novamente para validar persistência do DB:
```powershell
docker compose down
docker compose up -d
```
- Verificar se os registros existem após restart (Adminer ou `curl`)

14) Depuração e logs
- Ver logs do serviço API:
```powershell
docker compose logs -f api
```
- Ver logs do WordPress:
```powershell
docker compose logs -f wordpress
```

Dicas rápidas
- Se WordPress estiver em container e API no host, use `http://host.docker.internal:4000/api/v1` como `API URL`.
- Se `Testar API` retornar erros crípticos, verifique `docker compose logs -f api` e confirme `INTERNAL_SERVICE_KEY` corresponde.

Se quiser, posso também adicionar um script PowerShell que execute verificações básicas de saúde (sem modificar containers). Deseja que eu gere esse script? 
