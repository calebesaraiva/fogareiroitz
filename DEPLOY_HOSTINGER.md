## Deploy Hostinger VPS

Este projeto esta pronto para subir em uma VPS Ubuntu da Hostinger com Node, PM2 e Nginx.

### 1. Preparar a VPS

Conecte por SSH:

```bash
ssh root@SEU_IP
```

Atualize o sistema:

```bash
apt update && apt upgrade -y
```

Instale dependencias:

```bash
apt install -y git curl nginx
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
npm install -g pnpm pm2
```

### 2. Subir o projeto

Clone o repositorio:

```bash
git clone SEU_REPOSITORIO fogareiro-itz
cd fogareiro-itz
```

Instale dependencias:

```bash
pnpm install
```

### 3. Criar o `.env`

Crie o arquivo:

```bash
nano .env
```

Cole:

```env
DATABASE_URL=postgresql://postgres:Acesso%402026@db.mxjvbgwxxaznhmdaghmt.supabase.co:5432/postgres
JWT_SECRET=FogareiroITZ_2026_X9kP4mL7qR2vN8sT5cH1zW6a
VITE_RESTAURANT_PHONE=5599991512250
PORT=3000
VITE_APP_TITLE=Fogareiro ITZ Restaurante
VITE_APP_LOGO=/fogareiro-logo.png
```

### 4. Build de producao

```bash
pnpm check
pnpm build
```

### 5. Subir com PM2

```bash
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Veja se subiu:

```bash
pm2 status
pm2 logs fogareiro-itz
```

### 6. Configurar Nginx

Copie a configuracao:

```bash
cp deploy/nginx-fogareiro.conf /etc/nginx/sites-available/fogareiro-itz
ln -s /etc/nginx/sites-available/fogareiro-itz /etc/nginx/sites-enabled/fogareiro-itz
rm -f /etc/nginx/sites-enabled/default
```

Edite o dominio:

```bash
nano /etc/nginx/sites-available/fogareiro-itz
```

Troque:

```nginx
server_name _;
```

por:

```nginx
server_name SEU_DOMINIO www.SEU_DOMINIO;
```

Teste e reinicie:

```bash
nginx -t
systemctl restart nginx
```

### 7. Apontar dominio

No painel da Hostinger, crie um registro `A` apontando seu dominio para o IP da VPS.

### 8. Ativar HTTPS

Instale o Certbot:

```bash
apt install -y certbot python3-certbot-nginx
```

Gere o SSL:

```bash
certbot --nginx -d SEU_DOMINIO -d www.SEU_DOMINIO
```

### 9. Checklist final

Teste no dominio real:

- `/`
- `/login`
- `/admin`
- `/cozinha`
- `/garcom`
- `/acompanhar`

Valide tambem:

- login admin
- login cozinha
- QR da mesa liberando pedido
- pedido chegando na cozinha
- acompanhamento pelo telefone
- download do PDF da mesa

### 10. Comandos uteis

Rebuild e restart:

```bash
cd ~/fogareiro-itz
git pull
pnpm install
pnpm build
pm2 restart fogareiro-itz
```

Ver logs:

```bash
pm2 logs fogareiro-itz
```

Status:

```bash
pm2 status
systemctl status nginx
```
