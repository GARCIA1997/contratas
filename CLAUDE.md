# Instrucciones para Claude Code — Kredired

## Git: cuándo hacer push

**Nunca hagas `git push` sin que el usuario lo pida explícitamente en ese momento.**
Terminar una feature/fix y dejarla commiteada localmente (o en la rama remota si ya
se pidió subirla) no es lo mismo que autorización para el paso siguiente — cada
push, merge o tag se confirma por separado.

Si el PR de una rama ya se mergeó y hay que seguir trabajando en ese tema, **abre
una rama nueva desde `main`** — nunca sigas commiteando sobre una rama cuyo PR
ya está cerrado.

## Flujo de una feature/fix

1. Rama nueva desde `main` actualizado (`git checkout main && git pull && git checkout -b feat/lo-que-sea`).
2. Commits normales durante el desarrollo.
3. Cuando el usuario diga "sube esto" / "haz push": `git push -u origin <rama>`.
4. Cuando el usuario diga que abras PR: `gh pr create` con resumen real de los
   cambios (no genérico) y test plan.
5. Esperar a que el CI (`.github/workflows/ci.yml`) pase antes de mergear.
6. **Nunca mergear sin que el usuario lo pida.** El merge a `main` dispara el
   deploy automático a producción (`.github/workflows/deploy.yml` corre en cada
   push a `main`) — es una acción que afecta producción real, no un paso rutinario.
7. Mergear con **merge commit**, no squash — así el tag de versión (si aplica)
   puede apuntar a un commit que de verdad queda en la historia de `main`.

## Versionado con tags

`package.json` lleva la versión real de la app (se muestra en la UI vía
`NEXT_PUBLIC_APP_VERSION`, ver `next.config.mjs` y `src/components/version-badge.tsx`)
— por una PWA con service worker, es la única forma confiable de saber desde el
celular si un dispositivo ya tiene el build nuevo.

**El tag va DESPUÉS del merge, nunca antes.** Un tag apunta a un commit
específico; si se etiqueta una rama y luego se mergea con squash, el commit
original desaparece de la historia de `main` y el tag queda huérfano.

Proceso, solo cuando el usuario lo pida explícitamente:

```bash
git checkout main && git pull origin main
git tag -a v4.0.2 -m "Resumen real de qué cambió"
git push origin v4.0.2
```

Convención de números: `4.0.x` para arreglos, `4.x.0` para features nuevas,
`5.0.0` para algo que rompa compatibilidad. Antes de subir la versión en
`package.json`, confirma con el usuario cuál le corresponde — no lo asumas.

## Antes de tocar el VPS de producción

- Siempre toma un respaldo primero: `./deploy/backup-db.sh` (baja un `.dump` a
  la máquina local, verificable con `pg_restore -l archivo.dump`).
- Ver `DEPLOY.md` para el resto de la infraestructura (nginx, systemd, scripts
  en `deploy/`, secrets de CI/CD).
- El VPS es de 1 vCPU — evita levantar builds/servidores pesados ahí a mano;
  el deploy real pasa por el pipeline de GitHub Actions.

## Verificación antes de cualquier PR

Correr y confirmar en verde antes de pedir revisión o abrir PR:

```bash
npx tsc --noEmit
npx next lint
npm test
```

Si el cambio es visible en UI, verificar en el navegador (Playwright/Claude
Browser tools), no solo confiar en que compila.
