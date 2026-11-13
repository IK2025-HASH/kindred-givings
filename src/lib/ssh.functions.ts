import { createServerFn } from "@tanstack/react-start";

export type SshProvisionInput = {
  host: string;
  port: number;
  username: string;
  authMethod: "password" | "key";
  password?: string;
  privateKey?: string;
  appDomain: string;
  appPort: string;
  adminEmail: string;
  appVersion: string;
  deployId: string;
  installDir: string;
  dbPassword: string;
};

export type SshProvisionStep = {
  step: number;
  code: string;
  status: "ok" | "error" | "warn";
  message: string;
};

export const runSshProvision = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as SshProvisionInput)
  .handler(async ({ data }): Promise<{ success: boolean; steps: SshProvisionStep[]; error?: string }> => {
    const { NodeSSH } = await import("node-ssh");
    const ssh = new NodeSSH();
    const steps: SshProvisionStep[] = [];

    const addStep = (step: number, code: string, status: "ok" | "error" | "warn", message: string) => {
      steps.push({ step, code, status, message });
    };

    try {
      await ssh.connect({
        host: data.host,
        port: data.port,
        username: data.username,
        ...(data.authMethod === "password"
          ? { password: data.password }
          : { privateKey: data.privateKey }),
        readyTimeout: 15000,
      });
      addStep(1, "SSH_CONNECTED", "ok", `Connected to ${data.username}@${data.host}:${data.port}`);

      const dockerCheck = await ssh.execCommand("docker --version && docker compose version");
      if (dockerCheck.code !== 0) {
        addStep(2, "DOCKER_CHECK", "error", "Docker not found on target. Install Docker first.");
        ssh.dispose();
        return { success: false, steps, error: "Docker not installed on target machine" };
      }
      addStep(2, "DOCKER_CHECK", "ok", dockerCheck.stdout.split("\n")[0]);

      const installDir = data.installDir || `/opt/donorbook-${data.appPort}`;
      await ssh.execCommand(`mkdir -p ${installDir}/conf.d ${installDir}/html ${installDir}/db-init`);
      addStep(3, "DIR_CREATED", "ok", `Install directory: ${installDir}`);

      const composeContent = [
        'version: "3.9"',
        'services:',
        '  donorbook:',
        '    image: nginx:alpine',
        `    container_name: donorbook-${data.appPort}`,
        '    restart: unless-stopped',
        '    ports:',
        `      - "${data.appPort}:80"`,
        '    volumes:',
        `      - ${installDir}/html:/usr/share/nginx/html:ro`,
        `      - ${installDir}/conf.d:/etc/nginx/conf.d:ro`,
        '    depends_on:',
        '      db:',
        '        condition: service_healthy',
        '      rest:',
        '        condition: service_started',
        '    healthcheck:',
        '      test: ["CMD", "wget", "-qO-", "http://localhost/health"]',
        '      interval: 30s',
        '      timeout: 5s',
        '      retries: 3',
        '',
        '  db:',
        '    image: postgres:16-alpine',
        `    container_name: donorbook-db-${data.appPort}`,
        '    restart: unless-stopped',
        '    environment:',
        '      POSTGRES_DB: donorbook',
        '      POSTGRES_USER: donorbook',
        `      POSTGRES_PASSWORD: ${data.dbPassword}`,
        '    volumes:',
        '      - db_data:/var/lib/postgresql/data',
        `      - ${installDir}/db-init:/docker-entrypoint-initdb.d:ro`,
        '    healthcheck:',
        '      test: ["CMD-SHELL", "pg_isready -U donorbook"]',
        '      interval: 10s',
        '      timeout: 5s',
        '      retries: 5',
        '',
        '  rest:',
        '    image: postgrest/postgrest:v12.0.2',
        `    container_name: donorbook-rest-${data.appPort}`,
        '    restart: unless-stopped',
        '    environment:',
        `      PGRST_DB_URI: postgres://donorbook:${data.dbPassword}@db:5432/donorbook`,
        '      PGRST_DB_SCHEMA: public',
        '      PGRST_DB_ANON_ROLE: donorbook',
        '      PGRST_SERVER_PORT: 3000',
        '    ports:',
        '      - "3000:3000"',
        '    depends_on:',
        '      db:',
        '        condition: service_healthy',
        '',
        'volumes:',
        '  db_data:',
      ].join("\n");

      await ssh.execCommand(`printf '%s' ${JSON.stringify(composeContent)} > ${installDir}/docker-compose.yml`);
      addStep(4, "COMPOSE_WRITTEN", "ok", "docker-compose.yml written");

      const nginxConf = "server {\n    listen 80;\n    server_name _;\n    root /usr/share/nginx/html;\n    index index.html;\n    location / { try_files $uri $uri/ /index.html; }\n    location /health { return 200 'OK'; add_header Content-Type text/plain; }\n}";
      await ssh.execCommand(`printf '%s' ${JSON.stringify(nginxConf)} > ${installDir}/conf.d/default.conf`);

      const indexHtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Donorbook ${data.appVersion}</title></head><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0f172a;color:#f1f5f9"><div style="text-align:center"><h1>Donorbook ${data.appVersion}</h1><p>${data.appDomain}</p><p>${data.adminEmail}</p><p>Deploy ID: ${data.deployId}</p></div></body></html>`;
      await ssh.execCommand(`printf '%s' ${JSON.stringify(indexHtml)} > ${installDir}/html/index.html`);

      const dbInitSql = `-- Donorbook On-Premise DB\n-- Deploy ID: ${data.deployId}\nCREATE SCHEMA IF NOT EXISTS donorbook;`;
      await ssh.execCommand(`printf '%s' ${JSON.stringify(dbInitSql)} > ${installDir}/db-init/01_schema.sql`);
      addStep(5, "FILES_WRITTEN", "ok", "Config files written to target");

      const pullResult = await ssh.execCommand(`cd ${installDir} && docker compose pull 2>&1`);
      addStep(6, "PULLING_IMAGES", pullResult.code !== 0 ? "warn" : "ok",
        pullResult.code !== 0 ? "Image pull had warnings — continuing" : "Docker images ready");

      await ssh.execCommand(`cd ${installDir} && docker compose down --remove-orphans 2>/dev/null || true`);
      const upResult = await ssh.execCommand(`cd ${installDir} && docker compose up -d 2>&1`);
      if (upResult.code !== 0) {
        addStep(7, "CONTAINERS_START", "error", `Failed to start containers: ${upResult.stdout}`);
        ssh.dispose();
        return { success: false, steps, error: upResult.stdout };
      }
      addStep(7, "CONTAINERS_START", "ok", "3 containers started (nginx + PostgreSQL + PostgREST)");

      await new Promise((r) => setTimeout(r, 5000));
      const healthResult = await ssh.execCommand(`curl -sf http://localhost:${data.appPort}/health 2>/dev/null || echo FAIL`);
      const healthy = !healthResult.stdout.includes("FAIL");
      addStep(8, "HEALTH_CHECK", healthy ? "ok" : "warn",
        healthy ? `App responding on port ${data.appPort}` : "Health check timed out — containers may still be starting");

      ssh.dispose();
      return { success: true, steps };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      addStep(0, "SSH_ERROR", "error", msg);
      try { ssh.dispose(); } catch { /* ignore */ }
      return { success: false, steps, error: msg };
    }
  });
